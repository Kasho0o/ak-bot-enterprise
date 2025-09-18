// Add these requires at the top of your file, after the other requires:
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// Replace the entire BrowserlessManager class with this:
class BrowserlessManager {
  constructor() {
    this.token = process.env.BROWSERLESS_TOKEN || '2T4jHExQDja2fXee48179e6cf8d9d3f52bf897de38f71f318';
    this.endpoint = `wss://chrome.browserless.io?token=${this.token}`;
    logger.log(`Browserless endpoint: ${this.endpoint}`, 'info');
  }
  
  async getBrowser() {
    try {
      logger.log('Connecting to Browserless...', 'info');
      const browser = await puppeteer.connect({
        browserWSEndpoint: this.endpoint,
        defaultViewport: null
      });
      logger.log('Browserless connected successfully', 'success');
      await bot.telegram.sendMessage(process.env.CHAT_ID, `✅ Browser connected to Browserless!`);
      return browser;
    } catch (error) {
      logger.log(`Browserless connection failed: ${error.message}`, 'error');
      throw error;
    }
  }
  
  async autoFillForm(browser, config, phoneNumber) {
    try {
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
      
      logger.log('Navigating to booking site...', 'info');
      await bot.telegram.sendMessage(process.env.CHAT_ID, `🌐 Navigating to booking site...`);
      
      // Navigate to the booking site
      await page.goto('https://icp.administracionelectronica.gob.es/icpplus/index.html', {
        waitUntil: 'networkidle0',
        timeout: 60000
      });
      
      await bot.telegram.sendMessage(process.env.CHAT_ID, `✅ Site loaded! Starting form filling...`);
      
      // Click on Extranjería
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
      
      // Fill the form automatically
      await page.waitForSelector('select[name="provincia"]', { timeout: 30000 });
      await page.select('select[name="provincia"]', config.province);
      
      await page.waitForSelector('select[name="oficina"]', { timeout: 30000 });
      await page.select('select[name="oficina"]', config.office);
      
      await page.waitForSelector('input[name="tramite"]', { timeout: 30000 });
      await page.type('input[name="tramite"]', config.procedure);
      
      await page.click('input[value="Buscar"]');
      
      await bot.telegram.sendMessage(process.env.CHAT_ID, `✅ Form submitted! Waiting for next page...`);
      
      return page;
      
    } catch (error) {
      logger.log(`Auto fill failed: ${error.message}`, 'error');
      throw error;
    }
  }
}
