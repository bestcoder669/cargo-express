export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
  meta?: {
    page?: number
    limit?: number
    total?: number
  }
}

export interface PaginationParams {
  page: number
  limit: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface DateRange {
  from: Date | string
  to: Date | string
}

export type Currency = 'RUB' | 'USD' | 'EUR' | 'CNY' | 'GBP'

export type Language = 'ru' | 'en'
