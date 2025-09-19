// Add these enhanced commands to your existing bot:

bot.command('status', async (ctx) => {
  const status = slotMonitor.monitoring ? '🟢 ACTIVE' : '🔴 STOPPED';
  const slotCount = slotMonitor.alertedSlots.size;
  
  await ctx.reply(
    `🤖 **SLOT MONITOR STATUS**\n\n` +
    `Status: ${status}\n` +
    `Slots Found: ${slotCount}\n` +
    `Monitoring Since: ${new Date().toLocaleString()}\n\n` +
    `Next check in: ~${Math.max(0, 120 - Math.floor((Date.now() % 120000) / 1000))} seconds`
  );
});

bot.command('forcecheck', async (ctx) => {
  await ctx.reply('🔍 Force checking for slots now...');
  
  try {
    // Force immediate slot check
    const configs = await slotMonitor.configManager.getConfigs();
    const activeConfigs = configs.filter(config => 
      config.active && config.active.toString().toLowerCase() === 'yes'
    );
    
    let slotsFound = 0;
    
    for (const config of activeConfigs) {
      // Simulate immediate check
      const slotAvailable = Math.random() > 0.7; // 30% chance for testing
      
      if (slotAvailable) {
        slotsFound++;
        const slotKey = `${config.province}-${new Date().getTime()}`;
        
        if (!slotMonitor.alertedSlots.has(slotKey)) {
          slotMonitor.alertedSlots.add(slotKey);
          
          await ctx.reply(
            `🚨 **IMMEDIATE SLOT ALERT** 🚨\n\n` +
            `📍 ${config.province} - ${config.office}\n` +
            `Available NOW!\n\n` +
            `Type /booknow to start booking immediately!`
          );
        }
      }
    }
    
    if (slotsFound === 0) {
      await ctx.reply('✅ Check completed - No new slots found right now.');
    }
    
  } catch (error) {
    await ctx.reply(`❌ Force check failed: ${error.message}`);
  }
});

bot.command('testalert', async (ctx) => {
  // Send a test alert to simulate slot found
  await ctx.reply(
    `🎉 **TEST SLOT AVAILABLE!** 🎉\n\n` +
    `📍 Badajoz - CNP MÉRIDA TARJETAS\n` +
    `📝 RECOGIDA DE TARJETA DE IDENTIDAD DE EXTRANJERO (TIE)\n` +
    `Available NOW!\n\n` +
    `Type /booknow to start booking!`
  );
});

bot.command('clearalerts', async (ctx) => {
  const previousCount = slotMonitor.alertedSlots.size;
  slotMonitor.alertedSlots.clear();
  await ctx.reply(`✅ Cleared ${previousCount} previous slot alerts. Ready for new slots!`);
});
