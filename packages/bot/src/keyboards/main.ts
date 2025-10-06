// packages/bot/src/keyboards/main.ts - Основные клавиатуры
import { InlineKeyboard, Keyboard } from 'grammy'
import type { BotContext } from '../types/context'
import { getUserStats } from '../services/stats'
import { formatCurrency } from '../utils/formatter'

export const mainMenuKeyboard = async (ctx: BotContext): Promise<InlineKeyboard> => {
  const keyboard = new InlineKeyboard()
  
  // Основные действия - 2x2 сетка для компактности
  keyboard
    .text('📦 Новая отправка', 'shipping:new')
    .text('🛒 Заказать товар', 'purchase:new')
    .row()
    .text('📍 Мои заказы', 'orders:list')
    .text('👤 Профиль', 'profile:main')
  
  // Админ-кнопка только для админов
  if (ctx.isAdmin) {
    keyboard.row().text('🔧 Админ-панель', 'admin:dashboard')
  }
  
  return keyboard
}

export const quickActionsKeyboard = new InlineKeyboard()
  .text('🏢 Адреса складов', 'warehouses:list')
  .text('📊 Калькулятор', 'calculator:start')
  .row()
  .text('💬 Поддержка', 'support:start')
  .text('❓ Помощь', 'help:main')

export const profileKeyboard = async (userId: string): Promise<InlineKeyboard> => {
  const stats = await getUserStats(userId)
  const keyboard = new InlineKeyboard()
  
  keyboard
    .text(`💰 Пополнить баланс (${formatCurrency(stats.balance)})`, 'payment:topup')
    .row()
    .text('📦 История заказов', 'orders:history')
    .text('📍 Адреса доставки', 'addresses:list')
    .row()
    .text('⚙️ Настройки', 'settings:main')
    .text('🎁 Реферальная программа', 'referral:info')
  
  if (stats.vipTier !== 'REGULAR') {
    keyboard.row().text('⭐ VIP статус', 'vip:status')
  }
  
  keyboard.row().text('⬅️ Главное меню', 'menu:main')
  
  return keyboard
}

export const backButton = (callback: string) => 
  new InlineKeyboard().text('⬅️ Назад', callback)

export const cancelButton = new InlineKeyboard()
  .text('❌ Отмена', 'cancel')

export const confirmKeyboard = new InlineKeyboard()
  .text('✅ Подтвердить', 'confirm')
  .text('❌ Отмена', 'cancel')

// packages/bot/src/keyboards/dynamic.ts - Динамические клавиатуры из БД
import { InlineKeyboard } from 'grammy'
import { prisma } from '../services/database'
import { formatCurrency } from '../utils/formatter'

export async function getWarehousesKeyboard(): Promise<InlineKeyboard> {
  const warehouses = await prisma.country.findMany({
    where: {
      isActive: true,
      shippingAvailable: true,
      warehouses: {
        some: { isActive: true }
      }
    },
    include: {
      warehouses: {
        where: { isActive: true },
        take: 1
      },
      tariffs: {
        where: { 
          toCountryId: 'RU',
          isActive: true 
        },
        take: 1
      }
    },
    orderBy: [
      { popularityScore: 'desc' },
      { name: 'asc' }
    ]
  })
  
  const keyboard = new InlineKeyboard()
  
  for (const country of warehouses) {
    const tariff = country.tariffs[0]
    if (!tariff) continue
    
    const buttonText = `${country.flagEmoji} ${country.name} (от ${formatCurrency(tariff.pricePerKg)}/кг)`
    keyboard.text(buttonText, `warehouse:${country.id}`).row()
  }
  
  keyboard
    .text('📊 Калькулятор стоимости', 'calculator:start')
    .text('⬅️ Главное меню', 'menu:main')
  
  return keyboard
}

export async function getCitiesKeyboard(search?: string): Promise<InlineKeyboard> {
  const cities = await prisma.city.findMany({
    where: {
      countryCode: 'RU',
      isActive: true,
      ...(search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { region: { contains: search, mode: 'insensitive' } }
        ]
      } : {
        isPopular: true
      })
    },
    orderBy: [
      { isPopular: 'desc' },
      { population: 'desc' },
      { name: 'asc' }
    ],
    take: 12
  })
  
  const keyboard = new InlineKeyboard()
  let row: string[][] = []
  
  for (const city of cities) {
    row.push([city.name, `city:${city.id}`])
    
    if (row.length === 3) {
      keyboard.add(...row.map(([text, data]) => ({ text, callback_data: data })))
      keyboard.row()
      row = []
    }
  }
  
  if (row.length > 0) {
    keyboard.add(...row.map(([text, data]) => ({ text, callback_data: data })))
    keyboard.row()
  }
  
  if (!search) {
    keyboard.text('🔍 Найти другой город', 'city:search')
  } else {
    keyboard.text('⬅️ Популярные города', 'city:popular')
  }
  
  return keyboard
}

export async function getCountriesKeyboard(
  type: 'shipping' | 'purchase'
): Promise<InlineKeyboard> {
  const countries = await prisma.country.findMany({
    where: {
      isActive: true,
      [type === 'shipping' ? 'shippingAvailable' : 'purchaseAvailable']: true
    },
    include: {
      _count: {
        select: {
          orders: {
            where: {
              createdAt: {
                gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
              }
            }
          }
        }
      }
    },
    orderBy: [
      { popularityScore: 'desc' },
      { name: 'asc' }
    ]
  })
  
  const keyboard = new InlineKeyboard()
  
  for (const country of countries) {
    let buttonText = `${country.flagEmoji} ${country.name}`
    
    if (type === 'purchase') {
      buttonText += ` (комиссия ${country.purchaseCommission}%)`
    }
    
    if (country._count.orders > 0) {
      buttonText += ' 🔥'
    }
    
    keyboard.text(buttonText, `${type}:country:${country.id}`).row()
  }
  
  keyboard.text('⬅️ Назад', type === 'shipping' ? 'shipping:new' : 'purchase:new')
  
  return keyboard
}

export async function getWeightKeyboard(countryId: string): Promise<InlineKeyboard> {
  const tariff = await prisma.shippingTariff.findFirst({
    where: {
      fromCountryId: countryId,
      toCountryId: 'RU',
      isActive: true
    }
  })
  
  if (!tariff) {
    return new InlineKeyboard().text('❌ Тариф не найден', 'error')
  }
  
  const keyboard = new InlineKeyboard()
  const weights = [0.5, 1, 1.5, 2, 2.5, 3, 5, 10, 15, 20, 30, 50]
  
  let row = 0
  for (let i = 0; i < weights.length; i++) {
    const weight = weights[i]
    const cost = Math.max(weight * tariff.pricePerKg, tariff.minPrice)
    const buttonText = `${weight} кг - ${formatCurrency(cost)}`
    
    keyboard.text(buttonText, `weight:${weight}`)
    
    if ((i + 1) % 3 === 0) {
      keyboard.row()
      row++
    }
  }
  
  keyboard
    .row()
    .text('✏️ Ввести точный вес', 'weight:custom')
    .row()
    .text('⬅️ Назад', 'shipping:country')
  
  return keyboard
}

// packages/bot/src/keyboards/admin.ts - Админские клавиатуры
import { InlineKeyboard } from 'grammy'
import { prisma } from '../services/database'
import { formatCurrency } from '../utils/formatter'
import type { AdminRole } from '../types/database'

export async function getAdminDashboardKeyboard(role: AdminRole): Promise<InlineKeyboard> {
  const keyboard = new InlineKeyboard()
  
  // Получаем статистику для отображения уведомлений
  const problemOrders = await prisma.order.count({
    where: { status: 'PROBLEM' }
  })
  
  const pendingPayments = await prisma.transaction.count({
    where: { status: 'PENDING' }
  })
  
  const openChats = await prisma.supportChat.count({
    where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }
  })
  
  // Основные кнопки в зависимости от роли
  if (['SUPER_ADMIN', 'ORDER_MANAGER'].includes(role)) {
    keyboard.text(
      `📦 Заказы${problemOrders > 0 ? ` (${problemOrders}⚠️)` : ''}`,
      'admin:orders'
    )
  }
  
  if (['SUPER_ADMIN', 'ORDER_MANAGER', 'SUPPORT_OPERATOR'].includes(role)) {
    keyboard.text('👥 Пользователи', 'admin:users')
  }
  
  keyboard.row()
  
  if (['SUPER_ADMIN', 'CONTENT_MANAGER'].includes(role)) {
    keyboard.text('🌍 Страны и склады', 'admin:countries')
    keyboard.text('🛒 Товары', 'admin:products')
  }
  
  keyboard.row()
  
  if (['SUPER_ADMIN', 'FINANCE_MANAGER'].includes(role)) {
    keyboard.text(
      `💰 Финансы${pendingPayments > 0 ? ` (${pendingPayments}⚠️)` : ''}`,
      'admin:finance'
    )
  }
  
  if (['SUPER_ADMIN', 'ORDER_MANAGER', 'SUPPORT_OPERATOR'].includes(role)) {
    keyboard.text(
      `💬 Поддержка${openChats > 0 ? ` (${openChats}🔥)` : ''}`,
      'admin:support'
    )
  }
  
  keyboard.row()
  
  if (['SUPER_ADMIN', 'ORDER_MANAGER', 'FINANCE_MANAGER'].includes(role)) {
    keyboard.text('📊 Аналитика', 'admin:analytics')
  }
  
  if (role === 'SUPER_ADMIN') {
    keyboard.text('⚙️ Настройки', 'admin:settings')
  }
  
  keyboard.row()
  
  if (role === 'SUPER_ADMIN') {
    keyboard.text('👨‍💼 Администраторы', 'admin:admins')
    keyboard.text('📢 Рассылка', 'admin:broadcast')
  }
  
  keyboard.row()
  keyboard.text('📱 Сканер', 'admin:scanner')
  keyboard.text('🔄 Обновить', 'admin:refresh')
  
  return keyboard
}

export async function getAdminOrdersKeyboard(
  filter: 'all' | 'problem' | 'pending' | 'processing' = 'all'
): Promise<InlineKeyboard> {
  const keyboard = new InlineKeyboard()
  
  // Фильтры
  keyboard
    .text(`${filter === 'problem' ? '• ' : ''}⚠️ Проблемные`, 'admin:orders:problem')
    .text(`${filter === 'pending' ? '• ' : ''}⏳ Ожидают оплаты`, 'admin:orders:pending')
    .row()
    .text(`${filter === 'processing' ? '• ' : ''}🔄 В обработке`, 'admin:orders:processing')
    .text(`${filter === 'all' ? '• ' : ''}📋 Все заказы`, 'admin:orders:all')
    .row()
  
  // Действия
  keyboard
    .text('🔍 Поиск по ID', 'admin:orders:search')
    .text('📊 Статистика', 'admin:orders:stats')
    .row()
    .text('⬅️ Админ-панель', 'admin:dashboard')
  
  return keyboard
}

export async function getAdminUsersKeyboard(
  filter: 'all' | 'vip' | 'new' | 'blocked' = 'all'
): Promise<InlineKeyboard> {
  const keyboard = new InlineKeyboard()
  
  // Фильтры
  keyboard
    .text(`${filter === 'vip' ? '• ' : ''}🌟 VIP`, 'admin:users:vip')
    .text(`${filter === 'new' ? '• ' : ''}👶 Новые`, 'admin:users:new')
    .row()
    .text(`${filter === 'blocked' ? '• ' : ''}🚫 Заблокированные`, 'admin:users:blocked')
    .text(`${filter === 'all' ? '• ' : ''}👥 Все`, 'admin:users:all')
    .row()
  
  // Действия
  keyboard
    .text('🔍 Поиск', 'admin:users:search')
    .text('📊 Статистика', 'admin:users:stats')
    .row()
    .text('📢 Рассылка', 'admin:broadcast')
    .row()
    .text('⬅️ Админ-панель', 'admin:dashboard')
  
  return keyboard
}

export function getOrderActionsKeyboard(orderId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('📝 Изменить статус', `admin:order:status:${orderId}`)
    .text('💬 Написать клиенту', `admin:order:message:${orderId}`)
    .row()
    .text('📋 История статусов', `admin:order:history:${orderId}`)
    .text('💰 Управление оплатой', `admin:order:payment:${orderId}`)
    .row()
    .text('📦 Трек-номер', `admin:order:tracking:${orderId}`)
    .text('📝 Комментарий', `admin:order:comment:${orderId}`)
    .row()
    .text('🔄 Обновить', `admin:order:refresh:${orderId}`)
    .text('⬅️ К списку', 'admin:orders:all')
}

export function getUserActionsKeyboard(userId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('💰 Управление балансом', `admin:user:balance:${userId}`)
    .text('⭐ VIP статус', `admin:user:vip:${userId}`)
    .row()
    .text('📦 Заказы пользователя', `admin:user:orders:${userId}`)
    .text('💬 История чатов', `admin:user:chats:${userId}`)
    .row()
    .text('📧 Отправить сообщение', `admin:user:message:${userId}`)
    .text('📊 Статистика', `admin:user:stats:${userId}`)
    .row()
    .text('🚫 Заблокировать', `admin:user:block:${userId}`)
    .text('📝 Заметка', `admin:user:note:${userId}`)
    .row()
    .text('🔄 Обновить', `admin:user:refresh:${userId}`)
    .text('⬅️ К списку', 'admin:users:all')
}