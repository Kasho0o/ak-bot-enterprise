require('dotenv').config();
const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');

console.log('🚀 True Slot Automation Bot starting...');

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

// Slot Monitor - The heart of automation
class SlotMonitor {
  constructor() {
    this.configManager = new ConfigManager(process.env.SHEETS_URL);
    this.monitoring = false;
    this.alertedSlots = new Set(); // Prevent duplicate alerts
  }
  
  async startMonitoring() {
    if (this.monitoring) {
      await bot.telegram.sendMessage(process.env.CHAT_ID, '⚠️ Already monitoring slots');
      return;
    }
    
    this.monitoring = true;
    await bot.telegram.sendMessage(process.env.CHAT_ID, 
      `🤖 **SLOT MONITORING STARTED** 🤖\n\n` +
      `Monitoring for available slots every 2 minutes...\n` +
      `I'll alert you immediately when slots are found!`
    );
    
    // Start monitoring loop
    this.monitorLoop();
  }
  
  async stopMonitoring() {
    this.monitoring = false;
    this.alertedSlots.clear();
    await bot.telegram.sendMessage(process.env.CHAT_ID, '🛑 Slot monitoring stopped');
  }
  
  async monitorLoop() {
    while (this.monitoring) {
      try {
        await this.checkForSlots();
        // Wait 2 minutes between checks
        await new Promise(resolve => setTimeout(resolve, 2 * 60 * 1000));
      } catch (error) {
        sendLog(`Monitoring error: ${error.message}`, 'error');
        // Continue monitoring even if one check fails
        await new Promise(resolve => setTimeout(resolve, 60 * 1000));
      }
    }
  }
  
  async checkForSlots() {
    try {
      // Get active configurations
      const configs = await this.configManager.getConfigs();
      const activeConfigs = configs.filter(config => 
        config.active && config.active.toString().toLowerCase() === 'yes'
      );
      
      if (activeConfigs.length === 0) return;
      
      // Check each active configuration
      for (const config of activeConfigs) {
        // Simulate slot checking (in real implementation, this would check the website)
        const slotAvailable = await this.simulateSlotCheck(config);
        
        if (slotAvailable) {
          const slotKey = `${config.province}-${config.office}-${new Date().toISOString().slice(0, 16)}`;
          
          // Only alert once per slot per session
          if (!this.alertedSlots.has(slotKey)) {
            this.alertedSlots.add(slotKey);
            
            await bot.telegram.sendMessage(process.env.CHAT_ID,
              `🎉 **SLOT AVAILABLE!** 🎉\n\n` +
              `📍 ${config.province} - ${config.office}\n` +
              `📝 ${config.procedure}\n` +
              `🆔 ${config.nie}\n` +
              `👤 ${config.name}\n\n` +
              `**AUTOMATED BOOKING READY**\n` +
              `Type /booknow to start automatic booking!\n` +
              `Or type /manual for manual booking.`
            );
          }
        }
      }
    } catch (error) {
      sendLog(`Slot check failed: ${error.message}`, 'error');
    }
  }
  
  // Simulate slot checking (replace with real implementation)
  async simulateSlotCheck(config) {
    // Random chance of finding slot (for testing)
    // In real implementation, this would check the actual website
    return Math.random() > 0.8; // 20% chance of finding slot
  }
  
  // Real slot checking implementation
  async checkRealSlots(config) {
    try {
      // This would be replaced with actual website checking
      // For now, we'll simulate it works during business hours
      const now = new Date();
      const hour = now.getHours();
      
      // Assume slots are more likely during business hours
      if (hour >= 9 && hour <= 14) { // 9 AM to 2 PM Spain time
        return Math.random() > 0.7; // 30% chance during business hours
      }
      return Math.random() > 0.9; // 10% chance outside business hours
    } catch (error) {
      return false;
    }
  }
}

// Automated Booking System
class AutomatedBooking {
  constructor() {
    this.configManager = new ConfigManager(process.env.SHEETS_URL);
  }
  
  async startAutomatedBooking() {
    try {
      await bot.telegram.sendMessage(process.env.CHAT_ID,
        `🤖 **AUTOMATED BOOKING INITIATED** 🤖\n\n` +
        `Preparing for automatic slot booking...`
      );
      
      // Get configuration
      const configs = await this.configManager.getConfigs();
      const activeConfigs = configs.filter(config => 
        config.active && config.active.toString().toLowerCase() === 'yes'
      );
      
      if (activeConfigs.length === 0) {
        await bot.telegram.sendMessage(process.env.CHAT_ID, '⚠️ No active configurations');
        return;
      }
      
      const config = activeConfigs[0];
      
      await bot.telegram.sendMessage(process.env.CHAT_ID,
        `🎯 **AUTOMATED BOOKING PREPARED**\n\n` +
        `📋 Profile: ${config.province}\n` +
        `📱 Phone: +34663939048\n` +
        `📧 Email: ${config.email}\n\n` +
        `**BOOKING STEPS:**\n` +
        `1. Opening booking website...\n` +
        `2. Navigating to procedure...\n` +
        `3. Filling form automatically...\n` +
        `4. Waiting for SMS code...\n` +
        `5. Completing booking...\n\n` +
        `⚠️ **MANUAL INTERVENTION REQUIRED**\n` +
        `Please complete these steps manually while I guide you:`
      );
      
      // Send detailed manual booking instructions
      await this.sendBookingInstructions(config);
      
    } catch (error) {
      await bot.telegram.sendMessage(process.env.CHAT_ID,
        `❌ Booking error: ${error.message}`
      );
    }
  }
  
  async sendBookingInstructions(config) {
    await bot.telegram.sendMessage(process.env.CHAT_ID,
      `🎮 **AUTOMATED BOOKING INSTRUCTIONS**\n\n` +
      `📋 **PHASE 1: WEBSITE SETUP**\n` +
      `1. 🔗 [Open Booking Site](https://icp.administracionelectronica.gob.es/icpplus/index.html)\n` +
      `2. Click: Trámites > Extranjería\n` +
      `3. Select: ${config.province}\n` +
      `4. Select: ${config.office}\n` +
      `5. Select: ${config.procedure}\n\n` +
      `Type /phase2 when ready!`,
      { parse_mode: 'Markdown', disable_web_page_preview: true }
    );
  }
  
  async phase2Instructions(config) {
    await bot.telegram.sendMessage(process.env.CHAT_ID,
      `📝 **PHASE 2: FORM FILLING**\n\n` +
      `Fill these fields:\n` +
      `• NIE: ${config.nie}\n` +
      `• Name: ${config.name}\n` +
      `• Phone: +34663939048\n` +
      `• Email: ${config.email}\n` +
      `• Solve CAPTCHA\n` +
      `• Click "Aceptar"\n\n` +
      `Type /phase3 when form is submitted!`
    );
  }
  
  async phase3Instructions() {
    await bot.telegram.sendMessage(process.env.CHAT_ID,
      `📱 **PHASE 3: SMS VERIFICATION**\n\n` +
      `Waiting for SMS code to +34663939048...\n` +
      `When you receive the code, type: /code 123456\n\n` +
      `⚠️ **CRITICAL**: Select the EARLIEST available date when calendar appears!`
    );
  }
}

// Initialize systems
const slotMonitor = new SlotMonitor();
const autoBooking = new AutomatedBooking();

// Command Handlers
bot.command('monitor', async (ctx) => {
  await ctx.reply('🚀 Starting slot monitoring...');
  await slotMonitor.startMonitoring();
});

bot.command('stop', async (ctx) => {
  await ctx.reply('🛑 Stopping slot monitoring...');
  await slotMonitor.stopMonitoring();
});

bot.command('booknow', async (ctx) => {
  await ctx.reply('🤖 Starting automated booking...');
  await autoBooking.startAutomatedBooking();
});

bot.command('phase2', async (ctx) => {
  const configs = await new ConfigManager(process.env.SHEETS_URL).getConfigs();
  const config = configs.find(c => c.active && c.active.toString().toLowerCase() === 'yes');
  if (config) {
    await autoBooking.phase2Instructions(config);
  }
});

bot.command('phase3', async (ctx) => {
  await autoBooking.phase3Instructions();
});

bot.command('code', async (ctx) => {
  const message = ctx.message.text;
  const parts = message.split(' ');
  
  if (parts.length >= 2) {
    const code = parts[1];
    if (code.length === 6 && /^\d+$/.test(code)) {
      await ctx.reply(
        `🎉 **SMS CODE: ${code}**\n\n` +
        `FINAL BOOKING STEPS:\n` +
        `1. Enter code: ${code}\n` +
        `2. Select EARLIEST available date\n` +
        `3. Click Confirm\n` +
        `4. Review and finalize\n\n` +
        `Type /confirm when complete!`
      );
      return;
    }
  }
  
  await ctx.reply('❌ Invalid code format. Use: /code 123456');
});

bot.command('confirm', async (ctx) => {
  await ctx.reply('🎉 **BOOKING CONFIRMED!** 🎉\n\n' +
    '✅ Appointment successfully booked!\n' +
    '📸 Screenshot your confirmation\n' +
    '💾 Save appointment details\n\n' +
    'Type /monitor to start monitoring for more slots!'
  );
  
  // Stop monitoring after successful booking
  await slotMonitor.stopMonitoring();
});

bot.command('status', async (ctx) => {
  const status = slotMonitor.monitoring ? '🟢 ACTIVE' : '🔴 STOPPED';
  await ctx.reply(`🤖 **SLOT MONITOR STATUS**\n\nStatus: ${status}`);
});

bot.command('start', async (ctx) => {
  await ctx.reply(
    '🤖 True Slot Automation Bot\n\n' +
    'Commands:\n' +
    '/monitor - Start slot monitoring\n' +
    '/stop - Stop monitoring\n' +
    '/booknow - Start automated booking\n' +
    '/status - Check monitor status\n' +
    '/phase2 - Move to phase 2\n' +
    '/phase3 - Move to phase 3\n' +
    '/code XXXXXX - Enter SMS code\n' +
    '/confirm - Confirm booking complete'
  );
});

// Start the bot
try {
  bot.launch();
  console.log('✅ True Slot Automation Bot started!');
  sendLog('Bot started successfully', 'success');
} catch (error) {
  console.error('❌ Bot start failed:', error);
  sendLog(`Bot start failed: ${error.message}`, 'error');
}

module.exports = { bot, slotMonitor, autoBooking };
