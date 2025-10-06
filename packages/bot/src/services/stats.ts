// packages/bot/src/services/stats.ts - Сервис статистики
import { prisma } from './database'
import { redisHelpers } from './redis'
import Decimal from 'decimal.js'
import { logger } from '../utils/logger'
import type { VipTier } from '@prisma/client'

export interface UserStats {
  balance: Decimal
  totalOrders: number
  activeOrders: number
  totalSpent: Decimal
  totalSaved: Decimal
  vipTier: VipTier
  vipExpiresAt?: Date
}

export async function getUserStats(userId: string): Promise<UserStats> {
  try {
    // Проверяем кэш
    const cacheKey = `stats:${userId}`
    const cached = await redisHelpers.getCache<UserStats>(cacheKey)
    if (cached) {
      return {
        ...cached,
        balance: new Decimal(cached.balance),
        totalSpent: new Decimal(cached.totalSpent),
        totalSaved: new Decimal(cached.totalSaved),
        vipExpiresAt: cached.vipExpiresAt ? new Date(cached.vipExpiresAt) : undefined
      }
    }

    // Загружаем данные из БД
    const [user, orders, bonuses] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          balance: true,
          vipTier: true,
          vipExpiresAt: true
        }
      }),
      prisma.order.findMany({
        where: { userId },
        select: {
          status: true,
          totalCost: true
        }
      }),
      prisma.transaction.aggregate({
        where: {
          userId,
          type: 'BONUS',
          status: 'SUCCESS'
        },
        _sum: {
          amount: true
        }
      })
    ])

    if (!user) {
      throw new Error('User not found')
    }

    const totalOrders = orders.length
    const activeOrders = orders.filter(o => 
      !['DELIVERED', 'CANCELLED', 'REFUNDED'].includes(o.status)
    ).length
    
    const totalSpent = orders
      .filter(o => o.status !== 'CANCELLED')
      .reduce((sum, o) => sum.plus(o.totalCost), new Decimal(0))
    
    const totalSaved = new Decimal(bonuses._sum.amount || 0)

    const stats: UserStats = {
      balance: new Decimal(user.balance),
      totalOrders,
      activeOrders,
      totalSpent,
      totalSaved,
      vipTier: user.vipTier,
      vipExpiresAt: user.vipExpiresAt || undefined
    }

    // Сохраняем в кэш на 5 минут
    await redisHelpers.setCache(cacheKey, {
      ...stats,
      balance: stats.balance.toString(),
      totalSpent: stats.totalSpent.toString(),
      totalSaved: stats.totalSaved.toString(),
      vipExpiresAt: stats.vipExpiresAt?.toISOString()
    }, 300)

    return stats
  } catch (error) {
    logger.error('Failed to get user stats:', error)
    throw error
  }
}

// Получить статистику для админ-панели
export async function getDashboardStats() {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const [
      todayRevenue,
      yesterdayRevenue,
      todayOrders,
      todayUsers,
      activeOrders,
      problemOrders,
      onlineUsers,
      vipUsers
    ] = await Promise.all([
      // Выручка за сегодня
      prisma.transaction.aggregate({
        where: {
          type: 'PAYMENT',
          status: 'SUCCESS',
          createdAt: { gte: today }
        },
        _sum: { amount: true }
      }),
      
      // Выручка за вчера
      prisma.transaction.aggregate({
        where: {
          type: 'PAYMENT',
          status: 'SUCCESS',
          createdAt: {
            gte: yesterday,
            lt: today
          }
        },
        _sum: { amount: true }
      }),
      
      // Заказы за сегодня
      prisma.order.count({
        where: { createdAt: { gte: today } }
      }),
      
      // Новые пользователи
      prisma.user.count({
        where: { createdAt: { gte: today } }
      }),
      
      // Активные заказы
      prisma.order.count({
        where: {
          status: {
            notIn: ['DELIVERED', 'CANCELLED', 'REFUNDED']
          }
        }
      }),
      
      // Проблемные заказы
      prisma.order.count({
        where: { status: 'PROBLEM' }
      }),
      
      // Онлайн пользователи
      redisHelpers.getOnlineUsers(),
      
      // VIP пользователи
      prisma.user.count({
        where: { 
          vipTier: { not: 'REGULAR' },
          vipExpiresAt: {
            gte: new Date()
          }
        }
      })
    ])

    const todayRevenueAmount = new Decimal(todayRevenue._sum.amount || 0)
    const yesterdayRevenueAmount = new Decimal(yesterdayRevenue._sum.amount || 0)
    
    const revenueChange = yesterdayRevenueAmount.isZero() 
      ? 0 
      : todayRevenueAmount.minus(yesterdayRevenueAmount)
          .dividedBy(yesterdayRevenueAmount)
          .times(100)
          .toNumber()

    return {
      todayRevenue: todayRevenueAmount.toNumber(),
      todayOrders,
      todayUsers,
      activeOrders,
      problemOrders,
      onlineUsers: onlineUsers.length,
      vipUsers,
      revenueChange,
      todayPayments: await prisma.transaction.count({
        where: {
          type: 'PAYMENT',
          createdAt: { gte: today }
        }
      }),
      pendingPayments: await prisma.order.count({
        where: {
          status: 'CREATED',
          createdAt: { gte: today }
        }
      }),
      avgOrderValue: todayOrders > 0 
        ? todayRevenueAmount.dividedBy(todayOrders).toNumber()
        : 0,
      shippingOrders: await prisma.order.count({
        where: {
          type: 'SHIPPING',
          createdAt: { gte: today }
        }
      }),
      purchaseOrders: await prisma.order.count({
        where: {
          type: { in: ['PURCHASE', 'FIXED_PRICE'] },
          createdAt: { gte: today }
        }
      }),
      processingOrders: await prisma.order.count({
        where: { status: 'PROCESSING' }
      }),
      totalUsers: await prisma.user.count()
    }
  } catch (error) {
    logger.error('Failed to get dashboard stats:', error)
    throw error
  }
}

// Быстрая статистика для команды /stats
export async function getQuickStats() {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [revenue, orders, users, activeOrders] = await Promise.all([
      prisma.transaction.aggregate({
        where: {
          type: 'PAYMENT',
          status: 'SUCCESS',
          createdAt: { gte: today }
        },
        _sum: { amount: true }
      }),
      prisma.order.count({
        where: { createdAt: { gte: today } }
      }),
      prisma.user.count({
        where: { createdAt: { gte: today } }
      }),
      prisma.order.count({
        where: {
          status: {
            notIn: ['DELIVERED', 'CANCELLED', 'REFUNDED']
          }
        }
      })
    ])

    return [
      { label: 'Выручка сегодня', value: `${new Decimal(revenue._sum.amount || 0).toFixed(0)}₽` },
      { label: 'Заказов сегодня', value: orders.toString() },
      { label: 'Новых пользователей', value: users.toString() },
      { label: 'Активных заказов', value: activeOrders.toString() }
    ]
  } catch (error) {
    logger.error('Failed to get quick stats:', error)
    return []
  }
}