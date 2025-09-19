require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha');
const { Telegraf } = require('telegraf');
const fs = require('fs');
const fetch = require('node-fetch');
const pLimit = require('p-limit');

console.log('🚀 Bot starting at ' + new Date().toISOString());
console.log('Checking environment variables...');

const requiredVars = ['BOT_TOKEN', 'CHAT_ID', 'SHEETS_URL', 'FIVESIM_TOKEN', 'CAPSOLVER_KEY', 'TWOCAPTCHA_KEY'];
const missingVars = requiredVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars);
  process.exit(1);
}
console.log('✅ All required environment variables present');

puppeteer.use(StealthPlugin());
puppeteer.use(RecaptchaPlugin({
  provider: { id: 'capsolver', token: process.env.CAPSOLVER_KEY },
  visualFeedback: true,
  fallback: { id: '2captcha', token: process.env.TWOCAPTCHA_KEY }
}));

const bot = new Telegraf(process.env.BOT_TOKEN);
const limit = pLimit(3);

class Logger {
  constructor() { this.fs = require('fs'); }
  log(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level, message, metadata, pid: process.pid };
    const logMessage = JSON.stringify(logEntry);
    console[level.toLowerCase() === 'error' ? 'error' : 'log'](logMessage);
    if (level === 'ERROR' && metadata.critical) this.sendTelegramAlert(logEntry);
  }
  info(message, metadata) { this.log('INFO', message, metadata); }
  warn(message, metadata) { this.log('WARN', message, metadata); }
  error(message, metadata) { this.log('ERROR', message, metadata); }
  success(message, metadata) { this.log('SUCCESS', message, metadata); }
  async sendTelegramAlert(entry) {
    try {
      const alert = [`🚨 CRITICAL: ${entry.message}`, `Time: ${entry.timestamp}`, `Profile: ${entry.metadata.profile || 'N/A'}`].join('\n');
      await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.CHAT_ID, text: alert })
      });
    } catch (error) { console.error('Alert failed:', error); }
  }
}
const logger = new Logger();

async function testTelegramConnection() {
  try {
    await bot.telegram.sendMessage(process.env.CHAT_ID, `✅ Bot started at ${new Date().toISOString()}`);
    console.log('✅ Telegram connection successful');
    return true;
  } catch (error) {
    console.error('❌ Telegram connection failed:', error.message);
    return false;
  }
}

class ConfigManager {
  constructor(sheetsUrl, cacheTtl = 5 * 60 * 1000) {
    this.sheetsUrl = sheetsUrl; this.cache = null; this.cacheExpiry = 0; this.cacheTtl = cacheTtl;
  }
  async getConfigs() {
    const now = Date.now();
    if (this.cache && now < this.cacheExpiry) { logger.info('Using cached configs'); return this.cache; }
    try {
      logger.info('Fetching fresh configs from Sheets', { url: this.sheetsUrl });
      const response = await fetch(this.sheetsUrl, { timeout: 30000 });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const configs = await response.json();
      this.cache = configs; this.cacheExpiry = now + this.cacheTtl;
      logger.info(`Loaded ${configs.length} configs`);
      return configs;
    } catch (error) {
      logger.error('Config fetch failed', { error: error.message, url: this.sheetsUrl });
      if (this.cache) { logger.warn('Using expired cache'); return this.cache; }
      throw error;
    }
  }
}

class SMSManager {
  constructor() { this.token = process.env.FIVESIM_TOKEN; this.baseUrl = 'https://5sim.net/v1/user'; this.maxRetries = 3; this.retryDelay = 5000; }
  async makeRequest(url, options = {}) {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, { ...options, timeout: 30000, headers: { 'Authorization': `Bearer ${this.token}`, 'Accept': 'application/json' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (error) {
        logger.warn(`SMS attempt ${attempt} failed: ${error.message}`);
        if (attempt === this.maxRetries) throw error;
        await new Promise(r => setTimeout(r, this.retryDelay * attempt));
      }
    }
  }
  async getNumber(country = 130) {
    const data = await this.makeRequest(`${this.baseUrl}/buy/activation/${country}/any`);
    if (data.id && data.phone) { logger.success(`Got number: ${data.phone}`); return { id: data.id, phone: data.phone }; }
    throw new Error(JSON.stringify(data));
  }
  async getSMS(id) {
    const data = await this.makeRequest(`${this.baseUrl}/check/${id}`);
    if (data.sms && data.sms[0]) return data.sms[0].code;
    return null;
  }
  async waitForSMS(id) {
    logger.info('Waiting for SMS...');
    const start = Date.now();
    while (Date.now() - start < 120000) {
      const code = await this.getSMS(id);
      if (code) { logger.success('SMS code received'); return code; }
      await new Promise(r => setTimeout(r, 10000));
    }
    throw new Error('SMS timeout');
  }
  async cancelOrder(id) {
    try { await this.makeRequest(`${this.baseUrl}/cancel/${id}`); logger.success('Order cancelled'); } catch (error) { logger.warn('Cancel failed:', error.message); }
  }
}

class RetryManager {
  static async executeWithRetry(operation, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`Attempt ${attempt}/${maxRetries}`);
        return await operation();
      } catch (error) {
        lastError = error; logger.warn(`Attempt ${attempt} failed: ${error.message}`);
        if (attempt < maxRetries) await new Promise(r => setTimeout(r, baseDelay * attempt));
      }
    }
    throw new Error(`Failed after ${maxRetries} attempts: ${lastError.message}`);
  }
}

class HealthMonitor {
  constructor(bot, chatId) {
    this.bot = bot; this.chatId = chatId;
    this.metrics = { totalRuns: 0, successfulBookings: 0, failedBookings: 0, avgRuntime: 0, lastRun: null };
  }
  async checkBalances() {
    const checks = [];
    try { const simData = await fetch(`https://5sim.net/v1/user/balance`, { headers: { Authorization: `Bearer ${process.env.FIVESIM_TOKEN}` } }).then(r => r.json()); checks.push(`📱 5sim: $${simData.balance || 0}`); } catch (error) { checks.push('📱 5sim: ❌'); }
    try { const browserData = await fetch(`https://api.browserless.io/usage?token=${process.env.BROWSERLESS_TOKEN}`).then(r => r.json()); checks.push(`🖥️ Browserless: ${browserData.hoursRemaining || 0}h`); } catch (error) { checks.push('🖥️ Browserless: ❌'); }
    try { const captchaData = await fetch('https://api.capsolver.com/getBalance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientKey: process.env.CAPSOLVER_KEY }) }).then(r => r.json()); checks.push(`🤖 Capsolver: $${captchaData.balance || 0}`); } catch (error) { checks.push('🤖 Capsolver: ❌'); }
    return checks;
  }
  async sendHealthReport() {
    try {
      const balances = await this.checkBalances();
      const report = ['📊 **HEALTH REPORT**', `🕐 Last: ${new Date().toLocaleString()}`, '', '**BALANCES**', ...balances, '', '**METRICS**', `📈 Runs: ${this.metrics.totalRuns}`, `✅ Success: ${this.metrics.successfulBookings}`, `❌ Failed: ${this.metrics.failedBookings}`, `🎯 Rate: ${this.metrics.totalRuns > 0 ? Math.round((this.metrics.successfulBookings / this.metrics.totalRuns) * 100) : 0}%`, `⏱️ Avg Time: ${Math.round(this.metrics.avgRuntime)}s`].join('\n');
      await bot.telegram.sendMessage(this.chatId, report, { parse_mode: 'Markdown' });
    } catch (error) { logger.error('Report failed', { error: error.message }); }
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
setInterval(() => healthMonitor.sendHealthReport(), 6 * 60 * 60 * 1000);

async function findAvailableSlots(page) {
  let retries = 0;
  while (retries < 3) {
    try {
      const slots = await page.evaluate(() => {
        const available = Array.from(document.querySelectorAll('td.available, td.disponible'))
          .filter(td => /\d{1,2}\/\d{1,2}\/\d{4}/.test(td.textContent.trim()))
          .map(td => ({ date: td.textContent.trim(), element: td }));
        return available.length ? available[0].date : null;
      });
      if (slots) {
        await page.evaluate(date => {
          const slot = document.querySelector(`td.available, td.disponible`);
          if (slot && slot.textContent.trim() === date) slot.click();
        }, slots);
        logger.success(`Earliest slot found: ${slots}`);
        return slots;
      }
    } catch (error) {
      retries++;
      logger.warn(`Slot detection attempt ${retries} failed: ${error.message}`);
      if (retries === 3) throw error;
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  throw new Error('No slots found after retries');
}

async function bookAppointment(config) {
  let success = false;
  const startTime = Date.now();
  let browser;
  try {
    logger.info(`Starting booking for ${config.province}`);
    await bot.telegram.sendMessage(process.env.CHAT_ID, `🚀 Starting automated booking for ${config.province}...`);

    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', req => { if (['image', 'stylesheet', 'font'].includes(req.resourceType())) req.abort(); else req.continue(); });

    let retries = 0;
    while (retries < 3) {
      try {
        await page.goto('https://icpplus.sede.administracionespublicas.gob.es/icpplus/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
        break;
      } catch (error) {
        retries++;
        logger.warn(`Page load attempt ${retries}/3 failed: ${error.message}`);
        if (retries === 3) throw error;
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    await page.waitForSelector('a[href*="extranjeria"]', { timeout: 15000 });
    await page.click('a[href*="extranjeria"]');
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 });

    await page.select('select[name="provincia"]', config.province);
    await page.select('select[name="oficina"]', config.office);
    await page.type('input[name="tramite"]', config.procedure);
    await page.click('input[value="Buscar"]');

    await page.solveRecaptchas();
    logger.success('CAPTCHA solved');

    const slotDate = await findAvailableSlots(page);
    await bot.telegram.sendMessage(process.env.CHAT_ID, `🎉 Slot found for ${config.province}: ${slotDate}`);

    await page.type('input[name="nie"]', config.nie);
    await page.type('input[name="nombre"]', config.name || 'Kashif'); // Assuming name field
    const { id, phone } = await new SMSManager().getNumber();
    await page.type('input[name="telefono"]', phone);
    await page.type('input[name="email"]', config.email);
    await page.click('input[value="Continuar"]');

    const smsCode = await new SMSManager().waitForSMS(id);
    await page.type('#txtCodigoVerificacion', smsCode);
    await new SMSManager().cancelOrder(id);

    await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      selects.forEach(s => { if (s.options.length > 1) s.selectedIndex = 1; });
    });

    await page.click('#btnConfirmar');
    await page.waitForSelector('.success, .confirmacion', { timeout: 10000 });

    await bot.telegram.sendMessage(process.env.CHAT_ID, `✅ Booking confirmed for ${config.province}!`);
    logger.success(`Booking confirmed for ${config.province}`);
    success = true;

  } catch (error) {
    logger.error(`Booking failed for ${config.province}`, { error: error.message, critical: true });
    await bot.telegram.sendMessage(process.env.CHAT_ID, `❌ Booking failed for ${config.province}: ${error.message}`);
  } finally {
    if (browser) await browser.close();
    const runtime = Math.round((Date.now() - startTime) / 1000);
    healthMonitor.recordRun(success, runtime);
  }
}

async function main() {
  console.log('🚀 Main function started at ' + new Date().toISOString());
  try {
    const telegramWorks = await testTelegramConnection();
    if (!telegramWorks) return;

    const configManager = new ConfigManager(process.env.SHEETS_URL);
    const configs = await configManager.getConfigs();
    if (configs.length === 0) {
      await bot.telegram.sendMessage(process.env.CHAT_ID, '⚠️ No active configurations found in Google Sheets');
      return;
    }

    await Promise.all(configs.map(config => limit(() => bookAppointment(config))));
  } catch (error) {
    console.error('Main function failed:', error);
    logger.error('Main failed', { error: error.message, critical: true });
    await bot.telegram.sendMessage(process.env.CHAT_ID, `❌ Main error: ${error.message}`);
  }
}

console.log('🚀 Bot initialization complete, starting main function...');
main().then(() => console.log('✅ Initial run completed')).catch(error => console.error('❌ Initial run failed:', error));
setInterval(main, 10 * 60 * 1000);
console.log('⏰ Cron job scheduled for every 10 minutes');
