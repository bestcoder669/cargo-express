// packages/bot/src/scenes/admin/index.ts - Админские обработчики
import { Composer } from 'grammy'
import type { BotContext } from '../../types/context'
import { getAdminDashboardKeyboard } from '../../keyboards/admin'
import { getDashboardStats } from '../../services/stats'
import { formatCurrency, formatDate } from '../../utils/formatter'
import { logger } from '../../utils/logger'

export const adminHandlers = new Composer<BotContext>()

// Middleware проверки админских прав
const requireAdmin = async (ctx: BotContext, next: () => Promise<void>) => {
  if (!ctx.isAdmin) {
    await ctx.answerCallbackQuery('❌ У вас нет доступа')
    return
  }
  await next()
}

// Применяем middleware ко всем админским обработчикам
adminHandlers.use(requireAdmin)

// Dashboard
adminHandlers.callbackQuery('admin:dashboard', async (ctx) => {
  await ctx.answerCallbackQuery()
  
  try {
    const stats = await getDashboardStats()
    const keyboard = await getAdminDashboardKeyboard(ctx.admin!.role)
    
    await ctx.editMessageText(
      '🔧 <b>AdminPanel CargoExpress</b>\n' +
      `👨‍💼 ${ctx.admin!.firstName} ${ctx.admin!.lastName || ''} | ${ctx.admin!.role}\n\n` +
      `📊 <b>DASHBOARD (${formatDate(new Date())})</b>\n\n` +
      '💰 <b>ФИНАНСЫ ЗА СЕГОДНЯ:</b>\n' +
      `├ Выручка: ${formatCurrency(stats.todayRevenue)} (${stats.revenueChange > 0 ? '+' : ''}${stats.revenueChange.toFixed(1)}%)\n` +
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
        parse_mode: 'HTML',
        reply_markup: keyboard
      }
    )
  } catch (error) {
    logger.error('Failed to show admin dashboard:', error)
    await ctx.reply('❌ Ошибка при загрузке панели администратора')
  }
})

// Обновить dashboard
adminHandlers.callbackQuery('admin:refresh', async (ctx) => {
  await ctx.answerCallbackQuery('🔄 Обновляю...')
  // Перенаправляем на dashboard для обновления
  await ctx.emit('callback_query:data', 'admin:dashboard')
})

// Заказы
adminHandlers.callbackQuery(/^admin:orders/, async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.reply('📦 Управление заказами будет доступно в ближайшем обновлении')
})

// Пользователи
adminHandlers.callbackQuery(/^admin:users/, async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.reply('👥 Управление пользователями будет доступно в ближайшем обновлении')
})

// Финансы
adminHandlers.callbackQuery('admin:finance', async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.reply('💰 Финансовая панель будет доступна в ближайшем обновлении')
})

// Поддержка
adminHandlers.callbackQuery('admin:support', async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.reply('💬 Управление поддержкой будет доступно в ближайшем обновлении')
})

// Аналитика
adminHandlers.callbackQuery('admin:analytics', async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.reply('📊 Аналитика будет доступна в ближайшем обновлении')
})

// Настройки
adminHandlers.callbackQuery('admin:settings', async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.reply('⚙️ Настройки системы будут доступны в ближайшем обновлении')
})

// Администраторы
adminHandlers.callbackQuery('admin:admins', async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.reply('👨‍💼 Управление администраторами будет доступно в ближайшем обновлении')
})

// Рассылка
adminHandlers.callbackQuery('admin:broadcast', async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.reply('📢 Система рассылок будет доступна в ближайшем обновлении')
})

// Сканер
adminHandlers.callbackQuery('admin:scanner', async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.reply(
    '📱 <b>Сканер штрих-кодов</b>\n\n' +
    '🔄 Режим сканирования активирован.\n' +
    'Отправьте штрих-код или трек-номер:\n\n' +
    '<i>Формат: текст или фото с штрих-кодом</i>',
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📷 Сканировать фото', callback_data: 'scanner:photo' }],
          [{ text: '✏️ Ввести вручную', callback_data: 'scanner:manual' }],
          [{ text: '❌ Закрыть сканер', callback_data: 'scanner:close' }]
        ]
      }
    }
  )
})

// Обработчики сканера
adminHandlers.callbackQuery('scanner:photo', async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.reply('📷 Отправьте фото со штрих-кодом')
})

adminHandlers.callbackQuery('scanner:manual', async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.reply('✏️ Введите трек-номер или штрих-код вручную:')
})

adminHandlers.callbackQuery('scanner:close', async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.editMessageText('✅ Сканер закрыт')
})