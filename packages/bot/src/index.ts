// packages/bot/src/index.ts - Точка входа
import 'dotenv/config'
import { startBot } from './bot'
import { logger } from './utils/logger'
import { prisma } from './services/database'
import { redis } from './services/redis'
import { initializeQueues, shutdownQueues } from './services/queue'

async function main(): Promise<void> {
  try {
    logger.info('Starting application...')
    
    // Проверка подключения к базе данных
    logger.info('Connecting to database...')
    try {
      await prisma.$connect()
      logger.info('✅ Database connected')
    } catch (dbError) {
      logger.error('Database connection failed:', dbError)
      throw dbError
    }
    
    // Проверка подключения к Redis
    logger.info('Connecting to Redis...')
    try {
      await redis.ping()
      logger.info('✅ Redis connected')
    } catch (redisError) {
      logger.error('Redis connection failed:', redisError)
      throw redisError
    }
    
    // Инициализация очередей
    logger.info('Initializing queues...')
    try {
      await initializeQueues()
      logger.info('✅ Queues initialized')
    } catch (queueError) {
      logger.error('Queue initialization failed:', queueError)
      throw queueError
    }
    
    // Запуск бота
    logger.info('Starting bot...')
    try {
      await startBot()
      logger.info('✅ Bot started successfully')
    } catch (botError) {
      logger.error('Bot startup failed:', botError)
      throw botError
    }
    
  } catch (error) {
    // Выводим полную информацию об ошибке
    if (error instanceof Error) {
      logger.error('Failed to start application:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        cause: error.cause
      })
      
      // Также выводим в консоль для гарантии
      console.error('Full error details:')
      console.error(error)
    } else {
      logger.error('Failed to start application (unknown error):', error)
      console.error('Unknown error:', error)
    }
    
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully (SIGINT)...')
  
  try {
    await shutdownQueues()
    await prisma.$disconnect()
    await redis.quit()
    logger.info('✅ Shutdown complete')
  } catch (error) {
    logger.error('Error during shutdown:', error)
  } finally {
    process.exit(0)
  }
})

process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully (SIGTERM)...')
  
  try {
    await shutdownQueues()
    await prisma.$disconnect()
    await redis.quit()
    logger.info('✅ Shutdown complete')
  } catch (error) {
    logger.error('Error during shutdown:', error)
  } finally {
    process.exit(0)
  }
})

// Обработка необработанных ошибок
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', {
    promise,
    reason: reason instanceof Error ? {
      message: reason.message,
      stack: reason.stack,
      name: reason.name
    } : reason
  })
  console.error('Unhandled Rejection:', reason)
})

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', {
    message: error.message,
    stack: error.stack,
    name: error.name
  })
  console.error('Uncaught Exception:', error)
  process.exit(1)
})

// Запускаем приложение
void main()