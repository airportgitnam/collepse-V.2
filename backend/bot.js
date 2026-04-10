/**
 * =====================================================
 * TELEGRAM BOT MODULE — ИСПРАВЛЕННАЯ ВЕРСИЯ
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
      subscribers = new Set(JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE, 'utf8')));
    }
  } catch (e) {}

  const envChat = process.env.TELEGRAM_CHAT_ID || process.env.chat_id;
  if (envChat) subscribers.add(String(envChat));
}

function saveSubscribers() {
  try {
    fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify([...subscribers]));
  } catch (e) {}
}

function loadLastUpdateId() {
  try {
    if (fs.existsSync(LAST_UPDATE_FILE)) {
      lastUpdateId = JSON.parse(fs.readFileSync(LAST_UPDATE_FILE, 'utf8')).lastUpdateId || 0;
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

    if (data.ok && data.result.length) {
      for (const upd of data.result) {
        const chat = upd.message?.chat || upd.callback_query?.message?.chat;
        if (chat?.id) subscribers.add(String(chat.id));
      }
      saveSubscribers();
    }
  } catch (e) {}
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
    if (data.ok && data.result.length) {
      lastUpdateId = Math.max(...data.result.map(u => u.update_id));
      saveLastUpdateId();
    }
  } catch (e) {}
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
    return (await res.json()).ok;
  } catch (e) {
    return false;
  }
}

async function broadcastMessage(text, options = {}) {
  for (const chatId of subscribers) {
    await sendMessage(chatId, text, options);
    await new Promise(r => setTimeout(r, 50));
  }
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
    buttons.push([{
      text: `${c.name?.substring(0, 20) || '—'} (${c.service || '—'})`,
      callback_data: `view_${page * pageSize + i}`,
    }]);
  });

  const nav = [];
  if (page > 0) nav.push({ text: '⬅️', callback_data: `page_${page - 1}` });
  if ((page + 1) * pageSize < contacts.length) nav.push({ text: '➡️', callback_data: `page_${page + 1}` });
  if (nav.length) buttons.push(nav);

  buttons.push([{ text: '🔙 Меню', callback_data: 'back_to_main' }]);
  return { inline_keyboard: buttons };
}

// ============================================
// ФОРМАТИРОВАНИЕ
// ============================================

function formatContact(contact, idx = null) {
  const date = contact.createdAt ? new Date(contact.createdAt).toLocaleString('ru-RU') : '—';
  return `
${idx !== null ? `<b>📋 ЗАЯВКА #${idx + 1}</b>\n` : ''}
👤 <b>Имя:</b> ${contact.name || '—'}
📧 <b>Email:</b> ${contact.email || '—'}
📌 <b>Услуга:</b> ${contact.service || '—'}

💬 <b>Сообщение:</b>
${contact.message || '—'}

───────────────────
🆔 <b>ID:</b> <code>${contact._id || 'N/A'}</code>
📅 <b>Время:</b> ${date}
🌐 <b>IP:</b> ${contact.ipAddress || '—'}
`.trim();
}

function formatStats() {
  return `<b>📊 СТАТИСТИКА</b>\n\n👥 Подписчиков: ${subscribers.size}\n📋 Заявок: ${recentContacts.length}`;
}

// ============================================
// ОТПРАВКА УВЕДОМЛЕНИЯ О ЗАЯВКЕ
// ============================================

async function sendNewContactNotification(contactData) {
  recentContacts.unshift({
    ...contactData,
    _id: contactData._id?.toString(),
    addedAt: new Date().toISOString(),
  });
  if (recentContacts.length > MAX_RECENT_CONTACTS) recentContacts.pop();

  const msg = `<b>🚀 НОВАЯ ЗАЯВКА!</b>\n${formatContact(contactData)}`;
  await broadcastMessage(msg);
  return true;
}

// ============================================
// ПОЛУЧЕНИЕ ОБНОВЛЕНИЙ
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

    if (data.ok && data.result.length) {
      for (const upd of data.result) {
        lastUpdateId = upd.update_id;
        await handleUpdate(upd);
      }
      saveLastUpdateId();
    }
  } catch (e) {}
  finally {
    isProcessing = false;
  }
}

async function handleUpdate(upd) {
  // Callback query (кнопки)
  if (upd.callback_query) {
    const cb = upd.callback_query;
    const chatId = String(cb.message.chat.id);
    const msgId = cb.message.message_id;
    const data = cb.data;

    await fetch(`${API_URL}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: cb.id }),
    });

    if (data === 'back_to_main') {
      await editMessage(chatId, msgId, '🔽 Выберите действие:', getMainMenuKeyboard());
    } else if (data === 'contacts') {
      if (recentContacts.length === 0) {
        await editMessage(chatId, msgId, '📋 Нет заявок', getBackKeyboard());
      } else {
        await editMessage(chatId, msgId, `📋 Заявок: ${recentContacts.length}`, getContactsKeyboard(recentContacts, 0));
      }
    } else if (data === 'status') {
      const isSub = subscribers.has(chatId);
      await editMessage(chatId, msgId, `📊 Статус\n\nПодписан: ${isSub ? '✅' : '❌'}\nПодписчиков: ${subscribers.size}\nЗаявок: ${recentContacts.length}`, getBackKeyboard());
    } else if (data === 'stats') {
      await editMessage(chatId, msgId, formatStats(), getBackKeyboard());
    } else if (data === 'settings') {
      const isSub = subscribers.has(chatId);
      await editMessage(chatId, msgId, `⚙️ Настройки\nСтатус: ${isSub ? '✅' : '❌'}`, getSettingsKeyboard(isSub));
    } else if (data === 'help') {
      await editMessage(chatId, msgId, '❓ Помощь\n\n/start - меню\n@collepse_official', getBackKeyboard());
    } else if (data === 'subscribe') {
      subscribers.add(chatId);
      saveSubscribers();
      await editMessage(chatId, msgId, '✅ Вы подписаны!', getBackKeyboard());
    } else if (data === 'unsubscribe') {
      subscribers.delete(chatId);
      saveSubscribers();
      await editMessage(chatId, msgId, '❌ Вы отписались', getBackKeyboard());
    } else if (data.startsWith('page_')) {
      const page = parseInt(data.split('_')[1]);
      await editMessage(chatId, msgId, `📋 Страница ${page + 1}`, getContactsKeyboard(recentContacts, page));
    } else if (data.startsWith('view_')) {
      const idx = parseInt(data.split('_')[1]);
      const contact = recentContacts[idx];
      if (contact) {
        await editMessage(chatId, msgId, formatContact(contact, idx), getBackKeyboard());
      }
    }
    return;
  }

  // Обычные сообщения
  const msg = upd.message;
  if (!msg?.text) return;

  const chatId = String(msg.chat.id);
  const text = msg.text.trim();

  if (text === '/start' || text.includes('/start')) {
    if (!subscribers.has(chatId)) {
      subscribers.add(chatId);
      saveSubscribers();
    }
    await sendMessage(chatId, '👋 Добро пожаловать в Collepse Bot!', { reply_markup: getMainMenuKeyboard() });
  } else if (text === '/menu') {
    await sendMessage(chatId, '🔽 Меню:', { reply_markup: getMainMenuKeyboard() });
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
  } catch (e) {}
}

// ============================================
// ПОЛЛИНГ
// ============================================

async function startPolling() {
  if (pollingActive) return;
  pollingActive = true;

  await autoDiscoverChatId();
  await clearPendingUpdates();

  const poll = async () => {
    if (!pollingActive) return;
    await getUpdates();
    setTimeout(poll, 1000);
  };
  poll();
  console.log('🤖 [BOT] Поллинг запущен');
}

function stopPolling() {
  pollingActive = false;
}

// ============================================
// ИНФОРМАЦИЯ О БОТЕ (ИСПРАВЛЕНО)
// ============================================

async function getBotInfo() {
  try {
    const res = await fetch(`${API_URL}/getMe`);
    const text = await res.text();
    const data = JSON.parse(text);
    return data.ok ? data.result : null;
  } catch (error) {
    console.error('❌ getBotInfo error:', error.message);
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