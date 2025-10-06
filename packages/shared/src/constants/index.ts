export const CURRENCIES = ['RUB', 'USD', 'EUR', 'CNY', 'GBP'] as const

export const ORDER_STATUSES = [
  'CREATED',
  'PAID',
  'WAREHOUSE_RECEIVED',
  'PROCESSING',
  'SHIPPED',
  'CUSTOMS',
  'IN_TRANSIT',
  'READY_PICKUP',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
  'PURCHASING',
  'PURCHASED',
  'PROBLEM'
] as const

export const PAYMENT_METHODS = ['CARD', 'CRYPTO', 'SBP', 'BALANCE'] as const

export const VIP_TIERS = ['REGULAR', 'SILVER', 'GOLD', 'PLATINUM'] as const

export const ADMIN_ROLES = [
  'SUPER_ADMIN',
  'ORDER_MANAGER',
  'FINANCE_MANAGER',
  'SUPPORT_OPERATOR',
  'CONTENT_MANAGER'
] as const

export const DEFAULT_PAGINATION = {
  page: 1,
  limit: 20,
  maxLimit: 100
} as const

export const RATE_LIMITS = {
  api: {
    window: 60000, // 1 minute
    maxRequests: 100
  },
  bot: {
    window: 2000, // 2 seconds
    maxRequests: 3
  }
} as const