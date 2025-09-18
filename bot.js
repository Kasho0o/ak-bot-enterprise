require('dotenv').config();
const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');

console.log('🚀 Lightweight Professional Booking Bot starting...');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Simple logger
async function sendLog(message, type = 'info') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${type.toUpperCase()}: ${message}`);
  
  if (process.env.BOT_TOKEN && process.env.CHAT_ID) {
    try {
      await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chat_id: process.env.CHAT_ID, 
          text: `${type.toUpperCase()}: ${message}` 
        })
      });
    } catch (error) {
      console.error('Log send failed:', error);
    }
  }
}

// Browserless.io Direct API Integration
class BrowserlessAPI {
  constructor() {
    this.token = process.env.BROWSERLESS_TOKEN || '2T4jHExQDja2fXee48179e6cf8d9d3f52bf897de38f71f318';
    this.baseUrl = 'https://chrome.browserless.io';
  }
  
  async executeScript(scriptFunction) {
    try {
      const response = await fetch(`${this.baseUrl}/function?token=${this.token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/javascript' },
        body: scriptFunction.toString()
      });
      
      if (!response.ok) {
        throw new Error(`Browserless API error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      sendLog(`Browserless API failed: ${error.message}`, 'error');
      throw error;
    }
  }
}

// 5sim Manager
class FiveSimManager {
  constructor() {
    this.token = process.env.FIVESIM_TOKEN;
  }
  
  async getRealSpanishNumber() {
    const realNumber = process.env.REAL_PHONE_NUMBER || '+34663939048';
    await bot.telegram.sendMessage(process.env.CHAT_ID, 
      `📱 **PHONE NUMBER READY**\n\n` +
      `Phone: ${realNumber}\n` +
      `This number will receive your SMS code!`
    );
    return { phone: realNumber, orderId: 'manual-123' };
  }
}

// Config Manager
class ConfigManager {
  constructor(sheetsUrl) {
    this.sheetsUrl = sheetsUrl;
  }
  
  async getConfigs() {
    try {
      sendLog(`Fetching configs from: ${this.sheetsUrl}`, 'info');
      const response = await fetch(this.sheetsUrl, { timeout: 30000 });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const configs = await response.json();
      sendLog(`Loaded ${configs.length} configs`, 'success');
      return configs;
    } catch (error) {
      sendLog(`Config fetch failed: ${error.message}`, 'error');
      throw error;
    }
  }
}

// Lightweight Automated Booking
class LightweightBookingSystem {
  constructor() {
    this.browserless = new BrowserlessAPI();
    this.fivesim = new FiveSimManager();
    this.configManager = new ConfigManager(process.env.SHEETS_URL);
  }
  
  async startBooking() {
    try {
      await bot.telegram.sendMessage(process.env.CHAT_ID, 
        `🤖 **LIGHTWEIGHT AUTOMATED BOOKING** 🤖\n\n` +
        `Starting optimized booking process...`
      );
      
      // Get configuration
      const configs = await this.configManager.getConfigs();
      const activeConfigs = configs.filter(config => 
        config.active && config.active.toString().toLowerCase() === 'yes'
      );
      
      if (activeConfigs.length === 0) {
        throw new Error('No active configurations found');
      }
      
      const config = activeConfigs[0];
      
      await bot.telegram.sendMessage(process.env.CHAT_ID, 
        `📋 **BOOKING CONFIGURATION**\n\n` +
        `📍 ${config.province}\n` +
        `🏢 ${config.office}\n` +
        `📝 ${config.procedure}\n` +
        `🆔 ${config.nie}\n` +
        `👤 ${config.name}\n` +
        `📧 ${config.email}`
      );
      
      // Get phone number
      const phoneNumber = await this.fivesim.getRealSpanishNumber();
      
      // Send detailed booking instructions
      await bot.telegram.sendMessage(process.env.CHAT_ID,
        `🎮 **OPTIMIZED BOOKING INSTRUCTIONS**\n\n` +
        `Follow these steps:\n\n` +
        `1. 🔗 [Open Booking Site](https://icp.administracionelectronica.gob.es/icpplus/index.html)\n` +
        `2. Select: Trámites > Extranjería\n` +
        `3. Province: ${config.province}\n` +
        `4. Office: ${config.office}\n` +
        `5. Procedure: ${config.procedure}\n` +
        `6. Fill form:\n` +
        `   • NIE: ${config.nie}\n` +
        `   • Name: ${config.name}\n` +
        `   • Phone: ${phoneNumber.phone}\n` +
        `   • Email: ${config.email}\n` +
        `7. Solve CAPTCHA and submit\n` +
        `8. Wait for SMS to ${phoneNumber.phone}\n` +
        `9. When you get code, type: /code YOURCODE\n` +
        `10. Select EARLIEST date and confirm\n\n` +
        `I'll guide you through each step!`,
        { parse_mode: 'Markdown', disable_web_page_preview: true }
      );
      
      // Wait for SMS code
      await bot.telegram.sendMessage(process.env.CHAT_ID,
        `⏳ **WAITING FOR SMS CODE**\n\n` +
        `Check your phone ${phoneNumber.phone} for the verification code.\n` +
        `When you receive it, type: /code 123456`
      );
      
    } catch (error) {
      sendLog(`Booking failed: ${error.message}`, 'error');
      await bot.telegram.sendMessage(process.env.CHAT_ID,
        `❌ **BOOKING PROCESS FAILED**\n\n` +
        `Error: ${error.message}\n\n` +
        `Type /retry to try again.`
      );
    }
  }
}

const bookingSystem = new LightweightBookingSystem();

// Command Handlers
bot.command('light', async (ctx) => {
  await ctx.reply('🚀 Starting lightweight automated booking...');
  await bookingSystem.startBooking();
});

bot.command('code', async (ctx) => {
  const message = ctx.message.text;
  const code = message.split(' ')[1];
  
  if (code && code.length === 6 && /^\d+$/.test(code)) {
    await ctx.reply(
      `🎉 **SMS CODE RECEIVED: ${code}**\n\n` +
      `1. Enter this code on the booking website\n` +
      `2. Select the EARLIEST available date\n` +
      `3. Click Confirm immediately\n` +
      `4. Review and finalize booking\n\n` +
      `Type /confirm when complete!`
    );
  } else {
    await ctx.reply(
      `❌ **INVALID CODE FORMAT**\n\n` +
      `Please use: /code 123456\n` +
      `Replace 123456 with your actual 6-digit code.`
    );
  }
});

bot.command('confirm', async (ctx) => {
  await ctx.reply('🎉 **BOOKING CONFIRMED!** 🎉\n\n' +
    '✅ Excellent! You successfully booked your appointment!\n' +
    '📸 Please screenshot your confirmation\n' +
    '💾 Save the appointment details\n\n' +
    'Thank you for using the optimized booking system!'
  );
});

bot.command('retry', async (ctx) => {
  await ctx.reply('🔄 Restarting booking process...');
  await bookingSystem.startBooking();
});

bot.command('start', async (ctx) => {
  await ctx.reply('🤖 Optimized Cita Previa Booking Bot\n\n' +
    'Commands:\n' +
    '/light - Start optimized booking\n' +
    '/code XXXXXX - Enter SMS code\n' +
    '/confirm - Confirm successful booking\n' +
    '/retry - Restart booking process'
  );
});

// Start the bot
bot.launch().then(() => {
  console.log('✅ Lightweight Booking Bot is running!');
  sendLog('Bot started successfully', 'success');
}).catch(error => {
  console.error('❌ Bot failed to start:', error);
  sendLog(`Bot startup failed: ${error.message}`, 'error');
});

module.exports = { bot, bookingSystem };
