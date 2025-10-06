export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^\+?[1-9]\d{9,14}$/
  return phoneRegex.test(phone.replace(/[\s-()]/g, ''))
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

export function sanitizeString(str: string): string {
  return str.trim().replace(/[<>]/g, '')
}