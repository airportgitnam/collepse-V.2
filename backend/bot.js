/**
 * =====================================================
 * TELEGRAM BOT MODULE — ПОЛНАЯ ВЕРСИЯ
 * =====================================================
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Конфигурация бота
const BOT_TOKEN = process.env.BOT_TOKEN || '8626286366:AAHAuKqDcvVFORmi5BaJJtq2R3Q0nnvzV54';
const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;
const SUBSCRIBERS_FILE = path.join(__dirname, 'subscribers.json');
const LAST_UPDATE_FILE = path.join(__dirname, 'last_update.json');

// Хранилище
let subscribers = new Set();
let lastUpdateId = 0;
let pollingActive = false;
let isProcessing = false;

// Кэш заявок
let recentContacts = [];
const MAX_RECENT_CONTACTS = 15;

// Модель Contact
let Contact = null;

// ============================================
// УСТАНОВКА МОДЕЛИ
// ============================================

function setContactModel(model) {
  Contact = model;
  console.log('✅ [BOT] Модель Contact установлена');
  loadRecentContactsFromDB();
}

// ============================================
// ЗАГРУЗКА ЗАЯВОК ИЗ БД
// ============================================

async function loadRecentContactsFromDB() {
  try {
    if (!Contact) {
      console.log('⚠️ [BOT] Модель Contact не установлена');
      return;
    }

    const docs = await Contact.find()
      .sort({ createdAt: -1 })
      .limit(MAX_RECENT_CONTACTS)
      .lean();

    console.log(`📋 [BOT] Найдено ${docs.length} заявок в БД`);

    if (docs.length > 0) {
      recentContacts = docs.reverse().map(doc => ({
        ...doc,
        _id: doc._id.toString(),
        addedAt: doc.createdAt || new Date().toISOString(),
      }));
      
      console.log(`✅ [BOT] Кэш обновлён: ${recentContacts.length} заявок`);
    } else {
      recentContacts = [];
    }
  } catch (error) {
    console.error('❌ [BOT] Ошибка загрузки из БД:', error.message);
  }
}

// ============================================
// ЗАГРУЗКА ПОДПИСЧИКОВ
// ============================================

function loadSubscribers() {
  try {
    if (fs.existsSync(SUBSCRIBERS_FILE)) {
      const data = fs.readFileSync(SUBSCRIBERS_FILE, 'utf8');
      subscribers = new Set(JSON.parse(data));
      console.log(`📋 [BOT] Загружено подписчиков: ${subscribers.size}`);
    }
  } catch (e) {
    console.error('Ошибка загрузки подписчиков:', e);
  }

  const envChat = process.env.TELEGRAM_CHAT_ID || process.env.chat_id;
  if (envChat) {
    subscribers.add(String(envChat));
    console.log(`✅ [BOT] Добавлен chat_id из .env: ${envChat}`);
  }
}

function saveSubscribers() {
  try {
    fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify([...subscribers]));
    console.log(`💾 [BOT] Сохранено подписчиков: ${subscribers.size}`);
  } catch (e) {
    console.error('Ошибка сохранения подписчиков:', e);
  }
}

function loadLastUpdateId() {
  try {
    if (fs.existsSync(LAST_UPDATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(LAST_UPDATE_FILE, 'utf8'));
      lastUpdateId = data.lastUpdateId || 0;
    }
  } catch (e) {}
}

function saveLastUpdateId() {
  try {
    fs.writeFileSync(LAST_UPDATE_FILE, JSON.stringify({ lastUpdateId }));
  } catch (e) {}
}

// ============================================
// АВТООПРЕДЕЛЕНИЕ CHAT_ID
// ============================================

async function autoDiscoverChatId() {
  try {
    const res = await fetch(`${API_URL}/getUpdates?limit=10`);
    const data = await res.json();

    if (data.ok && data.result && data.result.length) {
      let added = 0;
      for (const upd of data.result) {
        const chat = upd.message?.chat || upd.callback_query?.message?.chat;
        if (chat?.id) {
          const chatId = String(chat.id);
          if (!subscribers.has(chatId)) {
            subscribers.add(chatId);
            added++;
          }
        }
      }
      if (added > 0) {
        saveSubscribers();
        console.log(`✅ [BOT] Автоматически добавлено ${added} новых подписчиков`);
      }
    }
  } catch (e) {
    console.error('Ошибка автоопределения chat_id:', e);
  }
}

// ============================================
// ОЧИСТКА ОЧЕРЕДИ
// ============================================

async function clearPendingUpdates() {
  try {
    const res = await fetch(`${API_URL}/getUpdates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offset: -1, timeout: 1 }),
    });
    const data = await res.json();
    if (data.ok && data.result && data.result.length) {
      lastUpdateId = Math.max(...data.result.map(u => u.update_id));
      saveLastUpdateId();
      console.log(`✅ [BOT] Очищено ${data.result.length} обновлений`);
    }
  } catch (e) {
    console.error('Ошибка очистки обновлений:', e);
  }
}

// ============================================
// ОТПРАВКА СООБЩЕНИЙ
// ============================================

async function sendMessage(chatId, text, options = {}) {
  try {
    const res = await fetch(`${API_URL}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options.parse_mode || 'HTML',
        disable_web_page_preview: true,
        reply_markup: options.reply_markup,
      }),
    });
    const data = await res.json();
    return data.ok;
  } catch (e) {
    console.error(`Ошибка отправки сообщения в ${chatId}:`, e.message);
    return false;
  }
}

async function broadcastMessage(text, options = {}) {
  let successCount = 0;
  for (const chatId of subscribers) {
    const sent = await sendMessage(chatId, text, options);
    if (sent) successCount++;
    await new Promise(r => setTimeout(r, 50)); // Задержка между сообщениями
  }
  console.log(`📢 [BOT] Рассылка завершена: ${successCount}/${subscribers.size}`);
  return successCount;
}

// ============================================
// ФОРМАТИРОВАНИЕ ЗАЯВКИ (с Telegram и Phone)
// ============================================

function formatContact(contact, idx = null) {
  const date = contact.createdAt ? new Date(contact.createdAt).toLocaleString('ru-RU') : '—';
  
  let result = '';
  
  if (idx !== null) {
    result += `<b>📋 ЗАЯВКА #${idx + 1}</b>\n\n`;
  }
  
  result += `👤 <b>Имя:</b> ${contact.name || '—'}\n`;
  result += `📧 <b>Email:</b> ${contact.email || '—'}\n`;
  result += `📱 <b>Telegram:</b> ${contact.telegram || '—'}\n`;
  result += `📞 <b>Телефон:</b> ${contact.phone || '—'}\n`;
  
  if (contact.service) {
    result += `🎯 <b>Услуга:</b> ${contact.service}\n`;
  }
  
  result += `\n💬 <b>Сообщение:</b>\n${contact.message || '—'}\n`;
  result += `\n───────────────────\n`;
  result += `🆔 <b>ID:</b> <code>${contact._id || 'N/A'}</code>\n`;
  result += `📅 <b>Время:</b> ${date}\n`;
  
  if (contact.ipAddress) {
    result += `🌐 <b>IP:</b> ${contact.ipAddress}\n`;
  }
  
  return result.trim();
}

function formatStats() {
  return `<b>📊 СТАТИСТИКА БОТА</b>\n\n` +
         `👥 Подписчиков: ${subscribers.size}\n` +
         `📋 Заявок в кэше: ${recentContacts.length}\n` +
         `🤖 Статус: ${pollingActive ? 'Активен ✅' : 'Остановлен ❌'}`;
}

// ============================================
// КЛАВИАТУРЫ
// ============================================

function getMainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '📊 Статус', callback_data: 'status' }, { text: '📋 Заявки', callback_data: 'contacts' }],
      [{ text: '📈 Статистика', callback_data: 'stats' }, { text: '⚙️ Настройки', callback_data: 'settings' }],
      [{ text: '❓ Помощь', callback_data: 'help' }],
    ],
  };
}

function getBackKeyboard() {
  return { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back_to_main' }]] };
}

function getSettingsKeyboard(isSubscribed) {
  return {
    inline_keyboard: [
      [{ text: isSubscribed ? '🔕 Отписаться' : '🔔 Подписаться', callback_data: isSubscribed ? 'unsubscribe' : 'subscribe' }],
      [{ text: '🔙 Назад', callback_data: 'back_to_main' }],
    ],
  };
}

function getContactsKeyboard(contacts, page = 0) {
  const buttons = [];
  const pageSize = 5;
  const pageContacts = contacts.slice(page * pageSize, (page + 1) * pageSize);

  pageContacts.forEach((c, i) => {
    const displayName = c.name && c.name.length > 20 ? c.name.substring(0, 17) + '...' : (c.name || 'Без имени');
    const displayService = c.service || '—';
    buttons.push([{
      text: `${displayName} (${displayService})`,
      callback_data: `view_${page * pageSize + i}`,
    }]);
  });

  const nav = [];
  if (page > 0) nav.push({ text: '⬅️ Назад', callback_data: `page_${page - 1}` });
  if ((page + 1) * pageSize < contacts.length) nav.push({ text: 'Вперед ➡️', callback_data: `page_${page + 1}` });
  if (nav.length) buttons.push(nav);

  buttons.push([{ text: '🔙 Главное меню', callback_data: 'back_to_main' }]);
  return { inline_keyboard: buttons };
}

// ============================================
// ОТПРАВКА УВЕДОМЛЕНИЯ О ЗАЯВКЕ
// ============================================

async function sendNewContactNotification(contactData) {
  // Добавляем в кэш
  recentContacts.unshift({
    ...contactData,
    _id: contactData._id?.toString(),
    addedAt: new Date().toISOString(),
  });
  
  if (recentContacts.length > MAX_RECENT_CONTACTS) {
    recentContacts.pop();
  }
  
  // Формируем сообщение
  const msg = `<b>🚀 НОВАЯ ЗАЯВКА!</b>\n\n${formatContact(contactData)}`;
  
  // Отправляем всем подписчикам
  const sentCount = await broadcastMessage(msg);
  
  console.log(`📱 [BOT] Уведомление о заявке отправлено ${sentCount} подписчикам`);
  return sentCount > 0;
}

// ============================================
// ОБРАБОТКА ОБНОВЛЕНИЙ
// ============================================

async function getUpdates() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const res = await fetch(`${API_URL}/getUpdates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offset: lastUpdateId + 1, timeout: 10 }),
    });
    const data = await res.json();

    if (data.ok && data.result && data.result.length) {
      for (const upd of data.result) {
        lastUpdateId = upd.update_id;
        await handleUpdate(upd);
      }
      saveLastUpdateId();
    }
  } catch (e) {
    console.error('Ошибка получения обновлений:', e);
  } finally {
    isProcessing = false;
  }
}

async function handleUpdate(upd) {
  // Обработка callback query (кнопки)
  if (upd.callback_query) {
    const cb = upd.callback_query;
    const chatId = String(cb.message.chat.id);
    const msgId = cb.message.message_id;
    const data = cb.data;

    // Отвечаем на callback
    await fetch(`${API_URL}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: cb.id }),
    });

    // Обработка разных callback_data
    if (data === 'back_to_main') {
      await editMessage(chatId, msgId, '🔽 Выберите действие:', getMainMenuKeyboard());
    } 
    else if (data === 'contacts') {
      if (recentContacts.length === 0) {
        await editMessage(chatId, msgId, '📋 Нет заявок в кэше', getBackKeyboard());
      } else {
        await editMessage(chatId, msgId, `📋 Заявок: ${recentContacts.length}\nВыберите заявку для просмотра:`, getContactsKeyboard(recentContacts, 0));
      }
    } 
    else if (data === 'status') {
      const isSub = subscribers.has(chatId);
      await editMessage(chatId, msgId, 
        `📊 <b>СТАТУС ПОДПИСКИ</b>\n\n` +
        `Подписан: ${isSub ? '✅ ДА' : '❌ НЕТ'}\n` +
        `Всего подписчиков: ${subscribers.size}\n` +
        `Заявок в кэше: ${recentContacts.length}\n` +
        `Бот активен: ${pollingActive ? '✅' : '❌'}`,
        getBackKeyboard()
      );
    } 
    else if (data === 'stats') {
      await editMessage(chatId, msgId, formatStats(), getBackKeyboard());
    } 
    else if (data === 'settings') {
      const isSub = subscribers.has(chatId);
      await editMessage(chatId, msgId, 
        `⚙️ <b>НАСТРОЙКИ</b>\n\n` +
        `Ваш статус: ${isSub ? '✅ Подписан' : '❌ Не подписан'}\n\n` +
        `Выберите действие:`,
        getSettingsKeyboard(isSub)
      );
    } 
    else if (data === 'help') {
      await editMessage(chatId, msgId, 
        `❓ <b>ПОМОЩЬ</b>\n\n` +
        `📌 <b>Доступные команды:</b>\n` +
        `/start - Главное меню\n` +
        `/menu - Показать меню\n\n` +
        `📌 <b>Возможности бота:</b>\n` +
        `• Просмотр новых заявок\n` +
        `• Управление подпиской\n` +
        `• Статистика работы\n\n` +
        `📌 <b>Контакты:</b>\n` +
        `Telegram: @collepse_official\n` +
        `Email: info@collepse.com`,
        getBackKeyboard()
      );
    } 
    else if (data === 'subscribe') {
      subscribers.add(chatId);
      saveSubscribers();
      await editMessage(chatId, msgId, 
        `✅ <b>Вы успешно подписались!</b>\n\n` +
        `Теперь вы будете получать уведомления о новых заявках.`,
        getBackKeyboard()
      );
    } 
    else if (data === 'unsubscribe') {
      subscribers.delete(chatId);
      saveSubscribers();
      await editMessage(chatId, msgId, 
        `❌ <b>Вы отписались от уведомлений</b>\n\n` +
        `Чтобы снова подписаться, используйте команду /start или /menu`,
        getBackKeyboard()
      );
    } 
    else if (data.startsWith('page_')) {
      const page = parseInt(data.split('_')[1]);
      await editMessage(chatId, msgId, 
        `📋 Страница ${page + 1} из ${Math.ceil(recentContacts.length / 5)}\nВыберите заявку:`,
        getContactsKeyboard(recentContacts, page)
      );
    } 
    else if (data.startsWith('view_')) {
      const idx = parseInt(data.split('_')[1]);
      const contact = recentContacts[idx];
      if (contact) {
        await editMessage(chatId, msgId, formatContact(contact, idx), getBackKeyboard());
      } else {
        await editMessage(chatId, msgId, '❌ Заявка не найдена', getBackKeyboard());
      }
    }
    return;
  }

  // Обработка обычных сообщений
  const msg = upd.message;
  if (!msg || !msg.text) return;

  const chatId = String(msg.chat.id);
  const text = msg.text.trim();

  if (text === '/start') {
    if (!subscribers.has(chatId)) {
      subscribers.add(chatId);
      saveSubscribers();
      console.log(`✅ [BOT] Новый подписчик: ${chatId}`);
    }
    await sendMessage(chatId, 
      `👋 <b>Добро пожаловать в Collepse Bot!</b>\n\n` +
      `Я буду присылать вам уведомления о новых заявках с сайта.\n\n` +
      `Используйте кнопки ниже для управления:`,
      { reply_markup: getMainMenuKeyboard() }
    );
  } 
  else if (text === '/menu') {
    await sendMessage(chatId, '🔽 Главное меню:', { reply_markup: getMainMenuKeyboard() });
  }
  else if (text === '/status') {
    const isSub = subscribers.has(chatId);
    await sendMessage(chatId, 
      `📊 <b>СТАТУС</b>\n\n` +
      `Подписан: ${isSub ? '✅ ДА' : '❌ НЕТ'}\n` +
      `Всего подписчиков: ${subscribers.size}`,
      { reply_markup: getBackKeyboard() }
    );
  }
}

async function editMessage(chatId, msgId, text, markup) {
  try {
    await fetch(`${API_URL}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: msgId,
        text,
        parse_mode: 'HTML',
        reply_markup: markup,
      }),
    });
  } catch (e) {
    console.error('Ошибка редактирования сообщения:', e);
  }
}

// ============================================
// ПОЛЛИНГ
// ============================================

async function startPolling() {
  if (pollingActive) return;
  pollingActive = true;

  await autoDiscoverChatId();
  await clearPendingUpdates();

  console.log('🤖 [BOT] Запуск поллинга...');
  
  const poll = async () => {
    if (!pollingActive) return;
    await getUpdates();
    setTimeout(poll, 1000);
  };
  
  poll();
  console.log('✅ [BOT] Поллинг запущен');
}

function stopPolling() {
  pollingActive = false;
  console.log('🛑 [BOT] Поллинг остановлен');
}

// ============================================
// ИНФОРМАЦИЯ О БОТЕ
// ============================================

async function getBotInfo() {
  try {
    const res = await fetch(`${API_URL}/getMe`);
    const data = await res.json();
    if (data.ok) {
      return data.result;
    }
    return null;
  } catch (error) {
    console.error('❌ Ошибка получения информации о боте:', error.message);
    return null;
  }
}

function getSubscribers() {
  return [...subscribers];
}

function getSubscriberCount() {
  return subscribers.size;
}

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

loadLastUpdateId();
loadSubscribers();

// ============================================
// ЭКСПОРТ
// ============================================

module.exports = {
  setContactModel,
  loadRecentContactsFromDB,
  sendMessage,
  broadcastMessage,
  sendNewContactNotification,
  startPolling,
  stopPolling,
  getBotInfo,
  getSubscribers,
  getSubscriberCount,
  clearPendingUpdates,
  BOT_TOKEN,
};