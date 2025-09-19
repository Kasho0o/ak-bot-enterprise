require('dotenv').config();
const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');

console.log('🚀 Emergency Booking Bot starting...');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Simple working version - no crashes
bot.command('start', async (ctx) => {
  await ctx.reply('🤖 Emergency Booking Bot\n\nJust follow the instructions!');
});

// Direct booking command - simple and works
bot.command('booknow', async (ctx) => {
  await ctx.reply(
    `🚨 **EMERGENCY BOOKING - SLOT AVAILABLE!** 🚨\n\n` +
    `📋 YOUR INFORMATION:\n` +
    `📍 Province: Badajoz\n` +
    `🏢 Office: CNP MÉRIDA TARJETAS\n` +
    `📝 Procedure: RECOGIDA DE TARJETA DE IDENTIDAD DE EXTRANJERO (TIE)\n` +
    `🆔 NIE: Z3690330P\n` +
    `👤 Name: Kashif\n` +
    `📧 Email: decitaprevia@gmail.com\n` +
    `📱 Phone: +34663939048\n\n` +
    `🎮 **BOOK NOW - STEP BY STEP:**\n` +
    `1. 🔗 [CLICK HERE TO BOOK](https://icp.administracionelectronica.gob.es/icpplus/index.html)\n` +
    `2. Select: Trámites > Extranjería\n` +
    `3. Choose: Badajoz > CNP MÉRIDA TARJETAS\n` +
    `4. Select procedure\n` +
    `5. Fill form with details above\n` +
    `6. Solve CAPTCHA and submit\n` +
    `7. Wait for SMS to +34663939048\n` +
    `8. When you get code, type: /code 123456\n` +
    `9. Select EARLIEST date and confirm\n\n` +
    `⚠️ **WORK FAST - SLOTS DISAPPEAR QUICKLY!**`,
    { parse_mode: 'Markdown', disable_web_page_preview: true }
  );
});

// SMS code handling
bot.command('code', async (ctx) => {
  const message = ctx.message.text;
  const parts = message.split(' ');
  
  if (parts.length >= 2) {
    const code = parts[1];
    if (code.length === 6 && /^\d+$/.test(code)) {
      await ctx.reply(
        `🎉 **SMS CODE: ${code}**\n\n` +
        `✅ FINAL BOOKING STEPS:\n` +
        `1. Enter code: ${code} on the website\n` +
        `2. Calendar will show available dates\n` +
        `3. SELECT THE EARLIEST DATE!\n` +
        `4. Click Confirm button\n` +
        `5. Review and finalize booking\n\n` +
        `When complete, type: /done`
      );
      return;
    }
  }
  
  await ctx.reply(
    `❌ **INVALID CODE FORMAT**\n\n` +
    `Please use exactly: /code 123456\n` +
    `Replace 123456 with your actual 6-digit SMS code.`
  );
});

// Booking completion
bot.command('done', async (ctx) => {
  await ctx.reply('🎉 **CONGRATULATIONS!** 🎉\n\n' +
    '✅ Your appointment is BOOKED!\n' +
    '📸 Take screenshot of confirmation\n' +
    '💾 Save the appointment details\n' +
    '📍 Location: Badajoz - CNP MÉRIDA TARJETAS\n\n' +
    'Thank you for using the Emergency Booking System!'
  );
});

// Simple start
bot.launch();
console.log('✅ Emergency Booking Bot is running!');
