// Production Hardened Alert Dispatch Service
const twilio = require('twilio');
const nodemailer = require('nodemailer');

const twilioSid = process.env.TWILIO_ACCOUNT_SID;
const twilioToken = process.env.TWILIO_AUTH_TOKEN;
const twilioFrom = process.env.TWILIO_FROM_NUMBER;

const smtpHost = process.env.SMTP_HOST;
const smtpPort = parseInt(process.env.SMTP_PORT || '587');
const smtpSecure = process.env.SMTP_SECURE === 'true';
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpFrom = process.env.SMTP_FROM_EMAIL || smtpUser;

// PII masking helpers for secure console logging
function maskEmail(email) {
  if (!email) return '';
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const name = parts[0];
  const domain = parts[1];
  if (name.length <= 2) return `${name[0]}***@${domain}`;
  return `${name[0]}***${name[name.length - 1]}@${domain}`;
}

function maskPhone(phone) {
  if (!phone) return '';
  if (phone.length < 5) return '***';
  return `${phone.slice(0, 3)}*****${phone.slice(-2)}`;
}

// Exponential backoff executor
async function retryWithBackoff(fn, retries = 3, delay = 1000) {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 1) {
      throw err;
    }
    console.warn(`[Alert Retry] Attempt failed. Retrying in ${delay}ms. Error: ${err.message}`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryWithBackoff(fn, retries - 1, delay * 2);
  }
}

// Low-level Twilio dispatch call
async function sendSMSCall(to, body) {
  if (!twilioSid || !twilioToken || !twilioFrom) {
    console.log(`[CONSOLE MOCK SMS] Send target: ${maskPhone(to)}\nContent:\n${body}\n------------------------------`);
    return { success: true, mock: true };
  }
  
  const client = twilio(twilioSid, twilioToken);
  const msg = await client.messages.create({ body, from: twilioFrom, to });
  console.log(`[Twilio SMS Success] Message sent to ${maskPhone(to)}. SID: ${msg.sid}`);
  return { success: true, mock: false, sid: msg.sid };
}

// Low-level SMTP dispatch call
async function sendEmailCall(to, subject, body) {
  if (!smtpUser || !smtpPass) {
    console.log(`[CONSOLE MOCK EMAIL] Send target: ${maskEmail(to)}\nSubject: ${subject}\nContent:\n${body}\n------------------------------`);
    return { success: true, mock: true };
  }
  
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: { user: smtpUser, pass: smtpPass }
  });
  
  const info = await transporter.sendMail({
    from: `"GuardianLink Alert" <${smtpFrom}>`,
    to,
    subject,
    text: body
  });
  
  console.log(`[SMTP Email Success] Message sent to ${maskEmail(to)}. MessageID: ${info.messageId}`);
  return { success: true, mock: false, messageId: info.messageId };
}

// --- EXPORTED SERVICE APIS ---

async function dispatchSMS(to, body) {
  return retryWithBackoff(() => sendSMSCall(to, body), 3, 1000);
}

async function dispatchEmail(to, subject, body) {
  return retryWithBackoff(() => sendEmailCall(to, subject, body), 3, 1000);
}

// High-level Alert Router supporting Fallbacks
async function dispatchAlertToContact(contact, alertText, emailSubject) {
  const result = { contactName: contact.name };
  let smsFailed = false;

  // 1. Try SMS first (if phone is configured)
  if (contact.phone) {
    try {
      const smsRes = await dispatchSMS(contact.phone, alertText);
      result.sms = { success: true, mock: smsRes.mock };
    } catch (err) {
      console.error(`[Alert Service] SMS dispatch to contact ${contact.name} failed after 3 attempts:`, err.message);
      result.sms = { success: false, error: err.message };
      smsFailed = true;
    }
  }

  // 2. Try Email (if configured)
  // FALLBACK CHANNEL: if SMS failed, or if email exists and no phone was present
  const shouldSendEmail = contact.email && (smsFailed || !contact.phone);
  
  if (shouldSendEmail) {
    try {
      if (smsFailed) {
        console.log(`[Alert Fallback] SMS failed to ${contact.name}. Escalating alert to EMAIL fallback channel.`);
      }
      const emailRes = await dispatchEmail(contact.email, emailSubject, alertText);
      result.email = { success: true, mock: emailRes.mock };
    } catch (err) {
      console.error(`[Alert Service] Email dispatch to contact ${contact.name} failed after 3 attempts:`, err.message);
      result.email = { success: false, error: err.message };
    }
  } else if (contact.email && !smsFailed && contact.phone) {
    // Standard alert (send both if both exist and SMS succeeded)
    try {
      const emailRes = await dispatchEmail(contact.email, emailSubject, alertText);
      result.email = { success: true, mock: emailRes.mock };
    } catch (err) {
      result.email = { success: false, error: err.message };
    }
  }

  return result;
}

function checkAlertsEnabled() {
  return {
    twilio: !!(twilioSid && twilioToken && twilioFrom),
    smtp: !!(smtpUser && smtpPass)
  };
}

module.exports = {
  dispatchSMS,
  dispatchEmail,
  dispatchAlertToContact,
  checkAlertsEnabled
};
