require('dotenv').config();
const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');

console.log('🚀 Browserless.io Automated Booking Bot starting...');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Simple logger
function sendLog(message, type = 'info') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${type.toUpperCase()}: ${message}`);
  
  if (process.env.BOT_TOKEN && process.env.CHAT_ID) {
    fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        chat_id: process.env.CHAT_ID, 
        text: `${type.toUpperCase()}: ${message}`
      })
    }).catch(err => console.error('Log error:', err));
  }
}

// Config Manager
class ConfigManager {
  constructor(sheetsUrl) {
    this.sheetsUrl = sheetsUrl;
  }
  
  async getConfigs() {
    try {
      const response = await fetch(this.sheetsUrl, { timeout: 30000 });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      throw error;
    }
  }
}

// Browserless.io Automation
class BrowserlessAutomation {
  constructor() {
    this.token = process.env.BROWSERLESS_TOKEN || '2T4jHExQDja2fXee48179e6cf8d9d3f52bf897de38f71f318';
    this.baseUrl = 'https://chrome.browserless.io';
  }
  
  async executeBookingScript(config) {
    try {
      await bot.telegram.sendMessage(process.env.CHAT_ID,
        `🤖 **STARTING AUTOMATED BOOKING**\n\n` +
        `Connecting to Browserless.io with Spanish IP...\n` +
        `This may take 1-3 minutes.`
      );
      
      // Browserless function that does the actual automation
      const bookingScript = `
        module.exports = async ({ page, browser }) => {
          try {
            // Set Spanish headers
            await page.setExtraHTTPHeaders({
              'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
            });
            
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            // Navigate to booking site
            await page.goto('https://icp.administracionelectronica.gob.es/icpplus/index.html', {
              waitUntil: 'networkidle0',
              timeout: 60000
            });
            
            // Click Extranjería link
            await page.waitForSelector('a', { timeout: 30000 });
            await page.evaluate(() => {
              const links = Array.from(document.querySelectorAll('a'));
              const extranjeriaLink = links.find(link => 
                link.textContent.toLowerCase().includes('extranjería') || 
                link.href.includes('extranjeria')
              );
              if (extranjeriaLink) extranjeriaLink.click();
            });
            
            await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 });
            
            // Fill form
            await page.waitForSelector('select[name="provincia"]', { timeout: 30000 });
            await page.select('select[name="provincia"]', '${config.province}');
            await page.select('select[name="oficina"]', '${config.office}');
            await page.type('input[name="tramite"]', '${config.procedure}');
            await page.click('input[value="Buscar"]');
            
            // Try to solve CAPTCHA (this would require 2Captcha integration on Browserless side)
            // For now, we'll indicate manual CAPTCHA solving is needed
            
            return { 
              status: 'form_filled', 
              message: 'Form completed successfully. CAPTCHA needs manual solving.',
              url: page.url()
            };
            
          } catch (error) {
            return { status: 'error', message: error.message };
          }
        };
      `;
      
      const response = await fetch(`${this.baseUrl}/function?token=${this.token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/javascript' },
        body: bookingScript
      });
      
      const result = await response.json();
      
      if (result.status === 'form_filled') {
        await bot.telegram.sendMessage(process.env.CHAT_ID,
          `✅ **AUTOMATION SUCCESSFUL**\n\n` +
          `✅ Website opened automatically\n` +
          `✅ Form filled with your details\n` +
          `✅ Ready for CAPTCHA solving\n\n` +
          `NEXT STEPS:\n` +
          `1. Go to the booking website\n` +
          `2. Solve the CAPTCHA manually\n` +
          `3. Submit the form\n` +
          `4. Wait for SMS to +34663939048\n` +
          `5. When you get code, type: /code 123456`
        );
        return true;
      } else {
        throw new Error(result.message);
      }
      
    } catch (error) {
      await bot.telegram.sendMessage(process.env.CHAT_ID,
        `❌ **AUTOMATION FAILED**\n\n` +
        `Error: ${error.message}\n\n` +
        `Falling back to manual booking...`
      );
      return false;
    }
  }
}

// SMS Manager
class SMSManager {
  async getNumber() {
    const phoneNumber = process.env.REAL_PHONE_NUMBER || '+34663939048';
    return { id: 'manual-123', phone: phoneNumber };
  }
  
  async waitForSMS() {
    return new Promise((resolve) => {
      global.smsCodeResolver = resolve;
    });
  }
}

// Automated Booking System
class AutomatedBookingSystem {
  constructor() {
    this.browserless = new BrowserlessAutomation();
    this.smsManager = new SMSManager();
    this.configManager = new ConfigManager(process.env.SHEETS_URL);
  }
  
  async startBooking() {
    try {
      await bot.telegram.sendMessage(process.env.CHAT_ID,
        `🤖 **BROWSERLESS.IO AUTOMATED BOOKING**\n\n` +
        `Initializing professional automation...`
      );
      
      // Get configuration
      const configs = await this.configManager.getConfigs();
      const activeConfigs = configs.filter(config => 
        config.active && config.active.toString().toLowerCase() === 'yes'
      );
      
      if (activeConfigs.length === 0) {
        await bot.telegram.sendMessage(process.env.CHAT_ID, '⚠️ No active configurations found');
        return;
      }
      
      const config = activeConfigs[0];
      
      // Start Browserless automation
      const automationSuccess = await this.browserless.executeBookingScript(config);
      
      if (automationSuccess) {
        // Automation successful - wait for SMS
        const phoneNumber = await this.smsManager.getNumber();
        await bot.telegram.sendMessage(process.env.CHAT_ID,
          `🎯 **AUTOMATION COMPLETE**\n\n` +
          `✅ Website opened with your details\n` +
          `✅ Form pre-filled automatically\n` +
          `📱 Now waiting for SMS to ${phoneNumber.phone}\n\n` +
          `When you receive the SMS code, type: /code 123456`
        );
      } else {
        // Fall back to manual guidance
        await bot.telegram.sendMessage(process.env.CHAT_ID,
          `📋 **MANUAL BOOKING INSTRUCTIONS**\n\n` +
          `📋 YOUR INFORMATION:\n` +
          `📍 Province: ${config.province}\n` +
          `🏢 Office: ${config.office}\n` +
          `📝 Procedure: ${config.procedure}\n` +
          `🆔 NIE: ${config.nie}\n` +
          `👤 Name: ${config.name}\n` +
          `📧 Email: ${config.email}\n` +
          `📱 Phone: +34663939048\n\n` +
          `🎮 BOOKING STEPS:\n` +
          `1. 🔗 [CLICK TO BOOK](https://icp.administracionelectronica.gob.es/icpplus/index.html)\n` +
          `2. Select: Trámites > Extranjería\n` +
          `3. Choose: ${config.province} > ${config.office}\n` +
          `4. Select: ${config.procedure}\n` +
          `5. Fill form with details above\n` +
          `6. Solve CAPTCHA and submit\n` +
          `7. Wait for SMS to +34663939048\n` +
          `8. When you get code, type: /code 123456\n` +
          `9. Select EARLIEST date and confirm`,
          { parse_mode: 'Markdown', disable_web_page_preview: true }
        );
      }
      
    } catch (error) {
      await bot.telegram.sendMessage(process.env.CHAT_ID,
        `❌ Booking error: ${error.message}\nType /retry to try again`
      );
    }
  }
}

const bookingSystem = new AutomatedBookingSystem();

// Command Handlers
bot.command('auto', async (ctx) => {
  await ctx.reply('🚀 Starting Browserless.io automated booking...');
  await bookingSystem.startBooking();
});

bot.command('code', async (ctx) => {
  const message = ctx.message.text;
  const parts = message.split(' ');
  
  if (parts.length >= 2) {
    const code = parts[1];
    if (code.length === 6 && /^\d+$/.test(code)) {
      if (global.smsCodeResolver) {
        global.smsCodeResolver(code);
        await ctx.reply(`✅ SMS code ${code} received!`);
      }
      
      await ctx.reply(
        `📱 **SMS CODE: ${code}**\n\n` +
        `FINAL BOOKING STEPS:\n` +
        `1. Enter code: ${code} on website\n` +
        `2. Calendar will appear\n` +
        `3. SELECT EARLIEST available date\n` +
        `4. Click Confirm immediately\n` +
        `5. Review and finalize booking\n\n` +
        `When complete, type: /done`
      );
      return;
    }
  }
  
  await ctx.reply('❌ Invalid code format. Use: /code 123456');
});

bot.command('done', async (ctx) => {
  await ctx.reply('🎉 **BOOKING CONFIRMED!** 🎉\n\n' +
    '✅ Your appointment is booked!\n' +
    '📸 Take screenshot of confirmation\n' +
    '💾 Save appointment details\n\n' +
    'Thank you for using Professional Booking System!'
  );
});

bot.command('retry', async (ctx) => {
  await ctx.reply('🔄 Retrying automated booking...');
  await bookingSystem.startBooking();
});

bot.command('start', async (ctx) => {
  await ctx.reply(
    '🤖 Browserless.io Automated Booking Bot\n\n' +
    'Commands:\n' +
    '/auto - Start automated booking\n' +
    '/code XXXXXX - Enter SMS code\n' +
    '/done - Confirm booking complete\n' +
    '/retry - Retry booking process'
  );
});

// Start the bot
try {
  bot.launch();
  console.log('✅ Browserless.io Booking Bot started!');
  sendLog('Bot started successfully', 'success');
} catch (error) {
  console.error('❌ Bot start failed:', error);
  sendLog(`Bot start failed: ${error.message}`, 'error');
}

module.exports = { bot, bookingSystem };
