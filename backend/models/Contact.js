const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const contactSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Имя обязательно'],
    trim: true,
    minlength: [2, 'Имя должно быть не менее 2 символов'],
    maxlength: [50, 'Имя не может превышать 50 символов'],
    match: [/^[a-zA-Zа-яА-ЯёЁ\s\-']+$/, 'Имя содержит недопустимые символы'],
  },
  email: {
    type: String,
    required: [true, 'Email обязателен'],
    trim: true,
    lowercase: true,
    match: [
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      'Пожалуйста, введите корректный email',
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
    minlength: [10, 'Сообщение должно быть не менее 10 символов'],
    maxlength: [2000, 'Сообщение не может превышать 2000 символов'],
  },
  telegram: {
    type: String,
    required: [true, 'Telegram обязателен'],
    trim: true,
    match: [/^@[a-zA-Z0-9_]{5,32}$|^[a-zA-Z0-9_]{5,32}$/, 'Пожалуйста, введите корректный Telegram username'],
  },
  phone: {
    type: String,
    required: [true, 'Номер телефона обязателен'],
    trim: true,
    match: [/^\+?[\d\s\-().]{10,20}$/, 'Пожалуйста, введите корректный номер телефона'],
  },
  status: {
    type: String,
    enum: ['new', 'processing', 'completed', 'archived'],
    default: 'new',
  },
  ipAddress: {
    type: String,
    default: '',
  },
  userAgent: {
    type: String,
    default: '',
  },
  notes: {
    type: String,
    default: '',
    maxlength: [500, 'Заметки не могут превышать 500 символов'],
  },
  emailSent: {
    type: Boolean,
    default: false,
  },
  emailSentAt: {
    type: Date,
  },
}, {
  timestamps: true, // Добавляет createdAt и updatedAt
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Индексы для быстрого поиска
contactSchema.index({ email: 1 });
contactSchema.index({ status: 1 });
contactSchema.index({ createdAt: -1 });
contactSchema.index({ emailSent: 1 });

// Виртуальное поле - отформатированная дата
contactSchema.virtual('formattedDate').get(function() {
  return this.createdAt.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
});

// Виртуальное поле - инициалы
contactSchema.virtual('initials').get(function() {
  return this.name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
});

// Pre-save middleware
contactSchema.pre('save', function(next) {
  // Очистка данных
  this.name = this.name.replace(/\s+/g, ' ').trim();
  this.email = this.email.toLowerCase().trim();
  this.message = this.message.replace(/\s+/g, ' ').trim();
  
  // Если статус изменился на completed
  if (this.isModified('status') && this.status === 'completed') {
    this.notes = this.notes || 'Обработано';
  }
  
  next();
});

// Post-save middleware
contactSchema.post('save', function(doc) {
  // Можно добавить дополнительную логику после сохранения
  // Например, отправка уведомления в Slack/Telegram
});

// Методы экземпляра
contactSchema.methods.markAsProcessing = async function() {
  this.status = 'processing';
  return this.save();
};

contactSchema.methods.markAsCompleted = async function(notes = '') {
  this.status = 'completed';
  this.notes = notes;
  return this.save();
};

contactSchema.methods.markEmailSent = async function() {
  this.emailSent = true;
  this.emailSentAt = new Date();
  return this.save();
};

// Статические методы
contactSchema.statics.findByEmail = function(email) {
  return this.find({ email: email.toLowerCase() }).sort({ createdAt: -1 });
};

contactSchema.statics.getStats = async function() {
  const total = await this.countDocuments();
  const byStatus = await this.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);
  const byService = await this.aggregate([
    { $match: { service: { $ne: '' } } },
    { $group: { _id: '$service', count: { $sum: 1 } } }
  ]);
  const lastWeek = await this.countDocuments({
    createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
  });
  
  return { total, byStatus, byService, lastWeek };
};

const Contact = mongoose.model('Contact', contactSchema);

module.exports = Contact;