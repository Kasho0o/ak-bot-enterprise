require('dotenv').config();
const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');

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

const bot = new Telegraf(process.env.BOT_TOKEN);

class Logger {
  log(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level, message, metadata, pid: process.pid };
    const logMessage = JSON.stringify(logEntry);
    console[level.toLowerCase() === 'error' ? 'error' : 'log'](logMessage);
  }
  info(message, metadata) { this.log('INFO', message, metadata); }
  error(message, metadata) { this.log('ERROR', message, metadata); }
  success(message, metadata) { this.log('SUCCESS', message, metadata); }
}
const logger = new Logger();

class ConfigManager {
  constructor(sheetsUrl) {
    this.sheetsUrl = sheetsUrl;
  }
  async getConfigs() {
    try {
      logger.info('Fetching configs from Sheets');
      console.log('Fetching from URL:', this.sheetsUrl);
      
      const response = await fetch(this.sheetsUrl, { timeout: 30000 });
      console.log('Response status:', response.status);
      
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      
      const configs = await response.json();
      console.log('Raw configs received:', JSON.stringify(configs, null, 2));
      
      logger.info(`Loaded ${configs.length} configs`);
      return configs;
    } catch (error) {
      logger.error('Config fetch failed', { error: error.message });
      throw error;
    }
  }
}

async function main() {
  console.log('🚀 Main function started at ' + new Date().toISOString());
  try {
    await bot.telegram.sendMessage(process.env.CHAT_ID, `✅ Bot started - Debug mode`);
    
    const configManager = new ConfigManager(process.env.SHEETS_URL);
    const configs = await configManager.getConfigs();
    
    await bot.telegram.sendMessage(process.env.CHAT_ID, `📊 Raw data: ${JSON.stringify(configs)}`);
    
    // Show what we received
    console.log('Configs received:', configs);
    
    // Filter active configs
    const activeConfigs = configs.filter(config => {
      console.log('Checking config:', config);
      console.log('Active field:', config.active);
      console.log('Active type:', typeof config.active);
      
      if (config.active === undefined) {
        // Try to find any field that might contain "yes"
        const isActive = Object.values(config).some(val => 
          val && val.toString().toLowerCase() === 'yes'
        );
        console.log('Fallback active check:', isActive);
        return isActive;
      }
      
      return config.active && config.active.toString().toLowerCase() === 'yes';
    });
    
    console.log('Active configs:', activeConfigs);
    await bot.telegram.sendMessage(process.env.CHAT_ID, `🔍 Found ${configs.length} total configs, ${activeConfigs.length} active`);
    
    if (activeConfigs.length === 0) {
      await bot.telegram.sendMessage(process.env.CHAT_ID, `⚠️ No active configurations found. Check your Google Sheet data format.`);
    } else {
      for (const config of activeConfigs) {
        await bot.telegram.sendMessage(process.env.CHAT_ID, `🚀 Active config: ${config.province || 'Unknown'}`);
      }
    }
    
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

// Run once for debugging
main();
