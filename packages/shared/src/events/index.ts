export enum EventType {
  // Order events
  ORDER_CREATED = 'order.created',
  ORDER_UPDATED = 'order.updated',
  ORDER_CANCELLED = 'order.cancelled',
  ORDER_DELIVERED = 'order.delivered',
  
  // Payment events
  PAYMENT_RECEIVED = 'payment.received',
  PAYMENT_FAILED = 'payment.failed',
  PAYMENT_REFUNDED = 'payment.refunded',
  
  // User events
  USER_REGISTERED = 'user.registered',
  USER_UPDATED = 'user.updated',
  USER_BLOCKED = 'user.blocked',
  
  // Admin events
  ADMIN_ACTION = 'admin.action',
  ADMIN_BROADCAST = 'admin.broadcast',
  
  // Scanner events
  SCANNER_SCAN = 'scanner.scan',
  SCANNER_ERROR = 'scanner.error',
  
  // Support events
  SUPPORT_MESSAGE = 'support.message',
  SUPPORT_ASSIGNED = 'support.assigned',
}

export interface BaseEvent {
  id: string
  type: EventType
  timestamp: Date | string
  userId?: string
  adminId?: string
  metadata?: Record<string, unknown>
}

export interface OrderEvent extends BaseEvent {
  type: EventType.ORDER_CREATED | EventType.ORDER_UPDATED | EventType.ORDER_CANCELLED | EventType.ORDER_DELIVERED
  orderId: string
  orderNumber: string
  status: OrderStatus
  changes?: Partial<Order>
}

export interface PaymentEvent extends BaseEvent {
  type: EventType.PAYMENT_RECEIVED | EventType.PAYMENT_FAILED | EventType.PAYMENT_REFUNDED
  transactionId: string
  orderId?: string
  amount: number
  currency: Currency
  method: PaymentMethod
}

export interface ScannerEvent extends BaseEvent {
  type: EventType.SCANNER_SCAN | EventType.SCANNER_ERROR
  barcode: string
  scannerId: string
  location?: string
  error?: string
}
