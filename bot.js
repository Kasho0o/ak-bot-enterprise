require('dotenv').config();
const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');

console.log('🚀 Bot starting at ' + new Date().toISOString());

// Validate required environment variables
if (!process.env.BOT_TOKEN || !process.env.CHAT_ID || !process.env.SHEETS_URL) {
  console.error('❌ Missing required environment variables');
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

async function sendBookingInstructions(config) {
  try {
    logger.info(`Sending booking instructions for ${config.province}`, { profile: config.province });
    
    const instructions = [
      `🚨 **URGENT: BOOK NOW - SLOTS AVAILABLE** 🚨`,
      ``,
      `**Profile**: ${config.province}`,
      `**Office**: ${config.office}`,
      `**Procedure**: ${config.procedure}`,
      `**NIE**: ${config.nie}`,
      `**Email**: ${config.email}`,
      ``,
      `**📋 BOOKING STEPS:**`,
      `1. Go to: https://icp.administracionelectronica.gob.es/icpplus/index.html`,
      `2. Select "Extranjería"`,
      `3. Choose Province: ${config.province}`,
      `4. Choose Office: ${config.office}`,
      `5. Select Procedure: ${config.procedure}`,
      `6. Enter NIE: ${config.nie}`,
      `7. Enter Phone: Use 5sim number or +34 600 000 000`,
      `8. Enter Email: ${config.email}`,
      ``,
      `**⏰ ACT NOW - Slots are limited!**`,
      ``,
      `**📱 TIPS:**`,
      `- Have your NIE document ready`,
      `- Use a Spanish phone number (5sim recommended)`,
      `- Keep email open for verification code`,
      `- Be ready to solve CAPTCHA quickly`
    ].join('\n');
    
    await bot.telegram.sendMessage(process.env.CHAT_ID, instructions, { parse_mode: 'Markdown' });
    logger.success(`Booking instructions sent for ${config.province}`);
    
  } catch (error) {
    logger.error(`Failed to send instructions for ${config.province}`, { error: error.message });
    // Send simplified instructions
    await bot.telegram.sendMessage(process.env.CHAT_ID, 
      `🚨 SLOTS AVAILABLE FOR ${config.province.toUpperCase()}!\n` +
      `Go to: https://icp.administracionelectronica.gob.es/icpplus/index.html\n` +
      `Procedure: ${config.procedure}\n` +
      `NIE: ${config.nie}\n` +
      `Book NOW!`
    );
  }
}

async function main() {
  console.log('🚀 Main function started at ' + new Date().toISOString());
  try {
    await bot.telegram.sendMessage(process.env.CHAT_ID, `✅ Bot started - EMERGENCY SLOT ALERT`);
    
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
    
    // Send booking instructions for all active configs
    for (const config of configs) {
      await sendBookingInstructions(config);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Small delay
    }
    
    await bot.telegram.sendMessage(process.env.CHAT_ID, 
      `✅ **EMERGENCY INSTRUCTIONS SENT**\n` +
      `Check your messages above and BOOK IMMEDIATELY!\n` +
      `Slots are available RIGHT NOW!`, 
      { parse_mode: 'Markdown' }
    );
    
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

// Run immediately
console.log('🚀 Bot initialization complete, sending emergency instructions...');
main().then(() => {
  console.log('✅ Emergency instructions sent');
}).catch(error => {
  console.error('❌ Failed to send emergency instructions:', error);
});

// Also run every 2 minutes for continuous alerts
setInterval(main, 2 * 60 * 1000);
console.log('⏰ Emergency alerts scheduled for every 2 minutes');
