# RootWatch — Plant care, even on busy days

[Live dashboard](https://iot-dashboard-alerts.vercel.app) · [Source](https://github.com/anishonly121/iot-threshold-email-alert-dashboard)

## Why I built it

My dad loves taking care of plants and gardening. Work means he cannot check on them as often as he would like, or always know when something changes. I built RootWatch to make the environment around his plants visible and help him respond sooner: sensor readings, understandable thresholds, email alerts, and practical care guidance in one place.

This is a personal engineering project, not a claim of proven plant-health outcomes. The current prototype checks alerts while the dashboard is open; always-on monitoring is a future milestone.

## Explore the experience

Start with **Explore the demo** to see explicitly simulated readings without connecting hardware or sending email. Select a station, set plant-appropriate temperature/humidity bounds, review the care brief, explore historical charts, and export the readings. The personal story lives in the dashboard as well as here.

## AI-assisted care guidance

Built-in, rule-based care cards work without an AI key and are labelled accordingly. **Ask AI for next steps** requests a Claude-generated brief using current readings, configured thresholds and optional plant context. It is on demand, not called by auto-refresh or included in email alerts. AI does not control irrigation or diagnose disease.

Configure ANTHROPIC_API_KEY in Vercel and redeploy to enable the provider. ANTHROPIC_MODEL defaults to claude-haiku-4-5 and can be changed to an available model. Enter the existing owner access token in Threshold Settings. The provider key stays server-side. The UI explains what is sent before the user asks for AI advice. Set a spending limit in your Anthropic account.

The endpoint authenticates the owner, validates and bounds inputs, rejects stale snapshots, limits output, applies a provider timeout and a 30-second warm-instance cooldown. This cooldown is not a global distributed quota. Missing provider configuration and provider errors leave the built-in guidance available. Soil sensor polarity is explicitly uncalibrated, so advice never assumes that 0 or 1 means a particular watering need.

API reference: https://platform.claude.com/docs/en/api/messages/create

## Engineering overview

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

No real email was sent. Live upstream readings and deployed Vercel behavior have not been verified. Desktop browser verification passed for demo readings, rendered charts and opening/closing threshold settings. Phone-width layout was checked and horizontal chart overflow was fixed. Production serves the upgrade and rejects unauthorized alerts. Live email delivery and real AI-provider output have not been tested.


## License
MIT. See LICENSE.

