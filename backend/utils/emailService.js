const nodemailer = require('nodemailer');
const logger = require('./logger');

// Создание транспортера
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.EMAIL_PORT === '465',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
    },
  });
};

// Отправка уведомления команде
const sendContactEmail = async (contact) => {
  try {
    const transporter = createTransporter();
    
    // Проверка подключения
    await transporter.verify();
    
    const mailOptions = {
      from: `"Collepse Bot" <${process.env.EMAIL_FROM}>`,
      to: process.env.RECIPIENT_EMAIL,
      subject: `🔔 Новая заявка #${contact._id.toString().slice(-6)} от ${contact.name}`,
      text: `
НОВАЯ ЗАЯВКА С САЙТА COLLEPSE
═══════════════════════════════════

👤 Имя: ${contact.name}
📧 Email: ${contact.email}
🎯 Услуга: ${contact.service || 'Не указана'}
📅 Дата: ${contact.formattedDate}
🌐 IP: ${contact.ipAddress}

💬 Сообщение:
${contact.message}

═══════════════════════════════════
ID: ${contact._id}
      `,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #3b82f6, #06b6d4); color: white; padding: 30px; border-radius: 16px 16px 0 0; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 700; }
    .header p { margin: 10px 0 0; opacity: 0.9; }
    .content { background: #f8fafc; padding: 30px; border-radius: 0 0 16px 16px; border: 1px solid #e2e8f0; border-top: none; }
    .field { margin-bottom: 20px; }
    .label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 600; margin-bottom: 4px; }
    .value { font-size: 16px; color: #1e293b; background: white; padding: 12px 16px; border-radius: 10px; border: 1px solid #e2e8f0; }
    .message-box { background: white; padding: 20px; border-radius: 10px; border-left: 4px solid #3b82f6; margin: 20px 0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 13px; }
    .badge { display: inline-block; background: #3b82f6; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚀 Collepse</h1>
      <p>Новая заявка с сайта</p>
    </div>
    <div class="content">
      <div class="field">
        <div class="label">👤 Имя</div>
        <div class="value">${contact.name}</div>
      </div>
      <div class="field">
        <div class="label">📧 Email</div>
        <div class="value"><a href="mailto:${contact.email}" style="color: #3b82f6;">${contact.email}</a></div>
      </div>
      <div class="field">
        <div class="label">🎯 Услуга</div>
        <div class="value">${contact.service || 'Не указана'}</div>
      </div>
      <div class="field">
        <div class="label">💬 Сообщение</div>
        <div class="message-box">${contact.message.replace(/\n/g, '<br>')}</div>
      </div>
      <div style="display: flex; justify-content: space-between; margin-top: 20px;">
        <div>
          <div class="label">📅 Дата</div>
          <div class="value" style="padding: 8px 12px;">${contact.formattedDate}</div>
        </div>
        <div>
          <div class="label">🆔 ID</div>
          <div class="value" style="padding: 8px 12px; font-family: monospace;">${contact._id.toString().slice(-8)}</div>
        </div>
      </div>
      <div style="margin-top: 15px;">
        <span class="badge">🌐 IP: ${contact.ipAddress}</span>
      </div>
    </div>
    <div class="footer">
      © ${new Date().getFullYear()} Collepse. Все права защищены.
    </div>
  </div>
</body>
</html>
      `,
    };
    
    const info = await transporter.sendMail(mailOptions);
    logger.info(`📧 Уведомление отправлено: ${info.messageId}`);
    
    // Отмечаем в БД что письмо отправлено
    await contact.markEmailSent();
    
    return info;
    
  } catch (error) {
    logger.error(`❌ Ошибка отправки email: ${error.message}`);
    throw error;
  }
};

// Отправка автоответа клиенту
const sendAutoReply = async (contact) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: `"Collepse Team" <${process.env.EMAIL_FROM}>`,
      to: contact.email,
      subject: '✅ Спасибо за обращение в Collepse',
      text: `
Здравствуйте, ${contact.name}!

Спасибо за обращение в Collepse. Мы получили вашу заявку и свяжемся с вами в ближайшее время (обычно в течение 2 часов в рабочее время).

Детали вашей заявки:
- Услуга: ${contact.service || 'Не указана'}
- Номер заявки: ${contact._id.toString().slice(-6)}

Если у вас есть срочный вопрос, напишите нам в Telegram: @collepse_official

С уважением,
Команда Collepse
      `,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; background: #f8fafc; padding: 20px; }
    .container { max-width: 550px; margin: 0 auto; background: white; border-radius: 20px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
    .logo { font-size: 28px; font-weight: 700; color: #3b82f6; margin-bottom: 30px; }
    .logo span { color: #1e293b; }
    h1 { color: #1e293b; margin-bottom: 20px; font-size: 24px; }
    p { margin-bottom: 15px; color: #475569; }
    .details { background: #f1f5f9; padding: 20px; border-radius: 12px; margin: 25px 0; }
    .detail-item { margin-bottom: 10px; }
    .label { font-size: 12px; color: #64748b; text-transform: uppercase; }
    .value { font-size: 16px; color: #1e293b; font-weight: 500; }
    .telegram-link { display: inline-block; background: #0088cc; color: white; padding: 12px 24px; border-radius: 30px; text-decoration: none; margin-top: 20px; font-weight: 600; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">Collepse<span>.</span></div>
    <h1>Здравствуйте, ${contact.name}! 👋</h1>
    <p>Спасибо за обращение в Collepse. Мы получили вашу заявку и уже приступили к её обработке.</p>
    <p>Наш специалист свяжется с вами <strong>в ближайшее время</strong> (обычно в течение 2 часов в рабочее время).</p>
    
    <div class="details">
      <div class="detail-item">
        <div class="label">Услуга</div>
        <div class="value">${contact.service || 'Не указана'}</div>
      </div>
      <div class="detail-item">
        <div class="label">Номер заявки</div>
        <div class="value" style="font-family: monospace;">#${contact._id.toString().slice(-6).toUpperCase()}</div>
      </div>
    </div>
    
    <p>Если у вас есть срочный вопрос, вы можете написать нам в Telegram:</p>
    <a href="https://t.me/collepse_official" class="telegram-link">📱 Написать в Telegram</a>
    
    <div class="footer">
      <p>С уважением,<br><strong>Команда Collepse</strong></p>
      <p style="font-size: 12px; margin-top: 15px;">© ${new Date().getFullYear()} Collepse. Все права защищены.</p>
    </div>
  </div>
</body>
</html>
      `,
    };
    
    const info = await transporter.sendMail(mailOptions);
    logger.info(`📧 Автоответ отправлен клиенту ${contact.email}: ${info.messageId}`);
    
    return info;
    
  } catch (error) {
    logger.error(`❌ Ошибка отправки автоответа: ${error.message}`);
    // Не пробрасываем ошибку, чтобы не влиять на основной поток
  }
};

// Проверка подключения к почтовому серверу
const verifyEmailConnection = async () => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    logger.info('✅ Почтовый сервер готов к работе');
    return true;
  } catch (error) {
    logger.error(`❌ Ошибка подключения к почтовому серверу: ${error.message}`);
    return false;
  }
};

module.exports = {
  sendContactEmail,
  sendAutoReply,
  verifyEmailConnection,
};