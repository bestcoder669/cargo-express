// packages/bot/src/scenes/payment.ts - Обработчики платежей
import { Composer } from 'grammy'
import type { BotContext } from '../types/context'

export const paymentHandlers = new Composer<BotContext>()

// Пополнение баланса
paymentHandlers.callbackQuery('payment:topup', async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.reply('💰 Пополнение баланса будет доступно в ближайшем обновлении')
})

// Оплата заказа
paymentHandlers.callbackQuery(/^pay:/, async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.reply('💳 Система оплаты будет доступна в ближайшем обновлении')
})

// Выкуп товаров
paymentHandlers.callbackQuery('purchase:new', async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.reply('🛒 Выкуп товаров будет доступен в ближайшем обновлении')
})