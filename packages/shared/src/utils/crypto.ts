import { createHash, randomBytes } from 'crypto'

export function generateToken(length = 32): string {
  return randomBytes(length).toString('hex')
}

export function hashString(str: string): string {
  return createHash('sha256').update(str).digest('hex')
}

export function generateId(): string {
  return randomBytes(16).toString('hex')
}