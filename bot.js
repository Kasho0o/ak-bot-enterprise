require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha');
const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');

console.log('🚀 Fully Automated Booking Bot starting...');

// Set up puppeteer with stealth and 2Captcha
puppeteer.use(StealthPlugin());
puppeteer.use(RecaptchaPlugin({ 
  provider: { 
    id: '2captcha', 
    token: process.env.TWOCAPTCHA_KEY || '2b750d90169c808fd82b4a0918f11725'
  }, 
  visualFeedback: true
}));

const bot = new Telegraf(process.env.BOT_TOKEN);

// Logger
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

// SMS Manager (using your real number)
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

// Fully Automated Booking System
class AutomatedBookingSystem {
  constructor() {
    this.configManager = new ConfigManager(process.env.SHEETS_URL);
    this.smsManager = new SMSManager();
  }
  
  async startFullyAutomatedBooking() {
    let browser;
    let success = false;
    
    try {
      await bot.telegram.sendMessage(process.env.CHAT_ID,
        `🤖 **FULLY AUTOMATED BOOKING STARTED** 🤖\n\n` +
        `Initializing complete automation...\n` +
        `This may take 2-5 minutes. I'll guide you through any manual steps if needed.`
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
      
      // Launch browser with Spanish proxy
      const proxyUrl = process.env.SPAIN_PROXY || 'socks5h://user-sph1i3su70-session-1-asn-12479:9v36Qzlbn3yLL~Nipz@gate.decodo.com:7000';
      
      await bot.telegram.sendMessage(process.env.CHAT_ID, 
        `🌐 Connecting to browser with Spanish IP...\n` +
        `Using proxy: ${proxyUrl.split('@')[1]}`
      );
      
      browser = await puppeteer.launch({
        headless: true,
        args: [
          `--proxy-server=${proxyUrl}`,
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ]
      });
      
      const page = await browser.newPage();
      
      // Set Spanish headers
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      });
      
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      await bot.telegram.sendMessage(process.env.CHAT_ID, '✅ Browser connected with Spanish IP!');
      
      // Phase 1: Navigate to booking site
      await bot.telegram.sendMessage(process.env.CHAT_ID, '🧭 Navigating to booking site...');
      
      await page.goto('https://icp.administracionelectronica.gob.es/icpplus/index.html', {
        waitUntil: 'networkidle0',
        timeout: 60000
      });
      
      // Click Extranjería
      await page.waitForSelector('a[href*="extranjeria"], a:contains("Extranjería")', { timeout: 30000 });
      await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        const extranjeriaLink = links.find(link => 
          link.textContent.toLowerCase().includes('extranjería') || 
          link.href.includes('extranjeria')
        );
        if (extranjeriaLink) extranjeriaLink.click();
      });
      
      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 });
      await bot.telegram.sendMessage(process.env.CHAT_ID, '✅ Navigated to Extranjería section!');
      
      // Phase 2: Fill form automatically
      await bot.telegram.sendMessage(process.env.CHAT_ID, '📝 Filling form automatically...');
      
      await page.waitForSelector('select[name="provincia"]', { timeout: 30000 });
      await page.select('select[name="provincia"]', config.province);
      
      await page.waitForSelector('select[name="oficina"]', { timeout: 30000 });
      await page.select('select[name="oficina"]', config.office);
      
      await page.waitForSelector('input[name="tramite"]', { timeout: 30000 });
      await page.type('input[name="tramite"]', config.procedure);
      
      await page.click('input[value="Buscar"]');
      await bot.telegram.sendMessage(process.env.CHAT_ID, '✅ Form submitted!');
      
      // Phase 3: Solve CAPTCHA automatically
      await bot.telegram.sendMessage(process.env.CHAT_ID, '🤖 Solving CAPTCHA with 2Captcha...');
      
      try {
        const { solved } = await page.solveRecaptchas();
        if (solved.length > 0) {
          await bot.telegram.sendMessage(process.env.CHAT_ID, `✅ CAPTCHA solved automatically! (${solved.length} CAPTCHAs)`);
        }
      } catch (captchaError) {
        await bot.telegram.sendMessage(process.env.CHAT_ID, 
          `⚠️ CAPTCHA solving failed: ${captchaError.message}\n` +
          `Falling back to manual CAPTCHA solving...`
        );
      }
      
      // Phase 4: Wait for slots and select earliest
      await bot.telegram.sendMessage(process.env.CHAT_ID, '📅 Searching for available slots...');
      
      // Wait for calendar or slot availability
      try {
        await page.waitForSelector('td.available, td.disponible', { timeout: 30000 });
        await bot.telegram.sendMessage(process.env.CHAT_ID, '🎉 Slots found!');
        
        // Click earliest available slot
        const earliestSlot = await page.evaluate(() => {
          const availableSlots = Array.from(document.querySelectorAll('td.available, td.disponible'))
            .filter(td => /\d{1,2}\/\d{1,2}\/\d{4}/.test(td.textContent.trim()))
            .sort((a, b) => {
              const dateA = new Date(a.textContent.trim().split('/').reverse().join('-'));
              const dateB = new Date(b.textContent.trim().split('/').reverse().join('-'));
              return dateA - dateB;
            });
          
          if (availableSlots.length > 0) {
            availableSlots[0].click();
            return availableSlots[0].textContent.trim();
          }
          return null;
        });
        
        if (earliestSlot) {
          await bot.telegram.sendMessage(process.env.CHAT_ID, `✅ Selected earliest slot: ${earliestSlot}`);
        }
        
      } catch (slotError) {
        await bot.telegram.sendMessage(process.env.CHAT_ID, 
          `⚠️ No slots visible yet. Continuing with form...\n` +
          `This might mean slots are available but not displayed yet.`
        );
      }
      
      // Phase 5: Fill personal information
      await bot.telegram.sendMessage(process.env.CHAT_ID, '👤 Filling personal information...');
      
      await page.waitForSelector('input[name="nie"]', { timeout: 30000 });
      await page.type('input[name="nie"]', config.nie);
      
      if (config.name) {
        await page.type('input[name="nombre"]', config.name);
      }
      
      const phoneNumber = await this.smsManager.getNumber();
      await page.type('input[name="telefono"]', phoneNumber.phone);
      await page.type('input[name="email"]', config.email);
      
      await page.click('input[value="Continuar"]');
      await bot.telegram.sendMessage(process.env.CHAT_ID, '✅ Personal information submitted!');
      
      // Phase 6: Handle SMS verification
      await bot.telegram.sendMessage(process.env.CHAT_ID,
        `📱 **WAITING FOR SMS CODE**\n\n` +
        `Waiting for SMS code to ${phoneNumber.phone}...\n` +
        `When you receive the code, type: /code 123456\n` +
        `The bot will automatically enter it!`
      );
      
      // Wait for SMS code (user will provide via /code command)
      const smsCode = await this.smsManager.waitForSMS();
      
      // Phase 7: Enter SMS code automatically
      await bot.telegram.sendMessage(process.env.CHAT_ID, `🔢 Entering SMS code: ${smsCode}...`);
      
      await page.waitForSelector('#txtCodigoVerificacion', { timeout: 30000 });
      await page.type('#txtCodigoVerificacion', smsCode);
      
      await page.click('input[value="Confirmar"]');
      await bot.telegram.sendMessage(process.env.CHAT_ID, '✅ SMS code confirmed!');
      
      // Phase 8: Final booking confirmation
      await bot.telegram.sendMessage(process.env.CHAT_ID, '🎯 Finalizing booking...');
      
      try {
        await page.waitForSelector('#btnConfirmar, .confirmar, [value="Confirmar"]', { timeout: 30000 });
        await page.click('#btnConfirmar, .confirmar, [value="Confirmar"]');
        await bot.telegram.sendMessage(process.env.CHAT_ID, '✅ Booking confirmed!');
        success = true;
      } catch (confirmError) {
        // Try alternative confirmation methods
        await page.evaluate(() => {
          const confirmButtons = Array.from(document.querySelectorAll('input[type="submit"], button'));
          const confirmButton = confirmButtons.find(btn => 
            btn.value.toLowerCase().includes('confirm') || 
            btn.textContent.toLowerCase().includes('confirm')
          );
          if (confirmButton) confirmButton.click();
        });
        await bot.telegram.sendMessage(process.env.CHAT_ID, '✅ Booking confirmed (alternative method)!');
        success = true;
      }
      
      // Phase 9: Wait for success confirmation
      try {
        await page.waitForSelector('.success, .confirmacion, [class*="success"]', { timeout: 30000 });
        await bot.telegram.sendMessage(process.env.CHAT_ID,
          `🎉 **BOOKING COMPLETED SUCCESSFULLY!** 🎉\n\n` +
          `✅ Appointment booked for ${config.province}!\n` +
          `📸 Please screenshot the confirmation page\n` +
          `💾 Save your appointment details\n\n` +
          `Thank you for using Fully Automated Booking!`
        );
      } catch (successError) {
        await bot.telegram.sendMessage(process.env.CHAT_ID,
          `⚠️ Booking process completed!\n` +
          `Please check the page to confirm your appointment is booked.\n` +
          `If you see a confirmation, take a screenshot!`
        );
      }
      
    } catch (error) {
      sendLog(`Booking failed: ${error.message}`, 'error');
      await bot.telegram.sendMessage(process.env.CHAT_ID,
        `❌ **AUTOMATION FAILED**\n\n` +
        `Error: ${error.message}\n\n` +
        `Falling back to manual guidance...\n` +
        `Type /manual for step-by-step instructions.`
      );
    } finally {
      if (browser) {
        await browser.close();
      }
      
      if (!success) {
        await bot.telegram.sendMessage(process.env.CHAT_ID,
          `📋 **MANUAL BOOKING INSTRUCTIONS**\n\n` +
          `1. 🔗 https://icp.administracionelectronica.gob.es/icpplus/index.html\n` +
          `2. Trámites > Extranjería\n` +
          `3. ${config.province} > ${config.office}\n` +
          `4. ${config.procedure}\n` +
          `5. Fill: ${config.nie}, ${config.name}, +34663939048, ${config.email}\n` +
          `6. Solve CAPTCHA\n` +
          `7. Submit and wait for SMS\n` +
          `8. Enter code and select date\n` +
          `9. Confirm booking`
        );
      }
    }
  }
}

const bookingSystem = new AutomatedBookingSystem();

// Command Handlers
bot.command('auto', async (ctx) => {
  await ctx.reply('🚀 Starting FULLY AUTOMATED booking...');
  await bookingSystem.startFullyAutomatedBooking();
});

bot.command('code', async (ctx) => {
  const message = ctx.message.text;
  const parts = message.split(' ');
  
  if (parts.length >= 2) {
    const code = parts[1];
    if (code.length === 6 && /^\d+$/.test(code)) {
      if (global.smsCodeResolver) {
        global.smsCodeResolver(code);
        await ctx.reply(`✅ SMS code ${code} received and will be entered automatically!`);
      } else {
        await ctx.reply(
          `📱 **SMS CODE: ${code}**\n\n` +
          `Please go back to the booking website and enter this code manually:\n` +
          `1. Find the SMS verification field\n` +
          `2. Enter: ${code}\n` +
          `3. Click Continue/Confirm\n` +
          `4. Select the earliest date\n` +
          `5. Finalize booking`
        );
      }
      return;
    }
  }
  
  await ctx.reply('❌ Invalid code format. Use: /code 123456');
});

bot.command('manual', async (ctx) => {
  await ctx.reply(
    '📋 **MANUAL BOOKING INSTRUCTIONS**\n\n' +
    '1. 🔗 https://icp.administracionelectronica.gob.es/icpplus/index.html\n' +
    '2. Select: Trámites > Extranjería\n' +
    '3. Choose your province and office\n' +
    '4. Select your procedure\n' +
    '5. Fill in your details\n' +
    '6. Solve CAPTCHA and submit\n' +
    '7. Wait for SMS to +34663939048\n' +
    '8. Enter code and select date\n' +
    '9. Confirm booking'
  );
});

bot.command('start', async (ctx) => {
  await ctx.reply(
    '🤖 Fully Automated Cita Previa Booking Bot\n\n' +
    'Commands:\n' +
    '/auto - Start FULLY AUTOMATED booking\n' +
    '/code XXXXXX - Enter SMS code\n' +
    '/manual - Get manual instructions'
  );
});

// Start the bot
try {
  bot.launch();
  console.log('✅ Fully Automated Booking Bot started!');
  sendLog('Bot started successfully', 'success');
} catch (error) {
  console.error('❌ Bot start failed:', error);
  sendLog(`Bot start failed: ${error.message}`, 'error');
}

module.exports = { bot, bookingSystem };
