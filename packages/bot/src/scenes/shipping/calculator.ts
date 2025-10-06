// packages/bot/src/scenes/shipping/calculator.ts - Калькулятор стоимости доставки
import { prisma } from '../../services/database'
import { redisHelpers } from '../../services/redis'
import Decimal from 'decimal.js'
import { logger } from '../../utils/logger'

export interface ShippingCost {
  cost: Decimal
  pricePerKg: Decimal
  minPrice: Decimal
  deliveryDaysMin: number
  deliveryDaysMax: number
  tariffId: string
}

// Рассчитать стоимость доставки
export async function calculateShippingCost(
  fromCountryId: string,
  weight: number,
  toCountryId = 'RU'
): Promise<ShippingCost> {
  try {
    // Проверяем кэш
    const cacheKey = `shipping:${fromCountryId}:${toCountryId}:${weight}`
    const cached = await redisHelpers.getCache<ShippingCost>(cacheKey)
    if (cached) {
      // Восстанавливаем Decimal из кэша
      return {
        ...cached,
        cost: new Decimal(cached.cost),
        pricePerKg: new Decimal(cached.pricePerKg),
        minPrice: new Decimal(cached.minPrice)
      }
    }

    // Получаем тариф
    const tariff = await prisma.shippingTariff.findFirst({
      where: {
        fromCountryId,
        toCountryId,
        isActive: true
      }
    })

    if (!tariff) {
      throw new Error(`Тариф не найден для маршрута ${fromCountryId} -> ${toCountryId}`)
    }

    // Рассчитываем стоимость
    const pricePerKg = new Decimal(tariff.pricePerKg)
    const minPrice = new Decimal(tariff.minPrice)
    const baseCost = pricePerKg.times(weight)
    const finalCost = Decimal.max(baseCost, minPrice)

    const result: ShippingCost = {
      cost: finalCost,
      pricePerKg,
      minPrice,
      deliveryDaysMin: tariff.deliveryDaysMin,
      deliveryDaysMax: tariff.deliveryDaysMax,
      tariffId: tariff.id
    }

    // Сохраняем в кэш на 1 час
    await redisHelpers.setCache(cacheKey, {
      ...result,
      cost: result.cost.toString(),
      pricePerKg: result.pricePerKg.toString(),
      minPrice: result.minPrice.toString()
    }, 3600)

    return result
  } catch (error) {
    logger.error('Failed to calculate shipping cost:', error)
    throw new Error('Не удалось рассчитать стоимость доставки')
  }
}

// Получить все тарифы для страны
export async function getCountryTariffs(fromCountryId: string) {
  try {
    const tariffs = await prisma.shippingTariff.findMany({
      where: {
        fromCountryId,
        isActive: true
      },
      include: {
        toCountry: true
      }
    })

    return tariffs.map(tariff => ({
      id: tariff.id,
      toCountry: {
        id: tariff.toCountry.id,
        name: tariff.toCountry.name,
        code: tariff.toCountry.code,
        flagEmoji: tariff.toCountry.flagEmoji
      },
      pricePerKg: new Decimal(tariff.pricePerKg),
      minPrice: new Decimal(tariff.minPrice),
      deliveryDaysMin: tariff.deliveryDaysMin,
      deliveryDaysMax: tariff.deliveryDaysMax
    }))
  } catch (error) {
    logger.error('Failed to get country tariffs:', error)
    return []
  }
}

// Рассчитать стоимость с учетом скидок VIP
export async function calculateWithDiscounts(
  baseCost: Decimal,
  userId: string
): Promise<{
  originalCost: Decimal
  discount: Decimal
  discountPercent: number
  finalCost: Decimal
}> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { vipTier: true, vipExpiresAt: true }
    })

    if (!user) {
      return {
        originalCost: baseCost,
        discount: new Decimal(0),
        discountPercent: 0,
        finalCost: baseCost
      }
    }

    // Проверяем, не истек ли VIP статус
    if (user.vipExpiresAt && new Date(user.vipExpiresAt) < new Date()) {
      return {
        originalCost: baseCost,
        discount: new Decimal(0),
        discountPercent: 0,
        finalCost: baseCost
      }
    }

    // Процент скидки в зависимости от VIP уровня
    const discountPercent = {
      REGULAR: 0,
      SILVER: 5,
      GOLD: 10,
      PLATINUM: 15
    }[user.vipTier] || 0

    if (discountPercent === 0) {
      return {
        originalCost: baseCost,
        discount: new Decimal(0),
        discountPercent: 0,
        finalCost: baseCost
      }
    }

    const discount = baseCost.times(discountPercent).dividedBy(100)
    const finalCost = baseCost.minus(discount)

    return {
      originalCost: baseCost,
      discount,
      discountPercent,
      finalCost
    }
  } catch (error) {
    logger.error('Failed to calculate discounts:', error)
    return {
      originalCost: baseCost,
      discount: new Decimal(0),
      discountPercent: 0,
      finalCost: baseCost
    }
  }
}

// Проверить ограничения склада
export async function checkWarehouseRestrictions(
  warehouseId: string,
  weight: number,
  declaredValue: number
): Promise<{
  allowed: boolean
  reason?: string
}> {
  try {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: warehouseId }
    })

    if (!warehouse || !warehouse.isActive) {
      return {
        allowed: false,
        reason: 'Склад недоступен'
      }
    }

    if (weight > Number(warehouse.maxWeightKg)) {
      return {
        allowed: false,
        reason: `Максимальный вес: ${warehouse.maxWeightKg} кг`
      }
    }

    if (declaredValue > Number(warehouse.maxDeclaredValue)) {
      return {
        allowed: false,
        reason: `Максимальная объявленная стоимость: $${warehouse.maxDeclaredValue}`
      }
    }

    return { allowed: true }
  } catch (error) {
    logger.error('Failed to check warehouse restrictions:', error)
    return {
      allowed: false,
      reason: 'Ошибка проверки ограничений'
    }
  }
}

// Массовый расчет стоимости для калькулятора
export async function bulkCalculateShipping(
  fromCountryId: string,
  weights: number[]
): Promise<Map<number, ShippingCost>> {
  const results = new Map<number, ShippingCost>()

  try {
    // Получаем тариф один раз
    const tariff = await prisma.shippingTariff.findFirst({
      where: {
        fromCountryId,
        toCountryId: 'RU',
        isActive: true
      }
    })

    if (!tariff) {
      throw new Error('Тариф не найден')
    }

    const pricePerKg = new Decimal(tariff.pricePerKg)
    const minPrice = new Decimal(tariff.minPrice)

    // Рассчитываем для каждого веса
    for (const weight of weights) {
      const baseCost = pricePerKg.times(weight)
      const finalCost = Decimal.max(baseCost, minPrice)

      results.set(weight, {
        cost: finalCost,
        pricePerKg,
        minPrice,
        deliveryDaysMin: tariff.deliveryDaysMin,
        deliveryDaysMax: tariff.deliveryDaysMax,
        tariffId: tariff.id
      })
    }

    return results
  } catch (error) {
    logger.error('Failed to bulk calculate shipping:', error)
    return results
  }
}