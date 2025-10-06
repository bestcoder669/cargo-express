// packages/bot/src/types/database.ts - Расширенные типы базы данных
import type { Prisma } from '@prisma/client'

export enum OrderType {
  SHIPPING = 'SHIPPING',
  PURCHASE = 'PURCHASE',
  FIXED_PRICE = 'FIXED_PRICE',
}

export enum OrderStatus {
  // Common statuses
  CREATED = 'CREATED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
  
  // Shipping statuses
  WAREHOUSE_RECEIVED = 'WAREHOUSE_RECEIVED',
  PROCESSING = 'PROCESSING',
  SHIPPED = 'SHIPPED',
  CUSTOMS = 'CUSTOMS',
  IN_TRANSIT = 'IN_TRANSIT',
  READY_PICKUP = 'READY_PICKUP',
  DELIVERED = 'DELIVERED',
  
  // Purchase statuses
  PURCHASING = 'PURCHASING',
  PURCHASED = 'PURCHASED',
  PROBLEM = 'PROBLEM',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export enum PaymentMethod {
  CARD = 'CARD',
  CRYPTO = 'CRYPTO',
  SBP = 'SBP',
  BALANCE = 'BALANCE',
}

export enum VipTier {
  REGULAR = 'REGULAR',
  SILVER = 'SILVER',
  GOLD = 'GOLD',
  PLATINUM = 'PLATINUM',
}

export enum AdminRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ORDER_MANAGER = 'ORDER_MANAGER',
  FINANCE_MANAGER = 'FINANCE_MANAGER',
  SUPPORT_OPERATOR = 'SUPPORT_OPERATOR',
  CONTENT_MANAGER = 'CONTENT_MANAGER',
}

// Extended types with relations
export type UserWithRelations = Prisma.UserGetPayload<{
  include: {
    addresses: true
    orders: true
    transactions: true
  }
}>

export type OrderWithRelations = Prisma.OrderGetPayload<{
  include: {
    user: true
    fromCountry: true
    toCountry: true
    statusHistory: true
    transactions: true
    items: true
  }
}>

export type CountryWithRelations = Prisma.CountryGetPayload<{
  include: {
    warehouses: true
    tariffs: true
    fixedProducts: true
  }
}>