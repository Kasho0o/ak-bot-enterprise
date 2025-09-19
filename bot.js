require('dotenv').config();
const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');

console.log('🚀 Ultra-Lightweight Professional Booking Bot starting...');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Simple logger that won't crash
function sendLog(message, type = 'info') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${type.toUpperCase()}: ${message}`);
  
  // Simple Telegram logging (no async/await to prevent crashes)
  if (process.env.BOT_TOKEN && process.env.CHAT_ID) {
    fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        chat_id: process.env.CHAT_ID, 
        text: `${type.toUpperCase()}: ${message}`
      })
    }).catch(err => console.error('Log send error:', err));
  }
}

// Ultra-simple config manager
class ConfigManager {
  constructor(sheetsUrl) {
    this.sheetsUrl = sheetsUrl;
  }
  
  async getConfigs() {
    try {
      sendLog(`Fetching configs...`);
      const response = await fetch(this.sheetsUrl, { timeout: 30000 });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const configs = await response.json();
      sendLog(`Loaded ${configs.length} configs`);
      return configs;
    } catch (error) {
      sendLog(`Config error: ${error.message}`, 'error');
      throw error;
    }
  }
}

// Simple SMS manager
class SMSManager {
  async getNumber() {
    const phoneNumber = process.env.REAL_PHONE_NUMBER || '+34663939048';
    return { id: 'manual-123', phone: phoneNumber };
  }
}

// Ultra-lightweight professional booking system
class UltraLightBooking {
  constructor() {
    this.configManager = new ConfigManager(process.env.SHEETS_URL);
    this.smsManager = new SMSManager();
  }
  
  async startBooking() {
    try {
      await bot.telegram.sendMessage(process.env.CHAT_ID, 
        `🤖 **ULTRA-LIGHT PROFESSIONAL BOOKING** 🤖\n\n` +
        `Starting optimized booking process...`
      );
      
      // Get configuration
      const configs = await this.configManager.getConfigs();
      const activeConfigs = configs.filter(config => 
        config.active && config.active.toString().toLowerCase() === 'yes'
      );
      
      if (activeConfigs.length === 0) {
        await bot.telegram.sendMessage(process.env.CHAT_ID, '⚠️ No active configs found');
        return;
      }
      
      const config = activeConfigs[0];
      
      // Get phone number
      const phoneNumber = await this.smsManager.getNumber();
      
      // Send professional booking guide
      await bot.telegram.sendMessage(process.env.CHAT_ID,
        `🎯 **PROFESSIONAL BOOKING SYSTEM**\n\n` +
        `📋 **YOUR INFORMATION:**\n` +
        `📍 Province: ${config.province}\n` +
        `🏢 Office: ${config.office}\n` +
        `📝 Procedure: ${config.procedure}\n` +
        `🆔 NIE: ${config.nie}\n` +
        `👤 Name: ${config.name}\n` +
        `📧 Email: ${config.email}\n` +
        `📱 Phone: ${phoneNumber.phone}\n\n` +
        `🎮 **BOOKING STEPS:**\n` +
        `1. 🔗 https://icp.administracionelectronica.gob.es/icpplus/index.html\n` +
        `2. Trámites > Extranjería\n` +
        `3. Select: ${config.province} > ${config.office}\n` +
        `4. Procedure: ${config.procedure}\n` +
        `5. Fill form with details above\n` +
        `6. Solve CAPTCHA\n` +
        `7. Submit form\n` +
        `8. Wait for SMS to ${phoneNumber.phone}\n` +
        `9. When you get code, type: /code 123456\n` +
        `10. Select EARLIEST date and confirm\n\n` +
        `Type /next when you're ready for SMS phase!`
      );
      
    } catch (error) {
      sendLog(`Booking error: ${error.message}`, 'error');
      await bot.telegram.sendMessage(process.env.CHAT_ID,
        `❌ Error: ${error.message}\nType /retry to try again`
      );
    }
  }
  
  async smsPhase() {
    await bot.telegram.sendMessage(process.env.CHAT_ID,
      `📱 **SMS VERIFICATION PHASE**\n\n` +
      `Waiting for SMS code to your Spanish number...\n` +
      `Check your phone +34663939048 for the verification code.\n\n` +
      `When you receive it, type: /code 123456`
    );
  }
}

const bookingSystem = new UltraLightBooking();

// Simple command handlers
bot.command('light', async (ctx) => {
  await ctx.reply('🚀 Starting ultra-light professional booking...');
  await bookingSystem.startBooking();
});

bot.command('next', async (ctx) => {
  await ctx.reply('✅ Moving to SMS verification phase...');
  await bookingSystem.smsPhase();
});

bot.command('code', async (ctx) => {
  const message = ctx.message.text;
  const parts = message.split(' ');
  
  if (parts.length >= 2) {
    const code = parts[1];
    if (code.length === 6 && /^\d+$/.test(code)) {
      await ctx.reply(
        `🎉 **SMS CODE RECEIVED: ${code}**\n\n` +
        `FINAL STEPS:\n` +
        `1. Enter code: ${code} on website\n` +
        `2. Select EARLIEST available date\n` +
        `3. Click Confirm immediately\n` +
        `4. Review and finalize booking\n\n` +
        `Type /confirm when complete!`
      );
      return;
    }
  }
  
  await ctx.reply(
    `❌ **INVALID CODE FORMAT**\n\n` +
    `Use: /code 123456\n` +
    `Replace with your 6-digit SMS code.`
  );
});

bot.command('confirm', async (ctx) => {
  await ctx.reply('🎉 **BOOKING CONFIRMED!** 🎉\n\n' +
    '✅ Excellent! Appointment booked successfully!\n' +
    '📸 Screenshot your confirmation\n' +
    '💾 Save appointment details\n\n' +
    'Thank you for using Professional Booking System!'
  );
});

bot.command('retry', async (ctx) => {
  await ctx.reply('🔄 Restarting booking process...');
  await bookingSystem.startBooking();
});

bot.command('start', async (ctx) => {
  await ctx.reply(
    '🤖 Ultra-Lightweight Professional Booking Bot\n\n' +
    'Commands:\n' +
    '/light - Start professional booking\n' +
    '/next - Move to SMS phase\n' +
    '/code XXXXXX - Enter SMS code\n' +
    '/confirm - Confirm booking complete\n' +
    '/retry - Restart booking process'
  );
});

// Simple start - no async to prevent crashes
try {
  bot.launch();
  console.log('✅ Bot started successfully!');
  sendLog('Bot started', 'success');
} catch (error) {
  console.error('❌ Bot start error:', error);
  sendLog(`Start error: ${error.message}`, 'error');
}

module.exports = { bot };
