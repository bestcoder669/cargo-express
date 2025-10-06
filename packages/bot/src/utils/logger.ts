// packages/bot/src/utils/logger.ts - Система логирования
import pino from 'pino'

// Ленивая инициализация для избежания циклической зависимости
let _logger: pino.Logger | null = null
let _config: any = null

// Функция для получения конфига (будет вызвана после инициализации)
function getConfig() {
  if (!_config) {
    // Динамический импорт для избежания циклической зависимости
    _config = require('../config').config
  }
  return _config
}

// Функция для создания logger instance
function createLoggerInstance(): pino.Logger {
  const config = getConfig()
  
  return pino({
    level: config.LOG_LEVEL,
    transport: config.LOG_PRETTY
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
            messageFormat: '{levelLabel} - {msg}',
            errorLikeObjectKeys: ['err', 'error'],
            errorProps: 'message,stack'
            // Убрали customPrettifiers, так как функции не могут быть сериализованы
          },
        }
      : undefined,
    base: {
      env: config.NODE_ENV,
    },
    serializers: {
      error: pino.stdSerializers.err,
      err: pino.stdSerializers.err,
      req: (req) => ({
        method: req.method,
        url: req.url,
        headers: req.headers,
        query: req.query,
        params: req.params,
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
    },
    hooks: {
      logMethod(inputArgs, method) {
        // Add timestamp to all logs
        if (inputArgs[0] && typeof inputArgs[0] === 'object') {
          inputArgs[0].timestamp = Date.now()
        }
        return method.apply(this, inputArgs)
      },
    },
  })
}

// Getter для logger с ленивой инициализацией
export const logger: pino.Logger = new Proxy({} as pino.Logger, {
  get(target, prop) {
    if (!_logger) {
      _logger = createLoggerInstance()
    }
    return (_logger as any)[prop]
  }
})

// Create child loggers for different modules
export const createLogger = (module: string) => {
  return logger.child({ module })
}

// Structured logging helpers
export const logEvent = (event: string, data?: Record<string, unknown>): void => {
  logger.info({ event, ...data }, `Event: ${event}`)
}

export const logError = (
  error: Error | unknown,
  context?: Record<string, unknown>
): void => {
  if (error instanceof Error) {
    logger.error(
      {
        err: error,
        ...context,
      },
      error.message
    )
  } else {
    logger.error(
      {
        error,
        ...context,
      },
      'Unknown error occurred'
    )
  }
}

export const logMetric = (
  metric: string,
  value: number,
  unit?: string,
  tags?: Record<string, string>
): void => {
  logger.info(
    {
      metric,
      value,
      unit,
      tags,
      type: 'metric',
    },
    `Metric: ${metric} = ${value}${unit ? ` ${unit}` : ''}`
  )
}

export const logPerformance = (
  operation: string,
  duration: number,
  metadata?: Record<string, unknown>
): void => {
  logger.info(
    {
      operation,
      duration,
      type: 'performance',
      ...metadata,
    },
    `Performance: ${operation} took ${duration}ms`
  )
}

// Async operation wrapper with logging
export async function withLogging<T>(
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  const start = Date.now()
  
  try {
    logger.debug({ operation, ...metadata }, `Starting: ${operation}`)
    const result = await fn()
    const duration = Date.now() - start
    
    logger.info(
      {
        operation,
        duration,
        success: true,
        ...metadata,
      },
      `Completed: ${operation} in ${duration}ms`
    )
    
    return result
  } catch (error) {
    const duration = Date.now() - start
    
    logger.error(
      {
        operation,
        duration,
        success: false,
        error: error instanceof Error ? error.message : error,
        ...metadata,
      },
      `Failed: ${operation} after ${duration}ms`
    )
    
    throw error
  }
}

// Request ID generator for tracing
let requestCounter = 0
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36)
  const counter = (++requestCounter).toString(36).padStart(4, '0')
  const random = Math.random().toString(36).substring(2, 6)
  return `${timestamp}-${counter}-${random}`
}

// Context logger for request tracing
export class ContextLogger {
  private requestId: string
  private metadata: Record<string, unknown>
  private childLogger: pino.Logger

  constructor(requestId?: string, metadata?: Record<string, unknown>) {
    this.requestId = requestId || generateRequestId()
    this.metadata = metadata || {}
    this.childLogger = logger.child({
      requestId: this.requestId,
      ...this.metadata,
    })
  }

  addMetadata(metadata: Record<string, unknown>): void {
    Object.assign(this.metadata, metadata)
    this.childLogger = logger.child({
      requestId: this.requestId,
      ...this.metadata,
    })
  }

  trace(msg: string, data?: Record<string, unknown>): void {
    this.childLogger.trace(data, msg)
  }

  debug(msg: string, data?: Record<string, unknown>): void {
    this.childLogger.debug(data, msg)
  }

  info(msg: string, data?: Record<string, unknown>): void {
    this.childLogger.info(data, msg)
  }

  warn(msg: string, data?: Record<string, unknown>): void {
    this.childLogger.warn(data, msg)
  }

  error(msg: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    if (error instanceof Error) {
      this.childLogger.error({ err: error, ...data }, msg)
    } else if (error) {
      this.childLogger.error({ error, ...data }, msg)
    } else {
      this.childLogger.error(data, msg)
    }
  }

  fatal(msg: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    if (error instanceof Error) {
      this.childLogger.fatal({ err: error, ...data }, msg)
    } else if (error) {
      this.childLogger.fatal({ error, ...data }, msg)
    } else {
      this.childLogger.fatal(data, msg)
    }
  }

  getRequestId(): string {
    return this.requestId
  }
}