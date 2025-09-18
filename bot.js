require('dotenv').config();
const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');
const puppeteer = require('puppeteer');
const { google } = require('googleapis');
const axios = require('axios');
const imap = require('imap-simple');

console.log('🚀 Auto-Booking Bot starting at ' + new Date().toISOString());

// Validate environment variables
const requiredEnvVars = ['BOT_TOKEN', 'CHAT_ID', 'SHEETS_URL', 'SCRAPINGBEE_API_KEY', 'TWOCAPTCHA_API_KEY', 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_ACCESS_TOKEN', 'GMAIL_REFRESH_TOKEN'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing environment variable: ${envVar}`);
    process.exit(1);
  }
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

class BookingBot {
  constructor() {
    this.baseUrl = 'https://icp.administracionelectronica.gob.es/icpplus/index.html';
  }

  async solveCaptcha(page) {
    try {
      logger.info('Solving CAPTCHA with 2Captcha');
      const captchaElement = await page.$('#captcha_element_id'); // Adjust selector
      const captchaImage = await captchaElement.screenshot({ encoding: 'base64' });
      const response = await axios.post('http://2captcha.com/in.php', {
        key: process.env.TWOCAPTCHA_API_KEY,
        method: 'base64',
        body: captchaImage
      });
      const captchaId = response.data.split('|')[1];
      let captchaResult;
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        const result = await axios.get(`http://2captcha.com/res.php?key=${process.env.TWOCAPTCHA_API_KEY}&action=get&id=${captchaId}`);
        if (result.data.includes('OK')) {
          captchaResult = result.data.split('|')[1];
          break;
        }
      }
      if (!captchaResult) throw new Error('CAPTCHA solving failed');
      await page.type('#captcha_input', captchaResult); // Adjust selector
      return captchaResult;
    } catch (error) {
      logger.error('CAPTCHA solving failed', { error: error.message });
      throw error;
    }
  }

  async getVerificationCode() {
    try {
      logger.info('Fetching verification code from Gmail');
      const oauth2Client = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        'https://developers.google.com/oauthplayground'
      );
      oauth2Client.setCredentials({
        access_token: process.env.GMAIL_ACCESS_TOKEN,
        refresh_token: process.env.GMAIL_REFRESH_TOKEN
      });
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const res = await gmail.users.messages.list({
        userId: 'me',
        q: 'from:no-reply@administracionelectronica.gob.es',
        maxResults: 1
      });
      const messageId = res.data.messages[0].id;
      const message = await gmail.users.messages.get({ userId: 'me', id: messageId });
      const body = Buffer.from(message.data.payload.parts[0].body.data, 'base64').toString();
      const codeMatch = body.match(/Your verification code is: (\d{6})/);
      if (!codeMatch) throw new Error('Verification code not found');
      return codeMatch[1];
    } catch (error) {
      logger.error('Failed to fetch verification code', { error: error.message });
      throw error;
    }
  }

  async book(config) {
    let browser;
    try {
      logger.info(`Initiating auto-booking for ${config.province}`, { profile: config.profileId });
      if (!config.name || !config.nie || !config.email) {
        await bot.telegram.sendMessage(process.env.CHAT_ID, `❌ Missing required fields for ${config.province}. Check Google Sheet.`);
        return false;
      }

      // Notify Telegram
      await bot.telegram.sendMessage(process.env.CHAT_ID, `🤖 **AUTO-BOOKING STARTED** 🤖\n\n📍 ${config.province} - ${config.office}\n📝 ${config.procedure}\n🆔 ${config.nie}\n👤 ${config.name}\n📧 ${config.email}`, { parse_mode: 'Markdown' });

      // Launch Puppeteer with ScrapingBee proxy
      browser = await puppeteer.launch({
        headless: true,
        args: [`--proxy-server=https://api.scrapingbee.com?api_key=${process.env.SCRAPINGBEE_API_KEY}&url=`]
      });
      const page = await browser.newPage();

      // Navigate to booking site
      await page.goto(this.baseUrl, { waitUntil: 'networkidle2' });

      // Step 1: Select Trámites > Extranjería
      await page.select('#tramites', 'Extranjería'); // Adjust selector
      await page.waitForTimeout(1000);

      // Step 2: Select Province
      await page.select('#province', config.province);
      await page.waitForTimeout(1000);

      // Step 3: Select Office
      await page.select('#office', config.office);
      await page.waitForTimeout(1000);

      // Step 4: Select Procedure
      await page.select('#procedure', config.procedure);
      await page.waitForTimeout(1000);

      // Step 5: Fill form
      await page.type('#nie', config.nie);
      await page.type('#name', config.name);
      await page.type('#phone', '+34600000000');
      await page.type('#email', config.email);
      await page.click('#accept');

      // Step 6: Solve CAPTCHA
      await this.solveCaptcha(page);
      await page.click('#submit');

      // Step 7: Enter verification code
      const verificationCode = await this.getVerificationCode();
      await page.type('#verification_code', verificationCode);
      await page.click('#submit_code');

      // Step 8: Select earliest date
      await page.waitForSelector('#calendar');
      const dates = await page.$$eval('#calendar .available', elements => elements.map(el => el.getAttribute('data-date')));
      if (!dates.length) throw new Error('No available dates');
      const earliestDate = dates.sort()[0];
      await page.click(`#calendar [data-date="${earliestDate}"]`);
      await page.click('#confirm');

      // Step 9: Final confirmation
      await page.click('#confirm_final');
      await page.waitForSelector('.success-message');
      await page.screenshot({ path: `confirmation_${config.profileId}.png` });

      // Notify success
      await bot.telegram.sendMessage(process.env.CHAT_ID, `🎉 **BOOKING SUCCESSFUL** 🎉\n\n📍 ${config.province}\n🆔 ${config.nie}\nConfirmation saved as confirmation_${config.profileId}.png`, { parse_mode: 'Markdown' });
      return true;
    } catch (error) {
      logger.error(`Auto-booking failed for ${config.province}`, { error: error.message });
      await bot.telegram.sendMessage(process.env.CHAT_ID, `❌ Auto-booking failed for ${config.province}: ${error.message}`, { parse_mode: 'Markdown' });
      return false;
    } finally {
      if (browser) await browser.close();
    }
  }
}

async function emergencyAutoBooking() {
  try {
    await bot.telegram.sendMessage(process.env.CHAT_ID, `✅ Auto-Booking System ACTIVE`);
    const configManager = new ConfigManager(process.env.SHEETS_URL);
    const configs = await configManager.getConfigs();
    const activeConfigs = configs.filter(config => config.active.toString().toLowerCase() === 'yes');
    
    logger.info(`Found ${activeConfigs.length} active configurations`);
    if (activeConfigs.length === 0) {
      await bot.telegram.sendMessage(process.env.CHAT_ID, `⚠️ No active configurations found`);
      return;
    }

    const bookingBot = new BookingBot();
    for (const config of activeConfigs) {
      await bookingBot.book(config);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    await bot.telegram.sendMessage(process.env.CHAT_ID, `✅ **AUTO-BOOKING SEQUENCE COMPLETED**\n\nAll configurations processed.`, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error('Emergency booking failed', { error: error.message });
    await bot.telegram.sendMessage(process.env.CHAT_ID, `❌ Emergency booking error: ${error.message}`);
  }
}

// Telegram commands
bot.command('book', async (ctx) => {
  await ctx.reply('🚀 Initiating auto-booking sequence...');
  await emergencyAutoBooking();
});

bot.command('start', async (ctx) => {
  await ctx.reply('🤖 Cita Previa Auto-Booking Bot\n\nCommands:\n/book - Start auto-booking\n/status - Check status');
});

bot.command('status', async (ctx) => {
  await ctx.reply('✅ Bot is running and monitoring for slots.\nUse /book to start auto-booking.');
});

// Run immediately
emergencyAutoBooking().then(() => {
  console.log('✅ Auto-booking sequence initiated');
}).catch(error => {
  console.error('❌ Auto-booking initiation failed:', error);
});

// Schedule every 10 minutes (9 AM to 3 PM CET)
setInterval(async () => {
  const now = new Date();
  const hour = now.getUTCHours() + 1; // CET is UTC+1
  if (hour >= 8 && hour <= 14) {
    await emergencyAutoBooking();
  }
}, 10 * 60 * 1000);

bot.launch();
console.log('⏰ Auto-booking monitoring scheduled');
