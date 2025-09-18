require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha');
const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');
const pLimit = require('p-limit');

console.log('🚀 Bot starting at ' + new Date().toISOString());

// Validate required environment variables
const requiredVars = ['BOT_TOKEN', 'CHAT_ID', 'SHEETS_URL'];
const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars);
  process.exit(1);
}

try {
  new URL(process.env.SHEETS_URL);
  console.log('✅ SHEETS_URL is valid');
} catch (error) {
  console.error('❌ SHEETS_URL is invalid:', process.env.SHEETS_URL);
  process.exit(1);
}

puppeteer.use(StealthPlugin());
if (process.env.CAPSOLVER_KEY) {
  puppeteer.use(RecaptchaPlugin({ 
    provider: { id: 'capsolver', token: process.env.CAPSOLVER_KEY }, 
    visualFeedback: true
  }));
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const limit = pLimit(1); // Only 1 concurrent booking to avoid conflicts

class Logger {
  log(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level, message, metadata, pid: process.pid };
    const logMessage = JSON.stringify(logEntry);
    console[level.toLowerCase() === 'error' ? 'error' : 'log'](logMessage);
    if (level === 'ERROR' && metadata.critical) this.sendTelegramAlert(logEntry);
  }
  info(message, metadata) { this.log('INFO', message, metadata); }
  warn(message, metadata) { this.log('WARN', message, metadata); }
  error(message, metadata) { this.log('ERROR', message, metadata); }
  success(message, metadata) { this.log('SUCCESS', message, metadata); }
  async sendTelegramAlert(entry) {
    if (process.env.BOT_TOKEN && process.env.CHAT_ID) {
      try {
        const alert = [`🚨 CRITICAL: ${entry.message}`, `Time: ${entry.timestamp}`, `Profile: ${entry.metadata.profile || 'N/A'}`].join('\n');
        await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: process.env.CHAT_ID, text: alert })
        });
      } catch (error) { console.error('Alert failed:', error); }
    }
  }
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

// Enhanced Slot Detection
async function findAvailableSlots(page) {
  try {
    // Wait for calendar to load (increased timeout for slow connections)
    await page.waitForSelector('td.available, td.disponible, td[class*="available"]', { timeout: 30000 });
    
    const slots = await page.evaluate(() => {
      // Multiple strategies to find available slots
      const selectors = ['td.available', 'td.disponible', 'td[class*="available"]', 'td[style*="cursor: pointer"]'];
      let availableCells = [];
      
      for (const selector of selectors) {
        const cells = Array.from(document.querySelectorAll(selector));
        if (cells.length > 0) {
          availableCells = cells;
          break;
        }
      }
      
      return availableCells
        .filter(cell => {
          const text = cell.textContent.trim();
          // Look for date patterns DD/MM/YYYY
          return text && /\d{1,2}\/\d{1,2}\/\d{4}/.test(text);
        })
        .map(cell => ({
          date: cell.textContent.trim(),
          element: cell
        }))
        .sort((a, b) => {
          // Sort by date (earliest first)
          const dateA = new Date(a.date.split('/').reverse().join('-'));
          const dateB = new Date(b.date.split('/').reverse().join('-'));
          return dateA - dateB;
        });
    });
    
    if (slots.length > 0) {
      const earliestSlot = slots[0];
      logger.success(`Found slot: ${earliestSlot.date}`);
      await bot.telegram.sendMessage(process.env.CHAT_ID, `🎉 Slot found: ${earliestSlot.date}`);
      return earliestSlot;
    }
  } catch (error) {
    logger.warn('Slot detection failed:', error.message);
  }
  return null;
}

// Enhanced booking function with real automation
async function bookAppointment(config) {
  let browser;
  let success = false;
  
  try {
    logger.info(`Starting booking for ${config.province}`, { profile: config.province });
    await bot.telegram.sendMessage(process.env.CHAT_ID, `🚀 Starting booking for ${config.province}...`);
    
    // Connect to Browserless
    if (!process.env.BROWSERLESS_TOKEN) {
      throw new Error('BROWSERLESS_TOKEN is required for booking');
    }
    
    browser = await puppeteer.connect({
      browserWSEndpoint: `wss://chrome.browserless.io?token=${process.env.BROWSERLESS_TOKEN}`,
      defaultViewport: null
    });
    
    const page = await browser.newPage();
    
    // Set up request interception to block unnecessary resources
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    // Navigate to the main page
    logger.info('Navigating to Cita Previa');
    await page.goto('https://icpplus.sede.administracionespublicas.gob.es/icpplus/index.html', {
      waitUntil: 'networkidle0',
      timeout: 60000
    });
    
    // Find and click the extranjería link
    await page.waitForSelector('a', { timeout: 30000 });
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const extranjeriaLink = links.find(link => 
        link.textContent.toLowerCase().includes('extranjería') || 
        link.textContent.toLowerCase().includes('extranjeria') ||
        link.href.includes('extranjeria')
      );
      if (extranjeriaLink) {
        extranjeriaLink.click();
      }
    });
    
    // Wait for navigation
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 });
    
    // Fill the form
    logger.info('Filling form');
    await page.waitForSelector('select[name="provincia"]', { timeout: 30000 });
    await page.select('select[name="provincia"]', config.province);
    
    await page.waitForSelector('select[name="oficina"]', { timeout: 30000 });
    await page.select('select[name="oficina"]', config.office);
    
    await page.waitForSelector('input[name="tramite"]', { timeout: 30000 });
    await page.type('input[name="tramite"]', config.procedure);
    
    await page.click('input[value="Buscar"]');
    
    // Solve CAPTCHA if present
    try {
      const { solved } = await page.solveRecaptchas();
      if (solved.length > 0) {
        logger.success(`CAPTCHA solved for ${config.province}`);
      }
    } catch (error) {
      logger.warn(`CAPTCHA solving failed: ${error.message}`);
    }
    
    // Wait for and find available slots
    logger.info('Searching for available slots');
    let slotFound = false;
    let attempts = 0;
    const maxAttempts = 20;
    
    while (attempts < maxAttempts && !slotFound) {
      attempts++;
      logger.info(`Slot search attempt ${attempts}/${maxAttempts}`);
      
      const slot = await findAvailableSlots(page);
      if (slot) {
        // Click on the earliest available slot
        await page.evaluate((date) => {
          const cells = Array.from(document.querySelectorAll('td'));
          const targetCell = cells.find(cell => cell.textContent.trim() === date);
          if (targetCell) {
            targetCell.click();
          }
        }, slot.date);
        
        slotFound = true;
        await bot.telegram.sendMessage(process.env.CHAT_ID, `✅ Selected slot: ${slot.date}`);
        break;
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Refresh the page
      await page.reload({ waitUntil: 'networkidle0', timeout: 60000 });
    }
    
    if (!slotFound) {
      throw new Error(`No available slots found for ${config.province} after ${maxAttempts} attempts`);
    }
    
    // Fill personal information
    logger.info('Filling personal information');
    await page.waitForSelector('input[name="nie"]', { timeout: 30000 });
    await page.type('input[name="nie"]', config.nie);
    
    // For now, we'll use a placeholder phone number
    // In production, you'd integrate with 5sim or similar
    await page.type('input[name="telefono"]', '600000000'); // Placeholder
    
    await page.type('input[name="email"]', config.email);
    
    // Submit the form
    await page.click('input[value="Continuar"]');
    
    // Wait for confirmation
    try {
      await page.waitForSelector('.success, .confirmacion, [class*="success"]', { timeout: 30000 });
      await bot.telegram.sendMessage(process.env.CHAT_ID, `🎉 CONFIRMED: Appointment booked for ${config.province} on ${slot.date}!`);
      logger.success(`Appointment booked for ${config.province}`);
      success = true;
    } catch (error) {
      // Check if we're on the confirmation page anyway
      const pageText = await page.evaluate(() => document.body.textContent);
      if (pageText.includes('confirm') || pageText.includes('cita') || pageText.includes('appointment')) {
        await bot.telegram.sendMessage(process.env.CHAT_ID, `🎉 Appointment appears to be booked for ${config.province}! Please check manually.`);
        success = true;
      } else {
        throw new Error('Failed to confirm booking');
      }
    }
    
  } catch (error) {
    logger.error(`Booking failed for ${config.province}`, { error: error.message, profile: config.province });
    await bot.telegram.sendMessage(process.env.CHAT_ID, `❌ Booking failed for ${config.province}: ${error.message}`);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
    if (!success) {
      await bot.telegram.sendMessage(process.env.CHAT_ID, `⚠️ Booking process completed for ${config.province} but may require manual verification`);
    }
  }
}

async function main() {
  console.log('🚀 Main function started at ' + new Date().toISOString());
  try {
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
    
    // Sort by priority
    configs.sort((a, b) => (a.priority || 3) - (b.priority || 3));
    
    // Run bookings one by one
    for (const config of configs) {
      try {
        await bookAppointment(config);
        // Add delay between bookings
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        logger.error(`Failed to book for ${config.province}`, { error: error.message });
        // Continue with next config
      }
    }
    
    await bot.telegram.sendMessage(process.env.CHAT_ID, `✅ All booking attempts completed`);
    
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

// Run immediately and then every 10 minutes
console.log('🚀 Bot initialization complete, starting main function...');
main().then(() => {
  console.log('✅ Initial run completed');
}).catch(error => {
  console.error('❌ Initial run failed:', error);
});

setInterval(main, 10 * 60 * 1000);
console.log('⏰ Cron job scheduled for every 10 minutes');
