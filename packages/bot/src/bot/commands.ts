// packages/bot/src/bot/commands.ts - Обработчики команд
import type { Bot } from 'grammy'
import type { BotContext } from '../types/context'
import { mainMenuKeyboard, quickActionsKeyboard, profileKeyboard } from '../keyboards/main'
import { getWarehousesKeyboard, getCountriesKeyboard } from '../keyboards/dynamic'
import { getAdminDashboardKeyboard } from '../keyboards/admin'
import { getUserStats } from '../services/stats'
import { formatCurrency, formatDate } from '../utils/formatter'
import { trackOrder } from '../services/tracking'
import { logger } from '../utils/logger'
import { getDashboardStats, getQuickStats } from '../services/stats'

export function setupCommands(bot: Bot<BotContext>): void {
  // Команда /start
  bot.command('start', async (ctx) => {
    try {
      if (!ctx.from) return
      
      const startParam = ctx.match
      
      // Проверка реферальной ссылки
      if (startParam && startParam.startsWith('ref_')) {
        const referrerId = startParam.replace('ref_', '')
        ctx.session.referrerId = referrerId
      }
      
      if (!ctx.user) {
        // Новый пользователь - начинаем регистрацию
        await ctx.replyWithHTML(
          '🚀 <b>Добро пожаловать в CargoExpress!</b>\n\n' +
          'Доставка товаров из-за рубежа в Россию 🇷🇺\n\n' +
          '🌍 Работаем со складами по всему миру\n' +
          '📦 Доставляем посылки и выкупаем товары\n' +
          '⚡ Быстро, надежно, выгодно\n\n' +
          'Изучите наши возможности:',
          {
            reply_markup: new InlineKeyboard()
              .text('🏢 Адреса складов', 'info:warehouses')
              .text('📋 Как это работает', 'info:how')
              .row()
              .text('💰 Тарифы доставки', 'info:tariffs')
              .text('🛒 Примеры товаров', 'info:products')
              .row()
              .text('▶️ Начать регистрацию', 'registration:start')
          }
        )
        return
      }
      
      // Зарегистрированный пользователь
      const stats = await getUserStats(ctx.user.id)
      const mainKeyboard = await mainMenuKeyboard(ctx)
      
      await ctx.replyWithHTML(
        `👋 <b>Добро пожаловать, ${ctx.user.firstName}!</b>\n\n` +
        `🆔 ID: <code>#${ctx.user.customId}</code>\n` +
        `💰 Баланс: <b>${formatCurrency(stats.balance)}</b>\n` +
        `📦 Активных заказов: <b>${stats.activeOrders}</b>\n` +
        (stats.vipTier !== 'REGULAR' ? `🎁 VIP статус: <b>${stats.vipTier}</b>\n` : ''),
        {
          reply_markup: mainKeyboard
        }
      )
    } catch (error) {
      logger.error('Error in /start command:', error)
      await ctx.reply('❌ Произошла ошибка. Попробуйте позже или обратитесь в поддержку.')
    }
  })
  
  // Команда /track - отслеживание посылки
  bot.command('track', async (ctx) => {
    const trackingNumber = ctx.match?.trim()
    
    if (!trackingNumber) {
      await ctx.replyWithHTML(
        '📍 <b>Отслеживание посылки</b>\n\n' +
        'Введите номер заказа или трек-номер:\n\n' +
        '<i>Примеры:</i>\n' +
        '• <code>#SP12345</code> (номер заказа)\n' +
        '• <code>CP123456789US</code> (трек-номер)',
        {
          reply_markup: new InlineKeyboard()
            .text('📦 Мои активные заказы', 'orders:active')
            .row()
            .text('⬅️ Главное меню', 'menu:main')
        }
      )
      return
    }
    
    const tracking = await trackOrder(trackingNumber, ctx.user?.id)
    
    if (!tracking) {
      await ctx.reply('❌ Заказ не найден. Проверьте номер и попробуйте снова.')
      return
    }
    
    const statusEmoji = {
      CREATED: '🆕',
      PAID: '💳',
      WAREHOUSE_RECEIVED: '📦',
      PROCESSING: '🔄',
      SHIPPED: '✈️',
      CUSTOMS: '🏛️',
      IN_TRANSIT: '🚛',
      READY_PICKUP: '🏪',
      DELIVERED: '✅',
    }
    
    await ctx.replyWithHTML(
      `📍 <b>Отслеживание ${tracking.orderNumber}</b>\n\n` +
      `📦 ${tracking.description}\n` +
      `👤 Получатель: ${tracking.recipient}\n` +
      `🏠 Адрес: ${tracking.address}\n\n` +
      `${statusEmoji[tracking.status] || '📍'} <b>Текущий статус:</b> ${tracking.statusText}\n` +
      `📍 Местоположение: ${tracking.location}\n` +
      `⏱️ Обновлено: ${formatDate(tracking.updatedAt)}\n\n` +
      '<b>История перемещений:</b>\n' +
      tracking.history.map(h => 
        `${h.date} - ${h.status}${h.location ? ` (${h.location})` : ''}`
      ).join('\n'),
      {
        reply_markup: new InlineKeyboard()
          .text('🔄 Обновить статус', `track:refresh:${trackingNumber}`)
          .text('📞 Поддержка', 'support:order')
          .row()
          .text('📧 Отправить трекинг', `track:email:${trackingNumber}`)
          .row()
          .text('⬅️ Назад', 'menu:main')
      }
    )
  })
  
  // Команда /warehouses - адреса складов
  bot.command('warehouses', async (ctx) => {
    const keyboard = await getWarehousesKeyboard()
    
    await ctx.replyWithHTML(
      '🏢 <b>Наши склады по миру</b>\n\n' +
      `Отправляйте посылки с указанием ID: <code>#${ctx.user?.customId || 'XXXXX'}</code>\n` +
      'Выберите склад для просмотра адреса:',
      {
        reply_markup: keyboard
      }
    )
  })
  
  // Команда /calculator - калькулятор стоимости
  bot.command('calculator', async (ctx) => {
    await ctx.replyWithHTML(
      '📊 <b>Калькулятор стоимости доставки</b>\n\n' +
      'Рассчитайте стоимость доставки заранее.\n' +
      'Выберите страну отправления:',
      {
        reply_markup: await getCountriesKeyboard('shipping')
      }
    )
  })
  
  // Команда /support - поддержка
  bot.command('support', async (ctx) => {
    await ctx.replyWithHTML(
      '💬 <b>Поддержка CargoExpress</b>\n' +
      '🟢 Онлайн 24/7 | Средний ответ: 3 минуты\n\n' +
      'Как можем помочь?',
      {
        reply_markup: new InlineKeyboard()
          .text('❓ Частые вопросы', 'support:faq')
          .text('📍 Где моя посылка?', 'support:tracking')
          .row()
          .text('💰 Вопросы по оплате', 'support:payment')
          .text('📦 Проблема с заказом', 'support:order')
          .row()
          .text('🛒 Помощь с выкупом', 'support:purchase')
          .text('🏢 Вопрос по складу', 'support:warehouse')
          .row()
          .text('💬 Чат с оператором', 'support:chat')
          .row()
          .text('⬅️ Главное меню', 'menu:main')
      }
    )
  })
  
  // Команда /profile - профиль пользователя
  bot.command('profile', async (ctx) => {
    if (!ctx.user) {
      await ctx.reply('❌ Необходима регистрация. Используйте /start')
      return
    }
    
    const stats = await getUserStats(ctx.user.id)
    const keyboard = await profileKeyboard(ctx.user.id)
    
    await ctx.replyWithHTML(
      `👤 <b>${ctx.user.firstName} ${ctx.user.lastName || ''}</b>\n` +
      `🆔 ID: <code>#${ctx.user.customId}</code> | 💰 Баланс: <b>${formatCurrency(stats.balance)}</b>\n\n` +
      '📊 <b>Ваша статистика:</b>\n' +
      `├ Заказов всего: ${stats.totalOrders}\n` +
      `├ Активных: ${stats.activeOrders}\n` +
      `├ Потрачено: ${formatCurrency(stats.totalSpent)}\n` +
      `├ Сэкономлено: ${formatCurrency(stats.totalSaved)}\n` +
      `└ Статус: ${stats.vipTier === 'REGULAR' ? 'Обычный' : `VIP ${stats.vipTier} ⭐`}\n\n` +
      'Управление профилем:',
      {
        reply_markup: keyboard
      }
    )
  })
  
  // Команда /help - помощь
  bot.command('help', async (ctx) => {
    await ctx.replyWithHTML(
      '❓ <b>Помощь по использованию бота</b>\n\n' +
      '<b>Основные команды:</b>\n' +
      '/start - Главное меню\n' +
      '/track - Отследить посылку\n' +
      '/warehouses - Адреса складов\n' +
      '/calculator - Калькулятор доставки\n' +
      '/support - Поддержка\n' +
      '/profile - Ваш профиль\n\n' +
      '<b>Как оформить заказ:</b>\n' +
      '1. Нажмите "📦 Новая отправка" в главном меню\n' +
      '2. Выберите страну отправления\n' +
      '3. Укажите вес и содержимое\n' +
      '4. Оплатите заказ\n\n' +
      '<b>Как заказать выкуп:</b>\n' +
      '1. Нажмите "🛒 Заказать товар"\n' +
      '2. Выберите страну магазина\n' +
      '3. Отправьте ссылку на товар\n' +
      '4. Оплатите предоплату\n\n' +
      'По всем вопросам: /support',
      {
        reply_markup: quickActionsKeyboard
      }
    )
  })
  
  // Команда /admin - админ-панель (только для админов)
  bot.command('admin', async (ctx) => {
    if (!ctx.isAdmin) {
      await ctx.reply('❌ У вас нет доступа к этой команде')
      return
    }
    
    const stats = await getDashboardStats()
    
    await ctx.replyWithHTML(
      '🔧 <b>AdminPanel CargoExpress</b>\n' +
      `👨‍💼 ${ctx.admin!.firstName} ${ctx.admin!.lastName} | ${ctx.admin!.role}\n\n` +
      `📊 <b>DASHBOARD (${formatDate(new Date())})</b>\n\n` +
      '💰 <b>ФИНАНСЫ ЗА СЕГОДНЯ:</b>\n' +
      `├ Выручка: ${formatCurrency(stats.todayRevenue)} (${stats.revenueChange > 0 ? '+' : ''}${stats.revenueChange}%)\n` +
      `├ Новых платежей: ${stats.todayPayments} шт\n` +
      `├ Средний чек: ${formatCurrency(stats.avgOrderValue)}\n` +
      `└ Ожидают оплаты: ${stats.pendingPayments} заказов\n\n` +
      '📦 <b>ЗАКАЗЫ ЗА СЕГОДНЯ:</b>\n' +
      `├ Создано: ${stats.todayOrders} заказов\n` +
      `├ Посылки: ${stats.shippingOrders} | Выкупы: ${stats.purchaseOrders}\n` +
      `├ Требуют внимания: ${stats.problemOrders} ⚠️\n` +
      `└ В обработке: ${stats.processingOrders}\n\n` +
      '👥 <b>ПОЛЬЗОВАТЕЛИ:</b>\n' +
      `├ Всего: ${stats.totalUsers} | Новых сегодня: ${stats.todayUsers}\n` +
      `├ Онлайн сейчас: ${stats.onlineUsers}\n` +
      `└ VIP клиентов: ${stats.vipUsers}`,
      {
        reply_markup: await getAdminDashboardKeyboard(ctx.admin!.role)
      }
    )
  })
  
  // Команда /stats - быстрая статистика (для админов)
  bot.command('stats', async (ctx) => {
    if (!ctx.isAdmin) {
      await ctx.reply('❌ У вас нет доступа к этой команде')
      return
    }
    
    const stats = await getQuickStats()
    
    await ctx.replyWithHTML(
      '📊 <b>Быстрая статистика</b>\n\n' +
      stats.map(s => `${s.label}: <b>${s.value}</b>`).join('\n'),
      {
        reply_markup: new InlineKeyboard()
          .text('🔧 Полная панель', 'admin:dashboard')
          .text('📊 Детальная аналитика', 'admin:analytics')
      }
    )
  })
  
  // Команда /broadcast - рассылка (только для админов)
  bot.command('broadcast', async (ctx) => {
    if (!ctx.isAdmin || !['SUPER_ADMIN', 'ORDER_MANAGER'].includes(ctx.admin!.role)) {
      await ctx.reply('❌ У вас нет прав для рассылки')
      return
    }
    
    await ctx.reply('📢 Начните создание рассылки:', {
      reply_markup: new InlineKeyboard()
        .text('📢 Всем пользователям', 'broadcast:all')
        .text('🌟 Только VIP', 'broadcast:vip')
        .row()
        .text('📦 С активными заказами', 'broadcast:active')
        .text('🆕 Новым пользователям', 'broadcast:new')
        .row()
        .text('❌ Отмена', 'cancel')
    })
  })
}