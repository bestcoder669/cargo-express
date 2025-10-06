// packages/bot/src/scenes/index.ts - Главный файл сцен
import type { Bot } from 'grammy'
import type { BotContext } from '../types/context'
import { registrationScene, registrationConversation } from './registration'
import { shippingScene, shippingConversation } from './shipping'
import { menuHandlers } from './menu'
import { warehouseHandlers } from './warehouses'
import { profileHandlers } from './profile'
import { supportHandlers } from './support'
import { paymentHandlers } from './payment'

export async function setupScenes(bot: Bot<BotContext>): Promise<void> {
  // Регистрируем conversations
  bot.use(registrationConversation)
  bot.use(shippingConversation)
  
  // Регистрируем сцены
  bot.use(registrationScene)
  bot.use(shippingScene)
  
  // Регистрируем обработчики
  bot.use(menuHandlers)
  bot.use(warehouseHandlers)
  bot.use(profileHandlers)
  bot.use(supportHandlers)
  bot.use(paymentHandlers)
  
  // Универсальный обработчик для неизвестных callback_query
  bot.on('callback_query:data', async (ctx) => {
    await ctx.answerCallbackQuery({
      text: '❌ Действие устарело. Используйте /start',
      show_alert: false
    })
  })
}