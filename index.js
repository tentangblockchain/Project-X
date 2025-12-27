// Project-X LP Daily Analysis Bot - Production Ready with PostgreSQL & Groq AI
const { Telegraf, Markup } = require('telegraf');
const { Pool } = require('pg');
const https = require('https');
const dns = require('dns');
const Groq = require('groq-sdk');
require('dotenv').config();

// 🌐 Force IPv4
dns.setDefaultResultOrder('ipv4first');

// 🚀 Groq Client
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// 🔗 Keep-Alive HTTPS Agent
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  timeout: 30000
});

// 🗄️ PostgreSQL Connection Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// 🗄️ Database Setup
async function initDatabase() {
  const client = await pool.connect();
  try {
    console.log('🗄️ Checking database tables...');
    
    // Create accounts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id SERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        account_number INTEGER NOT NULL,
        saldo DECIMAL(15,2) DEFAULT 0,
        total_points DECIMAL(15,2) DEFAULT 0,
        total_fees DECIMAL(15,2) DEFAULT 0,
        pending_yield DECIMAL(15,2) DEFAULT 0,
        account_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, account_number)
      );
    `);

    // Migration: Add missing columns if they don't exist
    try {
      await client.query(`
        ALTER TABLE accounts 
        ADD COLUMN IF NOT EXISTS account_name VARCHAR(100)
      `);
      console.log('✅ Migration: account_name column added/verified');
    } catch (e) {
      console.log('ℹ️ account_name column already exists');
    }

    try {
      await client.query(`
        ALTER TABLE accounts 
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `);
      console.log('✅ Migration: updated_at column added/verified');
    } catch (e) {
      console.log('ℹ️ updated_at column already exists');
    }

    // Create positions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS positions (
        id SERIAL PRIMARY KEY,
        account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
        pair VARCHAR(50) NOT NULL,
        position_size DECIMAL(15,4) DEFAULT 0,
        apr DECIMAL(10,2) DEFAULT 0,
        in_range BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create daily_history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_history (
        id SERIAL PRIMARY KEY,
        account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
        saldo DECIMAL(15,2),
        total_points DECIMAL(15,2),
        total_fees DECIMAL(15,2),
        recorded_at DATE DEFAULT CURRENT_DATE,
        UNIQUE(account_id, recorded_at)
      );
    `);

    console.log('✅ Database tables ready!');
  } catch (err) {
    console.error('❌ Database initialization error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

// 🎯 Smart Parser Logic with Groq (Cascade Mode)
async function parseAccountDataSmart(text) {
  const models = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "qwen/qwen3-32b",
    "allam-2-7b"
  ];

  for (const model of models) {
    try {
      console.log(`🤖 Trying AI Model: ${model}`);
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `You are a specialized parser for Project-X dashboard data. 
            Extract fields in JSON: 
            - saldo (number): Total portfolio value
            - totalPoints (number): Current total points (e.g., 426.5)
            - pointsChange (number): Points today (e.g., +39.0)
            - rank (string): User rank (e.g., "12992")
            - totalFees (number): Total fees earned (e.g., $20.77)
            - feesToday (number): Fees today (e.g., $0.8003)
            - pendingYield (number): Unclaimed/Pending yield (e.g., $0.8118)
            - positions (array): { 
                pair (string, e.g., "HYPE/USD"), 
                positionSize (number, e.g., 194.21), 
                apr (number, e.g., 162.55), 
                range (string, e.g., "24.441 - 26.822"), 
                currentPrice (number, e.g., 26.121), 
                status (string, e.g., "In Range"), 
                unclaimed (number, e.g., 0.1546) 
              }
            - accountNumber (number): If specified as "Akun X" in text, extract X
            - accountName (string): If specified as "Akun X" in text, use that
            
            IMPORTANT:
            - If data for Akun 1 and Akun 2 are both present, ONLY extract the data for the account explicitly mentioned or the first one if not specified.
            - If multiple accounts are detected in one text, please process them as separate entries if possible, or focus on the one the user is likely pointing to.
            - For "Fees Today", some data might have extreme numbers like $663... due to OCR/Copy-paste errors. Try to sanitize or capture as is, but prioritize logical currency values.
            
            Return ONLY valid JSON. If a value is missing, use null.`
          },
          { role: "user", content: text }
        ],
        model: model,
        response_format: { type: "json_object" }
      });
      return JSON.parse(completion.choices[0].message.content);
    } catch (error) {
      console.error(`⚠️ Model ${model} failed, trying next...`, error.message);
      continue;
    }
  }
  return null;
}

// 📸 Smart Vision Parser with Groq (Cascade Mode)
async function processImageGroq(imageBuffer) {
  const visionModels = [
    "llama-3.2-90b-vision-preview",
    "llama-3.2-11b-vision-preview"
  ];

  const base64Image = imageBuffer.toString('base64');

  for (const model of visionModels) {
    try {
      console.log(`👁️ Trying Vision Model: ${model}`);
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract Project-X dashboard data. Return JSON: saldo, totalPoints, totalFees, pendingYield, positions (pair, positionSize, apr), accountName, accountNumber. IMPORTANT: Set 'saldo' to null if the total portfolio value is not clearly visible."
              },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${base64Image}` }
              }
            ]
          }
        ],
        model: model,
        response_format: { type: "json_object" }
      });
      return JSON.parse(completion.choices[0].message.content);
    } catch (error) {
      console.error(`⚠️ Vision Model ${model} failed, trying next...`, error.message);
      continue;
    }
  }
  return null;
}

// 📱 Initialize Telegraf Bot
const bot = new Telegraf(process.env.BOT_TOKEN, {
  telegram: { 
    agent: httpsAgent,
    apiRoot: 'https://api.telegram.org',
    apiServerTimeout: 30000,
    apiMethodTimeout: 30000
  },
  handlerTimeout: 900000
});

// 🔧 Safe Message Editor with Retry & Fallback
async function safeEditMessage(ctx, text, extra = {}) {
  try {
    return await ctx.editMessageText(text, { 
      ...extra, 
      timeout: 15000 
    });
  } catch (err) {
    if (err.code === 'ETIMEDOUT' || err.message.includes('timeout')) {
      console.warn('⏱️ Message edit timeout, answering callback instead...');
      try {
        await ctx.answerCbQuery('⏳ Update in progress...');
      } catch (e) {}
      return null;
    }
    if (err.response?.error_code === 400) {
      console.warn('⚠️ Message already deleted or edited');
      return null;
    }
    throw err;
  }
}

// Improved Error Handling for Network Issues
bot.catch((err, ctx) => {
  console.error(`🚨 Telegraf Error for ${ctx.updateType}:`, err.message);
  if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.message.includes('timeout')) {
    console.log('🔄 Network issue detected. Bot will continue polling.');
    return;
  }
  if (err.response?.error_code === 409) {
    console.log('⚠️ Bot conflict (multiple instances). Bot will recover.');
    return;
  }
});

const userSessions = new Map();

// UI Keyboards
const mainKeyboard = Markup.keyboard([
  ['📊 Input Akun Baru', '👥 List Akun'],
  ['💰 Summary', '📈 Analisa'],
  ['📅 Update History', '❓ Help'],
  ['⚠️ Hapus Semua Data']
]).resize();

const backMenuKeyboard = Markup.keyboard([['🔙 Menu Utama']]).resize();

function formatCurrency(num) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num || 0);
}
function formatNumber(num) {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num || 0);
}

bot.start((ctx) => {
  let msg = '🚀 <b>Project-X LP Bot Ready!</b>\n\n';
  msg += '⚡ Tracking & analisa portfolio LP Anda jadi lebih mudah.\n';
  msg += '💰 Maksimalkan yield dengan insights real-time.\n\n';
  msg += '📢 <b>Join komunitas Project-X traders terbaik:</b>\n';
  msg += '<a href="https://www.prjx.com/@tentangblockchain">🔗 Lihat strategi winning &amp; insights terbaru</a>\n\n';
  msg += '✨ Jangan ketinggalan update earnings dan signals dari top performers!';
  ctx.replyWithHTML(msg, mainKeyboard);
  console.log(`👤 User Started: ${ctx.from.id} (${ctx.from.username})`);
});

bot.hears('📊 Input Akun Baru', (ctx) => {
  userSessions.set(ctx.chat.id, { inputMode: 'waiting_data' });
  ctx.reply('Silakan paste data dashboard Project-X kamu. Saya akan mendeteksi akun dan datanya secara otomatis!', backMenuKeyboard);
});

bot.on('text', async (ctx, next) => {
  const session = userSessions.get(ctx.chat.id);
  
  if (ctx.message.text === '🔙 Menu Utama') {
    userSessions.delete(ctx.chat.id);
    return ctx.reply('Menu Utama', mainKeyboard);
  }

  if (session && session.inputMode === 'waiting_saldo') {
    const saldoText = ctx.message.text.replace(/[^0-9.]/g, '');
    const saldo = parseFloat(saldoText);
    if (isNaN(saldo)) {
      return ctx.reply('⚠️ Masukkan angka yang valid untuk saldo (contoh: 500).');
    }
    
    const data = session.pendingData;
    data.saldo = saldo;
    await saveAccountData(ctx.from.id, session.accNum, data);
    userSessions.delete(ctx.chat.id);
    return ctx.reply(`✅ Saldo berhasil ditambahkan! Data disimpan di Akun ${session.accNum}.`, mainKeyboard);
  }

  if (!session || session.inputMode !== 'waiting_data') return next();

  const waitMsg = await ctx.reply('⏳ Menganalisa data dengan AI...');

  try {
    const data = await parseAccountDataSmart(ctx.message.text);

    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});

    if (!data || (!data.saldo && !data.totalPoints && !data.positions)) {
      return ctx.reply('⚠️ Maaf, data tidak dikenali. Pastikan teks yang di-paste benar.');
    }

    // Smart detection of account number from text if not explicitly in data
    let detectedAccNum = data.accountNumber;
    if (!detectedAccNum) {
      const match = ctx.message.text.match(/Akun\s*(\d+)/i);
      if (match) detectedAccNum = parseInt(match[1]);
    }

    session.pendingData = data;
    const accNum = detectedAccNum || 1;
    const accName = data.accountName || (detectedAccNum ? `Akun ${detectedAccNum}` : `Akun ${accNum}`);
    
    let msg = `📊 <b>ANALISA ${accName.toUpperCase()}</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `💰 <b>Portfolio Overview</b>\n`;
    msg += `├ Saldo: ${data.saldo !== null ? formatCurrency(data.saldo) : '<i>(Tidak terdeteksi)</i>'}\n`;
    msg += `├ Total Points: ${formatNumber(data.totalPoints)} ${data.pointsChange ? `(+${data.pointsChange})` : ''}\n`;
    if (data.rank) msg += `├ Rank: ${data.rank}\n`;
    msg += `├ Total Fees: ${formatCurrency(data.totalFees)}\n`;
    if (data.feesToday) msg += `├ Fees Today: ${formatCurrency(data.feesToday)}\n`;
    msg += `└ Pending Yield: ${formatCurrency(data.pendingYield)}\n\n`;
    
    if (data.positions?.length > 0) {
      msg += `📈 <b>Active Positions</b>\n\n`;
      data.positions.forEach((p, i) => {
        msg += `${i + 1}. ${p.pair} ${p.status === 'In Range' ? '✅' : '⚠️'}\n`;
        msg += `├ Position: ${formatCurrency(p.positionSize)}\n`;
        msg += `├ APR: ${p.apr}% \n`;
        if (p.range) msg += `├ Range: ${p.range}\n`;
        if (p.currentPrice) msg += `├ Current: ${p.currentPrice}\n`;
        msg += `└ Unclaimed: ${formatCurrency(p.unclaimed)}\n\n`;
      });
    }

    const estDaily = data.positions?.reduce((acc, p) => acc + (p.positionSize * (p.apr / 100) / 365), 0) || 0;
    
    msg += `📊 <b>Performance Metrics</b>\n`;
    msg += `├ Est. Daily Earnings: ${formatCurrency(estDaily)}\n`;
    msg += `└ All In Range: ${data.positions?.every(p => p.status === 'In Range') ? 'Yes ✅' : 'No ⚠️'}\n\n`;
    
    msg += `💡 <b>Rekomendasi</b>\n`;
    msg += `• ${data.pendingYield > 0 ? `Claim yield tersedia (${formatCurrency(data.pendingYield)})` : 'Simpan posisi Anda'}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `<b>Pilih Nomor Akun untuk Menyimpan:</b>`;

    const buttons = [];
    for (let i = 1; i <= 10; i++) {
      buttons.push(Markup.button.callback(`${i}`, `save_to_${i}`));
    }

    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
      rows.push(buttons.slice(i, i + 5));
    }
    rows.push([Markup.button.callback('❌ Batal', 'cancel_input')]);

    ctx.replyWithHTML(msg, Markup.inlineKeyboard(rows));
  } catch (err) {
    console.error(err);
    ctx.reply('❌ Error memproses data.');
  }
});

bot.action(/^save_to_(\d+)$/, async (ctx) => {
  const accNum = parseInt(ctx.match[1]);
  const session = userSessions.get(ctx.chat.id);
  if (session && session.pendingData) {
    const data = session.pendingData;
    
    if (data.saldo === null) {
      session.accNum = accNum;
      session.inputMode = 'waiting_saldo';
      return await safeEditMessage(ctx, `⚠️ Saldo tidak terdeteksi. Silakan masukkan saldo untuk Akun ${accNum} secara manual (angka saja, contoh: 500.50):`);
    }

    await saveAccountData(ctx.from.id, accNum, data);
    userSessions.delete(ctx.chat.id);
    ctx.answerCbQuery(`✅ Tersimpan di Akun ${accNum}`);
    await safeEditMessage(ctx, `✅ Berhasil disimpan di Akun ${accNum}!`);
  }
});

bot.action('cancel_input', async (ctx) => {
  userSessions.delete(ctx.chat.id);
  ctx.answerCbQuery();
  await safeEditMessage(ctx, '❌ Dibatalkan.');
});

bot.action('save_smart', async (ctx) => {
  const session = userSessions.get(ctx.chat.id);
  if (session && session.pendingData) {
    const data = session.pendingData;
    const accNum = data.accountNumber || 1;
    await saveAccountData(ctx.from.id, accNum, data);
    userSessions.delete(ctx.chat.id);
    ctx.answerCbQuery('✅ Tersimpan');
    await safeEditMessage(ctx, `✅ Tersimpan di Akun ${accNum}!`);
  }
});

async function saveAccountData(userId, accNum, data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Get existing data for comparison before update
    const existing = await client.query('SELECT saldo, total_points, total_fees FROM accounts WHERE user_id = $1 AND account_number = $2', [userId, accNum]);
    
    const res = await client.query(`
      INSERT INTO accounts (user_id, account_number, saldo, total_points, total_fees, pending_yield, account_name)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (user_id, account_number) DO UPDATE SET
      saldo = COALESCE(NULLIF(EXCLUDED.saldo, 0), accounts.saldo),
      total_points = COALESCE(NULLIF(EXCLUDED.total_points, 0), accounts.total_points),
      total_fees = COALESCE(NULLIF(EXCLUDED.total_fees, 0), accounts.total_fees),
      pending_yield = COALESCE(NULLIF(EXCLUDED.pending_yield, 0), accounts.pending_yield),
      account_name = COALESCE(EXCLUDED.account_name, accounts.account_name),
      updated_at = CURRENT_TIMESTAMP
      RETURNING id, saldo, total_points, total_fees
    `, [userId, accNum, data.saldo || 0, data.totalPoints || 0, data.totalFees || 0, data.pendingYield || 0, data.accountName || null]);
    
    const account = res.rows[0];
    const accountId = account.id;

    // Save daily snapshot for comparison
    await client.query(`
      INSERT INTO daily_history (account_id, saldo, total_points, total_fees, recorded_at)
      VALUES ($1, $2, $3, $4, CURRENT_DATE)
      ON CONFLICT (account_id, recorded_at) DO UPDATE SET
      saldo = EXCLUDED.saldo,
      total_points = EXCLUDED.total_points,
      total_fees = EXCLUDED.total_fees
    `, [accountId, account.saldo, account.total_points, account.total_fees]);

    if (data.positions?.length > 0) {
      await client.query('DELETE FROM positions WHERE account_id = $1', [accountId]);
      for (const p of data.positions) {
        await client.query('INSERT INTO positions (account_id, pair, position_size, apr) VALUES ($1, $2, $3, $4)',
          [accountId, p.pair, p.positionSize, p.apr]);
      }
    }
    await client.query('COMMIT');
    return { account, previous: existing.rows[0] };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally { client.release(); }
}

bot.hears('📅 Update History', async (ctx) => {
  ctx.reply('📅 Untuk update data harian dan melihat perubahan (growth):\n\n1. Klik <b>📊 Input Akun Baru</b>\n2. Paste data dashboard terbaru\n3. AI akan membandingkan data hari ini dengan data kemarin secara otomatis di menu 📈 Analisa.', { parse_mode: 'HTML' });
});

bot.action(/^analyze_acc_(\d+)$/, async (ctx) => {
  const accId = parseInt(ctx.match[1]);
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT * FROM accounts WHERE id = $1', [accId]);
    if (res.rows.length === 0) return ctx.answerCbQuery('Akun tidak ditemukan');
    
    const acc = res.rows[0];
    
    // Fetch yesterday's data for comparison
    const historyRes = await client.query(`
      SELECT * FROM daily_history 
      WHERE account_id = $1 AND recorded_at < CURRENT_DATE 
      ORDER BY recorded_at DESC LIMIT 1
    `, [accId]);
    
    const prev = historyRes.rows[0];
    const posRes = await client.query('SELECT * FROM positions WHERE account_id = $1', [accId]);
    const positions = posRes.rows;
    
    const now = new Date();
    const timestamp = now.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' + now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' WIB';

    let msg = `📊 <b>ANALISA ${acc.account_name?.toUpperCase() || `AKUN ${acc.account_number}`}</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    const diffSaldo = prev ? (acc.saldo - prev.saldo) : 0;
    const diffPoints = prev ? (acc.total_points - prev.total_points) : 0;
    
    msg += `💰 <b>Growth (vs Last Snapshot)</b>\n`;
    msg += `├ Saldo: ${formatCurrency(acc.saldo)} ${diffSaldo !== 0 ? `(${diffSaldo >= 0 ? '📈 +' : '📉 '}${formatCurrency(Math.abs(diffSaldo))})` : '➖'}\n`;
    msg += `├ Points: ${formatNumber(acc.total_points)} ${diffPoints !== 0 ? `(${diffPoints >= 0 ? '📈 +' : '📉 '}${formatNumber(Math.abs(diffPoints))})` : '➖'}\n`;
    msg += `├ Total Fees: ${formatCurrency(acc.total_fees)}\n`;
    msg += `└ Pending Yield: ${formatCurrency(acc.pending_yield)}\n\n`;
    
    if (positions.length > 0) {
      msg += `📈 <b>Active Positions</b>\n\n`;
      positions.forEach((p, i) => {
        const pct = acc.saldo > 0 ? ((parseFloat(p.position_size) / parseFloat(acc.saldo)) * 100).toFixed(1) : 0;
        msg += `${i + 1}. ${p.pair} ✅\n`;
        msg += `├ Position: ${formatCurrency(p.position_size)} (${pct}%)\n`;
        msg += `├ APR: ${p.apr}%\n`;
        msg += `└ Status: In Range ✅\n\n`;
      });
      
      const totalPos = positions.reduce((sum, p) => sum + parseFloat(p.position_size || 0), 0);
      const estDaily = positions.reduce((sum, p) => sum + (parseFloat(p.position_size || 0) * (parseFloat(p.apr || 0) / 100) / 365), 0);
      const avgApr = positions.reduce((sum, p) => sum + parseFloat(p.apr || 0), 0) / positions.length;

      msg += `📊 <b>Performance Metrics</b>\n`;
      msg += `├ Total Position Value: ${formatCurrency(totalPos)}\n`;
      msg += `├ Average APR: ${avgApr.toFixed(2)}%\n`;
      msg += `├ Est. Daily Earnings: ${formatCurrency(estDaily)}\n`;
      msg += `└ All In Range: Yes ✅\n\n`;
    }
    
    msg += `💡 <b>Rekomendasi</b>\n`;
    msg += `• ${acc.pending_yield > 1 ? `Segera claim yield (${formatCurrency(acc.pending_yield)})` : 'Pertahankan posisi Anda'}\n\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `⏰ ${timestamp}`;
    
    await safeEditMessage(ctx, msg, { parse_mode: 'HTML' });
  } catch (err) {
    console.error(err);
    ctx.answerCbQuery('Error analisa');
  } finally { client.release(); }
});

bot.hears('💰 Summary', async (ctx) => {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT 
        COUNT(DISTINCT id) as total_accounts,
        SUM(saldo) as total_saldo,
        SUM(total_points) as total_points,
        SUM(total_fees) as total_fees,
        SUM(pending_yield) as pending_yield
      FROM accounts WHERE user_id = $1
    `, [ctx.from.id]);
    
    const data = res.rows[0];
    if (!data.total_accounts || data.total_accounts === 0) {
      return ctx.reply('📭 Anda belum memiliki akun. Gunakan 📊 Input Akun Baru untuk memulai.', mainKeyboard);
    }
    
    let msg = `💰 <b>RINGKASAN TOTAL</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `📊 Jumlah Akun: ${data.total_accounts}\n\n`;
    msg += `💵 <b>Total Portfolio</b>\n`;
    msg += `├ Saldo: ${formatCurrency(data.total_saldo)}\n`;
    msg += `├ Total Points: ${formatNumber(data.total_points)}\n`;
    msg += `├ Total Fees: ${formatCurrency(data.total_fees)}\n`;
    msg += `└ Pending Yield: ${formatCurrency(data.pending_yield)}\n\n`;
    
    msg += `💡 Gunakan <b>👥 List Akun</b> untuk detail per akun.`;
    
    ctx.replyWithHTML(msg, mainKeyboard);
  } catch (err) {
    console.error(err);
    ctx.reply('❌ Error mengambil summary.', mainKeyboard);
  } finally { client.release(); }
});

bot.hears('👥 List Akun', async (ctx) => {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT id, account_number, account_name, saldo, total_points FROM accounts WHERE user_id = $1 ORDER BY account_number', [ctx.from.id]);
    
    if (res.rows.length === 0) {
      return ctx.reply('📭 Anda belum memiliki akun. Gunakan 📊 Input Akun Baru untuk memulai.', mainKeyboard);
    }
    
    let msg = `👥 <b>DAFTAR AKUN</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    res.rows.forEach((acc, i) => {
      const name = acc.account_name || `Akun ${acc.account_number}`;
      msg += `${i + 1}. ${name}\n`;
      msg += `   └ Saldo: ${formatCurrency(acc.saldo)} | Points: ${formatNumber(acc.total_points)}\n\n`;
    });
    
    msg += `Pilih akun untuk analisa:`;
    
    const buttons = res.rows.map(acc => 
      Markup.button.callback(
        `${acc.account_name || `Akun ${acc.account_number}`}`,
        `analyze_acc_${acc.id}`
      )
    );
    
    const rows = [];
    for (let i = 0; i < buttons.length; i += 2) {
      rows.push(buttons.slice(i, i + 2));
    }
    
    ctx.replyWithHTML(msg, Markup.inlineKeyboard(rows));
  } catch (err) {
    console.error(err);
    ctx.reply('❌ Error mengambil list akun.', mainKeyboard);
  } finally { client.release(); }
});

bot.hears('📈 Analisa', async (ctx) => {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT id, account_number, account_name, saldo, total_points FROM accounts WHERE user_id = $1 ORDER BY account_number', [ctx.from.id]);
    
    if (res.rows.length === 0) {
      return ctx.reply('📭 Anda belum memiliki akun. Gunakan 📊 Input Akun Baru untuk memulai.', mainKeyboard);
    }
    
    if (res.rows.length === 1) {
      const accId = res.rows[0].id;
      ctx.answerCbQuery = () => {};
      ctx.match = [null, accId];
      return bot.handleUpdate({ 
        update_id: 0, 
        callback_query: { data: `analyze_acc_${accId}` } 
      }, ctx);
    }
    
    let msg = `📈 <b>ANALISA AKUN</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `Pilih akun untuk analisa detail:`;
    
    const buttons = res.rows.map(acc => 
      Markup.button.callback(
        `📊 ${acc.account_name || `Akun ${acc.account_number}`}`,
        `analyze_acc_${acc.id}`
      )
    );
    
    const rows = [];
    for (let i = 0; i < buttons.length; i += 2) {
      rows.push(buttons.slice(i, i + 2));
    }
    
    ctx.replyWithHTML(msg, Markup.inlineKeyboard(rows));
  } catch (err) {
    console.error(err);
    ctx.reply('❌ Error mengambil akun untuk analisa.', mainKeyboard);
  } finally { client.release(); }
});

bot.hears('❓ Help', (ctx) => {
  let msg = '❓ <b>Cara Menggunakan Bot:</b>\n\n';
  msg += '1. Klik <b>📊 Input Akun Baru</b>\n';
  msg += '2. Paste data teks dari dashboard Project-X\n';
  msg += '3. AI akan mendeteksi data secara otomatis\n';
  msg += '4. Klik <b>✅ Simpan</b> untuk menyimpan ke database\n\n';
  msg += 'Gunakan <b>👥 List Akun</b> untuk melihat detail per akun dan <b>💰 Summary</b> untuk total keseluruhan.\n\n';
  msg += '━━━━━━━━━━━━━━━━━━━━━━\n\n';
  msg += '🚀 <b>Maksimalkan Yield Anda!</b>\n';
  msg += 'Bergabung dengan komunitas top traders Project-X dan pelajari strategi winning terbaru. Dapatkan insights real-time, signals, dan earnings update dari performers terbaik.\n\n';
  msg += '<a href="https://www.prjx.com/@tentangblockchain">💎 Join komunitas premium sekarang - jangan ketinggalan momentum!</a>';
  ctx.replyWithHTML(msg);
});

bot.hears('⚠️ Hapus Semua Data', (ctx) => {
  ctx.reply('⚠️ <b>PERINGATAN KONFIRMASI</b>\n\nApakah Anda yakin ingin menghapus SEMUA DATA akun dan history Anda? Tindakan ini tidak dapat dibatalkan.', {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔥 YA, HAPUS SEMUA', 'confirm_delete_all')],
      [Markup.button.callback('❌ BATAL', 'cancel_delete')]
    ])
  });
});

bot.action('confirm_delete_all', async (ctx) => {
  const client = await pool.connect();
  try {
    await client.query('DELETE FROM accounts WHERE user_id = $1', [ctx.from.id]);
    ctx.answerCbQuery('✅ Semua data telah dihapus');
    await safeEditMessage(ctx, '✅ <b>Semua data akun dan history Anda telah berhasil dihapus.</b>', { parse_mode: 'HTML' });
  } catch (err) {
    console.error(err);
    ctx.answerCbQuery('❌ Gagal menghapus data');
  } finally { client.release(); }
});

bot.action('cancel_delete', async (ctx) => {
  ctx.answerCbQuery('Dibatalkan');
  await safeEditMessage(ctx, '❌ Penghapusan data dibatalkan.');
});

bot.hears('🔙 Menu Utama', (ctx) => ctx.reply('Menu Utama', mainKeyboard));

(async () => {
  await initDatabase();
  bot.launch();
  console.log('🚀 Bot Running');
})();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
