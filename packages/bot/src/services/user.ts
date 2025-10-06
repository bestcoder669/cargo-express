// packages/bot/src/services/user.ts - Сервис управления пользователями
import { prisma, generateCustomId, withTransaction } from './database'
import { redisHelpers } from './redis'
import { logger } from '../utils/logger'
import type { User, Admin, VipTier, Address } from '@prisma/client'
import type { Decimal } from 'decimal.js'

// Cache TTL in seconds
const USER_CACHE_TTL = 300 // 5 minutes
const ADMIN_CACHE_TTL = 600 // 10 minutes

// Get user by Telegram ID
export async function getUserByTelegramId(telegramId: number): Promise<User | null> {
  try {
    // Check cache first
    const cacheKey = `user:tg:${telegramId}`
    const cached = await redisHelpers.getCache<User>(cacheKey)
    if (cached) {
      return cached
    }
    
    // Query database
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) }
    })
    
    if (user) {
      // Cache the result
      await redisHelpers.setCache(cacheKey, user, USER_CACHE_TTL)
    }
    
    return user
  } catch (error) {
    logger.error('Failed to get user by telegram ID:', error)
    return null
  }
}

// Get user by custom ID
export async function getUserByCustomId(customId: string): Promise<User | null> {
  try {
    const cacheKey = `user:custom:${customId}`
    const cached = await redisHelpers.getCache<User>(cacheKey)
    if (cached) {
      return cached
    }
    
    const user = await prisma.user.findUnique({
      where: { customId }
    })
    
    if (user) {
      await redisHelpers.setCache(cacheKey, user, USER_CACHE_TTL)
    }
    
    return user
  } catch (error) {
    logger.error('Failed to get user by custom ID:', error)
    return null
  }
}

// Create new user
export async function createUser(data: {
  telegramId: number
  username?: string
  firstName: string
  lastName?: string
  phone: string
  email: string
  referrerId?: string
}): Promise<User> {
  return withTransaction(async (tx) => {
    // Generate unique custom ID
    let customId: string
    let attempts = 0
    
    do {
      customId = generateCustomId()
      const existing = await tx.user.findUnique({
        where: { customId }
      })
      if (!existing) break
      attempts++
    } while (attempts < 10)
    
    if (attempts >= 10) {
      throw new Error('Failed to generate unique custom ID')
    }
    
    // Create user
    const user = await tx.user.create({
      data: {
        telegramId: BigInt(data.telegramId),
        username: data.username,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        email: data.email,
        customId,
        referrerId: data.referrerId,
      }
    })
    
    // Clear cache
    await redisHelpers.deleteCache(`user:*`)
    
    // Log event
    logger.info('User created', {
      userId: user.id,
      customId: user.customId,
      telegramId: user.telegramId.toString()
    })
    
    return user
  })
}

// Update user
export async function updateUser(
  userId: string,
  data: Partial<{
    firstName: string
    lastName: string
    phone: string
    email: string
    language: string
    timezone: string
  }>
): Promise<User> {
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data
    })
    
    // Clear cache
    await redisHelpers.deleteCache(`user:*${userId}*`)
    await redisHelpers.deleteCache(`user:*${user.telegramId}*`)
    await redisHelpers.deleteCache(`user:*${user.customId}*`)
    
    return user
  } catch (error) {
    logger.error('Failed to update user:', error)
    throw new Error('Не удалось обновить данные пользователя')
  }
}

// Update user balance
export async function updateUserBalance(
  userId: string,
  amount: number | string | Decimal,
  operation: 'add' | 'subtract' | 'set'
): Promise<User> {
  return withTransaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId }
    })
    
    if (!user) {
      throw new Error('User not found')
    }
    
    let newBalance: Decimal
    
    switch (operation) {
      case 'add':
        newBalance = new Decimal(user.balance).plus(amount)
        break
      case 'subtract':
        newBalance = new Decimal(user.balance).minus(amount)
        if (newBalance.lessThan(0)) {
          throw new Error('Недостаточно средств на балансе')
        }
        break
      case 'set':
        newBalance = new Decimal(amount)
        break
    }
    
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: { balance: newBalance }
    })
    
    // Clear cache
    await redisHelpers.deleteCache(`user:*${userId}*`)
    
    logger.info('User balance updated', {
      userId,
      operation,
      amount: amount.toString(),
      oldBalance: user.balance.toString(),
      newBalance: newBalance.toString()
    })
    
    return updatedUser
  })
}

// Update VIP status
export async function updateVipStatus(
  userId: string,
  tier: VipTier,
  expiresAt?: Date
): Promise<User> {
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        vipTier: tier,
        vipExpiresAt: expiresAt
      }
    })
    
    // Clear cache
    await redisHelpers.deleteCache(`user:*${userId}*`)
    
    logger.info('VIP status updated', {
      userId,
      tier,
      expiresAt
    })
    
    return user
  } catch (error) {
    logger.error('Failed to update VIP status:', error)
    throw new Error('Не удалось обновить VIP статус')
  }
}

// Block/unblock user
export async function setUserBlocked(
  userId: string,
  blocked: boolean,
  reason?: string
): Promise<User> {
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        isBlocked: blocked,
        blockReason: blocked ? reason : null
      }
    })
    
    // Clear cache
    await redisHelpers.deleteCache(`user:*${userId}*`)
    
    logger.warn('User blocked status changed', {
      userId,
      blocked,
      reason
    })
    
    return user
  } catch (error) {
    logger.error('Failed to update user blocked status:', error)
    throw new Error('Не удалось изменить статус блокировки')
  }
}

// Get admin by Telegram ID
export async function getAdminByTelegramId(telegramId: number): Promise<Admin | null> {
  try {
    const cacheKey = `admin:tg:${telegramId}`
    const cached = await redisHelpers.getCache<Admin>(cacheKey)
    if (cached) {
      return cached
    }
    
    const admin = await prisma.admin.findUnique({
      where: { telegramId: BigInt(telegramId) }
    })
    
    if (admin) {
      await redisHelpers.setCache(cacheKey, admin, ADMIN_CACHE_TTL)
    }
    
    return admin
  } catch (error) {
    logger.error('Failed to get admin by telegram ID:', error)
    return null
  }
}

// Update last activity
export async function updateLastActivity(userId: string): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { lastActivity: new Date() }
    })
    
    // Set user online in Redis
    await redisHelpers.setUserOnline(userId)
  } catch (error) {
    logger.error('Failed to update last activity:', error)
  }
}

// User addresses management
export async function getUserAddresses(userId: string): Promise<Address[]> {
  try {
    return await prisma.address.findMany({
      where: {
        userId,
        isActive: true
      },
      include: {
        city: true
      },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'asc' }
      ]
    })
  } catch (error) {
    logger.error('Failed to get user addresses:', error)
    return []
  }
}

export async function createUserAddress(data: {
  userId: string
  alias: string
  cityId: string
  address: string
  postalCode?: string
  isDefault?: boolean
}): Promise<Address> {
  return withTransaction(async (tx) => {
    // If setting as default, unset other defaults
    if (data.isDefault) {
      await tx.address.updateMany({
        where: {
          userId: data.userId,
          isDefault: true
        },
        data: { isDefault: false }
      })
    }
    
    const address = await tx.address.create({
      data,
      include: { city: true }
    })
    
    logger.info('User address created', {
      userId: data.userId,
      addressId: address.id,
      alias: address.alias
    })
    
    return address
  })
}

export async function updateUserAddress(
  addressId: string,
  userId: string,
  data: Partial<{
    alias: string
    cityId: string
    address: string
    postalCode: string
    isDefault: boolean
  }>
): Promise<Address> {
  return withTransaction(async (tx) => {
    // Verify ownership
    const existing = await tx.address.findFirst({
      where: {
        id: addressId,
        userId
      }
    })
    
    if (!existing) {
      throw new Error('Адрес не найден')
    }
    
    // If setting as default, unset other defaults
    if (data.isDefault) {
      await tx.address.updateMany({
        where: {
          userId,
          isDefault: true,
          id: { not: addressId }
        },
        data: { isDefault: false }
      })
    }
    
    const address = await tx.address.update({
      where: { id: addressId },
      data,
      include: { city: true }
    })
    
    return address
  })
}

export async function deleteUserAddress(
  addressId: string,
  userId: string
): Promise<void> {
  try {
    // Soft delete - just mark as inactive
    await prisma.address.updateMany({
      where: {
        id: addressId,
        userId
      },
      data: { isActive: false }
    })
    
    logger.info('User address deleted', { userId, addressId })
  } catch (error) {
    logger.error('Failed to delete user address:', error)
    throw new Error('Не удалось удалить адрес')
  }
}

// Get user statistics
export async function getUserStatistics(userId: string): Promise<{
  totalOrders: number
  activeOrders: number
  completedOrders: number
  totalSpent: Decimal
  totalSaved: Decimal
  averageOrderValue: Decimal
  lastOrderDate?: Date
}> {
  try {
    const [orders, transactions] = await Promise.all([
      prisma.order.findMany({
        where: { userId },
        select: {
          status: true,
          totalCost: true,
          createdAt: true
        }
      }),
      prisma.transaction.findMany({
        where: {
          userId,
          type: 'BONUS',
          status: 'SUCCESS'
        },
        select: {
          amount: true
        }
      })
    ])
    
    const totalOrders = orders.length
    const activeOrders = orders.filter(o => 
      !['DELIVERED', 'CANCELLED', 'REFUNDED'].includes(o.status)
    ).length
    const completedOrders = orders.filter(o => o.status === 'DELIVERED').length
    
    const totalSpent = orders.reduce(
      (sum, o) => sum.plus(o.totalCost),
      new Decimal(0)
    )
    
    const totalSaved = transactions.reduce(
      (sum, t) => sum.plus(t.amount),
      new Decimal(0)
    )
    
    const averageOrderValue = totalOrders > 0
      ? totalSpent.dividedBy(totalOrders)
      : new Decimal(0)
    
    const lastOrder = orders.sort((a, b) => 
      b.createdAt.getTime() - a.createdAt.getTime()
    )[0]
    
    return {
      totalOrders,
      activeOrders,
      completedOrders,
      totalSpent,
      totalSaved,
      averageOrderValue,
      lastOrderDate: lastOrder?.createdAt
    }
  } catch (error) {
    logger.error('Failed to get user statistics:', error)
    throw error
  }
}