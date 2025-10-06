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
    // Проверяем входные данные
    if (!userId) {
      throw new Error('User ID is required')
    }

    // Проверяем кэш
    const cacheKey = `stats:${userId}`
    const cached = await redisHelpers.getCache<any>(cacheKey)
    if (cached) {
      return {
        ...cached,
        balance: new Decimal(cached.balance || 0),
        totalSpent: new Decimal(cached.totalSpent || 0),
        totalSaved: new Decimal(cached.totalSaved || 0),
        vipExpiresAt: cached.vipExpiresAt ? new Date(cached.vipExpiresAt) : undefined
      }
    }

    // Загружаем данные из БД
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        balance: true,
        vipTier: true,
        vipExpiresAt: true
      }
    })

    if (!user) {
      logger.warn(`User not found for stats: ${userId}`)
      // Возвращаем дефолтные значения если пользователь не найден
      return {
        balance: new Decimal(0),
        totalOrders: 0,
        activeOrders: 0,
        totalSpent: new Decimal(0),
        totalSaved: new Decimal(0),
        vipTier: 'REGULAR' as VipTier,
        vipExpiresAt: undefined
      }
    }

    // Получаем статистику по заказам
    const [orders, bonuses] = await Promise.all([
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

    const totalOrders = orders.length
    const activeOrders = orders.filter(o => 
      !['DELIVERED', 'CANCELLED', 'REFUNDED'].includes(o.status)
    ).length
    
    const totalSpent = orders
      .filter(o => o.status !== 'CANCELLED')
      .reduce((sum, o) => sum.plus(o.totalCost || 0), new Decimal(0))
    
    const totalSaved = new Decimal(bonuses._sum.amount || 0)

    const stats: UserStats = {
      balance: new Decimal(user.balance || 0),
      totalOrders,
      activeOrders,
      totalSpent,
      totalSaved,
      vipTier: user.vipTier || 'REGULAR',
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
    logger.error('Failed to get user stats:', { userId, error })
    
    // Возвращаем дефолтные значения в случае ошибки
    return {
      balance: new Decimal(0),
      totalOrders: 0,
      activeOrders: 0,
      totalSpent: new Decimal(0),
      totalSaved: new Decimal(0),
      vipTier: 'REGULAR' as VipTier,
      vipExpiresAt: undefined
    }
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
      vipUsers,
      pendingPayments,
      todayPayments,
      shippingOrders,
      purchaseOrders,
      processingOrders,
      totalUsers
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
          OR: [
            { vipExpiresAt: null },
            { vipExpiresAt: { gte: new Date() } }
          ]
        }
      }),
      
      // Ожидают оплаты
      prisma.order.count({
        where: {
          status: 'CREATED',
          createdAt: { gte: today }
        }
      }),
      
      // Платежи сегодня
      prisma.transaction.count({
        where: {
          type: 'PAYMENT',
          createdAt: { gte: today }
        }
      }),
      
      // Заказы на отправку
      prisma.order.count({
        where: {
          type: 'SHIPPING',
          createdAt: { gte: today }
        }
      }),
      
      // Заказы на выкуп
      prisma.order.count({
        where: {
          type: { in: ['PURCHASE', 'FIXED_PRICE'] },
          createdAt: { gte: today }
        }
      }),
      
      // В обработке
      prisma.order.count({
        where: { status: 'PROCESSING' }
      }),
      
      // Всего пользователей
      prisma.user.count()
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
      todayPayments,
      pendingPayments,
      avgOrderValue: todayOrders > 0 
        ? todayRevenueAmount.dividedBy(todayOrders).toNumber()
        : 0,
      shippingOrders,
      purchaseOrders,
      processingOrders,
      totalUsers
    }
  } catch (error) {
    logger.error('Failed to get dashboard stats:', error)
    
    // Возвращаем дефолтные значения
    return {
      todayRevenue: 0,
      todayOrders: 0,
      todayUsers: 0,
      activeOrders: 0,
      problemOrders: 0,
      onlineUsers: 0,
      vipUsers: 0,
      revenueChange: 0,
      todayPayments: 0,
      pendingPayments: 0,
      avgOrderValue: 0,
      shippingOrders: 0,
      purchaseOrders: 0,
      processingOrders: 0,
      totalUsers: 0
    }
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