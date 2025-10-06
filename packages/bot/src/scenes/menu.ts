// packages/bot/src/scenes/menu.ts - Обработчики главного меню
import { Composer } from 'grammy'
import type { BotContext } from '../types/context'
import { mainMenuKeyboard } from '../keyboards/main'
import { getUserStats } from '../services/stats'
import { formatCurrency } from '../utils/formatter'
import { logger } from '../utils/logger'

export const menuHandlers = new Composer<BotContext>()

// Возврат в главное меню
menuHandlers.callbackQuery('menu:main', async (ctx) => {
  await ctx.answerCallbackQuery()
  
  if (!ctx.user) {
    await ctx.editMessageText('❌ Необходима регистрация. Используйте /start')
    return
  }
  
  try {
    const stats = await getUserStats(ctx.user.id)
    const keyboard = await mainMenuKeyboard(ctx)
    
    await ctx.editMessageText(
      `🏠 <b>Главное меню</b>\n\n` +
      `🆔 ID: <code>#${ctx.user.customId}</code>\n` +
      `💰 Баланс: <b>${formatCurrency(stats.balance)}</b>\n` +
      `📦 Активных заказов: <b>${stats.activeOrders}</b>\n` +
      (stats.vipTier !== 'REGULAR' ? `🎁 VIP статус: <b>${stats.vipTier}</b>\n` : '') +
      '\nВыберите действие:',
      {
        reply_markup: keyboard,
        parse_mode: 'HTML'
      }
    )
  } catch (error) {
    logger.error('Failed to show main menu:', error)
    await ctx.editMessageText('❌ Произошла ошибка. Попробуйте /start')
  }
})

// Обработчик кнопки "Отмена"
menuHandlers.callbackQuery('cancel', async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.editMessageText('❌ Действие отменено')
  
  // Показываем главное меню
  if (ctx.user) {
    const stats = await getUserStats(ctx.user.id)
    const keyboard = await mainMenuKeyboard(ctx)
    
    setTimeout(async () => {
      await ctx.reply(
        `🏠 Главное меню\n\n` +
        `💰 Баланс: ${formatCurrency(stats.balance)}\n` +
        `📦 Активных заказов: ${stats.activeOrders}`,
        {
          reply_markup: keyboard
        }
      )
    }, 500)
  }
})

// Информационные страницы
menuHandlers.callbackQuery('info:how', async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.editMessageText(
    '📋 <b>Как работает CargoExpress</b>\n\n' +
    '📦 <b>ОТПРАВКА ПОСЫЛОК:</b>\n' +
    '1️⃣ Регистрируетесь в боте → получаете ID\n' +
    '2️⃣ Отправляете товары на наш склад с вашим ID\n' +
    '3️⃣ Уведомляем о поступлении посылки\n' +
    '4️⃣ Оформляете доставку в боте\n' +
    '5️⃣ Оплачиваете по весу\n' +
    '6️⃣ Получаете в России\n\n' +
    '🛒 <b>ВЫКУП ТОВАРОВ:</b>\n' +
    '1️⃣ Присылаете ссылку на товар\n' +
    '2️⃣ Мы покупаем его для вас\n' +
    '3️⃣ Полная предоплата за товар + комиссия\n' +
    '4️⃣ Доплата только за вес доставки\n' +
    '5️⃣ Получаете оригинальный товар\n\n' +
    '💰 <b>ТАРИФЫ:</b>\n' +
    '• Посылки: от 450₽ за кг\n' +
    '• Выкуп: 3-7% комиссии\n' +
    '• Фикс. цены: без комиссии\n\n' +
    '⏱️ <b>СРОКИ:</b> 10-18 дней доставка',
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🏢 Посмотреть склады', callback_data: 'warehouses:list' }],
          [{ text: '▶️ Начать регистрацию', callback_data: 'registration:start' }]
        ]
      }
    }
  )
})

menuHandlers.callbackQuery('info:tariffs', async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.editMessageText(
    '💰 <b>Тарифы доставки</b>\n\n' +
    '🇺🇸 <b>США:</b> 650₽/кг (мин. 1500₽)\n' +
    '🇨🇳 <b>Китай:</b> 450₽/кг (мин. 1000₽)\n' +
    '🇩🇪 <b>Германия:</b> 750₽/кг (мин. 1500₽)\n' +
    '🇬🇧 <b>Великобритания:</b> 800₽/кг (мин. 1500₽)\n' +
    '🇹🇷 <b>Турция:</b> 550₽/кг (мин. 1200₽)\n' +
    '🇰🇷 <b>Южная Корея:</b> 700₽/кг (мин. 1500₽)\n' +
    '🇯🇵 <b>Япония:</b> 750₽/кг (мин. 1500₽)\n' +
    '🇫🇷 <b>Франция:</b> 850₽/кг (мин. 1700₽)\n\n' +
    '⭐ <b>Скидки VIP клиентам:</b>\n' +
    '• Silver: -5%\n' +
    '• Gold: -10%\n' +
    '• Platinum: -15%\n\n' +
    '⏱️ Срок доставки: 10-18 дней',
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📊 Калькулятор стоимости', callback_data: 'calculator:start' }],
          [{ text: '▶️ Начать регистрацию', callback_data: 'registration:start' }]
        ]
      }
    }
  )
})

menuHandlers.callbackQuery('info:products', async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.editMessageText(
    '🛒 <b>Примеры товаров для выкупа</b>\n\n' +
    '📱 <b>Электроника:</b>\n' +
    '• iPhone, iPad, MacBook\n' +
    '• Samsung, Xiaomi, OnePlus\n' +
    '• PlayStation, Xbox, Nintendo\n' +
    '• Наушники, смарт-часы\n\n' +
    '👕 <b>Одежда и обувь:</b>\n' +
    '• Nike, Adidas, Puma\n' +
    '• Zara, H&M, Uniqlo\n' +
    '• Supreme, Off-White\n' +
    '• Детская одежда\n\n' +
    '💄 <b>Косметика:</b>\n' +
    '• Sephora, MAC, NYX\n' +
    '• The Ordinary, CeraVe\n' +
    '• Корейская косметика\n\n' +
    '🏠 <b>Для дома:</b>\n' +
    '• IKEA, Home Depot\n' +
    '• Dyson, iRobot\n' +
    '• Кухонная техника\n\n' +
    '✅ Выкупаем с Amazon, eBay, AliExpress и других магазинов!',
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛒 Заказать выкуп', callback_data: 'purchase:new' }],
          [{ text: '▶️ Начать регистрацию', callback_data: 'registration:start' }]
        ]
      }
    }
  )
})

menuHandlers.callbackQuery('info:warehouses', async (ctx) => {
  await ctx.answerCallbackQuery()
  // Перенаправляем на список складов
  await ctx.emit('callback_query:data', 'warehouses:list')
})