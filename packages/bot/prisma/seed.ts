// packages/bot/prisma/seed.ts - Начальные данные для БД
import { PrismaClient } from '@prisma/client'
import { config } from 'dotenv'

config()

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Создаем страны
  const countries = await Promise.all([
    prisma.country.upsert({
      where: { code: 'RU' },
      update: {},
      create: {
        id: 'RU',
        code: 'RU',
        name: 'Россия',
        nameEn: 'Russia',
        flagEmoji: '🇷🇺',
        currency: 'RUB',
        shippingAvailable: false,
        purchaseAvailable: false,
        popularityScore: 0,
        isActive: true
      }
    }),
    prisma.country.upsert({
      where: { code: 'US' },
      update: {},
      create: {
        id: 'US',
        code: 'US',
        name: 'США',
        nameEn: 'United States',
        flagEmoji: '🇺🇸',
        currency: 'USD',
        shippingAvailable: true,
        purchaseAvailable: true,
        purchaseCommission: 5,
        popularityScore: 100,
        isActive: true
      }
    }),
    prisma.country.upsert({
      where: { code: 'CN' },
      update: {},
      create: {
        id: 'CN',
        code: 'CN',
        name: 'Китай',
        nameEn: 'China',
        flagEmoji: '🇨🇳',
        currency: 'CNY',
        shippingAvailable: true,
        purchaseAvailable: true,
        purchaseCommission: 3,
        popularityScore: 95,
        isActive: true
      }
    }),
    prisma.country.upsert({
      where: { code: 'DE' },
      update: {},
      create: {
        id: 'DE',
        code: 'DE',
        name: 'Германия',
        nameEn: 'Germany',
        flagEmoji: '🇩🇪',
        currency: 'EUR',
        shippingAvailable: true,
        purchaseAvailable: true,
        purchaseCommission: 5,
        popularityScore: 85,
        isActive: true
      }
    }),
    prisma.country.upsert({
      where: { code: 'GB' },
      update: {},
      create: {
        id: 'GB',
        code: 'GB',
        name: 'Великобритания',
        nameEn: 'United Kingdom',
        flagEmoji: '🇬🇧',
        currency: 'GBP',
        shippingAvailable: true,
        purchaseAvailable: true,
        purchaseCommission: 7,
        popularityScore: 80,
        isActive: true
      }
    }),
    prisma.country.upsert({
      where: { code: 'TR' },
      update: {},
      create: {
        id: 'TR',
        code: 'TR',
        name: 'Турция',
        nameEn: 'Turkey',
        flagEmoji: '🇹🇷',
        currency: 'TRY',
        shippingAvailable: true,
        purchaseAvailable: true,
        purchaseCommission: 4,
        popularityScore: 75,
        isActive: true
      }
    }),
    prisma.country.upsert({
      where: { code: 'KR' },
      update: {},
      create: {
        id: 'KR',
        code: 'KR',
        name: 'Южная Корея',
        nameEn: 'South Korea',
        flagEmoji: '🇰🇷',
        currency: 'KRW',
        shippingAvailable: true,
        purchaseAvailable: true,
        purchaseCommission: 6,
        popularityScore: 70,
        isActive: true
      }
    }),
    prisma.country.upsert({
      where: { code: 'JP' },
      update: {},
      create: {
        id: 'JP',
        code: 'JP',
        name: 'Япония',
        nameEn: 'Japan',
        flagEmoji: '🇯🇵',
        currency: 'JPY',
        shippingAvailable: true,
        purchaseAvailable: true,
        purchaseCommission: 6,
        popularityScore: 65,
        isActive: true
      }
    }),
    prisma.country.upsert({
      where: { code: 'FR' },
      update: {},
      create: {
        id: 'FR',
        code: 'FR',
        name: 'Франция',
        nameEn: 'France',
        flagEmoji: '🇫🇷',
        currency: 'EUR',
        shippingAvailable: true,
        purchaseAvailable: true,
        purchaseCommission: 7,
        popularityScore: 60,
        isActive: true
      }
    })
  ])

  console.log(`✅ Created ${countries.length} countries`)

  // Создаем склады
  const warehouses = await Promise.all([
    prisma.warehouse.create({
      data: {
        countryId: 'US',
        name: 'Miami Warehouse',
        address: '1234 Ocean Drive, Miami, FL 33139',
        phone: '+1-305-123-4567',
        email: 'miami@cargoexpress.com',
        workingHours: 'Mon-Fri: 09:00-18:00 EST, Sat: 09:00-15:00 EST',
        timezone: 'America/New_York',
        maxWeightKg: 50,
        maxDeclaredValue: 2000,
        restrictions: JSON.stringify(['Литиевые батареи', 'Жидкости', 'Оружие']),
        isActive: true
      }
    }),
    prisma.warehouse.create({
      data: {
        countryId: 'CN',
        name: 'Shanghai Warehouse',
        address: '888 Nanjing Road, Shanghai 200001',
        phone: '+86-21-1234-5678',
        email: 'shanghai@cargoexpress.com',
        workingHours: 'Mon-Sat: 09:00-18:00 CST',
        timezone: 'Asia/Shanghai',
        maxWeightKg: 50,
        maxDeclaredValue: 2000,
        restrictions: JSON.stringify(['Батареи', 'Жидкости']),
        isActive: true
      }
    }),
    prisma.warehouse.create({
      data: {
        countryId: 'DE',
        name: 'Berlin Warehouse',
        address: 'Alexanderplatz 10, 10178 Berlin',
        phone: '+49-30-1234-5678',
        email: 'berlin@cargoexpress.com',
        workingHours: 'Mon-Fri: 09:00-18:00 CET',
        timezone: 'Europe/Berlin',
        maxWeightKg: 50,
        maxDeclaredValue: 2000,
        restrictions: JSON.stringify(['Батареи', 'Жидкости', 'Табак']),
        isActive: true
      }
    })
  ])

  console.log(`✅ Created ${warehouses.length} warehouses`)

  // Создаем тарифы доставки
  const tariffs = await Promise.all([
    prisma.shippingTariff.create({
      data: {
        fromCountryId: 'US',
        toCountryId: 'RU',
        pricePerKg: 650,
        minPrice: 1500,
        deliveryDaysMin: 10,
        deliveryDaysMax: 18,
        isActive: true
      }
    }),
    prisma.shippingTariff.create({
      data: {
        fromCountryId: 'CN',
        toCountryId: 'RU',
        pricePerKg: 450,
        minPrice: 1000,
        deliveryDaysMin: 12,
        deliveryDaysMax: 20,
        isActive: true
      }
    }),
    prisma.shippingTariff.create({
      data: {
        fromCountryId: 'DE',
        toCountryId: 'RU',
        pricePerKg: 750,
        minPrice: 1500,
        deliveryDaysMin: 8,
        deliveryDaysMax: 15,
        isActive: true
      }
    }),
    prisma.shippingTariff.create({
      data: {
        fromCountryId: 'GB',
        toCountryId: 'RU',
        pricePerKg: 800,
        minPrice: 1500,
        deliveryDaysMin: 10,
        deliveryDaysMax: 18,
        isActive: true
      }
    }),
    prisma.shippingTariff.create({
      data: {
        fromCountryId: 'TR',
        toCountryId: 'RU',
        pricePerKg: 550,
        minPrice: 1200,
        deliveryDaysMin: 7,
        deliveryDaysMax: 14,
        isActive: true
      }
    }),
    prisma.shippingTariff.create({
      data: {
        fromCountryId: 'KR',
        toCountryId: 'RU',
        pricePerKg: 700,
        minPrice: 1500,
        deliveryDaysMin: 10,
        deliveryDaysMax: 18,
        isActive: true
      }
    }),
    prisma.shippingTariff.create({
      data: {
        fromCountryId: 'JP',
        toCountryId: 'RU',
        pricePerKg: 750,
        minPrice: 1500,
        deliveryDaysMin: 10,
        deliveryDaysMax: 18,
        isActive: true
      }
    }),
    prisma.shippingTariff.create({
      data: {
        fromCountryId: 'FR',
        toCountryId: 'RU',
        pricePerKg: 850,
        minPrice: 1700,
        deliveryDaysMin: 9,
        deliveryDaysMax: 16,
        isActive: true
      }
    })
  ])

  console.log(`✅ Created ${tariffs.length} shipping tariffs`)

  // Создаем популярные города России
  const cities = await Promise.all([
    prisma.city.create({ data: { name: 'Москва', region: 'Москва', isPopular: true, population: 12655000 }}),
    prisma.city.create({ data: { name: 'Санкт-Петербург', region: 'Санкт-Петербург', isPopular: true, population: 5384000 }}),
    prisma.city.create({ data: { name: 'Новосибирск', region: 'Новосибирская область', isPopular: true, population: 1625000 }}),
    prisma.city.create({ data: { name: 'Екатеринбург', region: 'Свердловская область', isPopular: true, population: 1493000 }}),
    prisma.city.create({ data: { name: 'Казань', region: 'Республика Татарстан', isPopular: true, population: 1257000 }}),
    prisma.city.create({ data: { name: 'Нижний Новгород', region: 'Нижегородская область', isPopular: true, population: 1244000 }}),
    prisma.city.create({ data: { name: 'Челябинск', region: 'Челябинская область', isPopular: true, population: 1187000 }}),
    prisma.city.create({ data: { name: 'Самара', region: 'Самарская область', isPopular: true, population: 1144000 }}),
    prisma.city.create({ data: { name: 'Омск', region: 'Омская область', isPopular: true, population: 1139000 }}),
    prisma.city.create({ data: { name: 'Ростов-на-Дону', region: 'Ростовская область', isPopular: true, population: 1137000 }}),
    prisma.city.create({ data: { name: 'Уфа', region: 'Республика Башкортостан', isPopular: true, population: 1125000 }}),
    prisma.city.create({ data: { name: 'Красноярск', region: 'Красноярский край', isPopular: true, population: 1095000 }})
  ])

  console.log(`✅ Created ${cities.length} popular cities`)

  // Создаем категории товаров
  const categories = await Promise.all([
    prisma.productCategory.create({ data: { name: 'Электроника', icon: '📱', sortOrder: 1 }}),
    prisma.productCategory.create({ data: { name: 'Одежда', icon: '👕', sortOrder: 2 }}),
    prisma.productCategory.create({ data: { name: 'Обувь', icon: '👟', sortOrder: 3 }}),
    prisma.productCategory.create({ data: { name: 'Косметика', icon: '💄', sortOrder: 4 }}),
    prisma.productCategory.create({ data: { name: 'БАДы/Витамины', icon: '💊', sortOrder: 5 }}),
    prisma.productCategory.create({ data: { name: 'Игры', icon: '🎮', sortOrder: 6 }}),
    prisma.productCategory.create({ data: { name: 'Для дома', icon: '🏠', sortOrder: 7 }}),
    prisma.productCategory.create({ data: { name: 'Книги', icon: '📚', sortOrder: 8 }})
  ])

  console.log(`✅ Created ${categories.length} product categories`)

  // Создаем администратора по умолчанию (если указан в .env)
  const adminTelegramId = process.env.BOT_ADMIN_IDS?.split(',')[0]
  if (adminTelegramId) {
    const admin = await prisma.admin.upsert({
      where: { telegramId: BigInt(adminTelegramId) },
      update: {},
      create: {
        telegramId: BigInt(adminTelegramId),
        firstName: 'Admin',
        role: 'SUPER_ADMIN',
        isActive: true
      }
    })
    console.log(`✅ Created default admin with Telegram ID: ${adminTelegramId}`)
  }

  console.log('✅ Database seeded successfully!')
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })