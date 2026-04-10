const express = require('express');
const router = express.Router();
const Contact = require('../models/Contact');
const { validateContact, validate } = require('../middleware/validation');
const { sendContactEmail, sendAutoReply } = require('../utils/emailService');
const logger = require('../utils/logger');

// @route   POST /api/contact
// @desc    Отправка контактной формы
// @access  Public
router.post('/', validateContact, validate, async (req, res, next) => {
  try {
    const { name, email, service, message } = req.body;
    
    // Получаем IP и User-Agent
    const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';
    
    // Проверка на спам (опционально)
    const recentContacts = await Contact.countDocuments({
      $or: [
        { email: email.toLowerCase() },
        { ipAddress: ipAddress }
      ],
      createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Последний час
    });
    
    if (recentContacts >= 3) {
      logger.warn(`⚠️ Подозрительная активность от ${email} (${ipAddress})`);
      return res.status(429).json({
        status: 'error',
        message: 'Слишком много заявок. Попробуйте позже.',
      });
    }
    
    // Создаём запись в БД
    const contact = new Contact({
      name,
      email: email.toLowerCase(),
      service: service || '',
      message,
      ipAddress,
      userAgent,
    });
    
    // Сохраняем в БД
    await contact.save();
    logger.info(`📝 Новая заявка от ${name} (${email}) - ID: ${contact._id}`);
    
    // Отправляем email уведомление (асинхронно, не блокируем ответ)
    sendContactEmail(contact).catch(err => {
      logger.error(`❌ Ошибка отправки email уведомления: ${err.message}`);
    });
    
    // Отправляем автоответ клиенту (опционально)
    sendAutoReply(contact).catch(err => {
      logger.error(`❌ Ошибка отправки автоответа: ${err.message}`);
    });
    
    // Успешный ответ
    res.status(201).json({
      status: 'success',
      message: 'Спасибо! Ваша заявка принята. Мы свяжемся с вами в ближайшее время.',
      data: {
        id: contact._id,
        timestamp: contact.createdAt,
      },
    });
    
  } catch (error) {
    logger.error(`❌ Ошибка при обработке заявки: ${error.message}`);
    next(error);
  }
});

// @route   GET /api/contact/stats (для админки, с авторизацией)
// @desc    Получение статистики заявок
// @access  Private (нужна авторизация)
router.get('/stats', async (req, res, next) => {
  try {
    // В реальном проекте здесь должна быть проверка JWT токена
    // const token = req.headers.authorization?.split(' ')[1];
    // if (!token) return res.status(401).json({ message: 'Нет доступа' });
    
    const stats = await Contact.getStats();
    
    res.json({
      status: 'success',
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;