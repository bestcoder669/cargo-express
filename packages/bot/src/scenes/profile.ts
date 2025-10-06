// packages/bot/src/scenes/profile.ts - Обработчики профиля
import { Composer } from 'grammy'
import type { BotContext } from '../types/context'
import { getUserStats, getUserStatistics } from '../services/user'
import { formatCurrency, formatDate, escapeHtml } from '../utils/formatter'
import { logger } from '../utils/logger'

export const profileHandlers = new Composer<BotContext>()

// Главная страница профиля
profileHandlers.callbackQuery('profile:main', async (ctx) => {
  await ctx.answerCallbackQuery()
  
  if (!ctx.user) {
    await ctx.reply('❌ Необходима регистрация')
    return
  }
  
  try {
    const [stats, statistics] = await Promise.all([
      getUserStats(ctx.user.id),
      getUserStatistics(ctx.user.id)
    ])
    
    await ctx.editMessageText(
      `👤 <b>${escapeHtml(ctx.user.firstName)} ${ctx.user.lastName ? escapeHtml(ctx.user.lastName) : ''}</b>\n` +
      `🆔 ID: <code>#${ctx.user.customId}</code> | 💰 Баланс: <b>${formatCurrency(stats.balance)}</b>\n\n` +
      '📊 <b>Ваша статистика:</b>\n' +
      `├ Заказов всего: ${statistics.totalOrders}\n` +
      `├ Активных: ${statistics.activeOrders}\n` +
      `├ Потрачено: ${formatCurrency(statistics.totalSpent)}\n` +
      `├ Сэкономлено: ${formatCurrency(statistics.totalSaved)}\n` +
      `└ Статус: ${stats.vipTier === 'REGULAR' ? 'Обычный' : `VIP ${stats.vipTier} ⭐`}\n\n` +
      'Управление профилем:',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: `💰 Пополнить баланс (${formatCurrency(stats.balance)})`, callback_data: 'payment:topup' }],
            [
              { text: '📦 История заказов', callback_data: 'orders:history' },
              { text: '📍 Адреса доставки', callback_data: 'addresses:list' }
            ],
            [
              { text: '⚙️ Настройки', callback_data: 'settings:main' },
              { text: '🎁 Реферальная программа', callback_data: 'referral:info' }
            ],
            ...(stats.vipTier !== 'REGULAR' ? [[{ text: '⭐ VIP статус', callback_data: 'vip:status' }]] : []),
            [{ text: '⬅️ Главное меню', callback_data: 'menu:main' }]
          ]
        }
      }
    )
  } catch (error) {
    logger.error('Failed to show profile:', error)
    await ctx.reply('❌ Ошибка при загрузке профиля')
  }
})

// История заказов
profileHandlers.callbackQuery('orders:history', async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.reply('📦 История заказов будет доступна в ближайшем обновлении')
})

// Список заказов
profileHandlers.callbackQuery('orders:list', async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.reply('📦 Список активных заказов будет доступен в ближайшем обновлении')
})

// Адреса доставки
profileHandlers.callbackQuery('addresses:list', async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.reply('📍 Управление адресами будет доступно в ближайшем обновлении')
})

// Настройки
profileHandlers.callbackQuery('settings:main', async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.reply('⚙️ Настройки будут доступны в ближайшем обновлении')
})

// Реферальная программа
profileHandlers.callbackQuery('referral:info', async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.reply('🎁 Реферальная программа будет доступна в ближайшем обновлении')
})

// VIP статус
profileHandlers.callbackQuery('vip:status', async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.reply('⭐ Информация о VIP статусе будет доступна в ближайшем обновлении')
})