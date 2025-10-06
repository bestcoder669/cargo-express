export enum AdminRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ORDER_MANAGER = 'ORDER_MANAGER',
  FINANCE_MANAGER = 'FINANCE_MANAGER',
  SUPPORT_OPERATOR = 'SUPPORT_OPERATOR',
  CONTENT_MANAGER = 'CONTENT_MANAGER',
}

export interface Admin {
  id: string
  telegramId: string
  username?: string
  firstName: string
  lastName?: string
  email?: string
  role: AdminRole
  permissions?: string[]
  isActive: boolean
  createdAt: Date | string
  lastLogin?: Date | string
}

export interface DashboardStats {
  todayRevenue: number
  todayOrders: number
  todayUsers: number
  activeOrders: number
  problemOrders: number
  onlineUsers: number
  revenueChange: number
  ordersChange: number
  usersChange: number
}
