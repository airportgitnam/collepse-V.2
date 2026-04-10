const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // Современные настройки
      autoIndex: process.env.NODE_ENV !== 'production', // Индексы только в dev
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4, // IPv4
    });

    logger.info(`✅ MongoDB подключена: ${conn.connection.host}`);
    logger.info(`📊 База данных: ${conn.connection.name}`);

    // Обработчики событий подключения
    mongoose.connection.on('error', (err) => {
      logger.error(`❌ Ошибка MongoDB: ${err}`);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('⚠️ MongoDB отключена');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('🔄 MongoDB переподключена');
    });

  } catch (error) {
    logger.error(`❌ Ошибка подключения к MongoDB: ${error.message}`);
    logger.error('Проверьте строку подключения и доступность Atlas');
    
    // Повторная попытка через 5 секунд
    logger.info('Повторная попытка через 5 секунд...');
    setTimeout(connectDB, 5000);
  }
};

module.exports = connectDB;