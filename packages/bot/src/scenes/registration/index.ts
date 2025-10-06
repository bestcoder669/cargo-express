// packages/bot/src/scenes/registration/index.ts - Сцена регистрации
import { Composer } from 'grammy'
import { conversations, createConversation } from '@grammyjs/conversations'
import type { BotContext, BotConversation } from '../../types/context'
import { prisma } from '../../services/database'
import { createUser } from '../../services/user'
import { getCitiesKeyboard } from '../../keyboards/dynamic'
import { logger } from '../../utils/logger'
import { validateEmail, validatePhone } from './validators'
import { escapeHtml } from '../../utils/formatter'

export const registrationScene = new Composer<BotContext>()

// Начало регистрации
registrationScene.callbackQuery('registration:start', async (ctx) => {
  await ctx.answerCallbackQuery()
  
  // Проверка, что пользователь еще не зарегистрирован
  if (ctx.user) {
    await ctx.reply('✅ Вы уже зарегистрированы!')
    return
  }
  
  await ctx.conversation.enter('registration')
})

// Экспортируем conversation для регистрации в боте
export const registrationConversation = createConversation(
  async function registration(
    conversation: BotConversation,
    ctx: BotContext
  ): Promise<void> {
    try {
      // Проверка, что пользователь еще не зарегистрирован
      if (ctx.user) {
        await ctx.reply('✅ Вы уже зарегистрированы!')
        return
      }

      const registrationData: {
        firstName?: string
        lastName?: string
        phone?: string
        email?: string
        cityId?: string
        address?: string
      } = {}

      // ШАГ 1: Имя и фамилия
      await ctx.replyWithHTML(
        '👤 <b>Регистрация (1/5)</b>\n\n' +
        'Представьтесь, пожалуйста.\n' +
        'Введите ваше полное имя:\n\n' +
        '<i>Пример: Иван Петров</i>'
      )

      const nameCtx = await conversation.wait()
      if (!nameCtx.message?.text) {
        await ctx.reply('❌ Регистрация отменена')
        return
      }

      const nameParts = nameCtx.message.text.trim().split(' ')
      if (nameParts.length < 1) {
        await ctx.reply('❌ Пожалуйста, введите имя')
        return
      }

      registrationData.firstName = nameParts[0]
      registrationData.lastName = nameParts.slice(1).join(' ') || undefined

      // Удаляем сообщение пользователя для конфиденциальности
      await ctx.api.deleteMessage(ctx.chat!.id, nameCtx.message.message_id).catch(() => {})

      // ШАГ 2: Номер телефона
      await ctx.replyWithHTML(
        '📱 <b>Регистрация (2/5)</b>\n\n' +
        'Ваш номер телефона:\n' +
        'Нужен для SMS уведомлений и связи курьера',
        {
          reply_markup: {
            keyboard: [
              [{ text: '📱 Поделиться номером', request_contact: true }]
            ],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        }
      )

      const phoneCtx = await conversation.wait()
      
      if (phoneCtx.message?.contact) {
        registrationData.phone = phoneCtx.message.contact.phone_number
      } else if (phoneCtx.message?.text) {
        const phone = phoneCtx.message.text.trim()
        if (!validatePhone(phone)) {
          await ctx.reply('❌ Неверный формат номера телефона. Попробуйте еще раз.')
          return
        }
        registrationData.phone = phone
      } else {
        await ctx.reply('❌ Регистрация отменена')
        return
      }

      // Убираем клавиатуру
      await ctx.reply('✅ Номер получен', {
        reply_markup: { remove_keyboard: true }
      })

      // ШАГ 3: Email
      await ctx.replyWithHTML(
        '📧 <b>Регистрация (3/5)</b>\n\n' +
        'Email для документов и уведомлений:\n\n' +
        'Введите ваш email адрес:'
      )

      const emailCtx = await conversation.wait()
      if (!emailCtx.message?.text) {
        await ctx.reply('❌ Регистрация отменена')
        return
      }

      const email = emailCtx.message.text.trim().toLowerCase()
      if (!validateEmail(email)) {
        await ctx.reply('❌ Неверный формат email. Попробуйте еще раз.')
        return
      }
      registrationData.email = email

      // ШАГ 4: Город
      await ctx.replyWithHTML(
        '🏠 <b>Регистрация (4/5)</b>\n\n' +
        'Город доставки:',
        {
          reply_markup: await getCitiesKeyboard()
        }
      )

      const cityCtx = await conversation.waitForCallbackQuery(/^city:/)
      await cityCtx.answerCallbackQuery()
      
      const cityId = cityCtx.callbackQuery.data.replace('city:', '')
      
      // Если выбран поиск города
      if (cityId === 'search') {
        await cityCtx.editMessageText(
          '🔍 Введите название города для поиска:'
        )
        
        const searchCtx = await conversation.wait()
        if (!searchCtx.message?.text) {
          await ctx.reply('❌ Регистрация отменена')
          return
        }
        
        const searchKeyboard = await getCitiesKeyboard(searchCtx.message.text)
        await ctx.replyWithHTML(
          '🏠 Выберите город из списка:',
          { reply_markup: searchKeyboard }
        )
        
        const citySearchCtx = await conversation.waitForCallbackQuery(/^city:/)
        await citySearchCtx.answerCallbackQuery()
        registrationData.cityId = citySearchCtx.callbackQuery.data.replace('city:', '')
      } else {
        registrationData.cityId = cityId
      }

      // Получаем информацию о городе
      const city = await prisma.city.findUnique({
        where: { id: registrationData.cityId }
      })

      if (!city) {
        await ctx.reply('❌ Город не найден')
        return
      }

      // ШАГ 5: Адрес
      await ctx.replyWithHTML(
        `📍 <b>Регистрация (5/5)</b>\n\n` +
        `Полный адрес доставки в г. ${escapeHtml(city.name)}:\n\n` +
        'Введите: улица, дом, квартира/офис\n' +
        '<i>Пример: ул. Тверская, д. 15, кв. 45</i>'
      )

      const addressCtx = await conversation.wait()
      if (!addressCtx.message?.text) {
        await ctx.reply('❌ Регистрация отменена')
        return
      }
      
      registrationData.address = addressCtx.message.text.trim()

      // Создаем пользователя
      const user = await createUser({
        telegramId: ctx.from!.id,
        username: ctx.from!.username,
        firstName: registrationData.firstName!,
        lastName: registrationData.lastName,
        phone: registrationData.phone!,
        email: registrationData.email!,
        referrerId: ctx.session.referrerId
      })

      // Создаем первый адрес
      await prisma.address.create({
        data: {
          userId: user.id,
          alias: 'Основной',
          cityId: registrationData.cityId!,
          address: registrationData.address!,
          isDefault: true
        }
      })

      // Обновляем контекст
      ctx.user = user
      ctx.session.userId = user.id
      ctx.session.user = user

      // Отправляем успешное сообщение
      await ctx.replyWithHTML(
        '✅ <b>Регистрация завершена!</b>\n\n' +
        `👤 ${escapeHtml(user.firstName)} ${user.lastName ? escapeHtml(user.lastName) : ''}\n` +
        `📱 ${registrationData.phone}\n` +
        `📧 ${registrationData.email}\n` +
        `🏠 ${escapeHtml(city.name)}, ${escapeHtml(registrationData.address!)}\n\n` +
        `🆔 Ваш персональный ID: <code>#${user.customId}</code>\n` +
        '📋 Указывайте этот ID при отправке посылок!',
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📋 Скопировать ID', callback_data: `copy:${user.customId}` }
              ],
              [
                { text: '🏢 Адреса складов', callback_data: 'warehouses:list' },
                { text: '🚀 Начать работу', callback_data: 'menu:main' }
              ]
            ]
          }
        }
      )

      // Логируем событие
      logger.info('User registered', {
        userId: user.id,
        customId: user.customId,
        telegramId: user.telegramId.toString()
      })

    } catch (error) {
      logger.error('Registration failed:', error)
      await ctx.reply(
        '❌ Произошла ошибка при регистрации.\n' +
        'Попробуйте еще раз или обратитесь в поддержку.'
      )
    }
  },
  'registration'
)

// Обработчик копирования ID
registrationScene.callbackQuery(/^copy:/, async (ctx) => {
  const customId = ctx.callbackQuery.data.replace('copy:', '')
  await ctx.answerCallbackQuery({
    text: `ID #${customId} скопирован!`,
    show_alert: true
  })
})

// Обработчик отмены
registrationScene.callbackQuery('registration:cancel', async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.editMessageText('❌ Регистрация отменена')
})