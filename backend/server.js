/**
 * =====================================================
 * COLLEPSE BACKEND SERVER — ПОЛНАЯ ВЕРСИЯ С TELEGRAM БОТОМ
 * =====================================================
 * Описание: Сервер для обработки заявок с сайта Collepse
 * Автор: Collepse Team
 * Версия: 3.0.0
 * =====================================================
 */

// ============================================
// ИМПОРТ ЗАВИСИМОСТЕЙ
// ============================================
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Импорт модулей проекта
const bot = require('./bot');

// ============================================
// КОНФИГУРАЦИЯ ПРИЛОЖЕНИЯ
// ============================================
const app = express();
const PORT = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const FRONTEND_PATH = path.join(__dirname, '..');

// ============================================
// НАСТРОЙКА MIDDLEWARE БЕЗОПАСНОСТИ
// ============================================

// Helmet - защита HTTP заголовков
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://telegram.org"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.telegram.org"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// CORS - кросс-доменные запросы
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:4000',
    'http://127.0.0.1:4000',
    'null',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Дополнительные заголовки CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// Rate Limiting - защита от DDoS
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // максимум 100 запросов с одного IP
  message: {
    status: 'error',
    message: 'Слишком много запросов. Попробуйте позже.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 час
  max: 10, // максимум 10 заявок в час
  message: {
    status: 'error',
    message: 'Превышен лимит заявок. Попробуйте позже.',
  },
});

app.use('/api/', apiLimiter);
app.use('/api/contact', contactLimiter);

// Защита от NoSQL инъекций и XSS
app.use(mongoSanitize());
app.use(xss());

// Парсинг тела запроса
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ============================================
// ЛОГИРОВАНИЕ ЗАПРОСОВ
// ============================================
app.use((req, res, next) => {
  const timestamp = new Date().toLocaleTimeString('ru-RU');
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ============================================
// СТАТИЧЕСКИЕ ФАЙЛЫ
// ============================================
console.log(`📁 Папка с фронтендом: ${FRONTEND_PATH}`);

app.use(express.static(FRONTEND_PATH, {
  index: 'index.html',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// ============================================
// ПОДКЛЮЧЕНИЕ К MONGODB ATLAS
// ============================================
const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    
    if (!uri) {
      throw new Error('MONGODB_URI не найден в .env файле');
    }

    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      dbName: 'Collepse',
      autoIndex: NODE_ENV !== 'production',
    });

    console.log(`✅ MongoDB подключена: ${conn.connection.host}`);
    console.log(`📊 База данных: ${conn.connection.name}`);
    
    // Обработчики событий подключения
    mongoose.connection.on('error', (err) => {
      console.error(`❌ Ошибка MongoDB: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB отключена');
    });

    return true;
  } catch (error) {
    console.error(`❌ Ошибка подключения к MongoDB: ${error.message}`);
    console.log('⚠️ Сервер продолжит работу без базы данных');
    return false;
  }
};

// ============================================
// МОДЕЛЬ ДАННЫХ CONTACT
// ============================================
const contactSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Имя обязательно'],
    trim: true,
    minlength: [2, 'Имя должно быть не менее 2 символов'],
    maxlength: [50, 'Имя не может превышать 50 символов'],
  },
  email: {
    type: String,
    required: [true, 'Email обязателен'],
    trim: true,
    lowercase: true,
    match: [
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      'Некорректный формат email'
    ],
  },
  service: {
    type: String,
    enum: ['Web', 'GameDev', 'AI', 'PC', 'Other', ''],
    default: '',
  },
  message: {
    type: String,
    required: [true, 'Сообщение обязательно'],
    trim: true,
    minlength: [3, 'Сообщение должно быть не менее 3 символов'],
    maxlength: [2000, 'Сообщение не может превышать 2000 символов'],
  },
  status: {
    type: String,
    enum: ['new', 'processing', 'completed', 'archived'],
    default: 'new',
  },
  ipAddress: String,
  userAgent: String,
  telegramNotified: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Индексы для оптимизации запросов
contactSchema.index({ email: 1 });
contactSchema.index({ createdAt: -1 });
contactSchema.index({ status: 1 });

// Pre-save middleware
contactSchema.pre('save', function(next) {
  this.name = this.name.replace(/\s+/g, ' ').trim();
  this.email = this.email.toLowerCase().trim();
  this.message = this.message.replace(/\s+/g, ' ').trim();
  next();
});

const Contact = mongoose.model('Contact', contactSchema);

// ============================================
// ПЕРЕДАЁМ МОДЕЛЬ В TELEGRAM БОТА
// ============================================
if (typeof bot.setContactModel === 'function') {
  bot.setContactModel(Contact);
  console.log('✅ Модель Contact передана в Telegram бота');
} else {
  console.warn('⚠️ Функция setContactModel не найдена в боте');
}

// ============================================
// ВАЛИДАЦИЯ ДАННЫХ
// ============================================
const validateContact = (req, res, next) => {
  const { name, email, message } = req.body;
  const errors = [];

  if (!name) {
    errors.push('Имя обязательно');
  } else if (name.length < 2) {
    errors.push('Имя должно быть не менее 2 символов');
  } else if (name.length > 50) {
    errors.push('Имя не может превышать 50 символов');
  }

  if (!email) {
    errors.push('Email обязателен');
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      errors.push('Некорректный формат email');
    }
  }

  if (!message) {
    errors.push('Сообщение обязательно');
  } else if (message.length < 3) {
    errors.push('Сообщение должно быть не менее 3 символов');
  } else if (message.length > 2000) {
    errors.push('Сообщение не может превышать 2000 символов');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      status: 'error',
      message: 'Ошибка валидации',
      errors: errors,
    });
  }

  next();
};

// ============================================
// API РОУТЫ
// ============================================

/**
 * @route   GET /api/health
 * @desc    Проверка здоровья сервера
 * @access  Public
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    telegram: {
      active: true,
      subscribers: bot.getSubscriberCount ? bot.getSubscriberCount() : 0,
    },
  });
});

/**
 * @route   GET /api/contact
 * @desc    Информация о эндпоинте
 * @access  Public
 */
app.get('/api/contact', (req, res) => {
  res.json({
    status: 'ok',
    message: 'API для отправки заявок. Используйте метод POST.',
    required_fields: ['name', 'email', 'message'],
    optional_fields: ['service'],
  });
});

/**
 * @route   POST /api/contact
 * @desc    Отправка новой заявки
 * @access  Public
 */
app.post('/api/contact', validateContact, async (req, res) => {
  try {
    const { name, email, service, message } = req.body;
    
    console.log('\n' + '='.repeat(50));
    console.log('📨 НОВАЯ ЗАЯВКА');
    console.log('='.repeat(50));
    console.log(`👤 Имя: ${name}`);
    console.log(`📧 Email: ${email}`);
    console.log(`🎯 Услуга: ${service || 'Не указана'}`);
    console.log(`💬 Сообщение: ${message}`);
    
    const ipAddress = req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';
    
    let savedContact = null;
    
    // Сохранение в базу данных
    if (mongoose.connection.readyState === 1) {
      const contact = new Contact({
        name,
        email,
        service: service || '',
        message,
        ipAddress,
        userAgent,
      });
      
      savedContact = await contact.save();
      console.log(`✅ Заявка сохранена в MongoDB`);
      console.log(`🆔 ID: ${savedContact._id}`);
    } else {
      console.warn('⚠️ База данных недоступна, заявка не сохранена');
      savedContact = { 
        _id: 'N/A', 
        name, 
        email, 
        service, 
        message, 
        ipAddress,
        createdAt: new Date(),
      };
    }
    
    // Отправка уведомления в Telegram
    console.log('📱 Отправка уведомления в Telegram...');
    
    let telegramSent = false;
    if (typeof bot.sendNewContactNotification === 'function') {
      telegramSent = await bot.sendNewContactNotification(savedContact);
    }
    
    if (telegramSent && savedContact._id !== 'N/A') {
      savedContact.telegramNotified = true;
      await savedContact.save();
    }
    
    console.log('='.repeat(50) + '\n');
    
    res.status(201).json({
      status: 'success',
      message: 'Спасибо! Ваша заявка принята. Мы свяжемся с вами в ближайшее время.',
      data: {
        id: savedContact._id,
        timestamp: savedContact.createdAt || new Date().toISOString(),
        telegram_notified: telegramSent,
      },
    });
    
  } catch (error) {
    console.error('❌ Ошибка при обработке заявки:', error);
    res.status(500).json({
      status: 'error',
      message: 'Произошла ошибка при обработке заявки. Попробуйте позже.',
    });
  }
});

/**
 * @route   GET /api/contacts
 * @desc    Получение списка заявок
 * @access  Public (в production добавить авторизацию)
 */
app.get('/api/contacts', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    if (mongoose.connection.readyState !== 1) {
      return res.json({
        status: 'warning',
        message: 'База данных недоступна',
        contacts: [],
      });
    }
    
    const contacts = await Contact.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-__v');
    
    const total = await Contact.countDocuments();
    
    res.json({
      status: 'success',
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
      contacts,
    });
    
  } catch (error) {
    console.error('❌ Ошибка получения заявок:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при получении заявок',
    });
  }
});

/**
 * @route   GET /api/telegram/info
 * @desc    Информация о Telegram боте
 * @access  Public
 */
app.get('/api/telegram/info', async (req, res) => {
  try {
    let botInfo = null;
    if (typeof bot.getBotInfo === 'function') {
      botInfo = await bot.getBotInfo();
    }
    
    res.json({
      status: 'ok',
      bot: botInfo,
      subscribers_count: bot.getSubscriberCount ? bot.getSubscriberCount() : 0,
      subscribers: bot.getSubscribers ? bot.getSubscribers() : [],
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Ошибка получения информации о боте',
    });
  }
});

/**
 * @route   POST /api/telegram/test
 * @desc    Отправка тестового сообщения подписчикам
 * @access  Public
 */
app.post('/api/telegram/test', async (req, res) => {
  const { message } = req.body;
  
  if (!message) {
    return res.status(400).json({
      status: 'error',
      message: 'Укажите текст сообщения',
    });
  }
  
  try {
    if (typeof bot.broadcastMessage === 'function') {
      await bot.broadcastMessage(
        `<b>🧪 ТЕСТОВОЕ УВЕДОМЛЕНИЕ</b>\n\n${message}\n\n<i>Отправлено: ${new Date().toLocaleString('ru-RU')}</i>`
      );
    }
    
    res.json({
      status: 'ok',
      message: 'Тестовое сообщение отправлено',
      subscribers_notified: bot.getSubscriberCount ? bot.getSubscriberCount() : 0,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Ошибка отправки сообщения',
    });
  }
});

// ============================================
// ОБРАБОТКА ОШИБОК
// ============================================

app.use('/api/*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: `API маршрут ${req.method} ${req.path} не найден`,
  });
});

app.use((req, res) => {
  if (!req.path.startsWith('/api/')) {
    const indexPath = path.join(FRONTEND_PATH, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send('index.html не найден');
    }
  } else {
    res.status(404).json({
      status: 'error',
      message: 'Маршрут не найден',
    });
  }
});

app.use((err, req, res, next) => {
  console.error('❌ Необработанная ошибка:', err);
  
  res.status(500).json({
    status: 'error',
    message: NODE_ENV === 'production' 
      ? 'Внутренняя ошибка сервера' 
      : err.message,
  });
});

// ============================================
// ЗАПУСК СЕРВЕРА
// ============================================
const startServer = async () => {
  try {
    await connectDB();
    
    app.listen(PORT, () => {
      console.log('\n' + '='.repeat(50));
      console.log('🚀 СЕРВЕР COLLEPSE ЗАПУЩЕН');
      console.log('='.repeat(50));
      console.log(`📍 Локальный адрес: http://localhost:${PORT}`);
      console.log(`🌐 Сайт: http://localhost:${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
      console.log(`📝 API заявок: http://localhost:${PORT}/api/contact`);
      console.log(`📁 Фронтенд: ${FRONTEND_PATH}`);
      console.log(`🔧 Режим: ${NODE_ENV}`);
      console.log('='.repeat(50));
      
      const indexPath = path.join(FRONTEND_PATH, 'index.html');
      if (fs.existsSync(indexPath)) {
        console.log('✅ index.html найден');
      } else {
        console.warn('⚠️ index.html не найден в:', FRONTEND_PATH);
      }
      
      initializeTelegramBot();
    });
    
  } catch (error) {
    console.error('❌ Ошибка запуска сервера:', error);
    process.exit(1);
  }
};

// ============================================
// ИНИЦИАЛИЗАЦИЯ TELEGRAM БОТА
// ============================================
const initializeTelegramBot = async () => {
  console.log('\n🤖 Инициализация Telegram бота...');
  
  try {
    if (typeof bot.clearPendingUpdates === 'function') {
      await bot.clearPendingUpdates();
    }
    
    let botInfo = null;
    if (typeof bot.getBotInfo === 'function') {
      botInfo = await bot.getBotInfo();
    }
    
    if (botInfo) {
      console.log(`✅ Бот @${botInfo.username} подключен`);
      console.log(`📝 Имя: ${botInfo.first_name}`);
      console.log(`👥 Подписчиков: ${bot.getSubscriberCount ? bot.getSubscriberCount() : 0}`);
      console.log(`💡 Отправьте @${botInfo.username} команду /start`);
      
      if (typeof bot.startPolling === 'function') {
        bot.startPolling();
      }
      
      if (typeof bot.broadcastMessage === 'function') {
        await bot.broadcastMessage(
          `🟢 <b>Сервер Collepse запущен!</b>\n\n` +
          `📅 ${new Date().toLocaleString('ru-RU')}\n` +
          `🌐 http://localhost:${PORT}`
        );
      }
    } else {
      console.error('❌ Не удалось подключиться к боту');
    }
  } catch (error) {
    console.error('❌ Ошибка инициализации бота:', error.message);
  }
  
  console.log('\n✨ Сервер готов!\n');
};

// ============================================
// КОРРЕКТНОЕ ЗАВЕРШЕНИЕ РАБОТЫ
// ============================================
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} получен. Завершение работы...`);
  
  if (typeof bot.stopPolling === 'function') {
    bot.stopPolling();
  }
  
  if (typeof bot.broadcastMessage === 'function') {
    await bot.broadcastMessage(
      `🔴 <b>Сервер Collepse остановлен</b>\n\n` +
      `📅 ${new Date().toLocaleString('ru-RU')}\n` +
      `⏱️ Время работы: ${Math.floor(process.uptime() / 60)} мин.`
    ).catch(() => {});
  }
  
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
    console.log('✅ Соединение с MongoDB закрыто');
  }
  
  console.log('👋 Сервер остановлен');
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (err) => {
  console.error('❌ НЕОБРАБОТАННЫЙ REJECTION:', err);
});

process.on('uncaughtException', (err) => {
  console.error('❌ НЕОБРАБОТАННОЕ ИСКЛЮЧЕНИЕ:', err);
  process.exit(1);
});

// ============================================
// ЗАПУСК
// ============================================
startServer();

module.exports = app;