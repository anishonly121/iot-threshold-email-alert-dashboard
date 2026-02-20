# IoT Threshold Email Alert Dashboard

A web-based IoT monitoring dashboard that reads sensor data from ThingSpeak and sends email alerts via SendGrid when temperature or humidity drops below user-defined minimum thresholds.

## Detailed Project Description

This project solves a common IoT monitoring problem: sensor values can drift into unsafe ranges when nobody is actively watching a dashboard. To address this, the system combines live visualization with automated notifications. The dashboard continuously pulls recent telemetry from ThingSpeak, renders it in time-series charts, and evaluates readings against user-defined thresholds.

When a reading breaches the minimum threshold (for temperature or humidity), the app triggers an alert workflow. The frontend calls a secure backend endpoint, which uses SendGrid to send a structured alert email. This allows near real-time escalation from “data observed” to “actionable notification.”

The design intentionally separates concerns:

- Frontend handles user interaction, charting, threshold management, and breach detection.
- Backend handles all email delivery logic and secrets management.
- SendGrid handles template-based transactional email delivery.

This separation keeps sensitive credentials off the client, improves maintainability, and makes deployment and future scaling easier.

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

## System Architecture

- Data source layer:
  - ThingSpeak public channel APIs provide the latest feed data.
  - The client fetches multiple channels and normalizes field values.
- Presentation layer:
  - Chart.js renders temperature, humidity, moisture, and PIR trends.
  - Metric cards show latest values and out-of-range status.
- Rules layer:
  - Threshold engine evaluates whether temperature/humidity are below configured minimum values.
  - Cooldown logic prevents repeated notifications in short intervals.
- Notification layer:
  - Frontend sends alert payloads to `POST /api/send-alert`.
  - Backend validates payload and sends email through SendGrid API.
  - Dynamic template variables are injected for consistent, branded alerts.

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

## End-to-End Flow

1. User opens dashboard and sets threshold values in the modal.
2. Dashboard polls ThingSpeak feeds at the configured refresh interval.
3. Latest values are parsed and visualized in charts/metric cards.
4. Breach detector checks whether temperature/humidity drop below minimum threshold.
5. On breach (and if cooldown allows), frontend sends alert payload to backend.
6. Backend validates request and calls SendGrid with dynamic template data.
7. Recipient receives an email containing metric, value, threshold, device, and timestamp.
8. Alert state is persisted locally to avoid duplicate spam behavior.

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

## Email Template Data Contract

The backend provides these dynamic fields to SendGrid:

- `metric`: sensor type (`Temperature` or `Humidity`)
- `value`: observed sensor reading at breach time
- `threshold`: minimum configured threshold
- `condition`: breach description (`below minimum`)
- `device`: selected device context (for example `Raspberry #1`)
- `time`: localized timestamp string

Your SendGrid dynamic template should reference these keys exactly.

## Reliability and Safety Considerations

- Secrets are stored server-side in `.env` and not exposed in frontend code.
- Input validation checks recipient email format before sending.
- Backend returns explicit failure messages to aid debugging.
- Cooldown reduces notification noise and repeated alert storms.
- Local storage persists thresholds and recipient settings across browser sessions.

## Limitations

- Current implementation is single-user and browser-local for settings.
- Breach logic currently covers only below-min thresholds for temperature/humidity.
- No persistent database is used; state resets when local storage is cleared.
- Delivery tracking (opened, bounced, deferred) is not yet persisted in-app.

## Use Cases

- Home/greenhouse environmental monitoring
- Small server room humidity/temperature monitoring
- Remote sensor watch with lightweight alerting
- Student/academic IoT prototype showcasing full data-to-alert pipeline

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
- Add alert history UI and acknowledgment workflow
- Add configurable channels and metric mappings from UI
- Add webhook/SMS/Telegram channels in addition to email
