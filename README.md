# 🌡️ IoT Threshold Email Alert Dashboard

> Real-time IoT sensor monitoring with automated email alerts — built with ThingSpeak, Chart.js, Node.js, and SendGrid.

![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![Chart.js](https://img.shields.io/badge/Chart.js-FF6384?style=flat&logo=chartdotjs&logoColor=white)
![SendGrid](https://img.shields.io/badge/SendGrid-1A82E2?style=flat&logo=sendgrid&logoColor=white)

---

## 📸 Demo

**🌐 Live:** [iot-dashboard-alerts.vercel.app](https://iot-dashboard-alerts.vercel.app)

![IoT Dashboard](assets/screenshot.png)

---

## 🚀 Features

**Data Pipeline**
- 📡 **Live ThingSpeak Integration** — Continuously polls 4 sensor channels (temperature, humidity, soil moisture, PIR/motion)
- 📊 **Interactive Charts** — Time-series visualizations with Chart.js, auto-refreshing every 30 seconds
- ↑↓ **Trend Indicators** — Per-sensor directional arrows on every metric card

**Statistical Process Control Engine**
- 〜 **EWMA Trend Lines** — Exponentially Weighted Moving Average (λ=0.3) overlaid on temperature and humidity charts, smoothing sensor noise to reveal real trends
- 📉 **Rolling 2σ Control Bands** — Auto-computed upper and lower control limits drawn as shaded regions; readings outside the band are statistically anomalous
- 🔢 **Live Z-Score Detection** — Every reading is scored against its rolling mean and standard deviation; |Z| > 2 triggers a warning, |Z| > 3 is critical
- 🔗 **Cross-Sensor Correlation** — Real-time Pearson correlation between temperature and humidity; a sudden breakdown flags environmental events or sensor faults
- 📐 **Stats Strip** — Rolling μ, σ, Z-score per sensor, T-H correlation, and 2σ event counter — all live, all color-coded

**Intelligence Panel**
- 🧠 **Environment Health Score** — 0–100 score weighted across all sensors, Z-score penalties, and correlation state
- ⏱️ **Predictive Breach Warning** — Linear regression on recent readings estimates time-to-threshold before a breach occurs
- 💬 **Contextual Observations** — 3 auto-generated insights per refresh, statistically contextualised (e.g. *"Temperature is 2.8σ below rolling mean"*)

**Alerting**
- 📧 **Automated Email Alerts** — SendGrid dynamic templates fire when readings breach configured thresholds
- 🔇 **Alert Cooldown** — Rate-limiting prevents notification spam during sustained breaches
- 🔔 **Toast Notifications** — In-dashboard feedback replaces browser alert dialogs

**Infrastructure**
- 🔒 **Secrets Stay Server-Side** — API keys handled by Node.js/Express, never exposed to the client
- 💾 **Local Persistence** — Thresholds and recipient settings survive browser sessions
- 🌐 **Deployed on Vercel** — Serverless API functions + static frontend

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript, Chart.js |
| Analytics | Custom SPC engine — EWMA, Z-scores, Pearson correlation, linear regression |
| Backend | Node.js, Express (local) + Vercel Serverless Functions (production) |
| Email | SendGrid (`@sendgrid/mail`) with dynamic templates |
| Data Source | ThingSpeak REST API |
| Deployment | Vercel |

---

## 🏗️ System Architecture

```
ThingSpeak API
      │
      ▼
  Frontend (index.html + app.js)
  ├── Fetches & normalizes 4-channel sensor feeds
  ├── Renders Chart.js time-series with EWMA + 2σ control bands
  ├── SPC Engine: rolling stats → Z-scores → Pearson correlation
  ├── Intelligence Engine: health score → breach prediction → observations
  ├── Threshold breach detector → POST /api/send-alert
  └── Trend arrows, countdown timer, toast notifications
      │
      ▼
  Vercel Serverless Function (/api/send-alert)
  ├── Validates payload and recipient email
  └── Sends email via SendGrid Dynamic Template
      │
      ▼
  Recipient Inbox 📬
```

---

## 📁 Project Structure

```
iot-threshold-email-alert-dashboard/
│
├── index.html                    # Dashboard UI, AI panel, threshold modal
├── style.css                     # All styles including SPC and AI panel
├── app.js                        # SPC engine, intelligence engine, charts, alerts
├── server.js                     # Local Express server (dev only)
├── api/
│   └── send-alert.js             # Vercel serverless function — email delivery
├── tests/
│   └── trigger-email.test.js     # Script to trigger a real alert end-to-end
├── assets/
│   └── screenshot.png            # Dashboard preview
└── .env                          # Secrets (not committed)
```

---

## ⚙️ Setup

### 1. Clone the Repository

```bash
git clone https://github.com/anishonly121/iot-threshold-email-alert-dashboard.git
cd iot-threshold-email-alert-dashboard
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the project root:
```env
SENDGRID_API_KEY=your_sendgrid_api_key
SENDGRID_FROM_EMAIL=verified_sender@example.com
SENDGRID_TEMPLATE_ID=your_dynamic_template_id
ALERT_TEST_TO_EMAIL=recipient@example.com
PORT=3000
```

> ⚠️ `SENDGRID_FROM_EMAIL` must be a verified sender in your SendGrid account.

### 4. Start the Server

```bash
npm start
```

Open your browser at `http://localhost:3000`

---

## 🔄 End-to-End Flow

1. User opens the dashboard and sets threshold values via the modal
2. Dashboard polls ThingSpeak feeds at a configured refresh interval
3. Latest values are parsed and rendered in charts and metric cards
4. Breach detector checks whether temperature or humidity drops below the minimum threshold
5. On breach (and if cooldown allows), frontend sends alert payload to the backend
6. Backend validates the request and calls SendGrid with dynamic template data
7. Recipient receives a structured email with metric, value, threshold, device, and timestamp
8. Alert state is persisted locally to prevent duplicate notifications

---

## 📧 SendGrid Template — Dynamic Fields

Your SendGrid template must reference these exact keys:

| Field | Description |
|---|---|
| `metric` | Sensor type (e.g. `Temperature` or `Humidity`) |
| `value` | Observed sensor reading at breach time |
| `threshold` | Configured minimum threshold |
| `condition` | Breach description (e.g. `below minimum`) |
| `device` | Device context (e.g. `Raspberry #1`) |
| `time` | Localized timestamp string |

---

## 🧪 Running the Email Trigger Test

To send a real alert payload to the backend and verify delivery:

```bash
npm run test:email
```

---

## ⚡ Alert Logic

- Evaluated on each dashboard refresh cycle
- Condition: reading is **below** the configured minimum threshold
- Emails are rate-limited by a configurable `cooldownMinutes` value
- A new breach after recovery can trigger immediately

---

## 🔒 Security & Reliability

- All secrets stored server-side in `.env` — never exposed to the client
- Input validation checks recipient email format before sending
- Backend returns explicit error messages to aid debugging
- Cooldown logic reduces notification noise and alert storms

---

## ⚠️ Known Limitations

- Single-user, browser-local settings (resets if local storage is cleared)
- Breach logic covers only below-minimum thresholds for temperature and humidity
- No persistent database; delivery tracking (opened/bounced) not yet in-app

---

## 🔮 Future Improvements

- [ ] Per-user authentication and per-device alert profiles
- [ ] Alert history log with acknowledgment workflow
- [ ] Smart AI alert emails — pipe health score and observations into SendGrid template
- [ ] Webhook, SMS, and Telegram notification channels
- [ ] Unit and integration tests for SPC engine and threshold logic
- [ ] Configurable EWMA decay factor (λ) and control band sigma level from UI

---

## 🌐 Use Cases

- Home or greenhouse environmental monitoring
- Small server room temperature and humidity tracking
- Remote sensor watching with lightweight alerting
- Academic IoT prototype demonstrating a full data-to-alert pipeline

---

## 🙋 Author

**Anish**
- GitHub: [@anishonly121](https://github.com/anishonly121)
- LinkedIn: [linkedin.com/in/anishbhole](https://www.linkedin.com/in/anishbhole/)

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
