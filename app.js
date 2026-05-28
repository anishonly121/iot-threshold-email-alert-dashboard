// =====================
// PUBLIC 4-CHANNEL SETUP (NO READ KEYS NEEDED)
// =====================
const CHANNELS = {
  temp: "3229661",   // temp
  pir:  "3007090",   // light (used as PIR/light)
  humi: "3230062",   // humidity
  mois: "3230067",   // moisture
};

const RESULTS = 30;
const AUTO_REFRESH_MS = 30000;
const SENDGRID_ALERT_ENDPOINT = '/api/send-alert';

// =====================
// THRESHOLD CONFIGURATION
// =====================
let thresholds = {
  temp: { min: null, max: null },
  humi: { min: null, max: null }
};

let emailAlerts = {
  toEmail: '',
  cooldownMinutes: 1
};

let alertState = {};

// Load thresholds from localStorage
function loadThresholds() {
  const stored = localStorage.getItem('iot_thresholds');
  if (stored) {
    try {
      thresholds = JSON.parse(stored);
    } catch (e) {
      console.error('Failed to load thresholds:', e);
    }
  }
}

// Save thresholds to localStorage
function saveThresholdsToStorage() {
  localStorage.setItem('iot_thresholds', JSON.stringify(thresholds));
}

function loadEmailAlerts() {
  const stored = localStorage.getItem('iot_email_alerts');
  if (stored) {
    try {
      emailAlerts = { ...emailAlerts, ...JSON.parse(stored) };
    } catch (e) {
      console.error('Failed to load email alert settings:', e);
    }
  }
}

function saveEmailAlertsToStorage() {
  localStorage.setItem('iot_email_alerts', JSON.stringify(emailAlerts));
}

function loadAlertState() {
  const stored = localStorage.getItem('iot_alert_state');
  if (stored) {
    try {
      alertState = JSON.parse(stored);
    } catch (e) {
      console.error('Failed to load alert state:', e);
      alertState = {};
    }
  }
}

function saveAlertState() {
  localStorage.setItem('iot_alert_state', JSON.stringify(alertState));
}


// --------------------- Helpers ---------------------
function buildFieldUrl(channelId, fieldNum) {
  return `https://api.thingspeak.com/channels/${channelId}/fields/${fieldNum}.json?results=${RESULTS}`;
}

async function fetchField(channelId, fieldNum) {
  const res = await fetch(buildFieldUrl(channelId, fieldNum));
  if (!res.ok) throw new Error(`HTTP ${res.status} for channel ${channelId} field${fieldNum}`);
  return res.json();
}

function parseFeedsToSeries(data, fieldNum) {
  const key = `field${fieldNum}`;
  const labels = [];
  const values = [];

  for (const feed of data.feeds || []) {
    const date = new Date(feed.created_at);
    labels.push(date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    const v = feed[key];
    values.push(v === null ? null : Number(v));
  }
  return { labels, values };
}

function latestValue(values) {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] !== null && !Number.isNaN(values[i])) return values[i];
  }
  return null;
}

function formatValue(value, type) {
  if (value === null || value === undefined) return "—";
  
  switch(type) {
    case 'temp':
      return value.toFixed(1);
    case 'humi':
      return value.toFixed(0);
    case 'mois':
    case 'pir':
      return value === 1 ? 'Active' : 'Inactive';
    default:
      return value.toString();
  }
}

// Check if value is outside threshold range
function isOutOfRange(value, type) {
  if (value === null || value === undefined) return false;
  if (type !== 'temp' && type !== 'humi') return false;
  
  const threshold = thresholds[type];
  if (threshold.min !== null && value < threshold.min) return true;
  if (threshold.max !== null && value > threshold.max) return true;
  return false;
}

// Get threshold line color based on type
function getThresholdColor(type) {
  return type === 'temp' ? 'rgba(252, 129, 129, 0.8)' : 'rgba(99, 179, 237, 0.8)';
}

function getBreach(value, type) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  if (type !== 'temp' && type !== 'humi') return null;

  const threshold = thresholds[type];
  if (threshold.min !== null && value < threshold.min) return 'below_min';
  return null;
}

function getMetricLabel(type) {
  if (type === 'temp') return 'Temperature';
  if (type === 'humi') return 'Humidity';
  return type;
}

function getBreachLabel() {
  return 'below minimum';
}

function canSendEmailAlert() {
  return Boolean(emailAlerts.toEmail && isValidEmail(emailAlerts.toEmail));
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}



async function sendEmailAlert(type, value, breach, fieldNum) {
  const thresholdValue = thresholds[type].min;
  const payload = {
    toEmail: emailAlerts.toEmail,
    metric: getMetricLabel(type),
    value: type === 'temp' ? value.toFixed(1) : value.toFixed(0),
    threshold: thresholdValue,
    condition: getBreachLabel(breach),
    device: `Raspberry #${fieldNum}`,
    time: new Date().toLocaleString()
  };

  const res = await fetch(SENDGRID_ALERT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alert API failed: ${res.status} ${text}`);
  }
}

async function handleThresholdAlerts(latestTemp, latestHumi, fieldNum) {
  if (!canSendEmailAlert()) return;

  const now = Date.now();
  const cooldownMs = Math.max(1, Number(emailAlerts.cooldownMinutes) || 30) * 60 * 1000;
  const checks = [
    { type: 'temp', value: latestTemp },
    { type: 'humi', value: latestHumi }
  ];

  for (const check of checks) {
    const breach = getBreach(check.value, check.type);
    const stateKey = `${fieldNum}:${check.type}`;
    const state = alertState[stateKey] || { breach: null, lastSentAt: 0 };

    if (!breach) {
      if (state.breach !== null) {
        alertState[stateKey] = { breach: null, lastSentAt: state.lastSentAt || 0 };
      }
      continue;
    }

    const isNewBreach = state.breach !== breach;
    const isCooldownElapsed = now - (state.lastSentAt || 0) >= cooldownMs;
    if (!isNewBreach && !isCooldownElapsed) continue;

    try {
      const metricLabel = getMetricLabel(check.type);
      const formattedValue = check.type === 'temp' ? check.value.toFixed(1) : check.value.toFixed(0);
      const thresholdValue = thresholds[check.type].min;

      showToast(`${metricLabel} below threshold (${formattedValue} < ${thresholdValue}) — sending alert...`, 'warning');

      await sendEmailAlert(check.type, check.value, breach, fieldNum);
      alertState[stateKey] = { breach, lastSentAt: now };
      setStatus(`Alert sent: ${metricLabel} ${getBreachLabel()}`);
      showToast(`Alert email sent to ${emailAlerts.toEmail}`, 'success');
    } catch (err) {
      console.error('Failed to send email alert:', err);
      setStatus(`Alert email failed: ${err.message}`, true);
      showToast(`Email failed: ${err.message}`, 'error');
    }
  }

  saveAlertState();
}


// --------------------- Chart Configuration ---------------------
const chartColors = {
  temp: {
    border: 'rgba(252, 129, 129, 1)',
    background: 'rgba(252, 129, 129, 0.2)',
    gradient: ['rgba(252, 129, 129, 0.4)', 'rgba(252, 129, 129, 0.05)']
  },
  humi: {
    border: 'rgba(99, 179, 237, 1)',
    background: 'rgba(99, 179, 237, 0.2)',
    gradient: ['rgba(99, 179, 237, 0.4)', 'rgba(99, 179, 237, 0.05)']
  },
  mois: {
    border: 'rgba(104, 211, 145, 1)',
    background: 'rgba(104, 211, 145, 0.2)',
    gradient: ['rgba(104, 211, 145, 0.4)', 'rgba(104, 211, 145, 0.05)']
  },
  pir: {
    border: 'rgba(251, 211, 141, 1)',
    background: 'rgba(251, 211, 141, 0.2)',
    gradient: ['rgba(251, 211, 141, 0.4)', 'rgba(251, 211, 141, 0.05)']
  }
};

// --------------------- Charts ---------------------
let tempChart, humiChart, moisChart, pirChart;

function createGradient(ctx, colorConfig) {
  const gradient = ctx.createLinearGradient(0, 0, 0, 280);
  gradient.addColorStop(0, colorConfig.gradient[0]);
  gradient.addColorStop(1, colorConfig.gradient[1]);
  return gradient;
}

function makeLineChart(canvasId, label, colorKey, withSPC = false) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  const colorConfig = chartColors[colorKey];
  
  const chartConfig = {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        label: label,
        data: [],
        borderColor: colorConfig.border,
        backgroundColor: createGradient(ctx, colorConfig),
        borderWidth: 2.5,
        tension: 0.4,
        fill: true,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: colorConfig.border,
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointHoverBackgroundColor: colorConfig.border,
        pointHoverBorderColor: '#ffffff',
        pointHoverBorderWidth: 3,
        segment: {
          borderColor: (ctx) => {
            if (colorKey !== 'temp' && colorKey !== 'humi') return colorConfig.border;
            return isOutOfRange(ctx.p1.parsed.y, colorKey) ? 'rgba(252, 129, 129, 1)' : colorConfig.border;
          },
          backgroundColor: (ctx) => {
            if (colorKey !== 'temp' && colorKey !== 'humi') return createGradient(ctx.chart.ctx, colorConfig);
            return isOutOfRange(ctx.p1.parsed.y, colorKey) ? 'rgba(252, 129, 129, 0.2)' : createGradient(ctx.chart.ctx, colorConfig);
          }
        }
      },
      ...(withSPC ? [
        {
          label: 'EWMA',
          data: [],
          borderColor: 'rgba(255, 255, 255, 0.4)',
          borderWidth: 1.5,
          borderDash: [5, 3],
          fill: false,
          pointRadius: 0,
          pointHoverRadius: 0,
          tension: 0.4,
          order: 1
        },
        {
          label: 'UCL 2σ',
          data: [],
          borderColor: colorConfig.border.replace('1)', '0.25)'),
          borderWidth: 1,
          borderDash: [3, 3],
          backgroundColor: colorConfig.border.replace('1)', '0.07)'),
          fill: '+1',
          pointRadius: 0,
          pointHoverRadius: 0,
          tension: 0,
          order: 0
        },
        {
          label: 'LCL 2σ',
          data: [],
          borderColor: colorConfig.border.replace('1)', '0.25)'),
          borderWidth: 1,
          borderDash: [3, 3],
          fill: false,
          pointRadius: 0,
          pointHoverRadius: 0,
          tension: 0,
          order: 0
        }
      ] : [])
    ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 750,
        easing: 'easeInOutQuart'
      },
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          filter: item => item.datasetIndex < 2,
          backgroundColor: 'rgba(15, 22, 36, 0.95)',
          titleColor: '#e8eef6',
          bodyColor: '#e8eef6',
          borderColor: colorConfig.border,
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          titleFont: {
            size: 13,
            weight: '600'
          },
          bodyFont: {
            size: 14,
            weight: '700'
          },
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              if (context.parsed.y !== null) {
                if (colorKey === 'mois' || colorKey === 'pir') {
                  label += context.parsed.y === 1 ? 'Active' : 'Inactive';
                } else if (colorKey === 'temp') {
                  label += context.parsed.y.toFixed(1) + '°C';
                  if (isOutOfRange(context.parsed.y, colorKey)) {
                    label += ' ⚠️ OUT OF RANGE';
                  }
                } else if (colorKey === 'humi') {
                  label += context.parsed.y.toFixed(0) + '%';
                  if (isOutOfRange(context.parsed.y, colorKey)) {
                    label += ' ⚠️ OUT OF RANGE';
                  }
                }
              }
              return label;
            }
          }
        },
        annotation: {
          annotations: {}
        }
      },
      scales: {
        y: {
          beginAtZero: colorKey === 'mois' || colorKey === 'pir',
          grid: {
            color: 'rgba(99, 179, 237, 0.08)',
            borderColor: 'rgba(99, 179, 237, 0.2)'
          },
          ticks: {
            color: '#a0aec0',
            font: {
              size: 11,
              weight: '500'
            },
            callback: function(value) {
              if (colorKey === 'mois' || colorKey === 'pir') {
                return value === 1 ? 'Active' : 'Inactive';
              }
              return value;
            }
          }
        },
        x: {
          grid: {
            color: 'rgba(99, 179, 237, 0.05)',
            borderColor: 'rgba(99, 179, 237, 0.2)'
          },
          ticks: {
            color: '#a0aec0',
            font: {
              size: 11,
              weight: '500'
            },
            maxRotation: 45,
            minRotation: 0
          }
        }
      }
    },
    plugins: [{
      id: 'thresholdLines',
      afterDatasetsDraw(chart) {
        if (colorKey !== 'temp' && colorKey !== 'humi') return;
        
        const { ctx, chartArea: { top, bottom, left, right }, scales: { y } } = chart;
        const threshold = thresholds[colorKey];
        
        ctx.save();
        
        // Draw max threshold line
        if (threshold.max !== null) {
          const yPos = y.getPixelForValue(threshold.max);
          if (yPos >= top && yPos <= bottom) {
            ctx.strokeStyle = 'rgba(252, 129, 129, 0.8)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(left, yPos);
            ctx.lineTo(right, yPos);
            ctx.stroke();
            
            // Draw label
            ctx.fillStyle = 'rgba(252, 129, 129, 1)';
            ctx.font = 'bold 11px system-ui';
            ctx.fillText(`MAX: ${threshold.max}`, left + 5, yPos - 5);
            
            // Fill area above max with red tint
            ctx.fillStyle = 'rgba(252, 129, 129, 0.1)';
            ctx.fillRect(left, top, right - left, yPos - top);
          }
        }
        
        // Draw min threshold line
        if (threshold.min !== null) {
          const yPos = y.getPixelForValue(threshold.min);
          if (yPos >= top && yPos <= bottom) {
            ctx.strokeStyle = 'rgba(252, 129, 129, 0.8)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(left, yPos);
            ctx.lineTo(right, yPos);
            ctx.stroke();
            
            // Draw label
            ctx.fillStyle = 'rgba(252, 129, 129, 1)';
            ctx.font = 'bold 11px system-ui';
            ctx.fillText(`MIN: ${threshold.min}`, left + 5, yPos + 15);
            
            // Fill area below min with red tint
            ctx.fillStyle = 'rgba(252, 129, 129, 0.1)';
            ctx.fillRect(left, yPos, right - left, bottom - yPos);
          }
        }
        
        ctx.restore();
      }
    }]
  };
  
  return new Chart(ctx, chartConfig);
}

function initCharts() {
  tempChart = makeLineChart("tempChart", "Temperature (°C)", "temp", true);
  humiChart = makeLineChart("humiChart", "Humidity (%)",     "humi", true);
  moisChart = makeLineChart("moisChart", "Moisture",         "mois");
  pirChart  = makeLineChart("pirChart",  "Motion",           "pir");
}

// --------------------- UI ---------------------
const statusEl = document.getElementById("status");
const fieldSelect = document.getElementById("fieldSelect");
const refreshBtn = document.getElementById("refreshBtn");

const latestTempEl = document.getElementById("latestTemp");
const latestHumiEl = document.getElementById("latestHumi");
const latestMoisEl = document.getElementById("latestMois");
const latestPirEl  = document.getElementById("latestPir");

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  const dot = document.querySelector('.status-dot');
  if (dot) {
    dot.style.background = isError ? '#f56565' : '#48bb78';
  }
}

function updateLatestValue(element, value, type) {
  const formatted = formatValue(value, type);
  
  // Add animation class
  element.style.opacity = '0.5';
  element.style.transform = 'scale(0.95)';
  
  setTimeout(() => {
    element.textContent = formatted;
    element.style.opacity = '1';
    element.style.transform = 'scale(1)';
    
    // Add warning class if out of range
    if (isOutOfRange(value, type)) {
      element.classList.add('warning');
    } else {
      element.classList.remove('warning');
    }
  }, 150);
}

async function refreshDashboard() {
  const fieldNum = Number(fieldSelect.value);

  // Disable refresh button during load
  refreshBtn.disabled = true;
  refreshBtn.style.opacity = '0.6';

  try {
    setStatus("Loading...");

    const [tempData, humiData, moisData, pirData] = await Promise.all([
      fetchField(CHANNELS.temp, fieldNum),
      fetchField(CHANNELS.humi, fieldNum),
      fetchField(CHANNELS.mois, fieldNum),
      fetchField(CHANNELS.pir,  fieldNum),
    ]);

    const tempSeries = parseFeedsToSeries(tempData, fieldNum);
    const humiSeries = parseFeedsToSeries(humiData, fieldNum);
    const moisSeries = parseFeedsToSeries(moisData, fieldNum);
    const pirSeries  = parseFeedsToSeries(pirData,  fieldNum);

    // Compute SPC statistics
    const tempStats  = rollingStats(tempSeries.values);
    const humiStats  = rollingStats(humiSeries.values);
    const tempBands  = buildControlBands(tempSeries.values, tempStats);
    const humiBands  = buildControlBands(humiSeries.values, humiStats);
    const tempZ      = getZScore(latestValue(tempSeries.values), tempStats);
    const humiZ      = getZScore(latestValue(humiSeries.values), humiStats);
    const correlation = pearsonCorrelation(tempSeries.values, humiSeries.values);
    const sigmaEvents = countSigmaEvents(tempSeries.values, tempStats)
                      + countSigmaEvents(humiSeries.values, humiStats);

    // Update charts with SPC overlays
    tempChart.data.labels = tempSeries.labels;
    tempChart.data.datasets[0].data = tempSeries.values;
    tempChart.data.datasets[1].data = computeEWMA(tempSeries.values);
    tempChart.data.datasets[2].data = tempBands.upper;
    tempChart.data.datasets[3].data = tempBands.lower;
    tempChart.update('active');

    humiChart.data.labels = humiSeries.labels;
    humiChart.data.datasets[0].data = humiSeries.values;
    humiChart.data.datasets[1].data = computeEWMA(humiSeries.values);
    humiChart.data.datasets[2].data = humiBands.upper;
    humiChart.data.datasets[3].data = humiBands.lower;
    humiChart.update('active');

    moisChart.data.labels = moisSeries.labels;
    moisChart.data.datasets[0].data = moisSeries.values;
    moisChart.update('active');

    pirChart.data.labels = pirSeries.labels;
    pirChart.data.datasets[0].data = pirSeries.values;
    pirChart.update('active');

    // Update latest values with animation
    const latestTemp = latestValue(tempSeries.values);
    const latestHumi = latestValue(humiSeries.values);
    const latestMois = latestValue(moisSeries.values);
    const latestPir = latestValue(pirSeries.values);

    updateLatestValue(latestTempEl, latestTemp, 'temp');
    updateLatestValue(latestHumiEl, latestHumi, 'humi');
    updateLatestValue(latestMoisEl, latestMois, 'mois');
    updateLatestValue(latestPirEl, latestPir, 'pir');
    await handleThresholdAlerts(latestTemp, latestHumi, fieldNum);

    updateTrendArrow('trendTemp', latestTemp, previousValues.temp);
    updateTrendArrow('trendHumi', latestHumi, previousValues.humi);
    previousValues.temp = latestTemp;
    previousValues.humi = latestHumi;

    runInsights(tempSeries, humiSeries, moisSeries, pirSeries,
                latestTemp, latestHumi, latestMois, latestPir, fieldNum,
                tempStats, humiStats, tempZ, humiZ, correlation, sigmaEvents);

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setStatus(`Updated at ${now}`);
    startCountdown();
  } catch (err) {
    console.error('Dashboard refresh error:', err);
    setStatus("Error loading data", true);
    
    // Show error details in console for debugging
    console.error('Error details:', {
      message: err.message,
      stack: err.stack
    });
  } finally {
    // Re-enable refresh button
    refreshBtn.disabled = false;
    refreshBtn.style.opacity = '1';
  }
}

// --------------------- Threshold Modal Management ---------------------
function openThresholdModal() {
  const modal = document.getElementById('thresholdModal');
  modal.classList.add('active');
  
  // Populate current values
  document.getElementById('tempMin').value = thresholds.temp.min ?? '';
  document.getElementById('tempMax').value = thresholds.temp.max ?? '';
  document.getElementById('humiMin').value = thresholds.humi.min ?? '';
  document.getElementById('humiMax').value = thresholds.humi.max ?? '';
  document.getElementById('alertToEmail').value = emailAlerts.toEmail || '';
}

function closeThresholdModal() {
  const modal = document.getElementById('thresholdModal');
  modal.classList.remove('active');
}

function saveThresholds() {
  // Get values from inputs
  const tempMin = parseFloat(document.getElementById('tempMin').value);
  const tempMax = parseFloat(document.getElementById('tempMax').value);
  const humiMin = parseFloat(document.getElementById('humiMin').value);
  const humiMax = parseFloat(document.getElementById('humiMax').value);
  const toEmail = document.getElementById('alertToEmail').value.trim();
  // Validate and update thresholds
  thresholds.temp.min = isNaN(tempMin) ? null : tempMin;
  thresholds.temp.max = isNaN(tempMax) ? null : tempMax;
  thresholds.humi.min = isNaN(humiMin) ? null : humiMin;
  thresholds.humi.max = isNaN(humiMax) ? null : humiMax;
  
  // Validate min < max
  if (thresholds.temp.min !== null && thresholds.temp.max !== null && thresholds.temp.min >= thresholds.temp.max) {
    showToast('Temperature minimum must be less than maximum', 'error');
    return;
  }

  if (thresholds.humi.min !== null && thresholds.humi.max !== null && thresholds.humi.min >= thresholds.humi.max) {
    showToast('Humidity minimum must be less than maximum', 'error');
    return;
  }

  if (toEmail && !isValidEmail(toEmail)) {
    showToast('Please enter a valid recipient email address', 'error');
    return;
  }

  emailAlerts.toEmail = toEmail;
  emailAlerts.cooldownMinutes = 1;
  
  // Save to localStorage
  saveThresholdsToStorage();
  saveEmailAlertsToStorage();
  
  // Refresh charts to show new thresholds
  refreshDashboard();
  
  closeThresholdModal();
  setStatus('Thresholds updated');
  showToast('Thresholds saved', 'success');
}

function resetThresholds() {
  thresholds = { temp: { min: null, max: null }, humi: { min: null, max: null } };
  saveThresholdsToStorage();

  document.getElementById('tempMin').value = '';
  document.getElementById('tempMax').value = '';
  document.getElementById('humiMin').value = '';
  document.getElementById('humiMax').value = '';

  refreshDashboard();
  setStatus('Thresholds reset');
  showToast('Thresholds reset to default', 'info');
}

// =====================
// STATISTICAL PROCESS CONTROL ENGINE
// =====================

function rollingStats(values) {
  const valid = values.filter(v => v !== null && !isNaN(v));
  if (valid.length < 2) return { mean: null, stdDev: null, n: valid.length };
  const n = valid.length;
  const mean = valid.reduce((a, b) => a + b, 0) / n;
  const variance = valid.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n - 1);
  return { mean: Math.round(mean * 100) / 100, stdDev: Math.round(Math.sqrt(variance) * 100) / 100, n };
}

function computeEWMA(values, lambda = 0.3) {
  const result = new Array(values.length).fill(null);
  let ewma = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || isNaN(v)) { result[i] = ewma; continue; }
    ewma = ewma === null ? v : lambda * v + (1 - lambda) * ewma;
    result[i] = Math.round(ewma * 100) / 100;
  }
  return result;
}

function buildControlBands(values, stats, sigma = 2) {
  if (stats.mean === null || stats.stdDev === null) {
    return { upper: new Array(values.length).fill(null), lower: new Array(values.length).fill(null) };
  }
  return {
    upper: values.map(v => v !== null ? Math.round((stats.mean + sigma * stats.stdDev) * 10) / 10 : null),
    lower: values.map(v => v !== null ? Math.round((stats.mean - sigma * stats.stdDev) * 10) / 10 : null)
  };
}

function pearsonCorrelation(xs, ys) {
  const pairs = xs.map((x, i) => [x, ys[i]])
    .filter(([x, y]) => x !== null && y !== null && !isNaN(x) && !isNaN(y));
  if (pairs.length < 4) return null;
  const n = pairs.length;
  const meanX = pairs.reduce((a, [x])    => a + x, 0) / n;
  const meanY = pairs.reduce((a, [, y])  => a + y, 0) / n;
  const num   = pairs.reduce((a, [x, y]) => a + (x - meanX) * (y - meanY), 0);
  const denX  = Math.sqrt(pairs.reduce((a, [x])   => a + Math.pow(x - meanX, 2), 0));
  const denY  = Math.sqrt(pairs.reduce((a, [, y]) => a + Math.pow(y - meanY, 2), 0));
  if (denX === 0 || denY === 0) return null;
  return Math.round((num / (denX * denY)) * 100) / 100;
}

function getZScore(value, stats) {
  if (value === null || stats.mean === null || !stats.stdDev) return null;
  return Math.round(((value - stats.mean) / stats.stdDev) * 10) / 10;
}

function countSigmaEvents(values, stats, threshold = 2) {
  if (stats.mean === null || !stats.stdDev) return 0;
  return values.filter(v => v !== null && !isNaN(v) && Math.abs(v - stats.mean) > threshold * stats.stdDev).length;
}

// --------------------- Intelligence Engine ---------------------
const CIRCUMFERENCE = 314;
let previousValues = { temp: null, humi: null };

function linReg(values) {
  const n = values.length;
  if (n < 2) return { slope: 0 };
  const xs = Array.from({ length: n }, (_, i) => i);
  const sumX  = xs.reduce((a, b) => a + b, 0);
  const sumY  = values.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * values[i], 0);
  const sumXX = xs.reduce((acc, x) => acc + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { slope: 0 };
  return { slope: (n * sumXY - sumX * sumY) / denom };
}

function validSlice(values, n = 10) {
  return values.filter(v => v !== null && !isNaN(v)).slice(-n);
}

function scoreMetric(values, thresh) {
  const valid = validSlice(values, 5);
  if (!valid.length) return 50;
  const cur = valid[valid.length - 1];
  const { min, max } = thresh;
  if (min === null && max === null) return 75;
  if (min !== null && max !== null) {
    if (cur < min) return Math.max(0, 50 - Math.min(50, ((min - cur) / (max - min)) * 100));
    if (cur > max) return Math.max(0, 50 - Math.min(50, ((cur - max) / (max - min)) * 100));
    const center = (min + max) / 2;
    return Math.round(100 - (Math.abs(cur - center) / ((max - min) / 2)) * 25);
  }
  if (min !== null) return cur < min ? Math.max(0, 40 - (min - cur) * 5) : Math.min(100, 75 + (cur - min) * 0.5);
  if (max !== null) return cur > max ? Math.max(0, 40 - (cur - max) * 5) : Math.min(100, 75 + (max - cur) * 0.5);
  return 75;
}

function predictBreach(values, threshold, direction) {
  if (threshold === null) return null;
  const valid = validSlice(values, 10);
  if (valid.length < 4) return null;
  const { slope } = linReg(valid);
  const cur = valid[valid.length - 1];
  if (direction === 'min' && slope >= -0.05) return null;
  if (direction === 'max' && slope <=  0.05) return null;
  if (direction === 'min' && cur <= threshold) return null;
  if (direction === 'max' && cur >= threshold) return null;
  const steps = Math.abs((cur - threshold) / slope);
  const mins  = Math.round(steps * 0.5);
  return mins >= 1 && mins <= 90 ? mins : null;
}

function computeInsights(tempSeries, humiSeries, moisSeries, pirSeries,
                          latestTemp, latestHumi, latestMois, latestPir, fieldNum,
                          tempStats, humiStats, tempZ, humiZ, correlation) {
  const tempScore = scoreMetric(tempSeries.values, thresholds.temp);
  const humiScore = scoreMetric(humiSeries.values, thresholds.humi);
  const dataScore = (latestTemp !== null && latestHumi !== null) ? 100 : 50;

  const tempZPenalty = tempZ !== null ? Math.min(25, Math.max(0, (Math.abs(tempZ) - 1.5) * 12)) : 0;
  const humiZPenalty = humiZ !== null ? Math.min(25, Math.max(0, (Math.abs(humiZ) - 1.5) * 12)) : 0;
  const corrPenalty  = correlation !== null && Math.abs(correlation) < 0.3 ? 10 : 0;

  const healthScore = Math.round(Math.max(0,
    tempScore * 0.38 + humiScore * 0.38 + dataScore * 0.14 - tempZPenalty * 0.5 - humiZPenalty * 0.5 - corrPenalty
  ));

  const healthLabel =
    healthScore >= 90 ? 'Excellent' :
    healthScore >= 75 ? 'Good' :
    healthScore >= 55 ? 'Fair' :
    healthScore >= 35 ? 'Poor' : 'Critical';

  const breachCandidates = [
    { key: 'tempMin', mins: predictBreach(tempSeries.values, thresholds.temp.min, 'min'), label: m => `Temperature breach in ~${m} min` },
    { key: 'tempMax', mins: predictBreach(tempSeries.values, thresholds.temp.max, 'max'), label: m => `Temp. max breach in ~${m} min` },
    { key: 'humiMin', mins: predictBreach(humiSeries.values, thresholds.humi.min, 'min'), label: m => `Humidity breach in ~${m} min` },
    { key: 'humiMax', mins: predictBreach(humiSeries.values, thresholds.humi.max, 'max'), label: m => `Humidity max breach in ~${m} min` },
  ].filter(b => b.mins !== null).sort((a, b) => a.mins - b.mins);

  const predictedBreach = breachCandidates.length ? breachCandidates[0].label(breachCandidates[0].mins) : null;

  const tempValid = validSlice(tempSeries.values, 8);
  const humiValid = validSlice(humiSeries.values, 8);
  const { slope: tempSlope } = tempValid.length >= 3 ? linReg(tempValid) : { slope: 0 };
  const { slope: humiSlope } = humiValid.length >= 3 ? linReg(humiValid) : { slope: 0 };

  const observations = [];

  // Temperature observation — Z-score aware
  if (latestTemp === null) {
    observations.push('No temperature data received from ThingSpeak');
  } else if (tempZ !== null && Math.abs(tempZ) > 2.5) {
    observations.push(`Temperature is ${Math.abs(tempZ).toFixed(1)}σ ${tempZ < 0 ? 'below' : 'above'} rolling mean — statistically anomalous`);
  } else if (isOutOfRange(latestTemp, 'temp')) {
    observations.push(`Temperature ${latestTemp.toFixed(1)}°C is outside configured range`);
  } else if (breachCandidates.find(b => b.key === 'tempMin')) {
    const m = breachCandidates.find(b => b.key === 'tempMin').mins;
    observations.push(`Temperature falling — threshold breach predicted in ~${m} min`);
  } else if (Math.abs(tempSlope) > 0.15) {
    const dir = tempSlope > 0 ? 'rising' : 'falling';
    observations.push(`Temperature ${dir} at ${Math.abs(tempSlope).toFixed(2)}°C/reading — currently ${latestTemp.toFixed(1)}°C`);
  } else {
    observations.push(`Temperature stable at ${latestTemp.toFixed(1)}°C — within normal range`);
  }

  // Humidity observation — Z-score aware
  if (latestHumi === null) {
    observations.push('No humidity data received from ThingSpeak');
  } else if (humiZ !== null && Math.abs(humiZ) > 2.5) {
    observations.push(`Humidity is ${Math.abs(humiZ).toFixed(1)}σ ${humiZ < 0 ? 'below' : 'above'} rolling mean — statistically anomalous`);
  } else if (isOutOfRange(latestHumi, 'humi')) {
    observations.push(`Humidity ${latestHumi.toFixed(0)}% is outside configured range`);
  } else if (breachCandidates.find(b => b.key === 'humiMin')) {
    const m = breachCandidates.find(b => b.key === 'humiMin').mins;
    observations.push(`Humidity declining — threshold breach predicted in ~${m} min`);
  } else if (Math.abs(humiSlope) > 0.2) {
    const dir = humiSlope > 0 ? 'rising' : 'falling';
    observations.push(`Humidity ${dir} — currently at ${latestHumi.toFixed(0)}%`);
  } else {
    observations.push(`Humidity stable at ${latestHumi.toFixed(0)}% — within normal range`);
  }

  // Correlation + moisture/motion observation
  const mois = latestMois === 1 ? 'Wet' : latestMois === 0 ? 'Dry' : null;
  const pir  = latestPir  === 1 ? 'active' : latestPir  === 0 ? 'inactive' : null;

  if (correlation !== null && Math.abs(correlation) < 0.3) {
    observations.push(`T-H correlation breakdown (r=${correlation}) — possible environmental event or sensor fault`);
  } else if (mois === 'Dry' && pir === 'inactive') {
    observations.push('Soil moisture low and no motion detected — environment is idle');
  } else if (mois === 'Dry') {
    observations.push('Soil moisture is low — consider watering soon');
  } else if (pir === 'active') {
    observations.push('Motion detected — activity present in monitored area');
  } else if (mois === 'Wet') {
    observations.push('Soil moisture adequate — no irrigation needed');
  } else {
    observations.push('All sensors reading within expected parameters');
  }

  return { healthScore, healthLabel, predictedBreach, observations };
}

function setAIStatus(text) {
  const el = document.getElementById('aiStatus');
  if (el) el.textContent = text;
}

function updateInsightsPanel(insights) {
  const { healthScore, healthLabel, predictedBreach, observations } = insights;

  const scoreEl      = document.getElementById('healthScore');
  const labelEl      = document.getElementById('healthLabel');
  const fillEl       = document.getElementById('healthFill');
  const breachEl     = document.getElementById('breachWarning');
  const breachTextEl = document.getElementById('breachText');
  const obsEl        = document.getElementById('observations');

  if (scoreEl) scoreEl.textContent = healthScore;
  if (labelEl) labelEl.textContent = healthLabel;

  const color =
    healthScore >= 90 ? '#48bb78' :
    healthScore >= 75 ? '#63b3ed' :
    healthScore >= 55 ? '#fbd38d' :
    healthScore >= 35 ? '#ed8936' : '#fc8181';

  if (fillEl) {
    fillEl.style.strokeDashoffset = CIRCUMFERENCE * (1 - healthScore / 100);
    fillEl.style.stroke = color;
  }
  if (scoreEl) scoreEl.style.color = color;

  if (breachEl && breachTextEl) {
    if (predictedBreach) {
      breachEl.classList.add('visible');
      breachTextEl.textContent = predictedBreach;
    } else {
      breachEl.classList.remove('visible');
    }
  }

  if (obsEl && observations) {
    obsEl.innerHTML = observations
      .map((obs, i) => `<li style="animation-delay:${i * 0.1}s">${obs}</li>`)
      .join('');
  }

  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  setAIStatus(`Updated ${now}`);
}

function updateStatsStrip(tempStats, humiStats, tempZ, humiZ, correlation, sigmaEvents) {
  function set(id, val, dec = 2) {
    const el = document.getElementById(id);
    if (el) el.textContent = val !== null ? (typeof val === 'number' ? val.toFixed(dec) : val) : '—';
  }
  function colorZ(id, z) {
    const el = document.getElementById(id);
    if (!el || z === null) return;
    const a = Math.abs(z);
    el.style.color = a > 3 ? '#fc8181' : a > 2 ? '#ed8936' : a > 1 ? '#fbd38d' : '#68d391';
  }
  function colorR(id, r) {
    const el = document.getElementById(id);
    if (!el || r === null) return;
    const a = Math.abs(r);
    el.style.color = a > 0.7 ? '#68d391' : a > 0.3 ? '#fbd38d' : '#fc8181';
  }
  function colorSigma(id, n) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.color = n > 5 ? '#fc8181' : n > 2 ? '#fbd38d' : '#68d391';
  }

  set('statTempMean',   tempStats.mean,   1);
  set('statTempStdDev', tempStats.stdDev, 2);
  set('statTempZ',      tempZ,            1);
  set('statHumiMean',   humiStats.mean,   1);
  set('statHumiStdDev', humiStats.stdDev, 2);
  set('statHumiZ',      humiZ,            1);
  set('statCorr',       correlation,      2);
  set('statSigmaEvents', sigmaEvents,     0);

  colorZ('statTempZ', tempZ);
  colorZ('statHumiZ', humiZ);
  colorR('statCorr', correlation);
  colorSigma('statSigmaEvents', sigmaEvents);
}

function runInsights(tempSeries, humiSeries, moisSeries, pirSeries,
                     latestTemp, latestHumi, latestMois, latestPir, fieldNum,
                     tempStats, humiStats, tempZ, humiZ, correlation, sigmaEvents) {
  const insights = computeInsights(
    tempSeries, humiSeries, moisSeries, pirSeries,
    latestTemp, latestHumi, latestMois, latestPir, fieldNum,
    tempStats, humiStats, tempZ, humiZ, correlation
  );
  updateInsightsPanel(insights);
  updateStatsStrip(tempStats, humiStats, tempZ, humiZ, correlation, sigmaEvents);
}

// --------------------- Trend Arrows ---------------------
function updateTrendArrow(id, current, previous) {
  const el = document.getElementById(id);
  if (!el || current === null || previous === null) return;
  const diff = current - previous;
  if (Math.abs(diff) < 0.2) { el.textContent = ''; el.className = 'trend-arrow'; return; }
  el.textContent = diff > 0 ? '↑' : '↓';
  el.className   = `trend-arrow ${diff > 0 ? 'up' : 'down'}`;
}

// --------------------- Countdown Timer ---------------------
let countdownValue = 30;
let countdownInterval = null;

function startCountdown() {
  countdownValue = AUTO_REFRESH_MS / 1000;
  clearInterval(countdownInterval);
  const el = document.getElementById('countdown');
  countdownInterval = setInterval(() => {
    countdownValue = Math.max(0, countdownValue - 1);
    if (el) {
      el.textContent = `${countdownValue}s`;
      el.className   = countdownValue <= 5 ? 'urgent' : '';
    }
  }, 1000);
}

// --------------------- Toast Notifications ---------------------
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    error:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
    warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
    info:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
  };

  toast.innerHTML = `${icons[type] || icons.info}<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// --------------------- Start ---------------------
function init() {
  // Load thresholds from localStorage
  loadThresholds();
  loadEmailAlerts();
  loadAlertState();
  
  // Initialize charts and load data
  initCharts();
  refreshDashboard();

  // Event listeners
  refreshBtn.addEventListener("click", refreshDashboard);
  fieldSelect.addEventListener("change", refreshDashboard);
  
  // Threshold modal event listeners
  const thresholdBtn = document.getElementById('thresholdBtn');
  const closeModalBtn = document.getElementById('closeModal');
  const saveThresholdsBtn = document.getElementById('saveThresholds');
  const resetThresholdsBtn = document.getElementById('resetThresholds');
  const modal = document.getElementById('thresholdModal');
  
  thresholdBtn.addEventListener('click', openThresholdModal);
  closeModalBtn.addEventListener('click', closeThresholdModal);
  saveThresholdsBtn.addEventListener('click', saveThresholds);
  resetThresholdsBtn.addEventListener('click', resetThresholds);  
  // Close modal when clicking outside
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeThresholdModal();
    }
  });
  
  // Close modal with Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      closeThresholdModal();
    }
  });
  
  // Auto-refresh
  setInterval(refreshDashboard, AUTO_REFRESH_MS);
  
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}








