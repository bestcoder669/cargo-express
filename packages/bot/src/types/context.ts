// packages/bot/src/types/context.ts - Расширенный контекст
import type { 
  Context as BaseContext, 
  SessionFlavor,
  LazySessionFlavor 
} from 'grammy'
import type { 
  ConversationFlavor,
  Conversation 
} from '@grammyjs/conversations'
import type { HydrateFlavor } from '@grammyjs/hydrate'
import type { I18nFlavor } from '@grammyjs/i18n'
import type { ParseModeFlavor } from '@grammyjs/parse-mode'
import type { FileFlavor } from '@grammyjs/files'
import type { User, Admin } from '@prisma/client'

export interface SessionData {
  // User session
  userId?: string
  user?: User
  isAdmin?: boolean
  admin?: Admin
  
  // Registration flow
  registration?: {
    step: 'name' | 'phone' | 'email' | 'city' | 'address'
    data: {
      firstName?: string
      lastName?: string
      phone?: string
      email?: string
      cityId?: string
      address?: string
    }
  }
  
  // Order creation flow
  orderCreation?: {
    type: 'shipping' | 'purchase'
    step: string
    data: Record<string, unknown>
  }
  
  // Temporary data
  messageToDelete?: number[]
  lastActivity?: Date
  scene?: string
}

export type BotContext = 
  & BaseContext
  & SessionFlavor<SessionData>
  & LazySessionFlavor<SessionData>
  & ConversationFlavor
  & HydrateFlavor
  & I18nFlavor
  & ParseModeFlavor<BaseContext>
  & FileFlavor<BaseContext>
  & {
    // Custom properties
    user: User | null
    admin: Admin | null
    isAdmin: boolean
    
    // Helper methods
    replyWithMarkdown: (text: string, other?: Record<string, unknown>) => Promise<unknown>
    replyWithHTML: (text: string, other?: Record<string, unknown>) => Promise<unknown>
    deleteMessageSafe: (messageId: number) => Promise<boolean>
    cleanupMessages: () => Promise<void>
  }

export type BotConversation = Conversation<BotContext>
