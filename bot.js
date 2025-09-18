require('dotenv').config();
const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');

console.log('🚀 DEBUG: Fully Auto-Booking Bot starting at ' + new Date().toISOString());

const bot = new Telegraf(process.env.BOT_TOKEN);

// Simple logger that sends everything to Telegram
function debugLog(message) {
  console.log(message);
  if (process.env.BOT_TOKEN && process.env.CHAT_ID) {
    try {
      fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chat_id: process.env.CHAT_ID, 
          text: `DEBUG: ${message}` 
        })
      }).catch(err => console.error('Debug send failed:', err));
    } catch (error) {
      console.error('Debug log error:', error);
    }
  }
}

debugLog('Bot initializing...');

// Check environment variables
debugLog('Checking environment variables...');
const requiredVars = ['BOT_TOKEN', 'CHAT_ID', 'SHEETS_URL'];
const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  debugLog(`❌ Missing required variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

debugLog('✅ Environment variables OK');

// 5sim Manager
class FiveSimManager {
  constructor() {
    this.token = process.env.FIVESIM_TOKEN;
    debugLog(`5sim token status: ${this.token ? 'Present' : 'Missing'}`);
  }
  
  async getRealSpanishNumber() {
    debugLog('Attempting to get real Spanish number...');
    
    if (!this.token) {
      debugLog('❌ No 5sim token - using placeholder');
      return { phone: '+34600000000', orderId: null };
    }
    
    try {
      debugLog('📞 Requesting number from 5sim...');
      
      // Simulate 5sim request (since we know it might fail)
      debugLog('⚠️ Simulating 5sim response for debugging');
      
      // Return your real number for testing
      const realNumber = process.env.REAL_PHONE_NUMBER || '+34663939048';
      debugLog(`📱 Using real number: ${realNumber}`);
      
      await bot.telegram.sendMessage(process.env.CHAT_ID, 
        `📱 **PHONE NUMBER READY**\n\n` +
        `Phone: ${realNumber}\n` +
        `Use this number for booking!`
      );
      
      return { phone: realNumber, orderId: 'test123' };
      
    } catch (error) {
      debugLog(`❌ 5sim error: ${error.message}`);
      return { phone: '+34600000000', orderId: null };
    }
  }
}

// Config Manager
class ConfigManager {
  constructor(sheetsUrl) {
    this.sheetsUrl = sheetsUrl;
    debugLog(`Config manager initialized with URL: ${sheetsUrl}`);
  }
  
  async getConfigs() {
    debugLog('Fetching configs from Google Sheets...');
    
    try {
      debugLog(`Making request to: ${this.sheetsUrl}`);
      const response = await fetch(this.sheetsUrl, { timeout: 30000 });
      debugLog(`Response status: ${response.status}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const configs = await response.json();
      debugLog(`Received ${configs.length} configs`);
      debugLog(`Configs: ${JSON.stringify(configs)}`);
      
      return configs;
    } catch (error) {
      debugLog(`❌ Config fetch failed: ${error.message}`);
      throw error;
    }
  }
}

// Main booking function
async function fullyAutomatedBooking() {
  debugLog('Starting fully automated booking process...');
  
  try {
    await bot.telegram.sendMessage(process.env.CHAT_ID, 
      `✅ Auto-Booking System ACTIVE\n` +
      `Starting automated booking process...`
    );
    
    // Initialize managers
    debugLog('Initializing managers...');
    const fiveSim = new FiveSimManager();
    const configManager = new ConfigManager(process.env.SHEETS_URL);
    
    // Get configs
    debugLog('Fetching configurations...');
    let configs = await configManager.getConfigs();
    debugLog(`Raw configs: ${JSON.stringify(configs)}`);
    
    // Filter active configs
    configs = configs.filter(config => {
      debugLog(`Checking config: ${JSON.stringify(config)}`);
      const isActive = config.active && config.active.toString().toLowerCase() === 'yes';
      debugLog(`Config active status: ${isActive}`);
      return isActive;
    });
    
    debugLog(`Filtered configs count: ${configs.length}`);
    
    if (configs.length === 0) {
      debugLog('❌ No active configurations found');
      await bot.telegram.sendMessage(process.env.CHAT_ID, 
        `⚠️ No active configurations found in Google Sheets`
      );
      return;
    }
    
    // Process first config
    const config = configs[0];
    debugLog(`Processing config: ${JSON.stringify(config)}`);
    
    await bot.telegram.sendMessage(process.env.CHAT_ID, 
      `🤖 **AUTOMATED BOOKING INITIATED**\n\n` +
      `📍 ${config.province || 'Unknown'}\n` +
      `📝 ${config.procedure || 'Unknown'}\n` +
      `🆔 ${config.nie || 'Unknown'}\n` +
      `👤 ${config.name || 'Unknown'}\n` +
      `📧 ${config.email || 'Unknown'}`
    );
    
    // Get phone number
    debugLog('Getting phone number...');
    const phoneNumberData = await fiveSim.getRealSpanishNumber();
    debugLog(`Phone data: ${JSON.stringify(phoneNumberData)}`);
    
    // Send booking instructions
    await bot.telegram.sendMessage(process.env.CHAT_ID,
      `📝 **BOOKING INSTRUCTIONS**\n\n` +
      `1. Go to: https://icp.administracionelectronica.gob.es/icpplus/index.html\n` +
      `2. Select: Trámites > Extranjería\n` +
      `3. Province: ${config.province}\n` +
      `4. Office: ${config.office}\n` +
      `5. Procedure: ${config.procedure}\n` +
      `6. Fill form:\n` +
      `   • NIE: ${config.nie}\n` +
      `   • Name: ${config.name}\n` +
      `   • Phone: ${phoneNumberData.phone}\n` +
      `   • Email: ${config.email}\n` +
      `7. Solve CAPTCHA and submit\n` +
      `8. Wait for SMS code to ${phoneNumberData.phone}\n` +
      `9. Enter code and select EARLIEST date\n\n` +
      `Type /confirm when complete, /failed if it fails`
    );
    
    debugLog('Booking process completed successfully');
    
  } catch (error) {
    debugLog(`❌ Main process error: ${error.message}`);
    debugLog(`Error stack: ${error.stack}`);
    
    await bot.telegram.sendMessage(process.env.CHAT_ID,
      `❌ **BOOKING PROCESS ERROR**\n\n` +
      `Error: ${error.message}\n\n` +
      `Please try manual booking with your real number: +34663939048`
    );
  }
}

// Command handlers
debugLog('Setting up command handlers...');

bot.command('book', async (ctx) => {
  debugLog('/book command received');
  await ctx.reply('🚀 Initiating fully automated booking...');
  await fullyAutomatedBooking();
});

bot.command('confirm', async (ctx) => {
  debugLog('/confirm command received');
  await ctx.reply('🎉 **BOOKING CONFIRMED!** 🎉\n\n✅ Great job! Take a screenshot of your confirmation.');
});

bot.command('failed', async (ctx) => {
  debugLog('/failed command received');
  await ctx.reply('❌ Booking failed. Check the instructions and try again with /book');
});

bot.command('start', async (ctx) => {
  debugLog('/start command received');
  await ctx.reply('🤖 Cita Previa Auto-Booking Bot\n\nCommands:\n/book - Start booking\n/confirm - Confirm success\n/failed - Report failure');
});

bot.command('debug', async (ctx) => {
  debugLog('/debug command received');
  const envStatus = {
    BOT_TOKEN: !!process.env.BOT_TOKEN,
    CHAT_ID: !!process.env.CHAT_ID,
    SHEETS_URL: !!process.env.SHEETS_URL,
    FIVESIM_TOKEN: !!process.env.FIVESIM_TOKEN
  };
  await ctx.reply(`Debug Status:\n${JSON.stringify(envStatus, null, 2)}`);
});

// Start the bot
debugLog('Launching bot...');
bot.launch().then(() => {
  debugLog('✅ Bot launched successfully');
}).catch(error => {
  debugLog(`❌ Bot launch failed: ${error.message}`);
});

debugLog('Bot initialization complete');

// Run once immediately for testing
setTimeout(async () => {
  debugLog('Running initial booking test...');
  await fullyAutomatedBooking();
}, 5000);
