// packages/bot/src/scenes/registration/validators.ts - Валидаторы для регистрации
export function validatePhone(phone: string): boolean {
  // Убираем все нецифровые символы кроме +
  const cleaned = phone.replace(/[^\d+]/g, '')
  
  // Проверка для российских номеров
  if (cleaned.startsWith('+7') || cleaned.startsWith('7') || cleaned.startsWith('8')) {
    const digits = cleaned.replace(/^\+?[78]/, '')
    return digits.length === 10 && /^\d+$/.test(digits)
  }
  
  // Международные номера
  if (cleaned.startsWith('+')) {
    return cleaned.length >= 11 && cleaned.length <= 15 && /^\+\d+$/.test(cleaned)
  }
  
  // Номер без кода страны (предполагаем российский)
  if (cleaned.length === 10 && /^\d+$/.test(cleaned)) {
    return true
  }
  
  return false
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  return emailRegex.test(email) && email.length <= 100
}

export function validateName(name: string): boolean {
  // Минимум 2 символа, только буквы, пробелы и дефисы
  const nameRegex = /^[а-яА-ЯёЁa-zA-Z\s-]{2,50}$/
  return nameRegex.test(name.trim())
}

export function validateAddress(address: string): boolean {
  // Минимум 10 символов, не более 200
  return address.trim().length >= 10 && address.trim().length <= 200
}