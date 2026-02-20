require('dotenv').config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:8081';
const toEmail = process.env.ALERT_TEST_TO_EMAIL || process.env.SENDGRID_FROM_EMAIL;

if (!toEmail) {
  console.error('Missing ALERT_TEST_TO_EMAIL or SENDGRID_FROM_EMAIL in .env');
  process.exit(1);
}

async function run() {
  const payload = {
    toEmail,
    metric: 'Temperature',
    value: '16.8',
    threshold: 18,
    condition: 'below minimum',
    device: 'Raspberry #1',
    time: new Date().toLocaleString()
  };

  const res = await fetch(`${BASE_URL}/api/send-alert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const text = await res.text();

  if (!res.ok) {
    console.error(`Email trigger failed: ${res.status} ${text}`);
    process.exit(1);
  }

  console.log(`Email trigger success: ${res.status} ${text}`);
}

run().catch((err) => {
  console.error('Email trigger test crashed:', err.message || err);
  process.exit(1);
});
