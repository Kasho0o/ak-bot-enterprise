require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha');
const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');
const pLimit = require('p-limit');

console.log('🚀 Bot starting at ' + new Date().toISOString());

// Validate required environment variables
const requiredVars = ['BOT_TOKEN', 'CHAT_ID', 'SHEETS_URL'];
const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars);
  process.exit(1);
}

try {
  new URL(process.env.SHEETS_URL);
  console.log('✅ SHEETS_URL is valid');
} catch (error) {
  console.error('❌ SHEETS_URL is invalid:', process.env.SHEETS_URL);
  process.exit(1);
}

puppeteer.use(StealthPlugin());
if (process.env.CAPSOLVER_KEY) {
  puppeteer.use(RecaptchaPlugin({ 
    provider: { id: 'capsolver', token: process.env.CAPSOLVER_KEY }, 
    visualFeedback: true
  }));
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const limit = pLimit(3);

class Logger {
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
    if (process.env.BOT_TOKEN && process.env.CHAT_ID) {
      try {
        const alert = [`🚨 CRITICAL: ${entry.message}`, `Time: ${entry.timestamp}`, `Profile: ${entry.metadata.profile || 'N/A'}`].join('\n');
        await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: process.env.CHAT_ID, text: alert })
        });
      } catch (error) { console.error('Alert failed:', error); }
    }
  }
}
const logger = new Logger();

class ConfigManager {
  constructor(sheetsUrl, cacheTtl = 5 * 60 * 1000) {
    this.sheetsUrl = sheetsUrl; 
    this.cache = null; 
    this.cacheExpiry = 0; 
    this.cacheTtl = cacheTtl;
  }
  async getConfigs() {
    const now = Date.now();
    if (this.cache && now < this.cacheExpiry) { 
      logger.info('Using cached configs'); 
      return this.cache; 
    }
    try {
      logger.info('Fetching fresh configs from Sheets');
      const response = await fetch(this.sheetsUrl, { timeout: 30000 });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const configs = await response.json();
      this.cache = configs; 
      this.cacheExpiry = now + this.cacheTtl;
      logger.info(`Loaded ${configs.length} configs`);
      return configs;
    } catch (error) {
      logger.error('Config fetch failed', { error: error.message });
      if (this.cache) { 
        logger.warn('Using expired cache'); 
        return this.cache; 
      }
      throw error;
    }
  }
}

// Enhanced Slot Detection
async function findAvailableSlots(page) {
  try {
    // Wait for calendar to load
    await page.waitForSelector('td.available, td.disponible', { timeout: 10000 });
    
    const slots = await page.evaluate(() => {
      const availableCells = Array.from(document.querySelectorAll('td.available, td.disponible'));
      return availableCells.map(cell => ({
        date: cell.textContent.trim(),
        element: cell
      }));
    });
    
    if (slots.length > 0) {
      const earliestSlot = slots[0];
      logger.success(`Found slot: ${earliestSlot.date}`);
      return earliestSlot.date;
    }
  } catch (error) {
    logger.warn('Slot detection failed:', error.message);
  }
  return null;
}

async function bookAppointment(config) {
  try {
    logger.info(`Starting check for ${config.province}`, { profile: config.province });
    await bot.telegram.sendMessage(process.env.CHAT_ID, `🚀 Check for ${config.province}...`);
    
    // Simple availability check (without Browserless for now)
    const mockResponse = await fetch('https://httpbin.org/delay/2');
    if (mockResponse.ok) {
      // This is where you'd normally check real availability
      // For testing, we'll just send a notification
      await bot.telegram.sendMessage(process.env.CHAT_ID, `✅ Checked ${config.province} - No errors (mock check)`);
      logger.success(`Checked ${config.province}`);
    }
    
  } catch (error) {
    logger.error(`Check failed for ${config.province}`, { error: error.message, profile: config.province });
    await bot.telegram.sendMessage(process.env.CHAT_ID, `❌ Error ${config.province}: ${error.message}`);
  }
}

async function main() {
  console.log('🚀 Main function started at ' + new Date().toISOString());
  try {
    const configManager = new ConfigManager(process.env.SHEETS_URL);
    let configs = await configManager.getConfigs();
    
    // Filter active configs
    configs = configs.filter(config => 
      config.active && 
      config.active.toString().toLowerCase() === 'yes'
    );
    
    logger.info(`Found ${configs.length} active configurations`);
    
    if (configs.length === 0) {
      await bot.telegram.sendMessage(process.env.CHAT_ID, `⚠️ No active configurations found`);
      return;
    }
    
    // Sort by priority
    configs.sort((a, b) => (a.priority || 3) - (b.priority || 3));
    
    // Run checks
    for (const config of configs) {
      await bookAppointment(config);
      // Add small delay between checks
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    await bot.telegram.sendMessage(process.env.CHAT_ID, `✅ All checks completed`);
    
  } catch (error) {
    console.error('Main function failed:', error);
    logger.error('Main failed', { error: error.message, critical: true });
    try {
      await bot.telegram.sendMessage(process.env.CHAT_ID, `❌ Main error: ${error.message}`);
    } catch (telegramError) {
      console.error('Failed to send Telegram error:', telegramError);
    }
  }
}

// Run immediately and then every 10 minutes
console.log('🚀 Bot initialization complete, starting main function...');
main().then(() => {
  console.log('✅ Initial run completed');
}).catch(error => {
  console.error('❌ Initial run failed:', error);
});

setInterval(main, 10 * 60 * 1000);
console.log('⏰ Cron job scheduled for every 10 minutes');
