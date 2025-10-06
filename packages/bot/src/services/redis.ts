// packages/bot/src/services/redis.ts - Сервис Redis
import Redis from 'ioredis'
import { logger } from '../utils/logger'
import { config } from '../config'

// Create Redis client для обычных операций
export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000)
    return delay
  },
})

// Создаём отдельную фабрику соединений для BullMQ
// BullMQ требует maxRetriesPerRequest: null
export function createBullMQConnection(): Redis {
  return new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null, // Критически важно для BullMQ!
    enableReadyCheck: false,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000)
      return delay
    },
  })
}

// Error handling
redis.on('error', (error) => {
  logger.error('Redis error:', error)
})

redis.on('connect', () => {
  logger.info('✅ Redis connected')
})

redis.on('ready', () => {
  logger.info('✅ Redis ready')
})

redis.on('close', () => {
  logger.warn('Redis connection closed')
})

redis.on('reconnecting', (delay: number) => {
  logger.info(`Redis reconnecting in ${delay}ms`)
})

// Helper functions for common operations
export const redisHelpers = {
  // Session management
  async getSession(userId: string): Promise<Record<string, unknown> | null> {
    try {
      const data = await redis.get(`session:${userId}`)
      return data ? JSON.parse(data) : null
    } catch (error) {
      logger.error('Failed to get session:', error)
      return null
    }
  },

  async setSession(userId: string, data: Record<string, unknown>, ttl?: number): Promise<void> {
    try {
      const key = `session:${userId}`
      const serialized = JSON.stringify(data)
      
      if (ttl) {
        await redis.setex(key, ttl, serialized)
      } else {
        await redis.set(key, serialized)
      }
    } catch (error) {
      logger.error('Failed to set session:', error)
    }
  },

  async deleteSession(userId: string): Promise<void> {
    try {
      await redis.del(`session:${userId}`)
    } catch (error) {
      logger.error('Failed to delete session:', error)
    }
  },

  // Cache management
  async getCache<T>(key: string): Promise<T | null> {
    try {
      const data = await redis.get(`cache:${key}`)
      return data ? JSON.parse(data) : null
    } catch (error) {
      logger.error('Failed to get cache:', error)
      return null
    }
  },

  async setCache<T>(key: string, data: T, ttl = 3600): Promise<void> {
    try {
      await redis.setex(`cache:${key}`, ttl, JSON.stringify(data))
    } catch (error) {
      logger.error('Failed to set cache:', error)
    }
  },

  async deleteCache(pattern: string): Promise<void> {
    try {
      const keys = await redis.keys(`cache:${pattern}`)
      if (keys.length > 0) {
        await redis.del(...keys)
      }
    } catch (error) {
      logger.error('Failed to delete cache:', error)
    }
  },

  // Rate limiting
  async checkRateLimit(key: string, limit: number, window: number): Promise<boolean> {
    try {
      const current = await redis.incr(`ratelimit:${key}`)
      
      if (current === 1) {
        await redis.expire(`ratelimit:${key}`, window)
      }
      
      return current <= limit
    } catch (error) {
      logger.error('Failed to check rate limit:', error)
      return true // Allow on error
    }
  },

  // Distributed locks
  async acquireLock(key: string, ttl = 30): Promise<boolean> {
    try {
      const result = await redis.set(
        `lock:${key}`,
        '1',
        'EX',
        ttl,
        'NX'
      )
      return result === 'OK'
    } catch (error) {
      logger.error('Failed to acquire lock:', error)
      return false
    }
  },

  async releaseLock(key: string): Promise<void> {
    try {
      await redis.del(`lock:${key}`)
    } catch (error) {
      logger.error('Failed to release lock:', error)
    }
  },

  // Queue management for background jobs
  async pushToQueue(queue: string, data: unknown): Promise<void> {
    try {
      await redis.rpush(`queue:${queue}`, JSON.stringify(data))
    } catch (error) {
      logger.error('Failed to push to queue:', error)
    }
  },

  async popFromQueue<T>(queue: string): Promise<T | null> {
    try {
      const data = await redis.lpop(`queue:${queue}`)
      return data ? JSON.parse(data) : null
    } catch (error) {
      logger.error('Failed to pop from queue:', error)
      return null
    }
  },

  // Pub/Sub helpers
  createPublisher(): Redis {
    return redis.duplicate()
  },

  createSubscriber(): Redis {
    return redis.duplicate()
  },

  // Statistics and counters
  async incrementCounter(key: string, value = 1): Promise<number> {
    try {
      return await redis.incrby(`counter:${key}`, value)
    } catch (error) {
      logger.error('Failed to increment counter:', error)
      return 0
    }
  },

  async getCounter(key: string): Promise<number> {
    try {
      const value = await redis.get(`counter:${key}`)
      return value ? parseInt(value, 10) : 0
    } catch (error) {
      logger.error('Failed to get counter:', error)
      return 0
    }
  },

  // Online users tracking
  async setUserOnline(userId: string, ttl = 300): Promise<void> {
    try {
      await redis.setex(`online:${userId}`, ttl, '1')
    } catch (error) {
      logger.error('Failed to set user online:', error)
    }
  },

  async isUserOnline(userId: string): Promise<boolean> {
    try {
      const result = await redis.exists(`online:${userId}`)
      return result === 1
    } catch (error) {
      logger.error('Failed to check user online:', error)
      return false
    }
  },

  async getOnlineUsers(): Promise<string[]> {
    try {
      const keys = await redis.keys('online:*')
      return keys.map(key => key.replace('online:', ''))
    } catch (error) {
      logger.error('Failed to get online users:', error)
      return []
    }
  },

  // Temporary data storage
  async setTemp(key: string, data: unknown, ttl = 300): Promise<void> {
    try {
      await redis.setex(`temp:${key}`, ttl, JSON.stringify(data))
    } catch (error) {
      logger.error('Failed to set temp data:', error)
    }
  },

  async getTemp<T>(key: string): Promise<T | null> {
    try {
      const data = await redis.get(`temp:${key}`)
      return data ? JSON.parse(data) : null
    } catch (error) {
      logger.error('Failed to get temp data:', error)
      return null
    }
  },

  async deleteTemp(key: string): Promise<void> {
    try {
      await redis.del(`temp:${key}`)
    } catch (error) {
      logger.error('Failed to delete temp data:', error)
    }
  },
}

// Event bus for real-time communication
export class EventBus {
  private publisher: Redis
  private subscriber: Redis
  private handlers: Map<string, Set<(data: unknown) => void>>

  constructor() {
    this.publisher = redis.duplicate()
    this.subscriber = redis.duplicate()
    this.handlers = new Map()

    this.subscriber.on('message', (channel: string, message: string) => {
      const handlers = this.handlers.get(channel)
      if (handlers) {
        try {
          const data = JSON.parse(message)
          handlers.forEach(handler => handler(data))
        } catch (error) {
          logger.error(`Failed to process message from ${channel}:`, error)
        }
      }
    })
  }

  async publish(channel: string, data: unknown): Promise<void> {
    try {
      await this.publisher.publish(channel, JSON.stringify(data))
    } catch (error) {
      logger.error(`Failed to publish to ${channel}:`, error)
    }
  }

  async subscribe(channel: string, handler: (data: unknown) => void): Promise<void> {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set())
      await this.subscriber.subscribe(channel)
    }
    this.handlers.get(channel)!.add(handler)
  }

  async unsubscribe(channel: string, handler?: (data: unknown) => void): Promise<void> {
    if (handler) {
      this.handlers.get(channel)?.delete(handler)
    } else {
      this.handlers.delete(channel)
      await this.subscriber.unsubscribe(channel)
    }
  }

  async close(): Promise<void> {
    await this.publisher.quit()
    await this.subscriber.quit()
  }
}

// Create default event bus instance
export const eventBus = new EventBus()

// Cleanup on exit
process.on('beforeExit', async () => {
  await redis.quit()
  await eventBus.close()
})