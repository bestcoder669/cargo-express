// packages/bot/src/config/index.ts - Конфигурация приложения
import { z } from 'zod'
import dotenv from 'dotenv'

dotenv.config()

const configSchema = z.object({
  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TZ: z.string().default('Europe/Moscow'),
  
  // Bot
  BOT_TOKEN: z.string().min(1),
  BOT_WEBHOOK_DOMAIN: z.string().url().optional(),
  BOT_WEBHOOK_PATH: z.string().default('/webhook'),
  BOT_WEBHOOK_PORT: z.coerce.number().default(8443),
  BOT_ADMIN_IDS: z
    .string()
    .transform(s => s.split(',').map(id => parseInt(id.trim(), 10)))
    .default(''),
  BOT_SUPPORT_GROUP_ID: z.coerce.number().optional(),
  
  // Database
  DATABASE_URL: z.string().url(),
  
  // Redis
  REDIS_URL: z.string().url(),
  
  // API Gateway
  API_URL: z.string().url().default('http://localhost:4000'),
  API_KEY: z.string().optional(),
  
  // WebSocket
  WS_URL: z.string().url().default('ws://localhost:4000'),
  
  // Payment
  PAYMENT_PROVIDER: z.enum(['stripe', 'crypto', 'test']).default('test'),
  STRIPE_PROVIDER_TOKEN: z.string().optional(),
  CRYPTO_BOT_TOKEN: z.string().optional(),
  
  // External Services
  EXCHANGE_RATE_API: z.string().url().optional(),
  TRACKING_API_URL: z.string().url().optional(),
  PRODUCT_PARSER_API: z.string().url().optional(),
  
  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_PRETTY: z.coerce.boolean().default(true),
  
  // Rate Limits
  RATE_LIMIT_WINDOW: z.coerce.number().default(2000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(3),
  
  // Session
  SESSION_TTL_DAYS: z.coerce.number().default(30),
  
  // File Upload
  MAX_FILE_SIZE_MB: z.coerce.number().default(50),
  ALLOWED_FILE_TYPES: z
    .string()
    .transform(s => s.split(',').map(t => t.trim()))
    .default('image/jpeg,image/png,image/webp,application/pdf'),
  
  // Notifications
  NOTIFICATION_BATCH_SIZE: z.coerce.number().default(100),
  NOTIFICATION_DELAY_MS: z.coerce.number().default(50),
  
  // Business Logic
  MIN_TOPUP_AMOUNT: z.coerce.number().default(500),
  MAX_TOPUP_AMOUNT: z.coerce.number().default(500000),
  CARD_FEE_PERCENT: z.coerce.number().default(2.5),
  SBP_FEE_PERCENT: z.coerce.number().default(0.7),
  VIP_CASHBACK_PERCENT: z.coerce.number().default(2),
  MAX_PARCEL_WEIGHT_KG: z.coerce.number().default(50),
  MAX_DECLARED_VALUE_USD: z.coerce.number().default(2000),
  ORDER_STORAGE_DAYS: z.coerce.number().default(14),
  AUTO_CANCEL_HOURS: z.coerce.number().default(24),
  
  // Scanner Configuration
  SCANNER_ENABLED: z.coerce.boolean().default(true),
  SCANNER_WEBHOOK_PORT: z.coerce.number().default(8444),
  SCANNER_TIMEOUT_MS: z.coerce.number().default(30000),
})

type Config = z.infer<typeof configSchema>

function loadConfig(): Config {
  try {
    const config = configSchema.parse(process.env)
    
    // Validate required services in production
    if (config.NODE_ENV === 'production') {
      if (!config.BOT_WEBHOOK_DOMAIN) {
        throw new Error('BOT_WEBHOOK_DOMAIN is required in production')
      }
      if (!config.API_KEY) {
        throw new Error('API_KEY is required in production')
      }
      if (config.PAYMENT_PROVIDER !== 'test' && !config.STRIPE_PROVIDER_TOKEN && !config.CRYPTO_BOT_TOKEN) {
        throw new Error('Payment provider token is required in production')
      }
    }
    
    // Используем console.log вместо logger чтобы избежать циклической зависимости
    console.log('✅ Configuration loaded successfully')
    return config
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Configuration validation failed:')
      error.errors.forEach(err => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`)
      })
    } else {
      console.error('Failed to load configuration:', error)
    }
    process.exit(1)
  }
}

export const config = loadConfig()

// Export typed config sections for convenience
export const botConfig = {
  token: config.BOT_TOKEN,
  webhook: {
    domain: config.BOT_WEBHOOK_DOMAIN,
    path: config.BOT_WEBHOOK_PATH,
    port: config.BOT_WEBHOOK_PORT,
  },
  adminIds: config.BOT_ADMIN_IDS,
  supportGroupId: config.BOT_SUPPORT_GROUP_ID,
} as const

export const dbConfig = {
  url: config.DATABASE_URL,
} as const

export const redisConfig = {
  url: config.REDIS_URL,
} as const

export const paymentConfig = {
  provider: config.PAYMENT_PROVIDER,
  stripe: {
    token: config.STRIPE_PROVIDER_TOKEN,
  },
  crypto: {
    token: config.CRYPTO_BOT_TOKEN,
  },
  fees: {
    card: config.CARD_FEE_PERCENT,
    sbp: config.SBP_FEE_PERCENT,
  },
} as const

export const businessConfig = {
  topup: {
    min: config.MIN_TOPUP_AMOUNT,
    max: config.MAX_TOPUP_AMOUNT,
  },
  shipping: {
    maxWeight: config.MAX_PARCEL_WEIGHT_KG,
    maxDeclaredValue: config.MAX_DECLARED_VALUE_USD,
    storageDays: config.ORDER_STORAGE_DAYS,
  },
  orders: {
    autoCancelHours: config.AUTO_CANCEL_HOURS,
  },
  vip: {
    cashbackPercent: config.VIP_CASHBACK_PERCENT,
  },
} as const

export const scannerConfig = {
  enabled: config.SCANNER_ENABLED,
  webhookPort: config.SCANNER_WEBHOOK_PORT,
  timeoutMs: config.SCANNER_TIMEOUT_MS,
} as const

// Environment helpers
export const isDevelopment = config.NODE_ENV === 'development'
export const isProduction = config.NODE_ENV === 'production'
export const isTest = config.NODE_ENV === 'test'