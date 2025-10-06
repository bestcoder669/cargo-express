export enum VipTier {
  REGULAR = 'REGULAR',
  SILVER = 'SILVER',
  GOLD = 'GOLD',
  PLATINUM = 'PLATINUM',
}

export interface User {
  id: string
  telegramId: string
  username?: string
  firstName: string
  lastName?: string
  phone: string
  email: string
  customId: string
  balance: number
  vipTier: VipTier
  vipExpiresAt?: Date | string
  language: Language
  timezone: string
  isActive: boolean
  isBlocked: boolean
  createdAt: Date | string
  updatedAt: Date | string
  lastActivity: Date | string
}

export interface CreateUserDTO {
  telegramId: number
  username?: string
  firstName: string
  lastName?: string
  phone: string
  email: string
  cityId: string
  address: string
  referrerId?: string
}

export interface UpdateUserDTO {
  firstName?: string
  lastName?: string
  phone?: string
  email?: string
  language?: Language
  timezone?: string
}

export interface Address {
  id: string
  userId: string
  alias: string
  cityId: string
  address: string
  postalCode?: string
  isDefault: boolean
  isActive: boolean
  createdAt: Date | string
  updatedAt: Date | string
}
