// packages/bot/src/scenes/purchase/index.ts - Сцена выкупа товаров
import { Composer } from 'grammy'
import { createConversation } from '@grammyjs/conversations'
import type { BotContext, BotConversation } from '../../types/context'
import { prisma, generateOrderNumber } from '../../services/database'
import { getUserAddresses } from '../../services/user'
import { getCountriesKeyboard } from '../../keyboards/dynamic'
import { formatCurrency, escapeHtml } from '../../utils/formatter'
import { logger } from '../../utils/logger'
import Decimal from 'decimal.js'

export const purchaseScene = new Composer<BotContext>()

// Главное меню выкупа
purchaseScene.callbackQuery('purchase:new', async (ctx) => {
  await ctx.answerCallbackQuery()
  
  if (!ctx.user) {
    await ctx.reply('❌ Необходима регистрация. Используйте /start')
    return
  }
  
  await ctx.editMessageText(
    '🛒 <b>Выкуп товара</b>\n\n' +
    'Мы купим товар для вас и доставим в Россию\n' +
    'Полная предоплата за товар + комиссия\n\n' +
    'Выберите тип заказа:',
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔗 Выкуп по вашей ссылке', callback_data: 'purchase:link' }],
          [{ text: '💰 Товары с фиксированной ценой', callback_data: 'purchase:fixed' }],
          [{ text: '🏢 Склады для выкупа', callback_data: 'warehouses:list' }],
          [{ text: '⬅️ Главное меню', callback_data: 'menu:main' }]
        ]
      }
    }
  )
})

// Выкуп по ссылке
purchaseScene.callbackQuery('purchase:link', async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.conversation.enter('purchaseByLink')
})

// Товары с фиксированными ценами
purchaseScene.callbackQuery('purchase:fixed', async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.conversation.enter('purchaseFixed')
})

// Conversation для выкупа по ссылке
export const purchaseByLinkConversation = createConversation(
  async function purchaseByLink(
    conversation: BotConversation,
    ctx: BotContext
  ): Promise<void> {
    try {
      const orderData: {
        countryId?: string
        productUrl?: string
        productName?: string
        productPrice?: number
        currency?: string
        quantity?: number
        notes?: string
        addressId?: string
      } = {}

      // ШАГ 1: Выбор страны
      await ctx.editMessageText(
        '🌍 <b>Выкуп по ссылке</b>\n\n' +
        'В какой стране находится интернет-магазин?',
        {
          parse_mode: 'HTML',
          reply_markup: await getCountriesKeyboard('purchase')
        }
      )

      const countryCtx = await conversation.waitForCallbackQuery(/^purchase:country:/)
      await countryCtx.answerCallbackQuery()
      
      orderData.countryId = countryCtx.callbackQuery.data.replace('purchase:country:', '')
      
      const country = await prisma.country.findUnique({
        where: { id: orderData.countryId }
      })

      if (!country) {
        await ctx.reply('❌ Страна не найдена')
        return
      }

      // ШАГ 2: Ссылка на товар
      await ctx.reply(
        `🔗 <b>Выкуп товара из ${country.flagEmoji} ${country.name}</b>\n\n` +
        `Комиссия за выкуп: ${country.purchaseCommission}%\n\n` +
        'Отправьте ссылку на товар:',
        { parse_mode: 'HTML' }
      )

      const urlCtx = await conversation.wait()
      if (!urlCtx.message?.text) {
        await ctx.reply('❌ Выкуп отменен')
        return
      }

      orderData.productUrl = urlCtx.message.text.trim()

      // ШАГ 3: Название товара (ручной ввод)
      await ctx.reply(
        '📦 <b>Название товара</b>\n\n' +
        'Введите название товара (как на сайте):',
        { parse_mode: 'HTML' }
      )

      const nameCtx = await conversation.wait()
      if (!nameCtx.message?.text) {
        await ctx.reply('❌ Выкуп отменен')
        return
      }

      orderData.productName = nameCtx.message.text.trim()

      // ШАГ 4: Цена товара
      await ctx.reply(
        `💰 <b>Цена товара</b>\n\n` +
        `Введите цену товара в ${country.currency}:\n` +
        '<i>Например: 99.99</i>',
        { parse_mode: 'HTML' }
      )

      const priceCtx = await conversation.wait()
      if (!priceCtx.message?.text) {
        await ctx.reply('❌ Выкуп отменен')
        return
      }

      const price = parseFloat(priceCtx.message.text.replace(',', '.').replace(/[^\d.]/g, ''))
      if (isNaN(price) || price <= 0) {
        await ctx.reply('❌ Неверная цена')
        return
      }

      orderData.productPrice = price
      orderData.currency = country.currency

      // ШАГ 5: Количество
      await ctx.reply(
        '🔢 <b>Количество</b>\n\n' +
        'Выберите количество товара:',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '1 шт', callback_data: 'qty:1' },
                { text: '2 шт', callback_data: 'qty:2' },
                { text: '3 шт', callback_data: 'qty:3' }
              ],
              [
                { text: '5 шт', callback_data: 'qty:5' },
                { text: '10 шт', callback_data: 'qty:10' },
                { text: '✏️ Другое', callback_data: 'qty:custom' }
              ]
            ]
          }
        }
      )

      const qtyCtx = await conversation.waitForCallbackQuery(/^qty:/)
      await qtyCtx.answerCallbackQuery()
      
      const qtyValue = qtyCtx.callbackQuery.data.replace('qty:', '')
      if (qtyValue === 'custom') {
        await ctx.reply('Введите количество:')
        const customQtyCtx = await conversation.wait()
        const qty = parseInt(customQtyCtx.message?.text || '0')
        if (isNaN(qty) || qty <= 0) {
          await ctx.reply('❌ Неверное количество')
          return
        }
        orderData.quantity = qty
      } else {
        orderData.quantity = parseInt(qtyValue)
      }

      // ШАГ 6: Дополнительные пожелания
      await ctx.reply(
        '📝 <b>Дополнительные пожелания</b>\n\n' +
        'Есть особые пожелания по товару?\n' +
        '(цвет, размер, модификация и т.д.)',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Без особых пожеланий', callback_data: 'notes:none' }],
              [{ text: '✏️ Написать пожелания', callback_data: 'notes:custom' }]
            ]
          }
        }
      )

      const notesCtx = await conversation.waitForCallbackQuery(/^notes:/)
      await notesCtx.answerCallbackQuery()
      
      if (notesCtx.callbackQuery.data === 'notes:custom') {
        await ctx.reply('Напишите ваши пожелания:')
        const customNotesCtx = await conversation.wait()
        orderData.notes = customNotesCtx.message?.text
      }

      // Расчет стоимости
      const commission = new Decimal(orderData.productPrice!)
        .times(orderData.quantity!)
        .times(country.purchaseCommission)
        .dividedBy(100)
      
      const productTotal = new Decimal(orderData.productPrice!)
        .times(orderData.quantity!)
      
      const prepayment = productTotal.plus(commission)
      
      // Курс валюты (упрощенно)
      const exchangeRate = getExchangeRate(orderData.currency!)
      const prepaymentRub = prepayment.times(exchangeRate)

      // ШАГ 7: Выбор адреса доставки
      const addresses = await getUserAddresses(ctx.user!.id)
      
      if (addresses.length === 0) {
        await ctx.reply('❌ У вас нет сохраненных адресов')
        return
      }

      const addressButtons = addresses.map(addr => [{
        text: `${addr.isDefault ? '🏠' : '📍'} ${addr.alias}: ${addr.city.name}`,
        callback_data: `addr:${addr.id}`
      }])

      await ctx.reply(
        '📍 <b>Адрес доставки</b>\n\n' +
        'Куда доставить товар после получения?',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: addressButtons
          }
        }
      )

      const addrCtx = await conversation.waitForCallbackQuery(/^addr:/)
      await addrCtx.answerCallbackQuery()
      orderData.addressId = addrCtx.callbackQuery.data.replace('addr:', '')

      // ШАГ 8: Подтверждение заказа
      await ctx.replyWithHTML(
        '🛒 <b>Подтверждение заказа на выкуп</b>\n\n' +
        `📦 ${escapeHtml(orderData.productName!)} × ${orderData.quantity} шт\n` +
        `${country.flagEmoji} Магазин: ${escapeHtml(country.name)}\n` +
        (orderData.notes ? `💬 Пожелания: ${escapeHtml(orderData.notes)}\n` : '') +
        '\n💵 <b>ПРЕДОПЛАТА (полная за товар):</b>\n' +
        `├ Стоимость товара: ${orderData.currency} ${productTotal.toFixed(2)} (~${formatCurrency(productTotal.times(exchangeRate))})\n` +
        `├ Комиссия за выкуп (${country.purchaseCommission}%): ~${formatCurrency(commission.times(exchangeRate))}\n` +
        `└ <b>ИТОГО ПРЕДОПЛАТА: ~${formatCurrency(prepaymentRub)}</b>\n\n` +
        '📦 <b>ДОПЛАТА (только за доставку):</b>\n' +
        '├ Будет рассчитана по факту веса\n' +
        '├ Тариф доставки: от 450₽/кг\n' +
        '└ Оплачивается после получения на склад\n\n' +
        '⏱️ <b>Сроки:</b>\n' +
        '├ Выкуп товара: 1-3 дня\n' +
        '└ Доставка в РФ: 10-18 дней',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Подтвердить и оплатить', callback_data: 'confirm:purchase' }],
              [{ text: '✏️ Изменить заказ', callback_data: 'edit:purchase' }],
              [{ text: '❌ Отменить', callback_data: 'cancel:purchase' }]
            ]
          }
        }
      )

      const confirmCtx = await conversation.waitForCallbackQuery(/^(confirm|cancel|edit):/)
      await confirmCtx.answerCallbackQuery()
      
      if (confirmCtx.callbackQuery.data === 'cancel:purchase') {
        await ctx.editMessageText('❌ Заказ на выкуп отменен')
        return
      }

      if (confirmCtx.callbackQuery.data === 'edit:purchase') {
        await ctx.reply('Создайте заказ заново')
        return
      }

      // Создаем заказ
      const order = await prisma.order.create({
        data: {
          orderNumber: generateOrderNumber('PU'),
          type: 'PURCHASE',
          status: 'CREATED',
          userId: ctx.user!.id,
          fromCountryId: orderData.countryId!,
          toCountryId: 'RU',
          purchaseUrl: orderData.productUrl,
          purchaseNotes: orderData.notes,
          addressId: orderData.addressId!,
          productCost: productTotal,
          commission,
          prepaidAmount: prepaymentRub,
          totalCost: prepaymentRub, // Пока только предоплата
          description: `${orderData.productName} x${orderData.quantity}`,
          declaredValue: productTotal.toNumber(),
          declaredCurrency: orderData.currency
        }
      })

      // Создаем товарную позицию
      await prisma.orderItem.create({
        data: {
          orderId: order.id,
          name: orderData.productName!,
          quantity: orderData.quantity!,
          price: orderData.productPrice!,
          currency: orderData.currency!
        }
      })

      // Отправляем на оплату
      await ctx.editMessageText(
        `✅ Заказ на выкуп #${order.orderNumber} создан!\n\n` +
        `💰 К предоплате: ${formatCurrency(order.prepaidAmount || order.totalCost)}\n\n` +
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

      logger.info('Purchase order created', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: ctx.user!.id
      })

    } catch (error) {
      logger.error('Failed to create purchase order:', error)
      await ctx.reply(
        '❌ Произошла ошибка при создании заказа.\n' +
        'Попробуйте еще раз или обратитесь в поддержку.'
      )
    }
  },
  'purchaseByLink'
)

// Conversation для товаров с фиксированными ценами
export const purchaseFixedConversation = createConversation(
  async function purchaseFixed(
    conversation: BotConversation,
    ctx: BotContext
  ): Promise<void> {
    try {
      // Получаем страны с фиксированными товарами
      const countries = await prisma.country.findMany({
        where: {
          isActive: true,
          fixedProducts: {
            some: { isActive: true }
          }
        },
        include: {
          _count: {
            select: {
              fixedProducts: {
                where: { isActive: true }
              }
            }
          }
        },
        orderBy: {
          popularityScore: 'desc'
        }
      })

      if (countries.length === 0) {
        await ctx.reply('❌ Нет доступных товаров с фиксированными ценами')
        return
      }

      // Показываем страны
      const countryButtons = countries.map(c => [{
        text: `${c.flagEmoji} ${c.name} (${c._count.fixedProducts} товаров)`,
        callback_data: `fixed:country:${c.id}`
      }])

      await ctx.editMessageText(
        '💰 <b>Товары с фиксированными ценами</b>\n\n' +
        'Популярные товары по выгодным ценам\n' +
        'Комиссия уже включена в стоимость!\n\n' +
        'Выберите страну:',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              ...countryButtons,
              [{ text: '⬅️ Назад', callback_data: 'purchase:new' }]
            ]
          }
        }
      )

      const countryCtx = await conversation.waitForCallbackQuery(/^fixed:country:/)
      await countryCtx.answerCallbackQuery()
      const countryId = countryCtx.callbackQuery.data.replace('fixed:country:', '')

      // Получаем категории товаров
      const categories = await prisma.productCategory.findMany({
        where: {
          products: {
            some: {
              countryId,
              isActive: true
            }
          }
        },
        include: {
          _count: {
            select: {
              products: {
                where: {
                  countryId,
                  isActive: true
                }
              }
            }
          }
        },
        orderBy: {
          sortOrder: 'asc'
        }
      })

      const categoryButtons = categories.map(c => [{
        text: `${c.icon} ${c.name} (${c._count.products})`,
        callback_data: `fixed:category:${c.id}`
      }])

      await ctx.editMessageText(
        '💰 <b>Выберите категорию товаров:</b>',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              ...categoryButtons,
              [{ text: '⬅️ Назад', callback_data: 'purchase:fixed' }]
            ]
          }
        }
      )

      const categoryCtx = await conversation.waitForCallbackQuery(/^fixed:category:/)
      await categoryCtx.answerCallbackQuery()
      const categoryId = categoryCtx.callbackQuery.data.replace('fixed:category:', '')

      // Получаем товары
      const products = await prisma.fixedPriceProduct.findMany({
        where: {
          countryId,
          categoryId,
          isActive: true,
          isAvailable: true
        },
        orderBy: [
          { isPopular: 'desc' },
          { name: 'asc' }
        ],
        take: 10
      })

      if (products.length === 0) {
        await ctx.reply('❌ Нет доступных товаров в этой категории')
        return
      }

      const productButtons = products.map(p => [{
        text: `${p.isPopular ? '⭐ ' : ''}${p.name} - $${p.price}`,
        callback_data: `fixed:product:${p.id}`
      }])

      await ctx.editMessageText(
        '🛒 <b>Выберите товар:</b>',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              ...productButtons,
              [{ text: '⬅️ К категориям', callback_data: 'purchase:fixed' }]
            ]
          }
        }
      )

      const productCtx = await conversation.waitForCallbackQuery(/^fixed:product:/)
      await productCtx.answerCallbackQuery()
      const productId = productCtx.callbackQuery.data.replace('fixed:product:', '')

      // Получаем полную информацию о товаре
      const product = await prisma.fixedPriceProduct.findUnique({
        where: { id: productId },
        include: {
          country: true,
          category: true
        }
      })

      if (!product) {
        await ctx.reply('❌ Товар не найден')
        return
      }

      // Показываем детали товара
      const exchangeRate = getExchangeRate(product.currency)
      const priceRub = new Decimal(product.price).times(exchangeRate)
      const deliveryMin = new Decimal(product.estimatedWeight).times(450) // минимальный тариф
      const deliveryMax = new Decimal(product.estimatedWeight).times(850) // максимальный тариф

      await ctx.replyWithHTML(
        `${product.category.icon} <b>${escapeHtml(product.name)}</b>\n\n` +
        `💰 Фиксированная цена: $${product.price}\n` +
        '🎯 Финальная цена - никаких доплат за товар!\n\n' +
        '<b>📋 Что включено:</b>\n' +
        '• Сам товар по указанной цене\n' +
        '• Выкуп и все сборы\n' +
        '• Упаковка для международной доставки\n' +
        '• Гарантия оригинальности\n\n' +
        `⚖️ Примерный вес: ${product.estimatedWeight} кг\n` +
        `🚚 Доставка: ${formatCurrency(deliveryMin)}-${formatCurrency(deliveryMax)}\n\n` +
        '<b>💵 ИТОГОВАЯ СТОИМОСТЬ:</b>\n' +
        `├ Товар: $${product.price} (~${formatCurrency(priceRub)})\n` +
        `├ Доставка: ~${formatCurrency(deliveryMin)}-${formatCurrency(deliveryMax)}\n` +
        `└ <b>ИТОГО: ~${formatCurrency(priceRub.plus(deliveryMin))}-${formatCurrency(priceRub.plus(deliveryMax))}</b>\n\n` +
        '🛒 Количество:',
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '1 шт', callback_data: 'fixed:qty:1' },
                { text: '2 шт', callback_data: 'fixed:qty:2' },
                { text: '3 шт', callback_data: 'fixed:qty:3' }
              ],
              [{ text: '✏️ Другое количество', callback_data: 'fixed:qty:custom' }],
              [{ text: '⬅️ К товарам', callback_data: 'purchase:fixed' }]
            ]
          }
        }
      )

      const qtyCtx = await conversation.waitForCallbackQuery(/^fixed:qty:/)
      await qtyCtx.answerCallbackQuery()
      
      let quantity = 1
      const qtyValue = qtyCtx.callbackQuery.data.replace('fixed:qty:', '')
      if (qtyValue === 'custom') {
        await ctx.reply('Введите количество:')
        const customQtyCtx = await conversation.wait()
        quantity = parseInt(customQtyCtx.message?.text || '1')
        if (isNaN(quantity) || quantity <= 0) quantity = 1
      } else {
        quantity = parseInt(qtyValue)
      }

      // Создаем заказ с фиксированным товаром
      const totalPrice = new Decimal(product.price).times(quantity).times(exchangeRate)
      
      const order = await prisma.order.create({
        data: {
          orderNumber: generateOrderNumber('FP'),
          type: 'FIXED_PRICE',
          status: 'CREATED',
          userId: ctx.user!.id,
          fromCountryId: product.countryId,
          toCountryId: 'RU',
          weight: new Decimal(product.estimatedWeight).times(quantity),
          description: `${product.name} x${quantity}`,
          productCost: totalPrice,
          prepaidAmount: totalPrice,
          totalCost: totalPrice,
          declaredValue: new Decimal(product.price).times(quantity).toNumber(),
          declaredCurrency: product.currency
        }
      })

      // Создаем товарную позицию
      await prisma.orderItem.create({
        data: {
          orderId: order.id,
          productId: product.id,
          name: product.name,
          quantity,
          price: product.price,
          currency: product.currency
        }
      })

      await ctx.editMessageText(
        `✅ Заказ #${order.orderNumber} создан!\n\n` +
        `${product.name} × ${quantity} шт\n` +
        `💰 К оплате: ${formatCurrency(totalPrice)}\n\n` +
        'После оплаты товар будет выкуплен и отправлен вам!',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '💳 Оплатить', callback_data: `pay:card:${order.id}` }],
              [{ text: '📦 Мои заказы', callback_data: 'orders:list' }],
              [{ text: '🏠 Главное меню', callback_data: 'menu:main' }]
            ]
          }
        }
      )

    } catch (error) {
      logger.error('Failed to process fixed price purchase:', error)
      await ctx.reply('❌ Произошла ошибка. Попробуйте еще раз.')
    }
  },
  'purchaseFixed'
)

// Вспомогательная функция для получения курса валют (упрощенная)
function getExchangeRate(currency: string): number {
  const rates: Record<string, number> = {
    'USD': 90,
    'EUR': 100,
    'GBP': 115,
    'CNY': 13,
    'TRY': 3,
    'KRW': 0.07,
    'JPY': 0.6
  }
  return rates[currency] || 90
}