const { body, validationResult } = require('express-validator');

// Правила валидации для контактной формы
const validateContact = [
  body('name')
    .trim()
    .notEmpty().withMessage('Имя обязательно')
    .isLength({ min: 2, max: 50 }).withMessage('Имя должно быть от 2 до 50 символов')
    .matches(/^[a-zA-Zа-яА-ЯёЁ\s\-']+$/).withMessage('Имя содержит недопустимые символы')
    .escape(),
  
  body('email')
    .trim()
    .notEmpty().withMessage('Email обязателен')
    .isEmail().withMessage('Введите корректный email')
    .normalizeEmail()
    .isLength({ max: 100 }).withMessage('Email слишком длинный'),
  
  body('service')
    .optional()
    .trim()
    .isIn(['Web', 'GameDev', 'AI', 'PC', 'Other', '']).withMessage('Некорректная услуга')
    .escape(),
  
  body('message')
    .trim()
    .notEmpty().withMessage('Сообщение обязательно')
    .isLength({ min: 10, max: 2000 }).withMessage('Сообщение должно быть от 10 до 2000 символов')
    .escape(),
];

// Middleware для проверки результатов валидации
const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      message: 'Ошибка валидации',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }
  
  next();
};

// Валидация ID MongoDB
const validateMongoId = (paramName = 'id') => {
  return (req, res, next) => {
    const id = req.params[paramName];
    
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        status: 'error',
        message: 'Некорректный ID',
      });
    }
    
    next();
  };
};

module.exports = {
  validateContact,
  validate,
  validateMongoId,
};