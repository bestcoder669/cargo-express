// packages/bot/src/scenes/shipping/index.ts - Сцена создания заказа на отправку
import { Composer } from 'grammy'
import { createConversation } from '@grammyjs/conversations'
import type { BotContext, BotConversation } from '../../types/context'
import { prisma, generateOrderNumber } from '../../services/database'
import { getUserAddresses } from '../../services/user'
import { getCountriesKeyboard, getWeightKeyboard } from '../../keyboards/dynamic'
import { calculateShippingCost } from './calculator'
import { formatCurrency, formatDeliveryTime, escapeHtml } from '../../utils/formatter'
import { logger } from '../../utils/logger'
import Decimal from 'decimal.js'

export const shippingScene = new Composer<BotContext>()

// Начало создания заказа
shippingScene.callbackQuery('shipping:new', async (ctx) => {
  await ctx.answerCallbackQuery()
  
  if (!ctx.user) {
    await ctx.reply('❌ Необходима регистрация. Используйте /start')
    return
  }
  
  await ctx.editMessageText(
    '📦 Отправка посылки\n\n' +
    'У вас есть посылка на одном из наших складов?\n' +
    'Или планируете отправить?',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📦 Посылка уже на складе', callback_data: 'shipping:warehouse' }],
          [{ text: '🏢 Посмотреть адреса складов', callback_data: 'warehouses:list' }],
          [{ text: '📊 Рассчитать стоимость', callback_data: 'calculator:start' }],
          [{ text: '⬅️ Главное меню', callback_data: 'menu:main' }]
        ]
      }
    }
  )
})

// Выбор склада
shippingScene.callbackQuery('shipping:warehouse', async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.conversation.enter('shippingConversation')
})

// Основная conversation для создания заказа
export async function shippingConversation(
  conversation: BotConversation,
  ctx: BotContext
): Promise<void> {
  try {
    const orderData: {
      fromCountryId?: string
      weight?: number
      description?: string
      declaredValue?: number
      declaredCurrency?: string
      recipientAddressId?: string
      totalCost?: Decimal
    } = {}

    // ШАГ 1: Выбор страны
    await ctx.editMessageText(
      '🌍 На каком складе ваша посылка?',
      {
        reply_markup: await getCountriesKeyboard('shipping')
      }
    )

    const countryCtx = await conversation.waitForCallbackQuery(/^shipping:country:/)
    await countryCtx.answerCallbackQuery()
    
    orderData.fromCountryId = countryCtx.callbackQuery.data.replace('shipping:country:', '')
    
    // Получаем информацию о стране
    const country = await prisma.country.findUnique({
      where: { id: orderData.fromCountryId },
      include: {
        warehouses: {
          where: { isActive: true },
          take: 1
        }
      }
    })

    if (!country || !country.warehouses[0]) {
      await ctx.reply('❌ Склад не найден')
      return
    }

    // ШАГ 2: Выбор веса
    await ctx.editMessageText(
      `⚖️ Укажите вес посылки\n\n` +
      `🇷🇺 Склад: ${country.flagEmoji} ${country.name}\n` +
      'Выберите вес или введите точный:',
      {
        reply_markup: await getWeightKeyboard(orderData.fromCountryId)
      }
    )

    const weightCtx = await conversation.waitFor(['callback_query:data', 'message:text'])
    
    if (weightCtx.callbackQuery) {
      await weightCtx.answerCallbackQuery()
      
      if (weightCtx.callbackQuery.data === 'weight:custom') {
        await ctx.reply('✏️ Введите точный вес в килограммах (например: 2.5):')
        const customWeightCtx = await conversation.waitFor('message:text')
        
        const weight = parseFloat(customWeightCtx.message!.text.replace(',', '.'))
        if (isNaN(weight) || weight <= 0 || weight > 50) {
          await ctx.reply('❌ Неверный вес. Допустимо от 0.1 до 50 кг')
          return
        }
        orderData.weight = weight
      } else {
        orderData.weight = parseFloat(weightCtx.callbackQuery.data.replace('weight:', ''))
      }
    } else if (weightCtx.message?.text) {
      const weight = parseFloat(weightCtx.message.text.replace(',', '.'))
      if (isNaN(weight) || weight <= 0 || weight > 50) {
        await ctx.reply('❌ Неверный вес. Допустимо от 0.1 до 50 кг')
        return
      }
      orderData.weight = weight
    }

    // Рассчитываем стоимость
    const shippingCost = await calculateShippingCost(
      orderData.fromCountryId!,
      orderData.weight!
    )

    // ШАГ 3: Содержимое посылки
    await ctx.reply(
      `📝 Содержимое посылки\n\n` +
      `${country.flagEmoji} ${country.name} → 🇷🇺 Россия\n` +
      `⚖️ ${orderData.weight} кг | 💰 ${formatCurrency(shippingCost.cost)}\n\n` +
      'Что находится в посылке?\n' +
      '(для таможенного оформления)',
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '👕 Одежда и обувь', callback_data: 'desc:clothes' },
              { text: '📱 Электроника', callback_data: 'desc:electronics' }
            ],
            [
              { text: '💄 Косметика', callback_data: 'desc:cosmetics' },
              { text: '📚 Книги/Документы', callback_data: 'desc:books' }
            ],
            [
              { text: '🎁 Подарки', callback_data: 'desc:gifts' },
              { text: '💊 БАДы/Витамины', callback_data: 'desc:supplements' }
            ],
            [
              { text: '🏠 Товары для дома', callback_data: 'desc:home' },
              { text: '🎮 Игры/Игрушки', callback_data: 'desc:toys' }
            ],
            [{ text: '✏️ Написать свое описание', callback_data: 'desc:custom' }]
          ]
        }
      }
    )

    const descCtx = await conversation.waitForCallbackQuery(/^desc:/)
    await descCtx.answerCallbackQuery()
    
    const descType = descCtx.callbackQuery.data.replace('desc:', '')
    
    if (descType === 'custom') {
      await ctx.reply('✏️ Опишите содержимое посылки:')
      const customDescCtx = await conversation.waitFor('message:text')
      orderData.description = customDescCtx.message!.text
    } else {
      const descriptions: Record<string, string> = {
        clothes: 'Одежда и обувь',
        electronics: 'Электроника',
        cosmetics: 'Косметика',
        books: 'Книги и документы',
        gifts: 'Подарки',
        supplements: 'БАДы и витамины',
        home: 'Товары для дома',
        toys: 'Игры и игрушки'
      }
      orderData.description = descriptions[descType] || 'Личные вещи'
    }

    // ШАГ 4: Объявленная стоимость
    await ctx.reply(
      `💰 Объявленная стоимость\n\n` +
      `${country.flagEmoji} ${country.name} → 🇷🇺 Россия\n` +
      `⚖️ ${orderData.weight} кг | 📝 ${orderData.description}\n\n` +
      'Укажите стоимость содержимого посылки:\n' +
      '(для страховки и таможни)',
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'До $50', callback_data: 'value:50' },
              { text: 'До $100', callback_data: 'value:100' },
              { text: 'До $200', callback_data: 'value:200' }
            ],
            [
              { text: 'До $500', callback_data: 'value:500' },
              { text: 'До $1000', callback_data: 'value:1000' },
              { text: 'До $2000', callback_data: 'value:2000' }
            ],
            [{ text: '✏️ Ввести точную сумму', callback_data: 'value:custom' }]
          ]
        }
      }
    )

    const valueCtx = await conversation.waitForCallbackQuery(/^value:/)
    await valueCtx.answerCallbackQuery()
    
    const valueType = valueCtx.callbackQuery.data.replace('value:', '')
    
    if (valueType === 'custom') {
      await ctx.reply('✏️ Введите точную стоимость в долларах (например: 150):')
      const customValueCtx = await conversation.waitFor('message:text')
      
      const value = parseFloat(customValueCtx.message!.text.replace(/[^\d.,]/g, '').replace(',', '.'))
      if (isNaN(value) || value <= 0 || value > 2000) {
        await ctx.reply('❌ Неверная сумма. Допустимо от $1 до $2000')
        return
      }
      orderData.declaredValue = value
    } else {
      orderData.declaredValue = parseInt(valueType)
    }
    
    orderData.declaredCurrency = 'USD'

    // ШАГ 5: Получатель
    const addresses = await getUserAddresses(ctx.user!.id)
    
    if (addresses.length === 0) {
      await ctx.reply('❌ У вас нет сохраненных адресов')
      return
    }

    const addressButtons = addresses.map(addr => [{
      text: `${addr.isDefault ? '🏠' : '📍'} ${addr.alias}: ${addr.city.name}, ${addr.address.substring(0, 30)}...`,
      callback_data: `addr:${addr.id}`
    }])

    await ctx.reply(
      '👤 Кто получит посылку?\n\n' +
      `${country.flagEmoji} ${country.name} → 🇷🇺 Россия\n` +
      `⚖️ ${orderData.weight} кг | 💰 ${formatCurrency(shippingCost.cost)}\n` +
      `📝 ${orderData.description} | 💵 $${orderData.declaredValue}`,
      {
        reply_markup: {
          inline_keyboard: [
            ...addressButtons,
            [{ text: '➕ Добавить новый адрес', callback_data: 'addr:new' }]
          ]
        }
      }
    )

    const addrCtx = await conversation.waitForCallbackQuery(/^addr:/)
    await addrCtx.answerCallbackQuery()
    
    const addrId = addrCtx.callbackQuery.data.replace('addr:', '')
    
    if (addrId === 'new') {
      await ctx.reply('Для добавления нового адреса используйте раздел профиля')
      return
    }
    
    orderData.recipientAddressId = addrId
    orderData.totalCost = shippingCost.cost

    // Получаем полную информацию об адресе
    const selectedAddress = addresses.find(a => a.id === addrId)
    if (!selectedAddress) {
      await ctx.reply('❌ Адрес не найден')
      return
    }

    // ШАГ 6: Подтверждение заказа
    await ctx.replyWithHTML(
      '📋 <b>Подтверждение заказа</b>\n\n' +
      '📦 <b>Детали посылки:</b>\n' +
      `├ Маршрут: ${country.flagEmoji} ${escapeHtml(country.name)} → 🇷🇺 Россия\n` +
      `├ Вес: ${orderData.weight} кг\n` +
      `├ Содержимое: ${escapeHtml(orderData.description!)}\n` +
      `├ Объявленная стоимость: $${orderData.declaredValue}\n` +
      `└ Срок доставки: ${formatDeliveryTime(shippingCost.deliveryDaysMin, shippingCost.deliveryDaysMax)}\n\n` +
      '👤 <b>Получатель:</b>\n' +
      `├ Имя: ${escapeHtml(ctx.user!.firstName)} ${ctx.user!.lastName ? escapeHtml(ctx.user!.lastName) : ''}\n` +
      `├ Телефон: ${ctx.user!.phone}\n` +
      `└ Адрес: ${escapeHtml(selectedAddress.city.name)}, ${escapeHtml(selectedAddress.address)}\n\n` +
      `💰 <b>К оплате:</b> ${formatCurrency(orderData.totalCost)}`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Подтвердить и оплатить', callback_data: 'confirm:order' }],
            [{ text: '✏️ Изменить получателя', callback_data: 'edit:recipient' }],
            [{ text: '❌ Отменить', callback_data: 'cancel:order' }]
          ]
        }
      }
    )

    const confirmCtx = await conversation.waitForCallbackQuery(/^(confirm|cancel|edit):/)
    await confirmCtx.answerCallbackQuery()
    
    if (confirmCtx.callbackQuery.data === 'cancel:order') {
      await ctx.editMessageText('❌ Создание заказа отменено')
      return
    }
    
    if (confirmCtx.callbackQuery.data === 'edit:recipient') {
      await ctx.reply('Используйте раздел профиля для редактирования адресов')
      return
    }

    // Создаем заказ
    const order = await prisma.order.create({
      data: {
        orderNumber: generateOrderNumber('SP'),
        type: 'SHIPPING',
        status: 'CREATED',
        userId: ctx.user!.id,
        fromCountryId: orderData.fromCountryId!,
        toCountryId: 'RU',
        weight: orderData.weight!,
        declaredValue: orderData.declaredValue!,
        declaredCurrency: orderData.declaredCurrency!,
        description: orderData.description!,
        addressId: orderData.recipientAddressId!,
        recipientName: `${ctx.user!.firstName} ${ctx.user!.lastName || ''}`,
        recipientPhone: ctx.user!.phone,
        deliveryAddress: `${selectedAddress.city.name}, ${selectedAddress.address}`,
        deliveryCost: orderData.totalCost,
        totalCost: orderData.totalCost
      }
    })

    // Отправляем на оплату
    await ctx.editMessageText(
      `✅ Заказ #${order.orderNumber} создан!\n\n` +
      `💰 К оплате: ${formatCurrency(order.totalCost)}\n\n` +
      'Выберите способ оплаты:',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💳 Банковская карта', callback_data: `pay:card:${order.id}` }],
            [{ text: '📱 СБП', callback_data: `pay:sbp:${order.id}` }],
            [{ text: '₿ Криптовалюта', callback_data: `pay:crypto:${order.id}` }],
            [{ text: '💰 С баланса', callback_data: `pay:balance:${order.id}` }]
          ]
        }
      }
    )

    logger.info('Shipping order created', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId: ctx.user!.id
    })

  } catch (error) {
    logger.error('Failed to create shipping order:', error)
    await ctx.reply(
      '❌ Произошла ошибка при создании заказа.\n' +
      'Попробуйте еще раз или обратитесь в поддержку.'
    )
  }
}