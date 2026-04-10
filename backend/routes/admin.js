const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Contact = require('../models/Contact');
const logger = require('../utils/logger');

// Middleware для проверки JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'Требуется авторизация' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Недействительный токен' });
    }
    req.user = user;
    next();
  });
};

// Получить все заявки с пагинацией
router.get('/contacts', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status;
    
    const query = {};
    if (status) query.status = status;
    
    const contacts = await Contact.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .select('-__v');
    
    const total = await Contact.countDocuments(query);
    
    res.json({
      status: 'success',
      data: contacts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error(`Ошибка получения контактов: ${error.message}`);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Обновить статус заявки
router.patch('/contacts/:id', authenticateToken, async (req, res) => {
  try {
    const { status, notes } = req.body;
    
    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({ message: 'Заявка не найдена' });
    }
    
    if (status) contact.status = status;
    if (notes) contact.notes = notes;
    
    await contact.save();
    
    logger.info(`Заявка ${contact._id} обновлена: статус=${status}`);
    
    res.json({
      status: 'success',
      data: contact,
    });
  } catch (error) {
    logger.error(`Ошибка обновления контакта: ${error.message}`);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Удалить заявку
router.delete('/contacts/:id', authenticateToken, async (req, res) => {
  try {
    const contact = await Contact.findByIdAndDelete(req.params.id);
    
    if (!contact) {
      return res.status(404).json({ message: 'Заявка не найдена' });
    }
    
    logger.info(`Заявка ${contact._id} удалена`);
    
    res.json({
      status: 'success',
      message: 'Заявка удалена',
    });
  } catch (error) {
    logger.error(`Ошибка удаления контакта: ${error.message}`);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Экспорт данных в CSV
router.get('/contacts/export', authenticateToken, async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 }).lean();
    
    // Создание CSV
    const fields = ['name', 'email', 'service', 'message', 'status', 'createdAt'];
    const csv = [
      fields.join(','),
      ...contacts.map(c => fields.map(f => `"${(c[f] || '').toString().replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=contacts.csv');
    res.send(csv);
    
  } catch (error) {
    logger.error(`Ошибка экспорта: ${error.message}`);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;