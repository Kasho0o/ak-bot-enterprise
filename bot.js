require('dotenv').config();
const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');

console.log('🚀 Hybrid Professional Booking Bot starting...');

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
          text: `**${type.toUpperCase()}**: ${message}`,
          parse_mode: 'Markdown'
        })
      });
    } catch (error) {
      console.error('Log send failed:', error);
    }
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

// SMS Manager (Hybrid - uses your real number)
class SMSManager {
  constructor() {
    this.token = process.env.FIVESIM_TOKEN;
  }
  
  async getNumber() {
    // Use your known working number
    const phoneNumber = process.env.REAL_PHONE_NUMBER || '+34663939048';
    await bot.telegram.sendMessage(process.env.CHAT_ID, 
      `📱 **PHONE NUMBER READY**\n\n` +
      `Phone: ${phoneNumber}\n` +
      `This number will receive your SMS code!\n\n` +
      `When you get the code, type: /code YOURCODE`
    );
    return { id: 'manual-123', phone: phoneNumber };
  }
  
  async waitForSMS() {
    await bot.telegram.sendMessage(process.env.CHAT_ID,
      `⏳ **WAITING FOR SMS CODE**\n\n` +
      `Please check your phone +34663939048 for the verification code.\n` +
      `When you receive it, type: /code 123456`
    );
    
    // Return promise that resolves when user sends code
    return new Promise((resolve) => {
      global.smsCodeResolver = resolve;
    });
  }
}

// Professional Booking System
class ProfessionalBookingSystem {
  constructor() {
    this.configManager = new ConfigManager(process.env.SHEETS_URL);
    this.smsManager = new SMSManager();
  }
  
  async startProfessionalBooking() {
    try {
      await bot.telegram.sendMessage(process.env.CHAT_ID, 
        `🤖 **PROFESSIONAL BOOKING SYSTEM** 🤖\n\n` +
        `Initializing advanced booking process...`
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
        `📋 **BOOKING CONFIGURATION LOADED**\n\n` +
        `📍 ${config.province}\n` +
        `🏢 ${config.office}\n` +
        `📝 ${config.procedure}\n` +
        `🆔 ${config.nie}\n` +
        `👤 ${config.name}\n` +
        `📧 ${config.email}`
      );
      
      // Get phone number
      const phoneNumber = await this.smsManager.getNumber();
      
      // Send comprehensive booking guide
      await bot.telegram.sendMessage(process.env.CHAT_ID,
        `🎮 **PROFESSIONAL BOOKING GUIDE**\n\n` +
        `**PHASE 1: WEBSITE NAVIGATION**\n` +
        `1. 🔗 [Open Booking Site](https://icp.administracionelectronica.gob.es/icpplus/index.html)\n` +
        `2. Click: Trámites > Extranjería\n` +
        `3. Select Province: ${config.province}\n` +
        `4. Select Office: ${config.office}\n` +
        `5. Select Procedure: ${config.procedure}\n\n` +
        `**PHASE 2: FORM COMPLETION**\n` +
        `6. NIE: ${config.nie}\n` +
        `7. Name: ${config.name}\n` +
        `8. Phone: ${phoneNumber.phone}\n` +
        `9. Email: ${config.email}\n` +
        `10. Click "Aceptar"\n\n` +
        `I'll guide you through the next phases...`,
        { parse_mode: 'Markdown', disable_web_page_preview: true }
      );
      
      // Wait for user to complete Phase 1 & 2
      await bot.telegram.sendMessage(process.env.CHAT_ID,
        `✅ **PHASE 1 & 2 COMPLETE?**\n\n` +
        `When you've completed the form and submitted it, type: /next`
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
  
  async phase3CAPTCHA() {
    await bot.telegram.sendMessage(process.env.CHAT_ID,
      `🤖 **PHASE 3: CAPTCHA HANDLING**\n\n` +
      `When you see the CAPTCHA:\n` +
      `1. 🔍 Solve it carefully\n` +
      `2. ✅ Click "Enviar"\n` +
      `3. Wait for SMS code to ${process.env.REAL_PHONE_NUMBER || '+34663939048'}\n\n` +
      `When you're at the SMS verification step, type: /sms`
    );
  }
  
  async phase4Booking() {
    try {
      await bot.telegram.sendMessage(process.env.CHAT_ID,
        `📅 **PHASE 4: BOOKING COMPLETION**\n\n` +
        `Waiting for SMS code...\n` +
        `Check your phone for the verification code.`
      );
      
      const smsCode = await this.smsManager.waitForSMS();
      
      await bot.telegram.sendMessage(process.env.CHAT_ID,
        `🎉 **SMS CODE RECEIVED: ${smsCode}**\n\n` +
        `1. Enter this code on the website\n` +
        `2. Calendar will appear\n` +
        `3. Select the EARLIEST available date\n` +
        `4. Click Confirm\n` +
        `5. Review and finalize booking\n\n` +
        `Type /confirm when booking is complete!`
      );
      
    } catch (error) {
      sendLog(`Phase 4 failed: ${error.message}`, 'error');
    }
  }
}

const bookingSystem = new ProfessionalBookingSystem();

// Command Handlers
bot.command('pro', async (ctx) => {
  await ctx.reply('🚀 Starting PROFESSIONAL booking system...');
  await bookingSystem.startProfessionalBooking();
});

bot.command('next', async (ctx) => {
  await ctx.reply('✅ Moving to Phase 3: CAPTCHA handling...');
  await bookingSystem.phase3CAPTCHA();
});

bot.command('sms', async (ctx) => {
  await ctx.reply('✅ Moving to Phase 4: Booking completion...');
  await bookingSystem.phase4Booking();
});

bot.command('code', async (ctx) => {
  const message = ctx.message.text;
  const code = message.split(' ')[1];
  
  if (code && code.length === 6 && /^\d+$/.test(code)) {
    if (global.smsCodeResolver) {
      global.smsCodeResolver(code);
      await ctx.reply(`✅ Code ${code} received and processed!`);
    } else {
      await ctx.reply(
        `🎉 **SMS CODE: ${code}**\n\n` +
        `1. Go back to the booking website\n` +
        `2. Enter code: ${code}\n` +
        `3. Select the EARLIEST available date\n` +
        `4. Click Confirm\n` +
        `5. Review and finalize\n\n` +
        `Type /confirm when booking is complete!`
      );
    }
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
    '✅ Congratulations! Your appointment is booked!\n' +
    '📸 Please screenshot your confirmation\n' +
    '💾 Save the appointment details\n\n' +
    'Thank you for using the PROFESSIONAL Booking System! 🚀'
  );
});

bot.command('retry', async (ctx) => {
  await ctx.reply('🔄 Restarting PROFESSIONAL booking system...');
  await bookingSystem.startProfessionalBooking();
});

bot.command('start', async (ctx) => {
  await ctx.reply('🤖 PROFESSIONAL Cita Previa Booking Bot\n\n' +
    'Commands:\n' +
    '/pro - Start PROFESSIONAL booking\n' +
    '/next - Move to next phase\n' +
    '/sms - Handle SMS verification\n' +
    '/code XXXXXX - Enter SMS code\n' +
    '/confirm - Confirm successful booking\n' +
    '/retry - Restart booking process'
  );
});

// Start the bot
bot.launch().then(() => {
  console.log('✅ PROFESSIONAL Booking Bot is running!');
  sendLog('PROFESSIONAL Bot started successfully', 'success');
}).catch(error => {
  console.error('❌ Bot failed to start:', error);
  sendLog(`Bot startup failed: ${error.message}`, 'error');
});

module.exports = { bot, bookingSystem };
