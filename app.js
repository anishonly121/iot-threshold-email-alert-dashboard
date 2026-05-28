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

function makeLineChart(canvasId, label, colorKey) {
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
            // Color segments red if they exceed thresholds
            if (colorKey !== 'temp' && colorKey !== 'humi') return colorConfig.border;
            
            const value = ctx.p1.parsed.y;
            if (isOutOfRange(value, colorKey)) {
              return 'rgba(252, 129, 129, 1)';
            }
            return colorConfig.border;
          },
          backgroundColor: (ctx) => {
            // Color background red if it exceeds thresholds
            if (colorKey !== 'temp' && colorKey !== 'humi') return createGradient(ctx.chart.ctx, colorConfig);
            
            const value = ctx.p1.parsed.y;
            if (isOutOfRange(value, colorKey)) {
              return 'rgba(252, 129, 129, 0.2)';
            }
            return createGradient(ctx.chart.ctx, colorConfig);
          }
        }
      }]
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
  tempChart = makeLineChart("tempChart", "Temperature (°C)", "temp");
  humiChart = makeLineChart("humiChart", "Humidity (%)", "humi");
  moisChart = makeLineChart("moisChart", "Moisture", "mois");
  pirChart  = makeLineChart("pirChart", "Motion", "pir");
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

    // Update charts
    tempChart.data.labels = tempSeries.labels;
    tempChart.data.datasets[0].data = tempSeries.values;
    tempChart.update('active');

    humiChart.data.labels = humiSeries.labels;
    humiChart.data.datasets[0].data = humiSeries.values;
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

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setStatus(`Updated at ${now}`);

    fetchInsights(tempSeries, humiSeries, moisSeries, pirSeries, latestTemp, latestHumi, latestMois, latestPir, fieldNum);
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

// --------------------- AI Insights ---------------------
const CIRCUMFERENCE = 314;

function setAIStatus(text) {
  const el = document.getElementById('aiStatus');
  if (el) el.textContent = text;
}

function setAILoading() {
  setAIStatus('Analyzing...');
  const obsEl = document.getElementById('observations');
  if (obsEl) {
    obsEl.innerHTML = `
      <li class="obs-skeleton"></li>
      <li class="obs-skeleton"></li>
      <li class="obs-skeleton"></li>
    `;
  }
}

function updateInsightsPanel(insights) {
  const { healthScore, healthLabel, predictedBreach, observations } = insights;

  const scoreEl  = document.getElementById('healthScore');
  const labelEl  = document.getElementById('healthLabel');
  const fillEl   = document.getElementById('healthFill');
  const breachEl = document.getElementById('breachWarning');
  const breachTextEl = document.getElementById('breachText');
  const obsEl    = document.getElementById('observations');

  if (scoreEl) scoreEl.textContent = healthScore;
  if (labelEl) labelEl.textContent = healthLabel;

  const color =
    healthScore >= 90 ? '#48bb78' :
    healthScore >= 70 ? '#63b3ed' :
    healthScore >= 50 ? '#fbd38d' :
    healthScore >= 30 ? '#ed8936' : '#fc8181';

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

async function fetchInsights(tempSeries, humiSeries, moisSeries, pirSeries, latestTemp, latestHumi, latestMois, latestPir, fieldNum) {
  setAILoading();

  try {
    const res = await fetch('/api/insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sensors: {
          temperature: { values: tempSeries.values, labels: tempSeries.labels, latest: latestTemp },
          humidity:    { values: humiSeries.values,  labels: humiSeries.labels,  latest: latestHumi },
          moisture:    { values: moisSeries.values,  labels: moisSeries.labels,  latest: latestMois },
          motion:      { values: pirSeries.values,   labels: pirSeries.labels,   latest: latestPir  }
        },
        thresholds,
        device: `Raspberry #${fieldNum}`
      })
    });

    if (!res.ok) throw new Error(`${res.status}`);
    const insights = await res.json();
    updateInsightsPanel(insights);
  } catch (err) {
    console.error('AI insights failed:', err.message);
    setAIStatus('Unavailable');
    const obsEl = document.getElementById('observations');
    if (obsEl) obsEl.innerHTML = `<li style="color:#718096">AI insights temporarily unavailable</li>`;
  }
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








