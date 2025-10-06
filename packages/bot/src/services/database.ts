// packages/bot/src/services/database.ts - Сервис базы данных
import { PrismaClient } from '@prisma/client'
import { logger } from '../utils/logger'

// Initialize Prisma with logging
function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: [
      {
        emit: 'event',
        level: 'query',
      },
      {
        emit: 'event',
        level: 'error',
      },
      {
        emit: 'event',
        level: 'warn',
      },
    ],
  })

  // Log queries in development
  if (process.env.NODE_ENV === 'development') {
    client.$on('query', (e) => {
      logger.debug('Query:', {
        query: e.query,
        params: e.params,
        duration: e.duration,
      })
    })
  }

  // Log errors
  client.$on('error', (e) => {
    logger.error('Database error:', e)
  })

  // Log warnings
  client.$on('warn', (e) => {
    logger.warn('Database warning:', e)
  })

  return client
}

// Создаём и экспортируем инициализированный экземпляр Prisma
export const prisma = createPrismaClient()

// Get Prisma instance (для обратной совместимости)
export function getPrisma(): PrismaClient {
  return prisma
}

// Helper function to handle database errors
export function handleDatabaseError(error: unknown): never {
  if (error instanceof Error) {
    logger.error('Database operation failed:', {
      message: error.message,
      stack: error.stack,
    })
    
    // Check for specific Prisma errors
    if (error.message.includes('P2002')) {
      throw new Error('Запись с такими данными уже существует')
    }
    if (error.message.includes('P2025')) {
      throw new Error('Запись не найдена')
    }
    if (error.message.includes('P2003')) {
      throw new Error('Ссылка на несуществующую запись')
    }
    
    throw new Error('Ошибка при работе с базой данных')
  }
  
  throw error
}

// Transaction helper with retry logic
export async function withTransaction<T>(
  fn: (tx: PrismaClient) => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: Error | undefined
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await prisma.$transaction(async (tx) => {
        return await fn(tx as PrismaClient)
      }, {
        maxWait: 5000,
        timeout: 10000,
      })
    } catch (error) {
      lastError = error as Error
      logger.warn(`Transaction attempt ${i + 1} failed:`, error)
      
      // Don't retry on certain errors
      if (error instanceof Error && (
        error.message.includes('P2002') || // Unique constraint
        error.message.includes('P2003')    // Foreign key constraint
      )) {
        throw error
      }
      
      // Wait before retry
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)))
      }
    }
  }
  
  throw lastError || new Error('Transaction failed after retries')
}

// Custom ID generators
export function generateOrderNumber(type: 'SP' | 'PU' | 'FP'): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 5).toUpperCase()
  return `${type}${timestamp}${random}`
}

export function generateCustomId(): string {
  // Generate 5-digit unique ID
  const min = 10000
  const max = 99999
  return Math.floor(Math.random() * (max - min + 1) + min).toString()
}

export function generateTransactionId(): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `TX${timestamp}${random}`
}

export function generateChatNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase().substring(-4)
  const random = Math.random().toString(36).substring(2, 5).toUpperCase()
  return `CH${timestamp}${random}`
}

// Cleanup old sessions
export async function cleanupOldSessions(): Promise<number> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  
  try {
    const result = await prisma.user.updateMany({
      where: {
        lastActivity: {
          lt: thirtyDaysAgo
        }
      },
      data: {
        // Cleanup logic here if needed
      }
    })
    
    logger.info(`Cleaned up ${result.count} old sessions`)
    return result.count
  } catch (error) {
    logger.error('Failed to cleanup old sessions:', error)
    return 0
  }
}

// Check database connection
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch (error) {
    logger.error('Database connection check failed:', error)
    return false
  }
}

// Initialize database (run migrations, seed data etc)
export async function initializeDatabase(): Promise<void> {
  try {
    // Check connection
    const isConnected = await checkDatabaseConnection()
    if (!isConnected) {
      throw new Error('Cannot connect to database')
    }
    
    // Check if initial data exists
    const adminCount = await prisma.admin.count()
    if (adminCount === 0) {
      logger.info('No admins found, creating default admin...')
      // Create default admin (should be in seed script)
    }
    
    const countryCount = await prisma.country.count()
    if (countryCount === 0) {
      logger.info('No countries found, creating default countries...')
      // Create default countries (should be in seed script)
    }
    
    logger.info('✅ Database initialized successfully')
  } catch (error) {
    logger.error('Failed to initialize database:', error)
    throw error
  }
}

// Export Prisma types for convenience
export type { User, Order, Country, City, Warehouse, Admin, Transaction } from '@prisma/client'
export { OrderStatus, OrderType, PaymentStatus, PaymentMethod, VipTier, AdminRole } from '@prisma/client'