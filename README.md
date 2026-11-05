# IoT monitoring workspace

Monitor temperature, humidity, binary moisture and motion across eight ThingSpeak fields. The dashboard includes Chart.js histories, EWMA smoothing, descriptive control bands, configurable upper/lower thresholds and authenticated email delivery.

## Run locally

Requires Node.js 20 or newer. Run npm ci, copy .env.example to .env, then npm start. Open http://127.0.0.1:8081. The server binds to loopback and serves only explicit public assets.

Demo mode generates clearly labelled simulated data and never sends email. Choose 30, 60 or 120 readings and export the displayed dataset as CSV. Live reads use the public channel IDs at the top of app.js; replace those IDs for your own sensors. Each selected Raspberry number maps to the same numbered field on all four channels.

## Email setup

Set SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, ALERT_API_TOKEN and comma-separated ALERT_ALLOWED_RECIPIENTS on the server. Use a long random access token; enter it into settings for the current browser session. It is never persisted in browser storage. Only distribute that token to trusted operators. Recipients must be approved in server configuration. Email is sent as plain text through SendGrid's v3 API.

Both upper and lower threshold breaches are supported. Browser-side cooldown prevents routine repeat notifications; this is not a distributed server rate limiter. Monitoring and delivery run only while the dashboard is open. Unattended monitoring requires a scheduled server worker and persistent alert state, which are not included. Never expose this endpoint to untrusted operators without durable rate limiting.

## Data interpretation

Missing, blank and invalid values remain missing. Readings older than five minutes, or more than a minute in the future, are withheld from current-value cards and alerts. Charts retain historical readings; freshness is reported separately. Temperature/humidity correlation uses exact timestamp matches and is unavailable with insufficient matching data. Low correlation alone is not treated as a sensor fault.

The environment score is a heuristic, not a validated safety assessment. EWMA and descriptive statistics are local calculations, not generative AI. Control bands use the displayed window, not a calibrated production baseline. Time-to-breach forecasting is disabled until timestamp-aware forecasts can be validated. Missing sensors and unconfigured thresholds limit the meaning of the score.

## Verification

npm run check performs syntax checks. npm test runs regression and local HTTP tests without sending email. GitHub Actions runs these checks on pushes and pull requests. The legacy npm run test:email command sends real mail and is not part of automated validation; use only deliberately with the required authorization setup.

## Deployment

The existing vercel.json retains static assets and /api/send-alert. Set the same environment variables in Vercel before enabling email. Keep .env and .vercel untracked. Dependency installation is reproducible through package-lock.json. The API handler is shared between local Express and Vercel.

## Upgrade verification limits

No real email was sent. Live upstream readings and deployed Vercel behavior have not been verified. Desktop browser verification passed for demo readings, rendered charts and opening/closing threshold settings. Mobile layouts, complete keyboard navigation, live email and deployed Vercel behavior still require verification before production publication.


## License
MIT. See LICENSE.

