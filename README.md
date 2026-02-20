# IoT Threshold Email Alert Dashboard

A web-based IoT monitoring dashboard that reads sensor data from ThingSpeak and sends email alerts via SendGrid when temperature or humidity drops below user-defined minimum thresholds.

## Features

- Real-time data fetch from ThingSpeak channels
- Interactive charts for:
  - Temperature
  - Humidity
  - Soil moisture
  - PIR/motion
- User-configurable threshold settings (temperature/humidity)
- Email alerting for below-threshold conditions
- SendGrid Dynamic Template support
- Alert cooldown/rate-limiting to prevent spam
- Local persistence of thresholds/email in browser storage
- API test script to trigger and verify email alert flow

## Tech Stack

- Frontend: HTML, CSS, JavaScript, Chart.js
- Backend: Node.js, Express
- Email Provider: SendGrid (`@sendgrid/mail`)
- Config: dotenv

## Project Structure

- `index.html` - dashboard UI and threshold modal
- `app.js` - frontend logic, ThingSpeak fetch, threshold checks, alert API calls
- `server.js` - Express server and `/api/send-alert` endpoint
- `tests/trigger-email.test.js` - script to trigger a real email alert
- `.env` - environment variables (not committed)

## Environment Variables

Create a `.env` file in the project root:

```env
SENDGRID_API_KEY=your_sendgrid_api_key
SENDGRID_FROM_EMAIL=verified_sender@example.com
SENDGRID_TEMPLATE_ID=your_dynamic_template_id
ALERT_TEST_TO_EMAIL=recipient@example.com
PORT=3000
```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start server:
   ```bash
   npm start
   ```

3. Open:
   - `http://localhost:3000`

## Running Email Trigger Test

This sends a real alert payload to the backend endpoint:

```bash
npm run test:email
```

## Alert Logic

- Alerts are evaluated on dashboard refresh cycles.
- Condition: value is **below** configured minimum threshold.
- Emails are rate-limited by cooldown (`cooldownMinutes` in frontend state).
- A new breach after recovery can trigger immediately.

## Notes

- Keep `.env` private and never commit secrets.
- `SENDGRID_FROM_EMAIL` must be verified in SendGrid.
- Ensure your SendGrid template is active and includes these dynamic variables:
  - `metric`
  - `value`
  - `threshold`
  - `condition`
  - `device`
  - `time`

## Future Improvements

- Add per-user authentication and per-device alert profiles
- Add retry/backoff and delivery status logging
- Add deployment config (Render/Railway/Vercel + backend service)
- Add unit/integration tests for threshold and cooldown behavior
