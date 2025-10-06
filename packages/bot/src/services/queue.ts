// packages/bot/src/services/queue.ts - Сервис очередей для фоновых задач
import { Queue, Worker, QueueEvents } from 'bullmq'
import IORedis from 'ioredis'
import { logger } from '../utils/logger'
import { prisma } from './database'
import { redisConfig } from '../config'
import type { Job } from 'bullmq'

// Типы задач
interface NotificationJob {
  type: 'notification'
  userId: string
  message: string
  orderId?: string
}

interface OrderStatusJob {
  type: 'order_status'
  orderId: string
  status: string
  notifyUser: boolean
}

interface BroadcastJob {
  type: 'broadcast'
  userIds: string[]
  message: string
  adminId: string
}

interface CleanupJob {
  type: 'cleanup'
  target: 'sessions' | 'cache' | 'temp'
}

type JobData = NotificationJob | OrderStatusJob | BroadcastJob | CleanupJob

// Создаём отдельное Redis соединение для BullMQ с правильными настройками
const createBullMQConnection = () => {
  return new IORedis(redisConfig.url, {
    maxRetriesPerRequest: null, // ВАЖНО: BullMQ требует это значение
    enableReadyCheck: false,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    }
  });
}

// Создаем очереди с правильными соединениями
export const mainQueue = new Queue<JobData>('main', {
  connection: createBullMQConnection(),
  defaultJobOptions: {
    removeOnComplete: {
      age: 3600, // 1 час
      count: 100
    },
    removeOnFail: {
      age: 24 * 3600, // 24 часа
      count: 500
    },
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  }
})

export const notificationQueue = new Queue('notifications', {
  connection: createBullMQConnection(),
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 5
  }
})

// События очереди с отдельным соединением
const queueEvents = new QueueEvents('main', {
  connection: createBullMQConnection()
})

queueEvents.on('completed', ({ jobId, returnvalue }) => {
  logger.debug(`Job ${jobId} completed`, { returnvalue })
})

queueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(`Job ${jobId} failed`, { failedReason })
})

// Воркер для обработки задач
let mainWorker: Worker<JobData> | null = null

export async function initializeQueues(): Promise<void> {
  // Главный воркер с отдельным соединением
  mainWorker = new Worker<JobData>(
    'main',
    async (job: Job<JobData>) => {
      const { data } = job
      
      switch (data.type) {
        case 'notification':
          return await processNotification(data)
        
        case 'order_status':
          return await processOrderStatus(data)
        
        case 'broadcast':
          return await processBroadcast(data)
        
        case 'cleanup':
          return await processCleanup(data)
        
        default:
          throw new Error(`Unknown job type: ${(data as any).type}`)
      }
    },
    {
      connection: createBullMQConnection(),
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 1000
      }
    }
  )

  mainWorker.on('completed', (job) => {
    logger.debug(`Job ${job.id} completed`)
  })

  mainWorker.on('failed', (job, err) => {
    logger.error(`Job ${job?.id} failed:`, err)
  })

  // Планируем периодические задачи
  await scheduleRecurringJobs()
  
  logger.info('✅ Queues initialized')
}

// Обработчики задач
async function processNotification(data: NotificationJob): Promise<void> {
  try {
    // Здесь будет отправка уведомления через бота
    logger.info('Processing notification', { userId: data.userId })
    
    // Сохраняем в БД
    await prisma.notification.create({
      data: {
        userId: data.userId,
        type: 'SYSTEM',
        title: 'Уведомление',
        text: data.message,
        data: data.orderId ? { orderId: data.orderId } : undefined,
        isSent: true,
        sentAt: new Date()
      }
    })
  } catch (error) {
    logger.error('Failed to process notification:', error)
    throw error
  }
}

async function processOrderStatus(data: OrderStatusJob): Promise<void> {
  try {
    logger.info('Processing order status update', { orderId: data.orderId })
    
    // Обновляем статус заказа
    const order = await prisma.order.update({
      where: { id: data.orderId },
      data: { 
        status: data.status as any,
        updatedAt: new Date()
      },
      include: { user: true }
    })
    
    // Создаем запись в истории
    await prisma.statusHistory.create({
      data: {
        orderId: data.orderId,
        newStatus: data.status as any,
        comment: 'Автоматическое обновление'
      }
    })
    
    // Отправляем уведомление пользователю
    if (data.notifyUser && order.user) {
      await mainQueue.add('notification', {
        type: 'notification',
        userId: order.user.id,
        message: `Статус заказа #${order.orderNumber} изменен на: ${data.status}`,
        orderId: order.id
      })
    }
  } catch (error) {
    logger.error('Failed to process order status:', error)
    throw error
  }
}

async function processBroadcast(data: BroadcastJob): Promise<void> {
  try {
    logger.info('Processing broadcast', { 
      userCount: data.userIds.length,
      adminId: data.adminId 
    })
    
    // Добавляем задачи для каждого пользователя
    const jobs = data.userIds.map(userId => ({
      name: 'notification',
      data: {
        type: 'notification' as const,
        userId,
        message: data.message
      }
    }))
    
    await mainQueue.addBulk(jobs)
    
    logger.info(`Broadcast queued for ${jobs.length} users`)
  } catch (error) {
    logger.error('Failed to process broadcast:', error)
    throw error
  }
}

async function processCleanup(data: CleanupJob): Promise<void> {
  try {
    logger.info('Processing cleanup', { target: data.target })
    
    switch (data.target) {
      case 'sessions':
        // Очистка старых сессий
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        
        const result = await prisma.user.updateMany({
          where: {
            lastActivity: {
              lt: thirtyDaysAgo
            }
          },
          data: {
            // Можно добавить какую-то логику очистки
          }
        })
        
        logger.info(`Cleaned ${result.count} old sessions`)
        break
      
      case 'cache':
        // Очистка кэша Redis
        // Используем отдельное соединение для операций с Redis
        const redisConnection = createBullMQConnection()
        const keys = await redisConnection.keys('cache:*')
        if (keys.length > 0) {
          await redisConnection.del(...keys)
        }
        logger.info(`Cleared ${keys.length} cache entries`)
        await redisConnection.quit()
        break
      
      case 'temp':
        // Очистка временных данных
        const redisTempConnection = createBullMQConnection()
        const tempKeys = await redisTempConnection.keys('temp:*')
        if (tempKeys.length > 0) {
          await redisTempConnection.del(...tempKeys)
        }
        logger.info(`Cleared ${tempKeys.length} temp entries`)
        await redisTempConnection.quit()
        break
    }
  } catch (error) {
    logger.error('Failed to process cleanup:', error)
    throw error
  }
}

// Планирование периодических задач
async function scheduleRecurringJobs(): Promise<void> {
  // Очистка каждый день в 3:00
  await mainQueue.add(
    'cleanup-sessions',
    {
      type: 'cleanup',
      target: 'sessions'
    },
    {
      repeat: {
        pattern: '0 3 * * *' // Cron pattern
      }
    }
  )
  
  // Очистка кэша каждые 6 часов
  await mainQueue.add(
    'cleanup-cache',
    {
      type: 'cleanup',
      target: 'cache'
    },
    {
      repeat: {
        every: 6 * 60 * 60 * 1000 // 6 часов в миллисекундах
      }
    }
  )
  
  logger.info('✅ Recurring jobs scheduled')
}

// Функции для добавления задач в очередь
export async function queueNotification(
  userId: string,
  message: string,
  orderId?: string
): Promise<void> {
  await mainQueue.add('notification', {
    type: 'notification',
    userId,
    message,
    orderId
  })
}

export async function queueOrderStatusUpdate(
  orderId: string,
  status: string,
  notifyUser = true
): Promise<void> {
  await mainQueue.add('order-status', {
    type: 'order_status',
    orderId,
    status,
    notifyUser
  })
}

export async function queueBroadcast(
  userIds: string[],
  message: string,
  adminId: string
): Promise<void> {
  // Разбиваем на батчи по 100 пользователей
  const batchSize = 100
  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize)
    await mainQueue.add('broadcast', {
      type: 'broadcast',
      userIds: batch,
      message,
      adminId
    })
  }
}

// Graceful shutdown
export async function shutdownQueues(): Promise<void> {
  if (mainWorker) {
    await mainWorker.close()
  }
  await mainQueue.close()
  await notificationQueue.close()
  await queueEvents.close()
  
  logger.info('✅ Queues shut down gracefully')
}