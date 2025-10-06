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

export enum TransactionType {
  PAYMENT = 'PAYMENT',
  REFUND = 'REFUND',
  TOPUP = 'TOPUP',
  WITHDRAWAL = 'WITHDRAWAL',
  BONUS = 'BONUS',
  COMMISSION = 'COMMISSION',
}

export interface Transaction {
  id: string
  transactionId: string
  userId: string
  orderId?: string
  type: TransactionType
  method?: PaymentMethod
  status: PaymentStatus
  amount: number
  currency: Currency
  description?: string
  createdAt: Date | string
  completedAt?: Date | string
}

export interface CreatePaymentDTO {
  orderId?: string
  amount: number
  currency: Currency
  method: PaymentMethod
  returnUrl?: string
}

export interface PaymentCallback {
  transactionId: string
  status: PaymentStatus
  paymentId?: string
  metadata?: Record<string, unknown>
}
