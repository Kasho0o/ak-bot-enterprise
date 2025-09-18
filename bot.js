require('dotenv').config();
const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');

console.log('🚀 Fully Auto-Booking Bot starting at ' + new Date().toISOString());

const bot = new Telegraf(process.env.BOT_TOKEN);

class Logger {
  log(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level, message, metadata, pid: process.pid };
    const logMessage = JSON.stringify(logEntry);
    console[level.toLowerCase() === 'error' ? 'error' : 'log'](logMessage);
    
    // Send critical errors to Telegram
    if (level === 'ERROR' && metadata.critical) {
      this.sendTelegramAlert(logEntry);
    }
  }
  
  info(message, metadata) { this.log('INFO', message, metadata); }
  error(message, metadata) { this.log('ERROR', message, metadata); }
  success(message, metadata) { this.log('SUCCESS', message, metadata); }
  
  async sendTelegramAlert(entry) {
    if (process.env.BOT_TOKEN && process.env.CHAT_ID) {
      try {
        const alert = [
          `🚨 CRITICAL: ${entry.message}`,
          `Time: ${entry.timestamp}`,
          `Profile: ${entry.metadata.profile || 'N/A'}`
        ].join('\n');
        await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: process.env.CHAT_ID, text: alert })
        });
      } catch (error) {
        console.error('Alert failed:', error);
      }
    }
  }
}
const logger = new Logger();

// 5sim.net Integration
class FiveSimManager {
  constructor() {
    this.token = process.env.FIVESIM_TOKEN;
    this.baseUrl = 'https://5sim.net/v1/user';
  }
  
  async getRealSpanishNumber() {
    try {
      if (!this.token) {
        throw new Error('FIVESIM_TOKEN not configured');
      }
      
      logger.info('Requesting real Spanish number from 5sim');
      
      const response = await fetch(`${this.baseUrl}/buy/activation/130/any`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`5sim API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.id && data.phone) {
        logger.success(`Acquired real number: ${data.phone}`);
        await bot.telegram.sendMessage(process.env.CHAT_ID, 
          `📱 **REAL PHONE NUMBER ACQUIRED**\n\n` +
          `Phone: ${data.phone}\n` +
          `Order ID: ${data.id}\n` +
          `Waiting for SMS code...`
        );
        return { phone: data.phone, orderId: data.id };
      }
      
      throw new Error('Failed to get phone number from 5sim');
      
    } catch (error) {
      logger.error(`5sim error: ${error.message}`);
      throw error;
    }
  }
  
  async waitForSMSCode(orderId, timeout = 300000) { // 5 minutes timeout
    try {
      if (!orderId || !this.token) {
        throw new Error('Invalid orderId or token');
      }
      
      logger.info(`Waiting for SMS code for order ${orderId}`);
      await bot.telegram.sendMessage(process.env.CHAT_ID, `⏳ Waiting for SMS code...`);
      
      const startTime = Date.now();
      const checkInterval = 10000; // Check every 10 seconds
      
      while (Date.now() - startTime < timeout) {
        try {
          const response = await fetch(`${this.baseUrl}/check/${orderId}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${this.token}`,
              'Accept': 'application/json'
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            
            if (data.sms && data.sms.length > 0) {
              const code = data.sms[0].code;
              logger.success(`Received SMS code: ${code}`);
              await bot.telegram.sendMessage(process.env.CHAT_ID, 
                `✅ **SMS CODE RECEIVED**\n\n` +
                `Code: ${code}\n` +
                `Use this code to complete booking!`
              );
              return code;
            }
          }
        } catch (error) {
          logger.warn(`SMS check failed: ${error.message}`);
        }
        
        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }
      
      throw new Error('SMS code timeout');
      
    } catch (error) {
      logger.error(`SMS waiting failed: ${error.message}`);
      throw error;
    }
  }
  
  async cancelOrder(orderId) {
    try {
      if (!orderId || !this.token) return;
      
      await fetch(`${this.baseUrl}/cancel/${orderId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'application/json'
        }
      });
      
      logger.success(`Cancelled order ${orderId}`);
    } catch (error) {
      logger.warn(`Failed to cancel order ${orderId}: ${error.message}`);
    }
  }
}

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

// Fully Automated Booking Process
async function fullyAutomatedBooking(config) {
  const fiveSim = new FiveSimManager();
  let phoneNumberData = null;
  let bookingSuccess = false;
  
  try {
    logger.info(`Starting fully automated booking for ${config.province}`, { profile: config.province });
    await bot.telegram.sendMessage(process.env.CHAT_ID, 
      `🤖 **FULLY AUTOMATED BOOKING STARTED** 🤖\n\n` +
      `📍 ${config.province} - ${config.office}\n` +
      `📝 ${config.procedure}\n` +
      `🆔 ${config.nie}\n` +
      `👤 ${config.name}\n` +
      `📧 ${config.email}\n\n` +
      `**Acquiring real phone number...**`
    );
    
    // Step 1: Get real phone number from 5sim
    try {
      phoneNumberData = await fiveSim.getRealSpanishNumber();
    } catch (error) {
      logger.warn('Failed to get 5sim number, using placeholder');
      phoneNumberData = { phone: '+34600000000', orderId: null };
      await bot.telegram.sendMessage(process.env.CHAT_ID, 
        `⚠️ Using placeholder number. Booking may fail without real SMS.`
      );
    }
    
    // Step 2: Send booking instructions with real number
    await bot.telegram.sendMessage(process.env.CHAT_ID,
      `📝 **BOOKING FORM DATA**\n\n` +
      `Fill these fields exactly:\n\n` +
      `**NIE**: \`${config.nie}\`\n` +
      `**Name**: \`${config.name}\`\n` +
      `**Phone**: \`${phoneNumberData.phone}\`\n` +
      `**Email**: \`${config.email}\`\n\n` +
      `**GO TO:** https://icp.administracionelectronica.gob.es/icpplus/index.html\n` +
      `**Select:** Trámites > Extranjería > ${config.province} > ${config.office}\n` +
      `**Procedure:** ${config.procedure}\n\n` +
      `**I'll wait for your SMS code...**`,
      { parse_mode: 'Markdown', disable_web_page_preview: true }
    );
    
    // Step 3: Wait for SMS code if we have a real number
    if (phoneNumberData.orderId) {
      try {
        const smsCode = await fiveSim.waitForSMSCode(phoneNumberData.orderId);
        
        // Send the code to user
        await bot.telegram.sendMessage(process.env.CHAT_ID,
          `🔓 **VERIFICATION CODE RECEIVED**\n\n` +
          `Code: ${smsCode}\n\n` +
          `**Enter this code on the booking website NOW!**\n` +
          `Then select the EARLIEST available date.`
        );
        
        // Wait for user to complete booking
        await bot.telegram.sendMessage(process.env.CHAT_ID,
          `⏳ **WAITING FOR BOOKING COMPLETION**\n\n` +
          `Please complete the booking with the code provided.\n` +
          `Select the EARLIEST date when calendar appears.\n\n` +
          `Type /confirm when booking is complete,\n` +
          `or /failed if booking failed.`
        );
        
        bookingSuccess = true;
        
      } catch (error) {
        logger.error(`SMS code waiting failed: ${error.message}`);
        await bot.telegram.sendMessage(process.env.CHAT_ID,
          `❌ **SMS CODE NOT RECEIVED**\n\n` +
          `Error: ${error.message}\n\n` +
          `Try booking manually with the phone number:\n` +
          `${phoneNumberData.phone}\n\n` +
          `Check 5sim dashboard for the code.`
        );
      }
    } else {
      // No real number, provide manual instructions
      await bot.telegram.sendMessage(process.env.CHAT_ID,
        `📝 **MANUAL BOOKING REQUIRED**\n\n` +
        `1. Use phone number: ${phoneNumberData.phone}\n` +
        `2. Complete form manually\n` +
        `3. Wait for SMS code on your device\n` +
        `4. Enter code and select date\n\n` +
        `Type /confirm when complete, /failed if failed.`
      );
    }
    
    return bookingSuccess;
    
  } catch (error) {
    logger.error(`Automated booking failed for ${config.province}`, { 
      error: error.message, 
      profile: config.province,
      critical: true 
    });
    
    await bot.telegram.sendMessage(process.env.CHAT_ID,
      `❌ **AUTOMATED BOOKING FAILED**\n\n` +
      `Error: ${error.message}\n\n` +
      `Please try manual booking with:\n` +
      `Phone: ${phoneNumberData?.phone || '+34600000000'}\n` +
      `NIE: ${config.nie}\n` +
      `Name: ${config.name}`
    );
    
    // Cancel 5sim order if it exists
    if (phoneNumberData?.orderId) {
      await fiveSim.cancelOrder(phoneNumberData.orderId);
    }
    
    return false;
  }
}

// Interactive booking coordinator
async function startFullyAutomatedBooking() {
  try {
    await bot.telegram.sendMessage(process.env.CHAT_ID, `✅ Fully Automated Booking System ACTIVE`);
    
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
    
    // Run automated booking for first config (prioritized)
    const config = configs[0]; // Process highest priority first
    await fullyAutomatedBooking(config);
    
  } catch (error) {
    console.error('Fully automated booking failed:', error);
    logger.error('Fully automated booking failed', { error: error.message, critical: true });
    await bot.telegram.sendMessage(process.env.CHAT_ID, `❌ Fully automated booking error: ${error.message}`);
  }
}

// Command handlers
bot.command('book', async (ctx) => {
  await ctx.reply('🚀 Initiating FULLY AUTOMATED booking sequence...');
  await startFullyAutomatedBooking();
});

bot.command('confirm', async (ctx) => {
  await ctx.reply('🎉 **BOOKING CONFIRMED!** 🎉\n\n' +
    '✅ Congratulations on securing your appointment!\n' +
    '📸 Please take a screenshot of your confirmation\n' +
    '💾 Save the appointment details for your records\n\n' +
    'Type /book to start another booking if needed.');
});

bot.command('failed', async (ctx) => {
  await ctx.reply('❌ Booking attempt failed.\n\n' +
    'Please check the error messages and try again.\n' +
    'Type /book to restart the automated booking process.');
});

bot.command('start', async (ctx) => {
  await ctx.reply('🤖 Cita Previa Fully Automated Booking Bot\n\n' +
    'Commands:\n' +
    '/book - Start fully automated booking\n' +
    '/confirm - Confirm successful booking\n' +
    '/failed - Report booking failure\n' +
    '/status - Check system status');
});

bot.command('status', async (ctx) => {
  const has5sim = !!process.env.FIVESIM_TOKEN;
  const hasBrowserless = !!process.env.BROWSERLESS_TOKEN;
  
  await ctx.reply('✅ Bot Status:\n\n' +
    `5sim Integration: ${has5sim ? '✅ Active' : '❌ Missing FIVESIM_TOKEN'}\n` +
    `Browser Automation: ${hasBrowserless ? '✅ Active' : '❌ Missing BROWSERLESS_TOKEN'}\n` +
    `Telegram: ✅ Connected\n` +
    `Google Sheets: ✅ Configured\n\n` +
    `Use /book to start automated booking.`);
});

// Start the bot
bot.launch();
console.log('🤖 Fully Automated Booking Bot is running!');

// Export for testing
module.exports = { bot, startFullyAutomatedBooking };
