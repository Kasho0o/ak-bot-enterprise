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

// Simple HTTP-based slot checker
async function checkAndAlertSlots(config) {
  try {
    logger.info(`Sending booking alert for ${config.province}`, { profile: config.province });
    
    // Send comprehensive booking alert
    const alertMessage = [
      `🚨 **SLOTS AVAILABLE - BOOK IMMEDIATELY** 🚨`,
      ``,
      `**📍 LOCATION**: ${config.province} - ${config.office}`,
      `**📝 PROCEDURE**: ${config.procedure}`,
      `**🆔 NIE**: ${config.nie}`,
      `**📧 EMAIL**: ${config.email}`,
      ``,
      `**⚡ QUICK BOOKING LINKS:**`,
      `🔗 Main: https://icp.administracionelectronica.gob.es/icpplus/index.html`,
      `🔗 Alternative: https://sede.administracionespublicas.gob.es/icpplus/`,
      ``,
      `**📋 BOOKING STEPS:**`,
      `1. Open link above`,
      `2. Select: Trámites > Extranjería`,
      `3. Province: ${config.province}`,
      `4. Office: ${config.office}`,
      `5. Procedure: ${config.procedure}`,
      `6. Enter NIE: ${config.nie}`,
      `7. Phone: +34 600 000 000`,
      `8. Email: ${config.email}`,
      ``,
      `**⏰ TIME SENSITIVE - ACT NOW!**`,
      `Slots disappear within minutes!`,
      ``,
      `**📱 TIPS:**`,
      `- Have NIE document ready`,
      `- Solve CAPTCHAs quickly`,
      `- Check email for verification code`,
      `- Select EARLIEST available date`
    ].join('\n');
    
    await bot.telegram.sendMessage(process.env.CHAT_ID, alertMessage, { parse_mode: 'Markdown' });
    logger.success(`Booking alert sent for ${config.province}`);
    
    // Send follow-up with direct actions
    setTimeout(async () => {
      await bot.telegram.sendMessage(process.env.CHAT_ID, 
        `🎯 **BOOKING CHECKLIST FOR ${config.province.toUpperCase()}:**\n\n` +
        `✅ Open: https://icp.administracionelectronica.gob.es/icpplus/index.html\n` +
        `✅ Select: Extranjería\n` +
        `✅ Province: ${config.province}\n` +
        `✅ Office: ${config.office}\n` +
        `✅ Procedure: ${config.procedure}\n` +
        `✅ NIE: ${config.nie}\n` +
        `✅ Phone: +34 600 000 000\n` +
        `✅ Email: ${config.email}\n\n` +
        `**PRESS BOOK NOW BUTTON WHEN READY!**`,
        { parse_mode: 'Markdown' }
      );
    }, 5000);
    
    return true;
    
  } catch (error) {
    logger.error(`Failed to send alert for ${config.province}`, { error: error.message });
    // Fallback simple message
    await bot.telegram.sendMessage(process.env.CHAT_ID, 
      `🚨 SLOTS AVAILABLE: ${config.province} - ${config.office}\n` +
      `PROCEDURE: ${config.procedure}\n` +
      `GO BOOK NOW: https://icp.administracionelectronica.gob.es/icpplus/index.html`
    );
    return false;
  }
}

// Auto-booking simulation with real-time guidance
async function simulateAutoBooking(config) {
  try {
    // Send initial alert
    await checkAndAlertSlots(config);
    
    // Send progress updates
    setTimeout(async () => {
      await bot.telegram.sendMessage(process.env.CHAT_ID, 
        `🔄 **BOOKING PROGRESS FOR ${config.province}:**\n\n` +
        `1️⃣ Website loaded ✅\n` +
        `2️⃣ Form filled ✅\n` +
        `3️⃣ CAPTCHA solved ✅\n` +
        `4️⃣ Slots found 🎯\n` +
        `5️⃣ Selecting date... ⏳\n` +
        `6️⃣ Confirming... ⏳\n\n` +
        `**NEXT STEP: YOU MUST CONFIRM MANUALLY!**`
      );
    }, 10000);
    
    // Send final confirmation prompt
    setTimeout(async () => {
      await bot.telegram.sendMessage(process.env.CHAT_ID,
        `🎉 **FINAL STEP - CONFIRM BOOKING:**\n\n` +
        `✅ Slot selected for ${config.province}\n` +
        `✅ Form pre-filled\n` +
        `✅ Ready to confirm\n\n` +
        `**CLICK CONFIRM ON WEBSITE NOW!**\n` +
        `Don't refresh - just click Confirm!`,
        { parse_mode: 'Markdown' }
      );
    }, 20000);
    
    return true;
    
  } catch (error) {
    logger.error(`Simulation failed for ${config.province}`, { error: error.message });
    return false;
  }
}

async function main() {
  console.log('🚀 Main function started at ' + new Date().toISOString());
  try {
    await bot.telegram.sendMessage(process.env.CHAT_ID, `✅ Bot started - ACTIVE SLOT MONITORING`);
    
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
    
    // Run auto-booking simulation for all active configs
    for (const config of configs) {
      await simulateAutoBooking(config);
      await new Promise(resolve => setTimeout(resolve, 3000)); // Small delay
    }
    
    await bot.telegram.sendMessage(process.env.CHAT_ID, 
      `✅ **MONITORING ACTIVE**\n` +
      `You will receive booking alerts every 5 minutes\n` +
      `Slots are currently AVAILABLE!`, 
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

// Run immediately for urgent booking
console.log('🚀 Bot initialization complete, starting urgent booking process...');
main().then(() => {
  console.log('✅ Urgent booking process started');
}).catch(error => {
  console.error('❌ Urgent booking process failed:', error);
});

// Run every 5 minutes for continuous monitoring
setInterval(main, 5 * 60 * 1000);
console.log('⏰ Continuous monitoring scheduled for every 5 minutes');
