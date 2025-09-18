require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha');
const { Telegraf } = require('telegraf');
const fs = require('fs');
const fetch = require('node-fetch');
const pLimit = require('p-limit');

puppeteer.use(StealthPlugin());
puppeteer.use(RecaptchaPlugin({ provider: { id: 'capsolver', token: process.env.CAPSOLVER_KEY }, visualFeedback: true, fallback: { id: '2captcha', token: process.env.TWOCAPTCHA_KEY } }));

const bot = new Telegraf(process.env.BOT_TOKEN);
const limit = pLimit(3);
// [Full code with Logger, ConfigManager, SMSManager, RetryManager, HealthMonitor, findAvailableSlots, bookAppointment, main]
// Use the complete bot.js from the previous enterprise response