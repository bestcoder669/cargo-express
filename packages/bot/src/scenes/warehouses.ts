// packages/bot/src/scenes/warehouses.ts - Обработчики складов
import { Composer } from 'grammy'
import type { BotContext } from '../types/context'
import { prisma } from '../services/database'
import { getWarehousesKeyboard } from '../keyboards/dynamic'
import { formatCurrency, escapeHtml } from '../utils/formatter'
import { logger } from '../utils/logger'

export const warehouseHandlers = new Composer<BotContext>()

// Список складов
warehouseHandlers.callbackQuery('warehouses:list', async (ctx) => {
  await ctx.answerCallbackQuery()
  
  try {
    const keyboard = await getWarehousesKeyboard()
    
    await ctx.editMessageText(
      '🏢 <b>Наши склады по миру</b>\n\n' +
      `Отправляйте посылки с указанием ID: <code>#${ctx.user?.customId || 'XXXXX'}</code>\n` +
      'Выберите склад для просмотра адреса:',
      {
        reply_markup: keyboard,
        parse_mode: 'HTML'
      }
    )
  } catch (error) {
    logger.error('Failed to show warehouses:', error)
    await ctx.reply('❌ Ошибка при загрузке складов')
  }
})

// Детали конкретного склада
warehouseHandlers.callbackQuery(/^warehouse:/, async (ctx) => {
  await ctx.answerCallbackQuery()
  
  const countryId = ctx.callbackQuery.data.replace('warehouse:', '')
  
  try {
    const country = await prisma.country.findUnique({
      where: { id: countryId },
      include: {
        warehouses: {
          where: { isActive: true },
          take: 1
        },
        tariffsFrom: {
          where: {
            toCountryId: 'RU',
            isActive: true
          },
          take: 1
        }
      }
    })

    if (!country || !country.warehouses[0]) {
      await ctx.reply('❌ Склад не найден')
      return
    }

    const warehouse = country.warehouses[0]
    const tariff = country.tariffsFrom[0]

    let restrictions = ''
    if (warehouse.restrictions) {
      try {
        const restrictionsList = JSON.parse(warehouse.restrictions) as string[]
        if (Array.isArray(restrictionsList) && restrictionsList.length > 0) {
          restrictions = '• Запрещены: ' + restrictionsList.join(', ') + '\n'
        }
      } catch {
        restrictions = '• ' + warehouse.restrictions + '\n'
      }
    }

    await ctx.editMessageText(
      `${country.flagEmoji} <b>Склад в ${escapeHtml(country.name)}</b>\n\n` +
      '📍 <b>АДРЕС ДЛЯ ОТПРАВКИ:</b>\n' +
      `CargoExpress Warehouse\n` +
      `Customer ID: <code>#${ctx.user?.customId || 'XXXXX'}</code>\n` +
      `${escapeHtml(warehouse.address)}\n` +
      `${escapeHtml(country.name)}\n\n` +
      (warehouse.phone ? `📞 ${warehouse.phone}\n` : '') +
      (warehouse.email ? `📧 ${warehouse.email}\n` : '') +
      (warehouse.workingHours ? `⏰ ${warehouse.workingHours}\n` : '') +
      '\n💰 <b>ТАРИФ В РОССИЮ:</b>\n' +
      `• ${formatCurrency(tariff.pricePerKg)} за килограмм\n` +
      `• Минимум: ${formatCurrency(tariff.minPrice)} за посылку\n` +
      `• Сроки доставки: ${tariff.deliveryDaysMin}-${tariff.deliveryDaysMax} дней\n\n` +
      '🚨 <b>ОГРАНИЧЕНИЯ:</b>\n' +
      `• Максимальный вес: ${warehouse.maxWeightKg} кг\n` +
      restrictions +
      `• Объявленная стоимость: до $${warehouse.maxDeclaredValue}\n` +
      '• Обработка на складе: 1-2 дня\n\n' +
      '📋 <b>ВАЖНО:</b>\n' +
      `Обязательно указывайте ваш ID: <code>#${ctx.user?.customId || 'XXXXX'}</code>`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📋 Скопировать адрес', callback_data: `copy:address:${warehouse.id}` }
            ],
            [
              { text: '📦 Оформить посылку', callback_data: `shipping:from:${country.id}` },
              { text: '📊 Рассчитать стоимость', callback_data: `calculator:country:${country.id}` }
            ],
            [
              { text: '⬅️ Все склады', callback_data: 'warehouses:list' },
              { text: '🏠 Главное меню', callback_data: 'menu:main' }
            ]
          ]
        }
      }
    )
  } catch (error) {
    logger.error('Failed to show warehouse details:', error)
    await ctx.reply('❌ Ошибка при загрузке информации о складе')
  }
})

// Копирование адреса
warehouseHandlers.callbackQuery(/^copy:address:/, async (ctx) => {
  const warehouseId = ctx.callbackQuery.data.replace('copy:address:', '')
  
  try {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: warehouseId },
      include: { country: true }
    })

    if (!warehouse) {
      await ctx.answerCallbackQuery('❌ Склад не найден')
      return
    }

    const address = 
      `CargoExpress Warehouse\n` +
      `Customer ID: #${ctx.user?.customId || 'XXXXX'}\n` +
      `${warehouse.address}\n` +
      `${warehouse.country.name}`

    await ctx.answerCallbackQuery({
      text: 'Адрес скопирован! Вставьте его при оформлении отправки.',
      show_alert: true
    })
  } catch (error) {
    logger.error('Failed to copy address:', error)
    await ctx.answerCallbackQuery('❌ Ошибка при копировании адреса')
  }
})

// Быстрый переход к оформлению посылки
warehouseHandlers.callbackQuery(/^shipping:from:/, async (ctx) => {
  await ctx.answerCallbackQuery()
  
  const countryId = ctx.callbackQuery.data.replace('shipping:from:', '')
  
  // Сохраняем выбранную страну в сессии
  ctx.session.orderCreation = {
    type: 'shipping',
    step: 'weight',
    data: { fromCountryId: countryId }
  }
  
  // Переходим к созданию заказа
  await ctx.conversation.enter('shippingConversation')
})

// Калькулятор для конкретной страны
warehouseHandlers.callbackQuery(/^calculator:country:/, async (ctx) => {
  await ctx.answerCallbackQuery()
  
  const countryId = ctx.callbackQuery.data.replace('calculator:country:', '')
  
  try {
    const country = await prisma.country.findUnique({
      where: { id: countryId },
      include: {
        tariffsFrom: {
          where: {
            toCountryId: 'RU',
            isActive: true
          },
          take: 1
        }
      }
    })

    if (!country || !country.tariffsFrom[0]) {
      await ctx.reply('❌ Тариф не найден')
      return
    }

    const tariff = country.tariffsFrom[0]
    const weights = [0.5, 1, 2, 3, 5, 10, 15, 20]
    
    let calculatorText = `📊 <b>Калькулятор стоимости</b>\n\n`
    calculatorText += `${country.flagEmoji} ${country.name} → 🇷🇺 Россия\n`
    calculatorText += `Тариф: ${formatCurrency(tariff.pricePerKg)}/кг (мин. ${formatCurrency(tariff.minPrice)})\n\n`
    calculatorText += '<b>Примеры расчета:</b>\n'
    
    weights.forEach(weight => {
      const cost = Math.max(Number(tariff.pricePerKg) * weight, Number(tariff.minPrice))
      calculatorText += `• ${weight} кг = ${formatCurrency(cost)}\n`
    })
    
    calculatorText += '\n<i>💡 Введите точный вес для расчета или выберите из примеров</i>'

    await ctx.editMessageText(calculatorText, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📦 Оформить посылку', callback_data: `shipping:from:${country.id}` }
          ],
          [
            { text: '⬅️ К складу', callback_data: `warehouse:${country.id}` },
            { text: '🏠 Главное меню', callback_data: 'menu:main' }
          ]
        ]
      }
    })
  } catch (error) {
    logger.error('Failed to show calculator:', error)
    await ctx.reply('❌ Ошибка при расчете стоимости')
  }
})