const logger = require('../utils/logger');

// Обработчик 404
const notFound = (req, res, next) => {
  const error = new Error(`Не найдено - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

// Глобальный обработчик ошибок
const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message;
  
  // Обработка ошибок Mongoose
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 404;
    message = 'Ресурс не найден';
  }
  
  if (err.code === 11000) {
    statusCode = 400;
    message = 'Дублирование данных';
  }
  
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map(val => val.message).join(', ');
  }
  
  // Логирование
  if (statusCode >= 500) {
    logger.error(`❌ [${statusCode}] ${message}`);
    logger.error(err.stack);
  } else {
    logger.warn(`⚠️ [${statusCode}] ${message}`);
  }
  
  // Ответ клиенту
  res.status(statusCode).json({
    status: 'error',
    message: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = {
  notFound,
  errorHandler,
};