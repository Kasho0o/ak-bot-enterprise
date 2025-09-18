require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha');
const { Telegraf } = require('telegraf');
const fs = require('fs');
const fetch = require('node-fetch');
const pLimit = require('p-limit');

// Add immediate startup logging
console.log('🚀 Bot starting at ' + new Date().toISOString());
console.log('Checking environment variables...');

// Validate required environment variables
const requiredVars = ['BOT_TOKEN', 'CHAT_ID', 'SHEETS_URL'];
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

// Enhanced Logger with Telegram alerts
class Logger {
  constructor() {
    this.fs = require('fs');
  }
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

// Test Telegram connection immediately
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

// ConfigManager with better error handling
class ConfigManager {
  constructor(sheetsUrl, cacheTtl = 5 * 60 * 1000) {
    this.sheetsUrl = sheetsUrl; this.cache = null; this.cacheExpiry = 0; this.cacheTtl = cacheTtl;
  }
  async getConfigs() {
    const now = Date.now();
    if (this.cache && now < this.cacheExpiry) { 
      logger.info('Using cached configs'); 
      return this.cache; 
    }
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

// Simplified booking function for testing
async function testBooking() {
  try {
    logger.info('Starting test run');
    const configManager = new ConfigManager(process.env.SHEETS_URL);
    const configs = await configManager.getConfigs();
    logger.info(`Found ${configs.length} configurations`);
    
    if (configs.length > 0) {
      const firstConfig = configs[0];
      await bot.telegram.sendMessage(process.env.CHAT_ID, `🚀 Test check for ${firstConfig.province || 'Unknown'}...`);
      logger.info(`Test message sent for ${firstConfig.province}`);
    } else {
      await bot.telegram.sendMessage(process.env.CHAT_ID, `⚠️ No configurations found in Google Sheets`);
      logger.warn('No configurations found in Google Sheets');
    }
  } catch (error) {
    logger.error('Test booking failed', { error: error.message, critical: true });
    await bot.telegram.sendMessage(process.env.CHAT_ID, `❌ Test failed: ${error.message}`);
  }
}

// Main function
async function main() {
  console.log('🚀 Main function started at ' + new Date().toISOString());
  try {
    // Test Telegram first
    const telegramWorks = await testTelegramConnection();
    if (!telegramWorks) {
      console.error('Cannot proceed without Telegram connection');
      return;
    }
    
    // Run test booking
    await testBooking();
    
  } catch (error) {
    console.error('Main function failed:', error);
    logger.error('Main failed', { error: error.message, critical: true });
  }
}

// Run immediately and then every 10 minutes
console.log('🚀 Bot initialization complete, starting main function...');
main().then(() => {
  console.log('✅ Initial run completed');
}).catch(error => {
  console.error('❌ Initial run failed:', error);
});

// Set up cron job
setInterval(main, 10 * 60 * 1000);

console.log('⏰ Cron job scheduled for every 10 minutes');
