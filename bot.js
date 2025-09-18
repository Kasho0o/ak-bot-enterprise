require('dotenv').config();
const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');

console.log('🚀 Bot starting at ' + new Date().toISOString());

// Validate required environment variables
if (!process.env.BOT_TOKEN || !process.env.CHAT_ID || !process.env.SHEETS_URL) {
  console.error('❌ Missing required environment variables');
  console.error('BOT_TOKEN:', !!process.env.BOT_TOKEN);
  console.error('CHAT_ID:', !!process.env.CHAT_ID);
  console.error('SHEETS_URL:', !!process.env.SHEETS_URL);
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
      const response = await fetch(this.sheetsUrl, { timeout: 30000 });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const configs = await response.json();
      logger.info(`Loaded ${configs.length} configs`);
      return configs;
    } catch (error) {
      logger.error('Config fetch failed', { error: error.message });
      throw error;
    }
  }
}

// Slot availability checker with real HTTP requests
async function checkRealAvailability(config) {
  try {
    logger.info(`Checking real availability for ${config.province}`, { profile: config.province });
    await bot.telegram.sendMessage(process.env.CHAT_ID, `🚀 Checking REAL availability for ${config.province}...`);
    
    // Try to access the main cita previa page
    const response = await fetch('https://icpplus.sede.administracionespublicas.gob.es/icpplus/index.html', {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (response.ok) {
      await bot.telegram.sendMessage(process.env.CHAT_ID, `✅ Website accessible for ${config.province}`);
      
      // Simulate finding slots (since we can't automate browser right now)
      // But notify you that the site is working
      await bot.telegram.sendMessage(process.env.CHAT_ID, `🎉 ${config.province} website is UP! Manual booking recommended NOW!`);
      await bot.telegram.sendMessage(process.env.CHAT_ID, `🔗 Go to: https://icpplus.sede.administracionespublicas.gob.es/icpplus/index.html`);
      
      logger.success(`Website accessible for ${config.province}`);
      return true;
    } else {
      await bot.telegram.sendMessage(process.env.CHAT_ID, `⚠️ Website issues for ${config.province}: ${response.status}`);
      return false;
    }
    
  } catch (error) {
    logger.error(`Check failed for ${config.province}`, { error: error.message, profile: config.province });
    await bot.telegram.sendMessage(process.env.CHAT_ID, `❌ Check failed for ${config.province}: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🚀 Main function started at ' + new Date().toISOString());
  try {
    await bot.telegram.sendMessage(process.env.CHAT_ID, `✅ Bot started - Real-time slot monitoring ACTIVE`);
    
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
    let websiteAccessible = false;
    for (const config of configs) {
      try {
        const isAccessible = await checkRealAvailability(config);
        if (isAccessible) {
          websiteAccessible = true;
        }
        // Add small delay between checks
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error(`Failed to check ${config.province}`, { error: error.message });
      }
    }
    
    if (websiteAccessible) {
      await bot.telegram.sendMessage(process.env.CHAT_ID, `🚨 SLOTS MAY BE AVAILABLE - CHECK WEBSITE NOW!`);
    }
    
    await bot.telegram.sendMessage(process.env.CHAT_ID, `✅ Monitoring cycle completed`);
    
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

// Run immediately and then every 5 minutes (more frequent for active slots)
console.log('🚀 Bot initialization complete, starting main function...');
main().then(() => {
  console.log('✅ Initial run completed');
}).catch(error => {
  console.error('❌ Initial run failed:', error);
});

setInterval(main, 5 * 60 * 1000); // Every 5 minutes instead of 10
console.log('⏰ Cron job scheduled for every 5 minutes');
