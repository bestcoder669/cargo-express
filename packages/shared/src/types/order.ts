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

export interface Order {
  id: string
  orderNumber: string
  type: OrderType
  status: OrderStatus
  userId: string
  fromCountryId: string
  toCountryId: string
  weight?: number
  declaredValue?: number
  declaredCurrency?: Currency
  description?: string
  totalCost: number
  trackingNumber?: string
  createdAt: Date | string
  updatedAt: Date | string
}

export interface CreateOrderDTO {
  type: OrderType
  fromCountryId: string
  toCountryId?: string
  weight?: number
  declaredValue?: number
  declaredCurrency?: Currency
  description?: string
  recipientName?: string
  recipientPhone?: string
  addressId?: string
  items?: OrderItemDTO[]
}

export interface OrderItemDTO {
  productId?: string
  name: string
  quantity: number
  price: number
  currency: Currency
}

export interface UpdateOrderDTO {
  status?: OrderStatus
  trackingNumber?: string
  adminComment?: string
  problemReason?: string
}
