// packages/bot/src/scenes/support.ts - Обработчики поддержки
import { Composer } from 'grammy'
import type { BotContext } from '../types/context'

export const supportHandlers = new Composer<BotContext>()

// Главная страница поддержки
supportHandlers.callbackQuery('support:start', async (ctx) => {
  await ctx.answerCallbackQuery()
  
  await ctx.editMessageText(
    '💬 <b>Поддержка CargoExpress</b>\n' +
    '🟢 Онлайн 24/7 | Средний ответ: 3 минуты\n\n' +
    'Как можем помочь?',
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '❓ Частые вопросы', callback_data: 'support:faq' },
            { text: '📍 Где моя посылка?', callback_data: 'support:tracking' }
          ],
          [
            { text: '💰 Вопросы по оплате', callback_data: 'support:payment' },
            { text: '📦 Проблема с заказом', callback_data: 'support:order' }
          ],
          [
            { text: '🛒 Помощь с выкупом', callback_data: 'support:purchase' },
            { text: '🏢 Вопрос по складу', callback_data: 'support:warehouse' }
          ],
          [
            { text: '💬 Чат с оператором', callback_data: 'support:chat' }
          ],
          [
            { text: '⬅️ Главное меню', callback_data: 'menu:main' }
          ]
        ]
      }
    }
  )
})

// FAQ
supportHandlers.callbackQuery('support:faq', async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.reply('❓ FAQ будет доступно в ближайшем обновлении')
})

// Остальные разделы поддержки
supportHandlers.callbackQuery(/^support:/, async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.reply('💬 Функция поддержки будет доступна в ближайшем обновлении')
})