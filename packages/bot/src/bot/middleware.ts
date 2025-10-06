// packages/bot/src/bot/middleware.ts - Middleware setup
import type { Bot } from 'grammy'
import type { BotContext } from '../types/context'
import { logger } from '../utils/logger'
import { getUserByTelegramId, getAdminByTelegramId, updateLastActivity } from '../services/user'

export async function setupMiddlewares(bot: Bot<BotContext>): Promise<void> {
  // Logging middleware
  bot.use(async (ctx, next) => {
    const start = Date.now()
    
    try {
      await next()
    } finally {
      const ms = Date.now() - start
      logger.debug({
        update_id: ctx.update.update_id,
        from: ctx.from?.id,
        chat: ctx.chat?.id,
        text: ctx.message?.text,
        callback: ctx.callbackQuery?.data,
        duration_ms: ms,
      })
    }
  })
  
  // User authentication middleware
  bot.use(async (ctx, next) => {
    if (!ctx.from) {
      return next()
    }
    
    // Load user from database
    const user = await getUserByTelegramId(ctx.from.id)
    ctx.user = user
    
    if (user) {
      ctx.session.userId = user.id
      ctx.session.user = user
      
      // Update last activity
      await updateLastActivity(user.id).catch(() => {})
    }
    
    // Check if admin
    const admin = await getAdminByTelegramId(ctx.from.id)
    ctx.admin = admin
    ctx.isAdmin = !!admin
    
    if (admin) {
      ctx.session.isAdmin = true
      ctx.session.admin = admin
    }
    
    await next()
  })
  
  // Helper methods middleware
  bot.use(async (ctx, next) => {
    // Safe message deletion
    ctx.deleteMessageSafe = async (messageId: number): Promise<boolean> => {
      try {
        await ctx.api.deleteMessage(ctx.chat!.id, messageId)
        return true
      } catch (error) {
        logger.warn(`Failed to delete message ${messageId}:`, error)
        return false
      }
    }
    
    // Cleanup tracked messages
    ctx.cleanupMessages = async (): Promise<void> => {
      if (ctx.session.messageToDelete && ctx.session.messageToDelete.length > 0) {
        await Promise.all(
          ctx.session.messageToDelete.map((msgId) => ctx.deleteMessageSafe(msgId))
        )
        ctx.session.messageToDelete = []
      }
    }
    
    await next()
  })
  
  // Activity tracking
  bot.use(async (ctx, next) => {
    ctx.session.lastActivity = new Date()
    await next()
  })
}