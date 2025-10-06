// packages/bot/src/utils/formatter.ts - Утилиты форматирования
import { format, formatDistance, formatRelative, parseISO } from 'date-fns'
import { ru, enUS } from 'date-fns/locale'
import Decimal from 'decimal.js'

// Currency formatting
export function formatCurrency(
  amount: number | string | Decimal,
  currency = 'RUB',
  locale = 'ru-RU'
): string {
  const value = new Decimal(amount).toNumber()
  
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'RUB' ? 0 : 2,
    maximumFractionDigits: 2,
  })
  
  return formatter.format(value)
}

// Number formatting with thousands separator
export function formatNumber(
  value: number | string | Decimal,
  decimals = 0,
  locale = 'ru-RU'
): string {
  const num = new Decimal(value).toNumber()
  
  const formatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  
  return formatter.format(num)
}

// Percentage formatting
export function formatPercent(
  value: number | string | Decimal,
  decimals = 1,
  locale = 'ru-RU'
): string {
  const num = new Decimal(value).dividedBy(100).toNumber()
  
  const formatter = new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  
  return formatter.format(num)
}

// Date formatting
export function formatDate(
  date: Date | string | number,
  formatStr = 'dd.MM.yyyy',
  locale: 'ru' | 'en' = 'ru'
): string {
  const d = typeof date === 'string' ? parseISO(date) : new Date(date)
  return format(d, formatStr, { locale: locale === 'ru' ? ru : enUS })
}

// DateTime formatting
export function formatDateTime(
  date: Date | string | number,
  formatStr = 'dd.MM.yyyy HH:mm',
  locale: 'ru' | 'en' = 'ru'
): string {
  const d = typeof date === 'string' ? parseISO(date) : new Date(date)
  return format(d, formatStr, { locale: locale === 'ru' ? ru : enUS })
}

// Relative time formatting
export function formatRelativeTime(
  date: Date | string | number,
  baseDate = new Date(),
  locale: 'ru' | 'en' = 'ru'
): string {
  const d = typeof date === 'string' ? parseISO(date) : new Date(date)
  return formatRelative(d, baseDate, { locale: locale === 'ru' ? ru : enUS })
}

// Distance time formatting
export function formatTimeDistance(
  date: Date | string | number,
  baseDate = new Date(),
  locale: 'ru' | 'en' = 'ru',
  addSuffix = true
): string {
  const d = typeof date === 'string' ? parseISO(date) : new Date(date)
  return formatDistance(d, baseDate, { 
    locale: locale === 'ru' ? ru : enUS,
    addSuffix 
  })
}

// Weight formatting
export function formatWeight(
  weight: number | string | Decimal,
  unit: 'kg' | 'g' = 'kg'
): string {
  const value = new Decimal(weight)
  
  if (unit === 'kg') {
    if (value.lessThan(1)) {
      return `${value.times(1000).toFixed(0)} г`
    }
    return `${value.toFixed(value.mod(1).equals(0) ? 0 : 1)} кг`
  }
  
  return `${value.toFixed(0)} г`
}

// Phone number formatting
export function formatPhone(phone: string): string {
  // Remove all non-digits
  const cleaned = phone.replace(/\D/g, '')
  
  // Format Russian phone number
  if (cleaned.startsWith('7') && cleaned.length === 11) {
    return `+7 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7, 9)}-${cleaned.slice(9, 11)}`
  }
  
  // Format international
  if (cleaned.length >= 10) {
    const country = cleaned.slice(0, -10)
    const area = cleaned.slice(-10, -7)
    const prefix = cleaned.slice(-7, -4)
    const line = cleaned.slice(-4)
    return `+${country} (${area}) ${prefix}-${line}`
  }
  
  return phone
}

// Order number formatting
export function formatOrderNumber(orderNumber: string): string {
  return `#${orderNumber}`
}

// Custom ID formatting
export function formatCustomId(customId: string): string {
  return `#${customId}`
}

// Status text formatting
export function formatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    // Common
    CREATED: 'Создан',
    PAID: 'Оплачен',
    CANCELLED: 'Отменен',
    REFUNDED: 'Возврат средств',
    
    // Shipping
    WAREHOUSE_RECEIVED: 'Получен на складе',
    PROCESSING: 'Обрабатывается',
    SHIPPED: 'Отправлен',
    CUSTOMS: 'Таможенное оформление',
    IN_TRANSIT: 'В пути',
    READY_PICKUP: 'Готов к получению',
    DELIVERED: 'Доставлен',
    
    // Purchase
    PURCHASING: 'Покупаем товар',
    PURCHASED: 'Товар выкуплен',
    PROBLEM: 'Проблема',
  }
  
  return statusMap[status] || status
}

// VIP tier formatting
export function formatVipTier(tier: string): string {
  const tierMap: Record<string, string> = {
    REGULAR: 'Обычный',
    SILVER: 'Серебряный ⚪',
    GOLD: 'Золотой 🟡',
    PLATINUM: 'Платиновый ⚫',
  }
  
  return tierMap[tier] || tier
}

// File size formatting
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

// Duration formatting
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  
  if (days > 0) {
    return `${days}д ${hours % 24}ч`
  }
  if (hours > 0) {
    return `${hours}ч ${minutes % 60}м`
  }
  if (minutes > 0) {
    return `${minutes}м ${seconds % 60}с`
  }
  return `${seconds}с`
}

// Escape HTML for Telegram
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Escape Markdown for Telegram
export function escapeMarkdown(text: string): string {
  return text
    .replace(/\_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\~/g, '\\~')
    .replace(/\`/g, '\\`')
    .replace(/\>/g, '\\>')
    .replace(/\#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/\-/g, '\\-')
    .replace(/\=/g, '\\=')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\./g, '\\.')
    .replace(/\!/g, '\\!')
}

// Truncate text
export function truncate(text: string, maxLength: number, suffix = '...'): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - suffix.length) + suffix
}

// Generate tracking info text
export function formatTrackingInfo(
  status: string,
  location?: string,
  updatedAt?: Date | string
): string {
  let info = `📍 Статус: ${formatStatus(status)}`
  
  if (location) {
    info += `\n📍 Местоположение: ${location}`
  }
  
  if (updatedAt) {
    info += `\n🕐 Обновлено: ${formatDateTime(updatedAt)}`
  }
  
  return info
}

// Format delivery time range
export function formatDeliveryTime(minDays: number, maxDays: number): string {
  if (minDays === maxDays) {
    return `${minDays} ${pluralize(minDays, 'день', 'дня', 'дней')}`
  }
  return `${minDays}-${maxDays} ${pluralize(maxDays, 'день', 'дня', 'дней')}`
}

// Pluralization helper for Russian
export function pluralize(
  count: number,
  one: string,
  few: string,
  many: string
): string {
  const mod10 = count % 10
  const mod100 = count % 100
  
  if (mod100 >= 11 && mod100 <= 14) {
    return many
  }
  
  if (mod10 === 1) {
    return one
  }
  
  if (mod10 >= 2 && mod10 <= 4) {
    return few
  }
  
  return many
}

// Format address
export function formatAddress(
  city: string,
  address: string,
  postalCode?: string
): string {
  let formatted = `${city}, ${address}`
  if (postalCode) {
    formatted = `${postalCode}, ${formatted}`
  }
  return formatted
}

// Format order summary
export function formatOrderSummary(order: {
  orderNumber: string
  type: string
  status: string
  totalCost: number | string | Decimal
  createdAt: Date | string
}): string {
  const type = order.type === 'SHIPPING' ? '📦' : '🛒'
  const status = formatStatus(order.status)
  const cost = formatCurrency(order.totalCost)
  const date = formatDate(order.createdAt)
  
  return `${type} ${formatOrderNumber(order.orderNumber)} | ${status} | ${cost} | ${date}`
}