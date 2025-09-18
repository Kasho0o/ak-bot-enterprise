require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha');
const { Telegraf } = require('telegraf');
const fs = require('fs');
const fetch = require('node-fetch');
const pLimit = require('p-limit');

puppeteer.use(StealthPlugin());
puppeteer.use(RecaptchaPlugin({ 
  provider: { id: 'capsolver', token: process.env.CAPSOLVER_KEY }, 
  visualFeedback: true,
  fallback: { id: '2captcha', token: process.env.TWOCAPTCHA_KEY } // Fallback per gpt.txt
}));

const bot = new Telegraf(process.env.BOT_TOKEN);
const limit = pLimit(3); // Throttling per gpt.txt/qwen.txt

// Enhanced Logger (qwen.txt)
class Logger {
  constructor() {
    this.fs = require('fs');
  }
  log(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level, message, metadata, pid: process.pid };
    const logMessage = JSON.stringify(logEntry);
    console[level.toLowerCase() === 'error' ? 'error' : 'log'](logMessage);
    const logFile = level === 'ERROR' ? 'error.log' : 'success.log';
    try { this.fs.appendFileSync(logFile, logMessage + '\n'); } catch (e) { console.error('Log write failed:', e); }
    if (level === 'ERROR' && metadata.critical) this.sendTelegramAlert(logEntry);
  }
  info(message, metadata) { this.log('INFO', message, metadata); }
  warn(message, metadata) { this.log('WARN', message, metadata); }
  error(message, metadata) { this.log('ERROR', message, metadata); }
  success(message, metadata) { this.log('SUCCESS', message, metadata); }
  async sendTelegramAlert(entry) {
    if (process.env.BOT_TOKEN && process.env.CHAT_ID) {
      try {
        const alert = [`🚨 CRITICAL: ${entry.message}`, `Time: ${entry.timestamp}`, `Profile: ${entry.metadata.profile || 'N/A'}`].join('\n');
        await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: process.env.CHAT_ID, text: alert })
        });
      } catch (e) { console.error('Alert failed:', e); }
    }
  }
}
const logger = new Logger();

// ConfigManager with Caching (qwen.txt)
class ConfigManager {
  constructor(sheetsUrl, cacheTtl = 5 * 60 * 1000) {
    this.sheetsUrl = sheetsUrl; this.cache = null; this.cacheExpiry = 0; this.cacheTtl = cacheTtl;
  }
  async getConfigs() {
    const now = Date.now();
    if (this.cache && now < this.cacheExpiry) { logger.info('Using cached configs'); return this.cache; }
    try {
      logger.info('Fetching fresh configs from Sheets');
      const response = await fetch(this.sheetsUrl, { timeout: 30000 });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const configs = await response.json();
      this.cache = configs; this.cacheExpiry = now + this.cacheTtl;
      logger.info(`Loaded ${configs.length} configs`);
      return configs;
    } catch (e) {
      logger.error('Config fetch failed', { error: e.message });
      if (this.cache) { logger.warn('Using expired cache'); return this.cache; }
      throw e;
    }
  }
  async refreshConfigs() { this.cache = null; this.cacheExpiry = 0; return this.getConfigs(); }
}

// Enhanced SMSManager with Retry (qwen.txt)
class SMSManager {
  constructor() { this.token = process.env.FIVESIM_TOKEN; this.baseUrl = 'https://5sim.net/v1/user'; this.maxRetries = 3; this.retryDelay = 5000; }
  async makeRequest(url, options = {}) {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, { ...options, timeout: 30000, headers: { 'Authorization': `Bearer ${this.token}`, 'Accept': 'application/json', ...(options.headers || {}) } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (e) {
        logger.warn(`SMS attempt ${attempt} failed: ${e.message}`);
        if (attempt === this.maxRetries) throw e;
        await new Promise(r => setTimeout(r, this.retryDelay * attempt));
      }
    }
  }
  async getNumber(country = 130, product = 'any') {
    logger.info(`Requesting Spain number (country: ${country})`);
    const data = await this.makeRequest(`${this.baseUrl}/buy/activation/${country}/${product}`);
    if (data.id && data.phone) { logger.success(`Got number: ${data.phone}`); return { id: data.id, phone: data.phone }; }
    throw new Error(JSON.stringify(data));
  }
  async getSMS(id) {
    const data = await this.makeRequest(`${this.baseUrl}/check/${id}`);
    if (data.sms && data.sms[0]) { logger.success(`SMS code: ${data.sms[0].code}`); return data.sms[0].code; }
    return null;
  }
  async waitForSMS(id, timeout = 120000) {
    logger.info(`Waiting for SMS (timeout: ${timeout / 1000}s)`);
    const start = Date.now(); let attempts = 0;
    while (Date.now() - start < timeout) {
      attempts++;
      try {
        const code = await this.getSMS(id);
        if (code) { logger.success(`SMS after ${attempts} attempts`); return code; }
        logger.info(`SMS check ${attempts}: No code`);
        await new Promise(r => setTimeout(r, 10000));
      } catch (e) {
        logger.warn(`SMS check ${attempts} failed: ${e.message}`);
        if (attempts >= 5) break;
        await new Promise(r => setTimeout(r, 5000));
      }
    }
    throw new Error(`SMS timeout after ${Math.round((Date.now() - start) / 1000)}s`);
  }
  async cancelOrder(id) {
    try { await this.makeRequest(`${this.baseUrl}/cancel/${id}`); logger.success(`Cancelled ${id}`); } catch (e) { logger.warn(`Cancel failed for ${id}: ${e.message}`); }
  }
}

// RetryManager (qwen.txt)
class RetryManager {
  static async executeWithRetry(operation, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`Attempt ${attempt}/${maxRetries}`);
        return await operation();
      } catch (e) {
        lastError = e; logger.warn(`Attempt ${attempt} failed: ${e.message}`);
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          logger.info(`Waiting ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    throw new Error(`Failed after ${maxRetries} attempts: ${lastError.message}`);
  }
}

// HealthMonitor with Metrics (qwen.txt)
class HealthMonitor {
  constructor(bot, chatId) {
    this.bot = bot; this.chatId = chatId;
    this.metrics = { totalRuns: 0, successfulBookings: 0, failedBookings: 0, avgRuntime: 0, lastRun: null };
  }
  async checkBalances() {
    const checks = [];
    // 5sim balance
    try {
      const simData = await fetch(`https://5sim.net/v1/user/balance`, { headers: { Authorization: `Bearer ${process.env.FIVESIM_TOKEN}` } }).then(r => r.json());
      checks.push(`📱 5sim: $${simData.balance || 0}`);
      if (simData.balance < 5) await this.bot.telegram.sendMessage(this.chatId, `⚠️ CRITICAL: 5sim low: $${simData.balance}`);
    } catch (e) { checks.push('📱 5sim: ❌'); logger.error('5sim check failed', { error: e.message }); }
    // Browserless
    try {
      const browserData = await fetch(`https://api.browserless.io/usage?token=${process.env.BROWSERLESS_TOKEN}`).then(r => r.json());
      checks.push(`🖥️ Browserless: ${browserData.hoursRemaining || 0}h`);
      if (browserData.hoursRemaining < 20) await this.bot.telegram.sendMessage(this.chatId, `⚠️ WARNING: Browserless low: ${browserData.hoursRemaining}h`);
    } catch (e) { checks.push('🖥️ Browserless: ❌'); logger.error('Browserless check failed', { error: e.message }); }
    // Capsolver
    try {
      const captchaData = await fetch('https://api.capsolver.com/getBalance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientKey: process.env.CAPSOLVER_KEY })
      }).then(r => r.json());
      checks.push(`🤖 Capsolver: $${captchaData.balance || 0}`);
    } catch (e) { checks.push('🤖 Capsolver: ❌'); logger.error('Capsolver check failed', { error: e.message }); }
    return checks;
  }
  async sendHealthReport() {
    try {
      const balances = await this.checkBalances();
      const report = [
        '📊 **HEALTH REPORT**',
        `🕐 Last: ${new Date().toLocaleString()}`,
        '',
        '**BALANCES**', ...balances,
        '',
        '**METRICS**',
        `📈 Runs: ${this.metrics.totalRuns}`,
        `✅ Success: ${this.metrics.successfulBookings}`,
        `❌ Failed: ${this.metrics.failedBookings}`,
        `🎯 Rate: ${this.metrics.totalRuns > 0 ? Math.round((this.metrics.successfulBookings / this.metrics.totalRuns) * 100) : 0}%`,
        `⏱️ Avg Time: ${Math.round(this.metrics.avgRuntime)}s`
      ].join('\n');
      await this.bot.telegram.sendMessage(this.chatId, report, { parse_mode: 'Markdown' });
    } catch (e) { logger.error('Report failed', { error: e.message }); }
  }
  recordRun(success, runtime) {
    this.metrics.totalRuns++;
    if (success) this.metrics.successfulBookings++; else this.metrics.failedBookings++;
    if (this.metrics.totalRuns === 1) this.metrics.avgRuntime = runtime;
    else this.metrics.avgRuntime = ((this.metrics.avgRuntime * (this.metrics.totalRuns - 1)) + runtime) / this.metrics.totalRuns;
    this.metrics.lastRun = new Date();
  }
}
const healthMonitor = new HealthMonitor(bot, process.env.CHAT_ID);
setInterval(() => healthMonitor.sendHealthReport(), 6 * 60 * 60 * 1000); // 6 hours

// Enhanced Slot Detection (qwen.txt)
async function findAvailableSlots(page, maxRetries = 3) {
  const strategies = [
    () => page.evaluate(() => Array.from(document.querySelectorAll('td.available, td.disponible')).filter(td => {
      const text = td.textContent.trim(); return text && /\d{1,2}\/\d{1,2}\/\d{4}/.test(text);
    }).map(td => ({ element: td, date: td.textContent.trim(), timestamp: new Date(td.textContent.trim()) })).sort((a, b) => a.timestamp - b.timestamp)),
    () => page.evaluate(() => {
      const tables = document.querySelectorAll('table[id*="cita"], .calendar, [class*="disponibilidad"]');
      const slots = []; tables.forEach(table => {
        table.querySelectorAll('td').forEach(cell => {
          const text = cell.textContent.trim();
          if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(text) && !cell.classList.contains('unavailable') && !cell.classList.contains('past')) {
            slots.push({ element: cell, date: text, timestamp: new Date(text) });
          }
        });
      }); return slots.sort((a, b) => a.timestamp - b.timestamp);
    }),
    () => page.evaluate(() => Array.from(document.querySelectorAll('td')).filter(td => {
      const style = window.getComputedStyle(td); const text = td.textContent.trim();
      return style.cursor === 'pointer' && /\d{1,2}\/\d{1,2}\/\d{4}/.test(text) && !td.classList.contains('unavailable');
    }).map(td => ({ element: td, date: td.textContent.trim(), timestamp: new Date(td.textContent.trim()) })).sort((a, b) => a.timestamp - b.timestamp))
  ];
  for (let strat = 0; strat < strategies.length; strat++) {
    for (let retry = 0; retry < maxRetries; retry++) {
      try {
        const slots = await strategies[strat]();
        if (slots.length > 0) {
          const earliest = slots[0];
          await page.evaluate(time => {
            const el = Array.from(document.querySelectorAll('td.available, td.disponible, td')).find(e => e.textContent.trim() === time);
            if (el) el.click();
          }, earliest.date);
          logger.success(`Earliest slot: ${earliest.date}`);
          return earliest.date;
        }
      } catch (e) { logger.warn(`Slot strat ${strat + 1} retry ${retry + 1} failed: ${e.message}`); }
    }
  }
  throw new Error('No slots found');
}

// Main bookAppointment (wrapped in RetryManager)
async function bookAppointment(config) {
  const startTime = Date.now();
  const smsManager = new SMSManager();
  let browser;
  try {
    // Browserless reconnect (gpt.txt/qwen.txt)
   let retries = 0;
while (retries < 3) {
  try {
    browser = await puppeteer.connect({
      browserWSEndpoint: `wss://chrome.browserless.io?token=${process.env.BROWSERLESS_TOKEN}`,
      defaultViewport: null
    });
    break;
  } catch (err) {  // Change 'e' to 'err'
    retries++;
    if (retries === 3) throw new Error('Browserless connection failed');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

      }
    }
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', req => { if (['image', 'stylesheet', 'font'].includes(req.resourceType())) req.abort(); else req.continue(); });

    logger.info(`Starting for ${config.province}`, { profile: config.province });
    await bot.telegram.sendMessage(process.env.CHAT_ID, `🚀 Check for ${config.province}...`);

    // Navigate & Form (selectors validated 2025-09-18)
    await page.goto('https://icpplus.sede.administracionespublicas.gob.es/icpplus/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => Array.from(document.querySelectorAll('a')).some(l => l.textContent.toLowerCase().includes('extranjería') || l.href.includes('extranjeria')), { timeout: 15000 });
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const link = links.find(l => l.textContent.toLowerCase().includes('extranjería') || l.href.includes('extranjeria'));
      if (link) link.click();
    });
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 });

    await page.waitForSelector('select[name="provincia"]', { timeout: 10000 }); await page.select('select[name="provincia"]', config.province);
    await page.waitForSelector('select[name="oficina"]', { timeout: 10000 }); await page.select('select[name="oficina"]', config.office);
    await page.waitForSelector('input[name="tramite"]', { timeout: 10000 }); await page.type('input[name="tramite"]', config.procedure);
    await page.click('input[value="Buscar"]');

    // CAPTCHA (fallback per gpt.txt)
    const { solved } = await page.solveRecaptchas();
    if (solved.length > 0) logger.success(`CAPTCHA solved for ${config.province}`);

    // Slot Polling with Enhanced Detection
    let slotFound = false; let delay = 30000;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const slotDate = await findAvailableSlots(page);
        slotFound = true;
        await bot.telegram.sendMessage(process.env.CHAT_ID, `🎉 Slot for ${config.province}: ${slotDate}`);
        break;
      } catch (e) {
        logger.warn(`Poll ${attempt + 1} for ${config.province}: ${e.message}`);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
        await new Promise(r => setTimeout(r, delay)); delay = Math.min(delay * 1.5, 300000);
      }
    }
    if (!slotFound) throw new Error(`No slots for ${config.province}`);

    // Form & SMS
    await page.type('input[name="nie"]', config.nie);
    const { id, phone } = await smsManager.getNumber();
    await page.type('input[name="telefono"]', phone);
    await page.type('input[name="email"]', config.email);
    await page.click('input[value="Continuar"]');
    const smsCode = await smsManager.waitForSMS(id);
    await page.type('#txtCodigoVerificacion', smsCode);
    await smsManager.cancelOrder(id); // Clean up

    // Dynamic selects
    await page.evaluate(() => { const selects = document.querySelectorAll('select'); selects.forEach(s => { if (s.options.length > 1) s.selectedIndex = 1; }); });

    // Submit with Retry (qwen.txt)
    for (let i = 0; i < 3; i++) {
      try {
        await page.click('#btnConfirmar');
        await page.waitForSelector('.success, .confirmacion, [class*="success"]', { timeout: 10000 });
        break;
      } catch (e) {
        logger.warn(`Submit retry ${i + 1} for ${config.province}: ${e.message}`);
        if (i === 2) throw e;
      }
    }

    await bot.telegram.sendMessage(process.env.CHAT_ID, `✅ Booked ${config.province}!`);
    logger.success(`Booked ${config.province}`);

  } catch (e) {
    logger.error(`Booking failed for ${config.province}`, { error: e.message, critical: true, profile: config.province });
    await bot.telegram.sendMessage(process.env.CHAT_ID, `❌ Error ${config.province}: ${e.message}`);
    throw e;
  } finally {
    if (browser) await browser.close();
    const runtime = Math.round((Date.now() - startTime) / 1000);
    healthMonitor.recordRun(!e, runtime);
  }
}

// Main: Priority Queue + Time Windows (gpt.txt)
async function main() {
  try {
    const configManager = new ConfigManager(process.env.SHEETS_URL);
    let configs = await configManager.getConfigs();
    const now = new Date();
    const currentHour = now.getHours() + now.getTimezoneOffset() / 60 + 1; // CET approx
    // Filter by time window (gpt.txt: ActiveWindow=08:00-12:00 CET)
    configs = configs.filter(c => {
      if (!c.activeWindow) return true;
      const [start, end] = c.activeWindow.split('-').map(t => parseInt(t.split(':')[0]));
      return currentHour >= start && currentHour <= end;
    });
    // Priority queue (gpt.txt: sort by Priority column 1-5, low=high priority)
    configs.sort((a, b) => (a.priority || 3) - (b.priority || 3));
    // Synthetic test: Always include a dummy row if marked 'test=true'
    const synthetic = configs.find(c => c.test); if (synthetic) logger.info('Running synthetic test');
    await Promise.all(configs.slice(0, 5).map(c => limit(() => RetryManager.executeWithRetry(() => bookAppointment(c)))));
  } catch (e) {
    logger.error('Main failed', { error: e.message, critical: true });
    await bot.telegram.sendMessage(process.env.CHAT_ID, `❌ Main error: ${e.message}`);
  }
}

// Run every 10 min (Railway cron) + initial
main();
setInterval(main, 10 * 60 * 1000);

