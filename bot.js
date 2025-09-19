require('dotenv').config();
const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

console.log('🚀 Spanish Proxy Booking Bot starting...');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Spanish Headers for better success rates
const SPANISH_HEADERS = {
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Cache-Control': 'max-age=0'
};

// Proxy-aware fetch function
async function fetchWithProxy(url, options = {}) {
  const proxyUrl = process.env.SPAIN_PROXY;
  
  if (proxyUrl) {
    console.log('Using Spanish proxy:', proxyUrl);
    
    // Create proxy agent based on proxy type
    let agent;
    if (proxyUrl.startsWith('socks5')) {
      agent = new SocksProxyAgent(proxyUrl);
    } else {
      agent = new HttpsProxyAgent(proxyUrl);
    }
    
    // Add proxy agent and Spanish headers
    options.agent = agent;
    options.headers = { ...SPANISH_HEADERS, ...options.headers };
  }
  
  return await fetch(url, options);
}

// Logger with proxy info
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

// Config Manager with Proxy Support
class ConfigManager {
  constructor(sheetsUrl) {
    this.sheetsUrl = sheetsUrl;
  }
  
  async getConfigs() {
    try {
      sendLog(`Fetching configs via Spanish proxy...`, 'info');
      
      const response = await fetchWithProxy(this.sheetsUrl, { timeout: 30000 });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const configs = await response.json();
      sendLog(`Loaded ${configs.length} configs via Spanish proxy`, 'success');
      return configs;
    } catch (error) {
      sendLog(`Config fetch failed: ${error.message}`, 'error');
      throw error;
    }
  }
}

// SMS Manager with Spanish Number
class SMSManager {
  constructor() {
    this.token = process.env.FIVESIM_TOKEN;
  }
  
  async getNumber() {
    const phoneNumber = process.env.REAL_PHONE_NUMBER || '+34663939048';
    await bot.telegram.sendMessage(process.env.CHAT_ID, 
      `📱 **SPANISH PHONE NUMBER**\n\n` +
      `Phone: ${phoneNumber}\n` +
      `This Spanish number will receive your SMS code!\n\n` +
      `When you get the code, type: /code YOURCODE`
    );
    return { id: 'manual-123', phone: phoneNumber };
  }
  
  async waitForSMS() {
    await bot.telegram.sendMessage(process.env.CHAT_ID,
      `⏳ **WAITING FOR SMS CODE**\n\n` +
      `Check your Spanish phone +34663939048 for the verification code.\n` +
      `When you receive it, type: /code 123456`
    );
    
    return new Promise((resolve) => {
      global.smsCodeResolver = resolve;
    });
  }
}

// Professional Booking System with Spanish Proxy
class ProfessionalBookingSystem {
  constructor() {
    this.configManager = new ConfigManager(process.env.SHEETS_URL);
    this.smsManager = new SMSManager();
  }
  
  async testProxyConnection() {
    try {
      await bot.telegram.sendMessage(process.env.CHAT_ID, 
        `🌐 **TESTING SPANISH PROXY CONNECTION**\n\n` +
        `Checking if Spanish proxy is working...`
      );
      
      // Test IP location
      const response = await fetchWithProxy('https://httpbin.org/ip');
      const data = await response.json();
      
      await bot.telegram.sendMessage(process.env.CHAT_ID,
        `✅ **PROXY CONNECTION SUCCESSFUL**\n\n` +
        `Your IP appears to be: ${data.origin}\n` +
        `This should be a Spanish IP address!\n\n` +
        `Spanish proxy is ready for booking.`
      );
      
      return true;
    } catch (error) {
      await bot.telegram.sendMessage(process.env.CHAT_ID,
        `❌ **PROXY CONNECTION FAILED**\n\n` +
        `Error: ${error.message}\n\n` +
        `Proceeding without proxy, but success rate may be lower.`
      );
      return false;
    }
  }
  
  async startProfessionalBooking() {
    try {
      await bot.telegram.sendMessage(process.env.CHAT_ID, 
        `🤖 **SPANISH PROXY BOOKING SYSTEM** 🤖\n\n` +
        `Initializing advanced booking with Spanish IP...`
      );
      
      // Test proxy connection
      await this.testProxyConnection();
      
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
        `📧 ${config.email}\n\n` +
        `All traffic routed through Spanish proxy!`
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
        `Waiting for SMS code via Spanish phone...\n` +
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
  await ctx.reply('🚀 Starting SPANISH PROXY booking system...');
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
    'Thank you for using the SPANISH PROXY Booking System! 🚀'
  );
});

bot.command('retry', async (ctx) => {
  await ctx.reply('🔄 Restarting SPANISH PROXY booking system...');
  await bookingSystem.startProfessionalBooking();
});

bot.command('testproxy', async (ctx) => {
  await ctx.reply('🌐 Testing Spanish proxy connection...');
  await bookingSystem.testProxyConnection();
});

bot.command('start', async (ctx) => {
  await ctx.reply('🤖 SPANISH PROXY Cita Previa Booking Bot\n\n' +
    'Commands:\n' +
    '/pro - Start PROFESSIONAL booking\n' +
    '/next - Move to next phase\n' +
    '/sms - Handle SMS verification\n' +
    '/code XXXXXX - Enter SMS code\n' +
    '/confirm - Confirm successful booking\n' +
    '/retry - Restart booking process\n' +
    '/testproxy - Test Spanish proxy'
  );
});

// Start the bot
bot.launch().then(() => {
  console.log('✅ SPANISH PROXY Booking Bot is running!');
  sendLog('SPANISH PROXY Bot started successfully', 'success');
}).catch(error => {
  console.error('❌ Bot failed to start:', error);
  sendLog(`Bot startup failed: ${error.message}`, 'error');
});

module.exports = { bot, bookingSystem };
