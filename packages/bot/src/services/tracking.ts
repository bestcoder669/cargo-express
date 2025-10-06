// packages/bot/src/services/tracking.ts - Сервис отслеживания заказов
import { prisma } from './database'
import { logger } from '../utils/logger'
import { formatDate, formatStatus } from '../utils/formatter'

export interface TrackingInfo {
  orderNumber: string
  description: string
  recipient: string
  address: string
  status: string
  statusText: string
  location: string
  updatedAt: Date
  history: TrackingHistoryItem[]
}

export interface TrackingHistoryItem {
  date: string
  status: string
  location?: string
}

export async function trackOrder(
  trackingNumber: string,
  userId?: string
): Promise<TrackingInfo | null> {
  try {
    // Убираем # если есть
    const cleanNumber = trackingNumber.replace('#', '').toUpperCase()
    
    // Ищем заказ по номеру или трек-номеру
    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { orderNumber: cleanNumber },
          { trackingNumber: cleanNumber },
          { internalTracking: cleanNumber }
        ],
        ...(userId ? { userId } : {})
      },
      include: {
        user: true,
        fromCountry: true,
        toCountry: true,
        address: {
          include: { city: true }
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' }
        }
      }
    })
    
    if (!order) {
      return null
    }
    
    // Формируем описание
    let description = `${order.fromCountry.flagEmoji} ${order.fromCountry.name} → ${order.toCountry.flagEmoji} ${order.toCountry.name}`
    if (order.weight) {
      description += ` (${order.weight} кг)`
    }
    
    // Формируем адрес
    const address = order.deliveryAddress || 
      (order.address ? `${order.address.city.name}, ${order.address.address}` : 'Не указан')
    
    // Формируем текущее местоположение
    const location = getLocationByStatus(order.status, order.fromCountry.name, order.toCountry.name)
    
    // Формируем историю перемещений
    const history: TrackingHistoryItem[] = order.statusHistory.map(h => ({
      date: formatDate(h.createdAt, 'dd.MM.yyyy HH:mm'),
      status: formatStatus(h.newStatus),
      location: getLocationByStatus(h.newStatus, order.fromCountry.name, order.toCountry.name)
    }))
    
    // Добавляем текущий статус в историю если его нет
    if (history.length === 0 || history[history.length - 1].status !== formatStatus(order.status)) {
      history.push({
        date: formatDate(order.updatedAt, 'dd.MM.yyyy HH:mm'),
        status: formatStatus(order.status),
        location
      })
    }
    
    return {
      orderNumber: order.orderNumber,
      description,
      recipient: order.recipientName || `${order.user.firstName} ${order.user.lastName || ''}`,
      address,
      status: order.status,
      statusText: formatStatus(order.status),
      location,
      updatedAt: order.updatedAt,
      history
    }
  } catch (error) {
    logger.error('Failed to track order:', error)
    return null
  }
}

function getLocationByStatus(status: string, fromCountry: string, toCountry: string): string {
  const locationMap: Record<string, string> = {
    CREATED: toCountry,
    PAID: toCountry,
    WAREHOUSE_RECEIVED: `${fromCountry}, склад`,
    PROCESSING: `${fromCountry}, склад`,
    SHIPPED: `${fromCountry} → ${toCountry}`,
    CUSTOMS: `${toCountry}, таможня`,
    IN_TRANSIT: `${toCountry}, в пути`,
    READY_PICKUP: `${toCountry}, пункт выдачи`,
    DELIVERED: `${toCountry}, доставлен`,
    PURCHASING: fromCountry,
    PURCHASED: fromCountry,
    PROBLEM: 'Уточняется',
    CANCELLED: '-',
    REFUNDED: '-'
  }
  
  return locationMap[status] || 'Неизвестно'
}

// Получить активные заказы пользователя
export async function getUserActiveOrders(userId: string) {
  try {
    const orders = await prisma.order.findMany({
      where: {
        userId,
        status: {
          notIn: ['DELIVERED', 'CANCELLED', 'REFUNDED']
        }
      },
      include: {
        fromCountry: true,
        toCountry: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10
    })
    
    return orders.map(order => ({
      id: order.id,
      orderNumber: order.orderNumber,
      type: order.type,
      status: order.status,
      statusText: formatStatus(order.status),
      fromCountry: order.fromCountry.name,
      fromCountryEmoji: order.fromCountry.flagEmoji,
      toCountry: order.toCountry.name,
      toCountryEmoji: order.toCountry.flagEmoji,
      weight: order.weight,
      totalCost: order.totalCost,
      createdAt: order.createdAt,
      trackingNumber: order.trackingNumber
    }))
  } catch (error) {
    logger.error('Failed to get user active orders:', error)
    return []
  }
}

// Обновить статус заказа
export async function updateOrderStatus(
  orderId: string,
  newStatus: string,
  comment?: string,
  adminId?: string
): Promise<boolean> {
  try {
    await prisma.$transaction(async (tx) => {
      // Получаем текущий статус
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true }
      })
      
      if (!order) {
        throw new Error('Order not found')
      }
      
      // Обновляем статус
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: newStatus as any,
          updatedAt: new Date()
        }
      })
      
      // Добавляем запись в историю
      await tx.statusHistory.create({
        data: {
          orderId,
          oldStatus: order.status,
          newStatus: newStatus as any,
          comment,
          adminId
        }
      })
    })
    
    logger.info('Order status updated', { orderId, newStatus, adminId })
    return true
  } catch (error) {
    logger.error('Failed to update order status:', error)
    return false
  }
}