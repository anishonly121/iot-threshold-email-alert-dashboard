require('dotenv').config();
const express = require('express');
const path = require('path');
const sgMail = require('@sendgrid/mail');

const app = express();
const PORT = process.env.PORT || 8081;

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL;
const SENDGRID_TEMPLATE_ID = process.env.SENDGRID_TEMPLATE_ID;

if (!SENDGRID_API_KEY || !SENDGRID_FROM_EMAIL) {
  console.warn('Missing SENDGRID_API_KEY or SENDGRID_FROM_EMAIL. Email alerts will fail until set.');
}

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

app.use(express.json());
app.use(express.static(__dirname));

app.post('/api/send-alert', async (req, res) => {
  try {
    const { toEmail, metric, value, threshold, condition, device, time } = req.body || {};

    if (!SENDGRID_API_KEY || !SENDGRID_FROM_EMAIL) {
      return res.status(500).json({ message: 'Server email config missing' });
    }

    if (!isValidEmail(toEmail)) {
      return res.status(400).json({ message: 'Invalid recipient email' });
    }

    const safeMetric = metric || 'Metric';
    const safeValue = value ?? '-';
    const safeThreshold = threshold ?? '-';
    const safeDevice = device || 'Unknown device';
    const safeCondition = condition || 'below minimum';
    const safeTime = time || new Date().toLocaleString();

    const msg = {
      to: toEmail,
      from: SENDGRID_FROM_EMAIL
    };

    if (SENDGRID_TEMPLATE_ID) {
      msg.templateId = SENDGRID_TEMPLATE_ID;
      msg.dynamicTemplateData = {
        metric: safeMetric,
        value: safeValue,
        threshold: safeThreshold,
        condition: safeCondition,
        device: safeDevice,
        time: safeTime
      };
    } else {
      msg.subject = `[IoT Alert] ${safeMetric} is ${safeCondition}`;
      msg.text =
        `Alert from ${safeDevice}\n` +
        `${safeMetric}: ${safeValue}\n` +
        `Threshold: ${safeThreshold}\n` +
        `Condition: ${safeCondition}\n` +
        `Time: ${safeTime}`;
      msg.html =
        `<p><strong>Alert from ${safeDevice}</strong></p>` +
        `<p><strong>${safeMetric}</strong>: ${safeValue}</p>` +
        `<p><strong>Threshold</strong>: ${safeThreshold}</p>` +
        `<p><strong>Condition</strong>: ${safeCondition}</p>` +
        `<p><strong>Time</strong>: ${safeTime}</p>`;
    }

    await sgMail.send(msg);
    return res.status(200).json({ message: 'Alert email sent' });
  } catch (err) {
    const sgMessage = err?.response?.body?.errors?.[0]?.message;
    const detail = sgMessage || err.message || 'Failed to send email';
    console.error('SendGrid send failed:', err?.response?.body || err.message || err);
    return res.status(500).json({ message: detail });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Dashboard running on http://localhost:${PORT}`);
});
