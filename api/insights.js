const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function getTrend(values) {
  const valid = values.filter(v => v !== null && !isNaN(v));
  if (valid.length < 3) return 'insufficient data';
  const recent = valid.slice(-5);
  const diff = recent[recent.length - 1] - recent[0];
  if (Math.abs(diff) < 0.3) return 'stable';
  return diff > 0 ? `rising +${diff.toFixed(1)}` : `falling ${diff.toFixed(1)}`;
}

function formatReadings(values, labels) {
  return values.slice(-10).map((v, i) => `${labels.slice(-10)[i]}: ${v ?? 'null'}`).join(', ');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ message: 'ANTHROPIC_API_KEY not configured' });

  try {
    const { sensors, thresholds, device } = req.body;
    const { temperature, humidity, moisture, motion } = sensors;

    const prompt = `You are an IoT environmental monitoring AI. Analyze this real-time sensor data and return a JSON insights report.

Device: ${device}
Time: ${new Date().toLocaleString()}

TEMPERATURE (°C)
Readings: ${formatReadings(temperature.values, temperature.labels)}
Latest: ${temperature.latest !== null ? temperature.latest + '°C' : 'no data'}
Trend: ${getTrend(temperature.values)}
Thresholds: min=${thresholds.temp.min ?? 'none'}, max=${thresholds.temp.max ?? 'none'}

HUMIDITY (%)
Readings: ${formatReadings(humidity.values, humidity.labels)}
Latest: ${humidity.latest !== null ? humidity.latest + '%' : 'no data'}
Trend: ${getTrend(humidity.values)}
Thresholds: min=${thresholds.humi.min ?? 'none'}, max=${thresholds.humi.max ?? 'none'}

SOIL MOISTURE: ${moisture.latest === 1 ? 'Wet' : moisture.latest === 0 ? 'Dry' : 'no data'}
MOTION/PIR: ${motion.latest === 1 ? 'Active' : motion.latest === 0 ? 'Inactive' : 'no data'}

Return ONLY valid JSON, no markdown:
{
  "healthScore": <integer 0-100>,
  "healthLabel": "<Excellent|Good|Fair|Poor|Critical>",
  "predictedBreach": <null or string e.g. "Temperature breach in ~18 min">,
  "observations": ["<obs1>", "<obs2>", "<obs3>"]
}

Rules:
- healthScore: 90-100 optimal, 70-89 good, 50-69 fair, 30-49 poor, 0-29 critical
- predictedBreach: only if a clear trend will reach a threshold soon — estimate time. Otherwise null.
- observations: exactly 3, specific to this data, under 12 words each, no fluff`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }]
    });

    const raw = message.content[0].text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid response format from AI');

    const insights = JSON.parse(jsonMatch[0]);
    if (typeof insights.healthScore !== 'number') throw new Error('Missing health score');
    if (!Array.isArray(insights.observations) || insights.observations.length !== 3) throw new Error('Invalid observations');

    return res.status(200).json(insights);
  } catch (err) {
    console.error('Insights error:', err.message);
    return res.status(500).json({ message: err.message });
  }
};
