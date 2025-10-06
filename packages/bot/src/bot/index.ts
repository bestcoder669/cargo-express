// packages/bot/src/bot/index.ts - Инициализация бота
import { Bot, session, webhookCallback } from 'grammy'
import { hydrate } from '@grammyjs/hydrate'
import { conversations } from '@grammyjs/conversations'
import { autoRetry } from '@grammyjs/auto-retry'
import { limit } from '@grammyjs/ratelimiter'
import { parseMode } from '@grammyjs/parse-mode'
import { I18n } from '@grammyjs/i18n'
import { run, sequentialize } from '@grammyjs/runner'
import { RedisAdapter } from '@grammyjs/storage-redis'
import express from 'express'
import path from 'path'
import type { BotContext } from '../types/context'
import { config, botConfig, isDevelopment } from '../config'
import { logger } from '../utils/logger'
import { redis } from '../services/redis'
import { setupMiddlewares } from './middleware'
import { setupCommands } from './commands'
import { setupScenes } from '../scenes'
import { setupErrorHandler } from './error-handler'

// Тип данных сессии
interface SessionData {
  lastActivity: Date
  scene?: string
  sceneData?: Record<string, any>
  language?: string
  referrerId?: string
  userId?: string
  user?: any
  isAdmin?: boolean
  admin?: any
  orderCreation?: any
  messageToDelete?: number[]
}

// Инициализация i18n
const i18n = new I18n<BotContext>({
  defaultLocale: 'ru',
  directory: path.resolve(__dirname, '../locales'),
  useSession: true,
})

export async function createBot(): Promise<Bot<BotContext>> {
  const bot = new Bot<BotContext>(botConfig.token)
  
  // API transformations
  bot.api.config.use(autoRetry())
  bot.api.config.use(parseMode('HTML'))
  
  // Plugins
  bot.use(hydrate())
  bot.use(i18n)
  
  // Session with Redis storage
  const storage = new RedisAdapter<SessionData>({
    instance: redis,
    ttl: 30 * 24 * 60 * 60, // 30 days
  })
  
  bot.use(
    session({
      storage,
      initial: (): SessionData => ({
        lastActivity: new Date(),
        language: 'ru',
      }),
    })
  )
  
  // Conversations ДОЛЖНЫ быть ПОСЛЕ session
  bot.use(conversations())
  
  // Rate limiting
  bot.use(
    limit({
      timeFrame: 2000,
      limit: 3,
      onLimitExceeded: async (ctx) => {
        await ctx.reply('⚠️ Слишком много запросов. Подождите немного.')
      },
    })
  )
  
  // Sequentialize updates
  bot.use(sequentialize((ctx) => ctx.from?.id.toString()))
  
  // Setup middlewares
  await setupMiddlewares(bot)
  
  // Setup commands
  setupCommands(bot)
  
  // Setup scenes (включая conversations)
  await setupScenes(bot)
  
  // Error handler
  setupErrorHandler(bot)
  
  return bot
}

export async function startBot(): Promise<void> {
  const bot = await createBot()
  
  // Set bot commands menu
  await bot.api.setMyCommands([
    { command: 'start', description: '🏠 Главное меню' },
    { command: 'track', description: '📍 Отследить посылку' },
    { command: 'warehouses', description: '🏢 Адреса складов' },
    { command: 'calculator', description: '📊 Калькулятор доставки' },
    { command: 'support', description: '💬 Поддержка' },
    { command: 'profile', description: '👤 Профиль' },
    { command: 'help', description: '❓ Помощь' },
  ])
  
  // Admin commands (для конкретных пользователей)
  const adminIds = botConfig.adminIds || []
  for (const adminId of adminIds) {
    try {
      await bot.api.setMyCommands(
        [
          { command: 'start', description: '🏠 Главное меню' },
          { command: 'admin', description: '🔧 Админ-панель' },
          { command: 'stats', description: '📊 Статистика' },
          { command: 'broadcast', description: '📢 Рассылка' },
          { command: 'scanner', description: '📱 Сканер' },
          { command: 'support', description: '💬 Поддержка' },
        ],
        { scope: { type: 'chat', chat_id: adminId } }
      )
    } catch (error) {
      logger.warn(`Failed to set admin commands for ${adminId}:`, error)
    }
  }
  
  if (!isDevelopment && botConfig.webhook.domain) {
    // Webhook mode for production
    const app = express()
    app.use(express.json())
    
    const webhook = webhookCallback(bot, 'express')
    app.post(botConfig.webhook.path, webhook)
    
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok' })
    })
    
    const server = app.listen(botConfig.webhook.port, () => {
      logger.info(`🚀 Bot webhook server running on port ${botConfig.webhook.port}`)
    })
    
    // Set webhook
    await bot.api.setWebhook(`${botConfig.webhook.domain}${botConfig.webhook.path}`)
    logger.info('✅ Webhook set successfully')
    
    // Graceful shutdown
    process.on('SIGTERM', async () => {
      server.close()
      await bot.stop()
    })
  } else {
    // Long polling for development
    logger.info('🚀 Bot started in long polling mode')
    
    // Use runner for better performance
    run(bot, {
      runner: {
        fetch: {
          allowed_updates: ['message', 'callback_query', 'inline_query'],
        },
      },
    })
  }
}

// Export bot instance for testing
export { Bot }