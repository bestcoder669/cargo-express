// packages/bot/src/bot/error-handler.ts - Обработчик ошибок
import type { Bot, BotError, GrammyError, HttpError } from 'grammy'
import type { BotContext } from '../types/context'
import { logger } from '../utils/logger'

export function setupErrorHandler(bot: Bot<BotContext>): void {
  bot.catch(async (err: BotError<BotContext>) => {
    const ctx = err.ctx
    const error = err.error
    
    logger.error('Bot error:', {
      update_id: ctx.update.update_id,
      from: ctx.from?.id,
      chat: ctx.chat?.id,
      error: error.message,
      stack: error.stack
    })

    // Определяем тип ошибки
    if (error instanceof GrammyError) {
      await handleGrammyError(ctx, error)
    } else if (error instanceof HttpError) {
      await handleHttpError(ctx, error)
    } else {
      await handleUnknownError(ctx, error)
    }
  })
}

async function handleGrammyError(ctx: BotContext, error: GrammyError): Promise<void> {
  logger.error('Grammy error:', {
    method: error.method,
    error_code: error.error_code,
    description: error.description
  })

  if (error.error_code === 403) {
    // Бот заблокирован пользователем
    logger.info(`Bot blocked by user ${ctx.from?.id}`)
    return
  }

  if (error.error_code === 429) {
    // Rate limit
    logger.warn('Rate limit hit')
    return
  }

  if (error.error_code === 400) {
    // Bad request
    if (error.description?.includes('message is not modified')) {
      // Сообщение не изменилось - игнорируем
      return
    }
    
    if (error.description?.includes('message to delete not found')) {
      // Сообщение для удаления не найдено - игнорируем
      return
    }
  }

  // Для остальных ошибок пытаемся уведомить пользователя
  try {
    await ctx.reply(
      '❌ Произошла ошибка при обработке запроса.\n' +
      'Попробуйте еще раз или обратитесь в поддержку.'
    )
  } catch {
    // Если не можем отправить сообщение - игнорируем
  }
}

async function handleHttpError(ctx: BotContext, error: HttpError): Promise<void> {
  logger.error('HTTP error:', {
    status: error.status,
    statusText: error.statusText
  })

  try {
    await ctx.reply(
      '❌ Проблемы с подключением к серверу.\n' +
      'Попробуйте позже.'
    )
  } catch {
    // Игнорируем
  }
}

async function handleUnknownError(ctx: BotContext, error: Error): Promise<void> {
  logger.error('Unknown error:', error)

  // Специальные случаи
  if (error.message?.includes('conversation')) {
    try {
      await ctx.reply(
        '❌ Сессия истекла.\n' +
        'Пожалуйста, начните заново с помощью /start'
      )
    } catch {
      // Игнорируем
    }
    return
  }

  if (error.message?.includes('database')) {
    try {
      await ctx.reply(
        '❌ Ошибка базы данных.\n' +
        'Мы уже работаем над решением проблемы.'
      )
    } catch {
      // Игнорируем
    }
    return
  }

  // Для остальных ошибок
  try {
    await ctx.reply(
      '❌ Неожиданная ошибка.\n' +
      'Попробуйте еще раз или обратитесь в поддержку.'
    )
  } catch {
    // Игнорируем
  }
}