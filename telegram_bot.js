const dns = require('dns');
try {
    dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
    const originalLookup = dns.lookup;
    dns.lookup = function(hostname, options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        const domainsToOverride = ['telegram', '2captcha', 'googleapis', 'google', 'cloudflare'];
        const shouldOverride = domainsToOverride.some(d => hostname.toLowerCase().includes(d));
        
        if (shouldOverride) {
            dns.resolve4(hostname, (err, addresses) => {
                if (!err && addresses && addresses.length > 0) {
                    if (options && options.all) {
                        return callback(null, addresses.map(addr => ({ address: addr, family: 4 })));
                    }
                    return callback(null, addresses[0], 4);
                }
                originalLookup(hostname, options, callback);
            });
        } else {
            originalLookup(hostname, options, callback);
        }
    };
    console.log('[DNS Override] Configured custom DNS resolver with lookup monkey-patch.');
} catch (dnsErr) {
    console.error('[DNS Override Error] Failed to patch DNS resolver:', dnsErr.message);
}

const TelegramBot = require('node-telegram-bot-api');
const db = require('./database');
const modemService = require('./modem_service');
const ooredooAhlaService = require('./ooredoo_ahla_service');
const axios = require('axios');

let bot = null;
const pendingMobilis = new Map();
const lastScannedOffers = new Map();
const pendingCaptchas = new Map();
const meetmobQueue = [];
let meetmobProcessing = false;

function phoneFormatClean(phone) {
    if (!phone) return '';
    let cleaned = phone.toString().trim().replace(/[\s\-\(\)\+]/g, '');
    if (cleaned.startsWith('213') && cleaned.length > 3) {
        cleaned = '0' + cleaned.substring(3);
    }
    if (!cleaned.startsWith('0') && cleaned.length === 9) {
        cleaned = '0' + cleaned;
    }
    return cleaned;
}

function cleanOfferLabel(label) {
    if (!label) return '';
    let clean = label.toString();
    
    // Strip parentheses and brackets completely
    clean = clean.replace(/[\(\)\[\]]/g, '');
    
    // Replace French repetitive words with premium compact symbols/emojis
    clean = clean.replace(/illimités?/gi, '∞');
    clean = clean.replace(/appels?/gi, '📞');
    clean = clean.replace(/internets?/gi, '🌐');
    clean = clean.replace(/promos?/gi, '🎁');
    
    // Clean up connections
    clean = clean.replace(/\bvers\b/gi, '➔');
    clean = clean.replace(/\bto\b/gi, '➔');
    clean = clean.replace(/\bplus\b/gi, '+');
    
    // Clean networks
    clean = clean.replace(/mobilis/gi, 'Mob');
    clean = clean.replace(/djezzy/gi, 'Dj');
    clean = clean.replace(/ooredoo/gi, 'Oor');
    clean = clean.replace(/tous\s+réseaux/gi, 'الكل');
    clean = clean.replace(/tous\s+les\s+réseaux/gi, 'الكل');
    
    // Clean currency
    clean = clean.replace(/\bda\b/gi, 'دج');
    clean = clean.replace(/\bflexy\b/gi, 'فليكسي');
    
    // Clean data sizes
    clean = clean.replace(/\bgo\b/gi, 'GB');
    clean = clean.replace(/\bmo\b/gi, 'MB');
    
    // Clean redundant spaces and clean up
    clean = clean.replace(/\s+/g, ' ').trim();
    
    // Word-level deduplication to prevent repetition
    const uniqueWords = [];
    clean.split(/\s+/).forEach(w => {
        if (uniqueWords.indexOf(w) === -1) {
            uniqueWords.push(w);
        }
    });
    clean = uniqueWords.join(' ');
    
    return clean;
}

function getSetting(key) {
    return new Promise((resolve) => {
        db.get(`SELECT value FROM settings WHERE key = ?`, [key], (err, row) => {
            resolve(row ? row.value : '');
        });
    });
}

async function ensureMeetmobLoggedIn() {
    const meetmobPhone = await getSetting('meetmob_phone');
    const meetmobPin = await getSetting('meetmob_pin');
    const meetmobModem = await getSetting('meetmob_modem');

    if (!meetmobPhone || !meetmobPin) {
        throw new Error("⚠️ إعدادات حساب Meetmob غير مكتملة (يرجى مراجعة لوحة التحكم).");
    }

    try {
        const checkRes = await axios.get('http://localhost:3000/meetmob/captcha');
        if (checkRes.data && checkRes.data.success) {
            return true;
        }
    } catch (e) {
        // Ignored, proceed to login
    }

    console.log(`[Telegram Bot] Meetmob session expired or not active. Triggering auto-login...`);
    const loginRes = await axios.post('http://localhost:3000/meetmob/send-otp', {
        phone: meetmobPhone,
        pin: meetmobPin,
        modemAddress: meetmobModem
    });

    if (loginRes.data && loginRes.data.success) {
        if (loginRes.data.loggedIn) {
            return true;
        } else {
            throw new Error("⚠️ فشل تسجيل الدخول التلقائي لـ Meetmob: كود OTP لم يصل أو لم يتم التحقق منه.");
        }
    } else {
        throw new Error(`⚠️ فشل بدء تسجيل الدخول لـ Meetmob: ${loginRes.data.message || 'خطأ غير معروف'}`);
    }
}

async function solveMeetmobCaptcha2Captcha(base64Image) {
    const apiKey = await getSetting('captcha_api_key');
    if (!apiKey) throw new Error("⚠️ مفتاح 2Captcha غير مهيأ في الإعدادات.");

    const submitRes = await axios.post('https://2captcha.com/in.php', {
        key: apiKey,
        method: 'base64',
        body: base64Image,
        json: 1
    });
    if (submitRes.data.status !== 1) throw new Error('API 2Captcha Error: ' + submitRes.data.request);
    
    const captchaId = submitRes.data.request;
    for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const resultRes = await axios.get(`https://2captcha.com/res.php?key=${apiKey}&action=get&id=${captchaId}&json=1`);
        if (resultRes.data.status === 1) return resultRes.data.request;
        if (resultRes.data.request !== 'CAPCHA_NOT_READY') throw new Error('API 2Captcha Error: ' + resultRes.data.request);
    }
    throw new Error('API 2Captcha Timeout');
}

async function getSolvedCaptcha(chatId, phone, amount, card, agent, captchaImgBase64) {
    try {
        const apiKey = await getSetting('captcha_api_key');
        if (apiKey && apiKey.trim() !== '') {
            console.log(`[Telegram Bot] Trying to solve captcha via 2Captcha...`);
            const solved = await solveMeetmobCaptcha2Captcha(captchaImgBase64);
            if (solved && solved.trim() !== '') {
                return solved;
            }
        } else {
            console.log(`[Telegram Bot] 2Captcha API Key is not configured. Switching directly to manual prompt.`);
        }
    } catch (err) {
        console.error(`[Telegram Bot] 2Captcha automatic solver failed: ${err.message}. Switching to manual prompt.`);
    }

    return new Promise((resolve, reject) => {
        db.all(`SELECT telegram_id FROM agents WHERE is_admin = 1`, async (err, admins) => {
            if (err || !admins || admins.length === 0) {
                return reject(new Error("⚠️ فشل 2Captcha ولا يوجد مدراء مسجلين في النظام لاستقبال الكابتشا يدوياً."));
            }

            const transactionId = 'tx_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
            const context = {
                id: transactionId,
                phone,
                amount,
                card,
                agent,
                chatId,
                resolve,
                reject,
                telegramPromptMsgIds: [],
                isResolved: false
            };

            pendingCaptchas.set(transactionId, context);

            const captchaBuffer = Buffer.from(captchaImgBase64, 'base64');
            let sentToAny = false;

            for (const admin of admins) {
                const adminChatId = admin.telegram_id;
                try {
                    await bot.sendPhoto(adminChatId, captchaBuffer, {
                        caption: `🖼️ **طلب كود كابتشا معلق (Meetmob Captcha)**\n\n👤 الوكيل: ${agent.name}\n📱 الرقم المستهدف: \`${phone}\`\n💰 القيمة: ${amount} دج\n💳 كود البطاقة: \`${card.pin_code}\``,
                        parse_mode: 'Markdown'
                    });

                    const promptMsg = await bot.sendMessage(adminChatId,
                        `⚠️ الرجاء كتابة رمز الكابتشا المعروض في الصورة أعلاه كـ **رد (Reply)** على هذه الرسالة لإتمام التعبئة:`,
                        { reply_markup: { force_reply: true } }
                    );

                    const msgIdStr = promptMsg.message_id.toString();
                    context.telegramPromptMsgIds.push({ adminChatId, msgId: msgIdStr });
                    pendingCaptchas.set(msgIdStr, context);
                    sentToAny = true;
                } catch (adminSendErr) {
                    console.error(`[Telegram Bot] Failed to send captcha alert to admin ${adminChatId}:`, adminSendErr.message);
                }
            }

            if (!sentToAny) {
                pendingCaptchas.delete(transactionId);
                return reject(new Error("⚠️ فشل إرسال صورة الكابتشا إلى أي مدير في النظام."));
            }

            if (process.emit) {
                process.emit('pending-captcha', {
                    id: transactionId,
                    phone: phone,
                    amount: amount,
                    image: captchaImgBase64
                });
            }

            const adminIds = admins.map(a => a.telegram_id);
            if (!adminIds.includes(chatId.toString())) {
                bot.sendMessage(chatId, `⏳ عملية الشحن للرقم ${phone} معلقة بانتظار إدخال رمز التحقق الكابتشا يدوياً من قبل الإدارة...`);
            }
        });
    });
}

function resolvePendingCaptcha(idOrMsgId, captchaCode) {
    const keyStr = idOrMsgId.toString();
    if (!pendingCaptchas.has(keyStr)) {
        console.log(`[Telegram Bot] resolvePendingCaptcha called for expired or non-existent key: ${keyStr}`);
        return false;
    }

    const context = pendingCaptchas.get(keyStr);
    if (context.isResolved) {
        return false;
    }

    context.isResolved = true;
    console.log(`[Telegram Bot] Captcha resolved successfully: ${captchaCode}`);

    context.resolve(captchaCode);

    context.telegramPromptMsgIds.forEach(item => {
        bot.editMessageText(`✅ تم حل الكابتشا يدوياً وإتمام الشحن للرقم ${context.phone}.`, {
            chat_id: item.adminChatId,
            message_id: parseInt(item.msgId)
        }).catch(() => {});
    });

    if (process.emit) {
        process.emit('pending-captcha-solved', { id: context.id });
    }

    pendingCaptchas.delete(context.id);
    context.telegramPromptMsgIds.forEach(item => {
        pendingCaptchas.delete(item.msgId);
    });

    return true;
}

function queueMeetmobRecharge(chatId, phone, amount, agent, card) {
    return new Promise((resolve, reject) => {
        meetmobQueue.push({ chatId, phone, amount, agent, card, resolve, reject });
        processMeetmobQueue();
    });
}

async function processMeetmobQueue() {
    if (meetmobProcessing) return;
    if (meetmobQueue.length === 0) return;

    meetmobProcessing = true;
    const task = meetmobQueue.shift();

    try {
        console.log(`[Meetmob Queue] Processing next recharge task: Phone ${task.phone}, Amount ${task.amount} DA`);
        const result = await executeMeetmobRechargeTask(task.chatId, task.phone, task.amount, task.agent, task.card);
        task.resolve(result);
    } catch (err) {
        task.reject(err);
    } finally {
        meetmobProcessing = false;
        setTimeout(processMeetmobQueue, 1000);
    }
}

async function executeMeetmobRechargeTask(chatId, phone, amount, agent, card) {
    const cardValue = (amount === 1300) ? 1000 : amount;
    try {
        await ensureMeetmobLoggedIn();
        
        const captchaRes = await axios.get('http://localhost:3000/meetmob/captcha');
        if (!captchaRes.data || !captchaRes.data.success) {
            throw new Error("⚠️ فشل جلب صورة كود التحقق (Captcha).");
        }
        
        const captchaImgBase64 = captchaRes.data.captcha.replace(/^data:image\/png;base64,/, '');
        
        const solvedCaptcha = await getSolvedCaptcha(chatId, phone, amount, card, agent, captchaImgBase64);
        console.log(`[Telegram Bot Queue] Captcha solved: ${solvedCaptcha}`);
        
        const cleanPhone = phone.trim().replace(/^0/, '');
        const rechargeRes = await axios.post('http://localhost:3000/meetmob/recharge', {
            customerPhone: cleanPhone,
            voucherCode: card.pin_code,
            captchaCode: solvedCaptcha
        });
        
        if (rechargeRes.data && rechargeRes.data.success) {
            if (amount === 1300) {
                bot.sendMessage(chatId, `✅ تم شحن بطاقة موبيليس 1000 دج بنجاح!\n⏳ جاري إرسال فليكسي 300 دج المتبقية عبر الشريحة (USSD)...`);
                try {
                    await executeStandardUSSDMobilisFlexy(phone, 300);
                    bot.sendMessage(chatId, `✅ تم إرسال 300 دج المتبقية فليكسي بنجاح!`);
                } catch (flexyErr) {
                    bot.sendMessage(chatId, `⚠️ فشل إرسال فليكسي 300 دج عبر الشريحة: ${flexyErr.message}. يرجى إرسالها يدوياً.`);
                }
            }
            
            db.run(`INSERT INTO transactions (agent_id, phone_number, amount, operator, type, status) 
                   VALUES (?, ?, ?, ?, ?, ?)`, 
                   [agent.id, phone, amount, 'Mobilis', 'MEETMOB_VOUCHER', 'SUCCESS']);
                   
            bot.sendMessage(chatId, `🎉 تم الشحن بنجاح للرقم ${phone}!\n💳 نوع العملية: بطاقة تعبئة ${cardValue} دج تلقائية\n💰 القيمة المخصومة: ${amount} دج\nالرصيد المتبقي: ${agent.balance - amount} دج`);
            return true;
        } else {
            throw new Error(rechargeRes.data.message || "فشلت عملية التعبئة على موقع موبيليس.");
        }
    } catch (rechargeError) {
        console.error("[Meetmob Recharge Failed]", rechargeError);
        
        // Return card to available in database
        db.run(`UPDATE recharge_cards SET status = 'available', sold_to = NULL, sold_at = NULL WHERE id = ?`, [card.id]);
        
        bot.sendMessage(chatId, `⚠️ فشلت عملية الشحن التلقائي بالبطاقة للرقم ${phone} (السبب: ${rechargeError.message}).\n⏳ جاري تحويل العملية تلقائياً للشحن عبر الشريحة (Flexy USSD)...`);
        
        try {
            // Attempt standard USSD Flexy fallback recharge
            await executeStandardUSSDMobilisFlexy(phone, amount);
            
            // Record SUCCESSFUL Fallback transaction
            db.run(`INSERT INTO transactions (agent_id, phone_number, amount, operator, type, status) 
                   VALUES (?, ?, ?, ?, ?, ?)`, 
                   [agent.id, phone, amount, 'Mobilis', 'FLEXY', 'SUCCESS (FALLBACK)']);
                   
            bot.sendMessage(chatId, `🎉 تم شحن الرصيد ${amount} دج للرقم ${phone} بنجاح عبر الشريحة (USSD) كبديل تلقائي!\nالرصيد المتبقي: ${agent.balance - amount} دج`);
            return true;
            
        } catch (fallbackError) {
            console.error("[Meetmob Fallback USSD Failed]", fallbackError);
            
            // Refund agent balance only if USSD fallback also fails
            db.run(`UPDATE agents SET balance = balance + ? WHERE id = ?`, [amount, agent.id]);
            
            db.run(`INSERT INTO transactions (agent_id, phone_number, amount, operator, type, status) 
                   VALUES (?, ?, ?, ?, ?, ?)`, 
                   [agent.id, phone, amount, 'Mobilis', 'MEETMOB_VOUCHER', 'FAILED: ' + rechargeError.message + ' | USSD Fallback FAILED: ' + fallbackError.message]);
                   
            bot.sendMessage(chatId, `❌ فشلت عملية الشحن البديل أيضاً للرقم ${phone}.\nالسبب: ${fallbackError.message}\n🔄 تم إرجاع المبلغ ${amount} دج لرصيدك بالكامل.`);
            throw fallbackError;
        }
    }
}

function getActiveSim(operator, callback) {
    db.get(`SELECT value FROM settings WHERE key = ?`, [`sort_order_${operator}`], (err, row) => {
        const sortOrder = row && row.value === 'ASC' ? 'ASC' : 'DESC';
        db.get(`SELECT * FROM sim_cards WHERE operator = ? AND status = 'active' ORDER BY CAST(balance AS REAL) ${sortOrder}`, [operator], callback);
    });
}

async function executeStandardUSSDMobilisFlexy(phone, amount) {
    return new Promise((resolve, reject) => {
        getActiveSim('Mobilis', async (err, sim) => {
            if (!sim) return reject(new Error("شريحة موبيليس غير متوفرة."));
            
            db.get(`SELECT value FROM settings WHERE key = 'ussd_mobilis_transfer'`, async (err, setting) => {
                if (!setting) return reject(new Error("إعداد USSD غير متوفر."));
                
                let baseCode = sim.ussd_transfer_override || setting.value;
                let ussdCode = baseCode.replace('{phone}', phone).replace('{amount}', amount);
                const pin = sim.sim_pin || '0000';
                ussdCode = ussdCode.replace('{pin}', pin);
                
                const transferType = sim.transfer_type || '04';
                if (!ussdCode.includes('{type}')) {
                    ussdCode = ussdCode.replace(/\*610\*1\*\d{2}\*/, `*610*1*${transferType}*`);
                } else {
                    ussdCode = ussdCode.replace('{type}', transferType);
                }
                
                try {
                    const response = await modemService.sendUssdCommand(sim.address, ussdCode);
                    if (response.success) {
                        await new Promise((res) => setTimeout(res, 2000));
                        await modemService.sendUssdCommand(sim.address, "1");
                        resolve(true);
                    } else {
                        reject(new Error(response.message || "فشلت عملية USSD."));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
    });
}

function startBot(token, adminSecret) {
    if (bot) {
        bot.stopPolling();
        bot = null;
    }

    if (!token) {
        console.log('[Telegram Bot] No token provided. Bot will not start.');
        return { success: false, message: 'No token' };
    }

    try {
        bot = new TelegramBot(token, { polling: false });
        // Clear all pending updates (offline commands) before starting to poll
        bot.deleteWebHook({ drop_pending_updates: true }).then(() => {
            return bot.getUpdates({ offset: -1 }); // Fallback to clear just in case
        }).then((updates) => {
            if (updates && updates.length > 0) {
                const nextOffset = updates[updates.length - 1].update_id + 1;
                return bot.getUpdates({ offset: nextOffset });
            }
        }).then(() => {
            console.log('[Telegram Bot] Old pending messages cleared successfully.');
            bot.startPolling();
            console.log('[Telegram Bot] Bot is running and waiting for commands...');
        }).catch(err => {
            console.error('[Telegram Bot] Error clearing old updates, starting polling anyway:', err);
            bot.startPolling();
        });

        function getCachedChoices(phone, operator, path) {
            return new Promise((resolve) => {
                db.all(`SELECT * FROM phone_offers_cache WHERE phone = ? AND operator = ?`, [phone, operator], (err, rows) => {
                    if (err || !rows) {
                        return resolve([]);
                    }
                    const pathStr = path.join('_');
                    const filtered = rows.filter(row => {
                        const cp = row.choice_path;
                        if (pathStr === '') {
                            return !cp.includes('_');
                        } else {
                            if (cp.startsWith(pathStr + '_')) {
                                const remaining = cp.substring(pathStr.length + 1);
                                return !remaining.includes('_');
                            }
                            return false;
                        }
                    });
                    resolve(filtered);
                });
            });
        }

        function cacheOffer(phone, operator, choicePath, label) {
            db.run(`INSERT INTO phone_offers_cache (phone, operator, choice_path, label) 
                    SELECT ?, ?, ?, ? 
                    WHERE NOT EXISTS (SELECT 1 FROM phone_offers_cache WHERE phone = ? AND operator = ? AND choice_path = ?)`,
                [phone, operator, choicePath, label, phone, operator, choicePath]);
        }

        // Verify token and status
        bot.getMe().then(me => {
            console.log(`[Telegram Bot] Connected as ${me.username}`);
            
            // Add polling error handler to prevent Unhandled Rejection crashes
            bot.on('polling_error', (error) => {
                if (error.code !== 'EFATAL' && error.code !== 'ECONNRESET') {
                    console.error(`[Telegram Bot] Polling error: ${error.code} - ${error.message}`);
                }
            });
            // Initialize Mobilis Offers Database
            const defaults = [
                { cat: 'Sama Mix', root: '*665#', catCode: '1', choice: '1', label: 'Mix 100', amt: 100 },
                { cat: 'Sama Mix', root: '*665#', catCode: '1', choice: '2', label: 'Mix 500', amt: 500 },
                { cat: 'Sama Mix', root: '*665#', catCode: '1', choice: '3', label: 'Mix 1000', amt: 1000 },
                { cat: 'Sama Mix', root: '*665#', catCode: '1', choice: '4', label: 'Mix 1500', amt: 1500 },
                { cat: 'Sama Mix', root: '*665#', catCode: '1', choice: '5', label: 'Mix 2000', amt: 2000 },
                { cat: 'Sama Net', root: '*665#', catCode: '2', choice: '1', label: 'Net 500', amt: 500 },
                { cat: 'Sama Net', root: '*665#', catCode: '2', choice: '2', label: 'Net 1000', amt: 1000 },
                { cat: 'Sama Net', root: '*665#', catCode: '2', choice: '3', label: 'Net 1500', amt: 1500 },
                { cat: 'Sama Net', root: '*665#', catCode: '2', choice: '4', label: 'Net 2000', amt: 2000 },
                { cat: 'Sama Talk', root: '*665#', catCode: '1', choice: '6', label: 'Talk 500', amt: 500 },
                { cat: 'Sama Talk', root: '*665#', catCode: '1', choice: '7', label: 'Talk 1000', amt: 1000 },
                { cat: 'Sama Talk', root: '*665#', catCode: '1', choice: '8', label: 'Talk 1500', amt: 1500 },
                { cat: 'Sama Talk', root: '*665#', catCode: '1', choice: '9', label: 'Talk 2000', amt: 2000 },
                { cat: 'PixX', root: '*665#', catCode: '1', choice: '1', label: 'PixX 50', amt: 50 },
                { cat: 'PixX', root: '*665#', catCode: '1', choice: '2', label: 'PixX 100', amt: 100 },
                { cat: 'PixX', root: '*665#', catCode: '1', choice: '3', label: 'PixX 500', amt: 500 },
                { cat: 'PixX', root: '*665#', catCode: '1', choice: '4', label: 'PixX 1000', amt: 1000 },
                { cat: 'PixX', root: '*665#', catCode: '1', choice: '5', label: 'PixX 2000', amt: 2000 },
                { cat: 'Revolution', root: '*665#', catCode: '1', choice: '1', label: 'Revolution 2500', amt: 2500 },
                { cat: 'Revolution', root: '*665#', catCode: '1', choice: '2', label: 'Revolution 2000', amt: 2000 },
                { cat: 'Revolution', root: '*665#', catCode: '1', choice: '3', label: 'Revolution 1800', amt: 1800 },
                { cat: 'Revolution', root: '*665#', catCode: '1', choice: '6', label: 'Revolution 1000', amt: 1000 },
                { cat: 'Gold', root: '*665#', catCode: '1', choice: '8', label: 'Gold 1000', amt: 1000 },
                { cat: 'Gold', root: '*665#', catCode: '1', choice: '10', label: 'Gold 1500', amt: 1500 },
                { cat: 'Gold', root: '*665#', catCode: '1', choice: '9', label: 'Gold 2000', amt: 2000 },
                { cat: 'Gold', root: '*665#', catCode: '1', choice: '62', label: 'Gold 2500 (100Go)', amt: 2500 },
                { cat: 'Gold', root: '*665#', catCode: '1', choice: '61', label: 'Gold 4000 (200Go)', amt: 4000 }
            ];

            db.run(`CREATE TABLE IF NOT EXISTS mobilis_offers (id INTEGER PRIMARY KEY AUTOINCREMENT, category_name TEXT, root_code TEXT, category_code TEXT, choice_code TEXT, label TEXT, amount INTEGER)`, () => {
                // Seed any missing defaults dynamically without duplication
                defaults.forEach(d => {
                    db.run(`INSERT INTO mobilis_offers (category_name, root_code, category_code, choice_code, label, amount) 
                            SELECT ?, ?, ?, ?, ?, ? 
                            WHERE NOT EXISTS (SELECT 1 FROM mobilis_offers WHERE category_name = ? AND choice_code = ?)`, 
                        [d.cat, d.root, d.catCode, d.choice, d.label, d.amt, d.cat, d.choice]);
                });
                console.log('[DB] Mobilis defaults seeded/verified.');
                db.run(`CREATE TABLE IF NOT EXISTS phone_offers_cache (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    phone TEXT,
                    operator TEXT,
                    choice_path TEXT,
                    label TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )`);
            });

            if (process.emit) {
                process.emit('bot-status', { connected: true, username: me.username });
            }

            // Listen for SMS updates to notify users
            process.on('modem-data-update', (data) => {
                if (data.transaction_update) {
                    for (const [key, pending] of pendingMobilis.entries()) {
                        if (data.transaction_update.includes(pending.phone)) {
                            bot.sendMessage(pending.chatId, `✅ تأكيد من موبيليس لعملية الرقم ${pending.phone}:\n${data.transaction_update}`);
                            pendingMobilis.delete(key);
                        }
                    }
                }
            });
        }).catch(err => {
            console.error('[Telegram Bot] Connection failed:', err.message);
            if (process.emit) {
                process.emit('bot-status', { connected: false, message: err.message });
            }
        });

        function getKeyboard(agent) {
            return {
                keyboard: [
                    [{ text: 'التقارير 🧾' }, { text: 'بونيس 🎁' }, { text: '🔐' }],
                    [{ text: '🎮' }, { text: 'منافسة 🏆' }],
                    [{ text: 'بطاقات تعبئة | شحن ألعاب | مفاتيح تفعيل 💳' }, { text: 'رصيد 💰' }]
                ],
                resize_keyboard: true,
                one_time_keyboard: false
            };
        }

        function getCardsSubmenu() {
            return {
                keyboard: [
                    [{ text: 'قائمة بطاقات وطنية 🧾' }, { text: 'قائمة بطاقات دولية 🧾' }],
                    [{ text: 'بطاقات وطنية 💳' }, { text: 'بطاقات دولية 💲' }],
                    [{ text: 'مساعدة بطاقة ✨' }, { text: 'رجوع 🏛️' }]
                ],
                resize_keyboard: true
            };
        }

        function getAdminSubmenu() {
            return {
                keyboard: [
                    [{ text: 'رصيد الشرائح 📊' }, { text: 'حالة الشرائح 📶' }],
                    [{ text: 'الوكلاء 👥' }, { text: 'إضافة رصيد 💰' }],
                    [{ text: 'إعادة تشغيل الحاسوب 🔄' }, { text: 'رجوع 🏛️' }]
                ],
                resize_keyboard: true
            };
        }

        function getControlPanelSubmenu() {
            return {
                keyboard: [
                    [{ text: 'RESTART SERVEUR🔴' }, { text: 'رجوع 🏛️' }],
                    [{ text: 'RESTART COMPUTER🔴' }, { text: 'ARETER COMPUTER🔴' }],
                    [{ text: 'SERVEUR NEDJMA⚙️' }, { text: 'SERVEUR MOBILIS⚙️' }, { text: 'SERVEUR DJEZZY⚙️' }],
                    [{ text: 'PAUSE SERVEUR🔴' }, { text: 'START SERVEUR🟢' }]
                ],
                resize_keyboard: true
            };
        }

        function getReportsSubmenu() {
            return {
                keyboard: [
                    [{ text: 'العمليات 🧾' }, { text: 'رجوع 🏛️' }],
                    [{ text: '👨🏻‍💼🧾' }, { text: 'ديون ن.البيع 🧾' }, { text: 'تفاصيل الديون 🧾' }],
                    [{ text: 'إجمالي 🧾' }, { text: 'ن.البيع 🧾' }, { text: 'الدفاتر 📖' }],
                    [{ text: 'تقرير 🗓️' }]
                ],
                resize_keyboard: true
            };
        }

        function getTotalsSubmenu() {
            return {
                keyboard: [
                    [{ text: 'Aujourdhui 🧾' }, { text: 'رجوع 🏛️' }],
                    [{ text: 'Dernier 7 jour 🧾' }, { text: 'Dernier 15 jour 🧾' }],
                    [{ text: 'Mois Dernier 🧾' }, { text: '6 Mois dernier 🧾' }, { text: 'Annuel 🧾' }]
                ],
                resize_keyboard: true
            };
        }

        function getOperationsSubmenu() {
            return {
                keyboard: [
                    [{ text: 'اليوم 🧾' }, { text: 'رجوع 🏛️' }],
                    [{ text: 'أمس 🧾' }, { text: 'قبل أمس 🧾' }, { text: 'قبل 3أيام 🧾' }]
                ],
                resize_keyboard: true
            };
        }

        const soldeHandler = (msg) => {
            const chatId = msg.chat.id;
            db.get(`SELECT * FROM agents WHERE telegram_id = ?`, [chatId.toString()], (err, row) => {
                if (!row) return bot.sendMessage(chatId, 'حسابك غير مسجل في النظام. أرسل /start للتسجيل.');
                bot.sendMessage(chatId, `💰 رصيدك الحالي هو: ${row.balance} دج.`);
            });
        };

        const handleReportCommand = (msg) => {
            const chatId = msg.chat.id;
            db.get(`SELECT is_admin FROM agents WHERE telegram_id = ?`, [chatId.toString()], (err, agent) => {
                if (!agent || !agent.is_admin) return bot.sendMessage(chatId, '⛔ هذا الأمر مخصص للمدراء فقط.');

                bot.sendMessage(chatId, 'إخترالتقرير 🗓️', {
                    reply_markup: getReportsSubmenu()
                });
            });
        };

        // Handle report callbacks
        bot.on('callback_query', async (callbackQuery) => {
            const data = callbackQuery.data;
            const chatId = callbackQuery.message.chat.id;

            // Gate: Block unregistered users
            const isReg = await new Promise(r => db.get(`SELECT id FROM agents WHERE telegram_id = ?`, [chatId.toString()], (e, row) => r(!!row)));
            if (!isReg) {
                bot.answerCallbackQuery(callbackQuery.id, { text: '✖️ حسابك غير مسجل.' });
                return;
            }

            if (data === 'report_operations') {
                bot.answerCallbackQuery(callbackQuery.id);
                bot.sendMessage(chatId, '📅 **اختر فترة التقرير:**', {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📅 اليومي (Aujourd\'hui)', callback_data: 'rperiod_1' }],
                            [{ text: '📆 الأسبوعي (7 jours)', callback_data: 'rperiod_7' }],
                            [{ text: '📆 15 يوم (15 jours)', callback_data: 'rperiod_15' }],
                            [{ text: '📆 شهري (30 jours)', callback_data: 'rperiod_30' }],
                            [{ text: '📆 6 أشهر (180 jours)', callback_data: 'rperiod_180' }]
                        ]
                    }
                });
                return;
            }

            if (data === 'report_solde') {
                bot.answerCallbackQuery(callbackQuery.id);
                handleSimsBalance(callbackQuery.message);
                return;
            }

            if (data === 'report_stock') {
                bot.answerCallbackQuery(callbackQuery.id);
                generateStockReport(chatId);
                return;
            }

            if (data && data.startsWith('rperiod_')) {
                bot.answerCallbackQuery(callbackQuery.id);
                const days = parseInt(data.replace('rperiod_', ''));
                generateFinancialReport(chatId, days);
                return;
            }
            if (data && data.startsWith('rg_trans_')) {
                const parts = data.split('_');
                const targetId = parseInt(parts[2]);
                const amount = parseFloat(parts[3]);

                db.get(`SELECT * FROM agents WHERE telegram_id = ?`, [chatId.toString()], (err, distributor) => {
                    if (distributor && (distributor.role === 'distributor' || distributor.is_admin)) {
                        if (!distributor.is_admin && distributor.balance < amount) {
                            return bot.answerCallbackQuery(callbackQuery.id, { text: `❌ رصيدك غير كافٍ. رصيدك الحالي: ${distributor.balance} دج.`, show_alert: true });
                        }

                        let query = distributor.is_admin ? `SELECT * FROM agents WHERE id = ?` : `SELECT * FROM agents WHERE id = ? AND parent_id = ?`;
                        let params = distributor.is_admin ? [targetId] : [targetId, distributor.id];

                        db.get(query, params, (err, subAgent) => {
                            if (!subAgent) return bot.answerCallbackQuery(callbackQuery.id, { text: `❌ لم يتم العثور على الزبون.`, show_alert: true });

                            const updateDistributorQuery = distributor.is_admin ? `SELECT 1` : `UPDATE agents SET balance = balance - ? WHERE id = ?`;
                            const distParams = distributor.is_admin ? [] : [amount, distributor.id];

                            db.run(updateDistributorQuery, distParams, (err) => {
                                db.run(`UPDATE agents SET balance = balance + ?, credit_balance = credit_balance + ? WHERE id = ?`, [amount, amount, subAgent.id], (err) => {
                                    bot.answerCallbackQuery(callbackQuery.id, { text: `✅ تم التحويل بنجاح!`, show_alert: true });
                                    const remainingDistBal = distributor.is_admin ? 'غير محدود (مدير)' : `${distributor.balance - amount} دج`;
                                    bot.sendMessage(chatId, `✅ تم تحويل ${amount} دج إلى الزبون ${subAgent.name} (rg${targetId}).\nرصيدك المتبقي: ${remainingDistBal}`);
                                    bot.sendMessage(subAgent.telegram_id, `💰 إشعار: تم إضافة ${amount} دج إلى رصيدك من قبل الموزع.\nرصيدك الجديد: ${subAgent.balance + amount} دج`);
                                    
                                    // Remove inline keyboard after successful transaction
                                    bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: callbackQuery.message.message_id }).catch(()=>{});
                                });
                            });
                        });
                    } else {
                        bot.answerCallbackQuery(callbackQuery.id, { text: `⛔ غير مصرح.`, show_alert: true });
                    }
                });
                return;
            }
        });

        function generateFinancialReport(chatId, days) {
            const periodLabel = days === 1 ? "Aujourd'hui" : `${days} jours`;
            const dateFilter = days === 1 
                ? "date(timestamp) = date('now')" 
                : `timestamp >= datetime('now', '-${days} days')`;

            // Get transactions grouped by operator
            db.all(`SELECT t.*, s.operator, s.number, s.margin_percent_1, s.margin_percent_2 
                    FROM transactions t 
                    LEFT JOIN sim_cards s ON t.sim_id = s.id 
                    WHERE t.type = 'FLEXY' AND t.status LIKE 'SUCCESS%' AND ${dateFilter}`, [], (err, txns) => {
                if (err) return bot.sendMessage(chatId, '❌ خطأ في قاعدة البيانات.');

                const operators = {};
                (txns || []).forEach(tx => {
                    const op = tx.operator || 'Autre';
                    if (!operators[op]) operators[op] = { count: 0, total: 0, margin: 0 };
                    operators[op].count++;
                    operators[op].total += (tx.amount || 0);
                    const marginPct = tx.margin_percent_1 || 0;
                    operators[op].margin += ((tx.amount || 0) * marginPct / 100);
                });

                let totalTransfer = 0;
                let totalMargin = 0;
                let report = `🧾 *Rapport ${periodLabel}:*\n`;
                report += `━━━━━━━━━━━━━━━━━━━━━\n`;

                for (const [op, data] of Object.entries(operators)) {
                    report += `\nN Operation ${op}: ${data.count}\n`;
                    report += `Tot Flexy ${op}: ${Number(data.total).toLocaleString()} Da\n`;
                    report += `Tot Marge: ${Number(data.margin.toFixed(2)).toLocaleString()} Da\n`;
                    report += `--------------------------------------------\n`;
                    totalTransfer += data.total;
                    totalMargin += data.margin;
                }

                report += `\n💰 *Total Transfert:* ${Number(totalTransfer).toLocaleString()} Da\n`;
                report += `💰 *Tot Marge:* ${Number(totalMargin.toFixed(2)).toLocaleString()} Da\n`;
                report += `━━━━━━━━━━━━━━━━━━━━━\n`;

                // Add SIM balances section
                db.all(`SELECT * FROM sim_cards WHERE status = 'active'`, [], (err2, sims) => {
                    if (!err2 && sims && sims.length > 0) {
                        report += `\n📱 *Solde puce:*\n`;
                        sims.forEach(sim => {
                            let bal = sim.balance || '0';
                            try {
                                const parsed = JSON.parse(bal);
                                const typeMap = { '04': parsed.gts, '01': parsed.poste, '02': parsed.assilou, '03': parsed.data, '05': parsed.mobilis };
                                bal = typeMap[sim.transfer_type] || parsed.gts || Object.values(parsed)[0] || '0';
                            } catch(e) {}
                            const m1 = sim.margin_percent_1 || 0;
                            const m2 = sim.margin_percent_2 || 0;
                            report += `${sim.operator}-${sim.id}: ${Number(bal).toLocaleString()} Da %: ${m1} / ${m2}\n`;
                        });
                        report += `━━━━━━━━━━━━━━━━━━━━━\n`;
                    }

                    // Add card stock section
                    db.all(`SELECT category, COUNT(*) as rest FROM recharge_cards WHERE status = 'available' GROUP BY category ORDER BY category`, [], (err3, cards) => {
                        if (!err3 && cards && cards.length > 0) {
                            report += `\n💳 *Stock carte Recharge:*\n`;
                            cards.forEach(c => {
                                report += `${c.category} Rest: ${c.rest}\n`;
                            });
                            report += `━━━━━━━━━━━━━━━━━━━━━\n`;
                        }

                        // Card sales in the period
                        db.all(`SELECT category, COUNT(*) as sold, SUM(value) as totalVal, SUM(value - COALESCE(purchase_price, 0)) as margin 
                                FROM recharge_cards WHERE status = 'sold' AND ${dateFilter.replace('timestamp', 'sold_at')}
                                GROUP BY category`, [], (err4, soldCards) => {
                            if (!err4 && soldCards && soldCards.length > 0) {
                                let cardMarginTotal = 0;
                                report += `\n🌷 *Ventes cartes recharge:*\n`;
                                soldCards.forEach(c => {
                                    report += `${c.category} (${c.sold}) Marge: ${Number((c.margin || 0).toFixed(2)).toLocaleString()} Da\n`;
                                    cardMarginTotal += (c.margin || 0);
                                });
                                report += `Total Marge Cart: ${Number(cardMarginTotal.toFixed(2)).toLocaleString()} Da\n`;
                            }

                            bot.sendMessage(chatId, report, { parse_mode: 'Markdown' });
                        });
                    });
                });
            });
        }

        function generateStockReport(chatId) {
            db.all(`SELECT category, COUNT(*) as rest FROM recharge_cards WHERE status = 'available' GROUP BY category ORDER BY category`, [], (err, cards) => {
                if (err) return bot.sendMessage(chatId, '❌ خطأ.');
                if (!cards || cards.length === 0) return bot.sendMessage(chatId, '📭 لا يوجد مخزون بطاقات.');

                let report = '💳 **مخزون البطاقات:**\n\n';
                cards.forEach(c => {
                    report += `📦 ${c.category}: ${c.rest} بطاقة\n`;
                });
                bot.sendMessage(chatId, report, { parse_mode: 'Markdown' });
            });
        }

        const handleSimsBalance = (msg) => {
            const chatId = msg.chat.id;
            db.get(`SELECT is_admin FROM agents WHERE telegram_id = ?`, [chatId.toString()], (err, agent) => {
                if (!agent || !agent.is_admin) return bot.sendMessage(chatId, '⛔ هذا الأمر مخصص للمدراء فقط.');

                db.all(`SELECT * FROM sim_cards`, [], (err, rows) => {
                    if (err) return bot.sendMessage(chatId, '❌ حدث خطأ في قاعدة البيانات.');
                    if (rows.length === 0) return bot.sendMessage(chatId, '📭 لا توجد شرائح مسجلة.');

                    let responseText = '📊 **رصيد الشرائح:**\n\n';
                    rows.forEach(sim => {
                        let balanceText = sim.balance || '0';
                        try {
                            const balances = JSON.parse(sim.balance);
                            // Show balance based on transfer_type
                            const typeMap = {
                                '04': balances.gts,
                                '01': balances.poste,
                                '02': balances.assilou,
                                '03': balances.data,
                                '05': balances.mobilis
                            };
                            const relevant = typeMap[sim.transfer_type] || balances.gts || Object.values(balances)[0];
                            balanceText = `${relevant || 0} دج`;
                        } catch(e) {
                            balanceText = `${sim.balance} دج`;
                        }
                        const statusIcon = sim.status === 'active' ? '🟢' : '🔴';
                        responseText += `${statusIcon} ${sim.operator} (${sim.number}): ${balanceText}\n`;
                    });
                    bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });
                });
            });
        };

        const handleSimsStatus = (msg) => {
            const chatId = msg.chat.id;
            db.get(`SELECT is_admin FROM agents WHERE telegram_id = ?`, [chatId.toString()], (err, agent) => {
                if (!agent || !agent.is_admin) return bot.sendMessage(chatId, '⛔ هذا الأمر مخصص للمدراء فقط.');

                db.all(`SELECT * FROM sim_cards`, [], (err, rows) => {
                    if (err) return bot.sendMessage(chatId, '❌ حدث خطأ في قاعدة البيانات.');
                    if (rows.length === 0) return bot.sendMessage(chatId, '📭 لا توجد شرائح مسجلة.');

                    let responseText = '📶 **حالة الشرائح:**\n\n';
                    rows.forEach(sim => {
                        const statusIcon = sim.status === 'active' ? '🟢' : '🔴';
                        responseText += `${statusIcon} ${sim.operator} (${sim.number}): إشارة ${sim.signal || 0}/5\n`;
                    });
                    bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });
                });
            });
        };

        const handleAgentsList = (msg) => {
            const chatId = msg.chat.id;
            db.get(`SELECT is_admin FROM agents WHERE telegram_id = ?`, [chatId.toString()], (err, agent) => {
                if (!agent || !agent.is_admin) return bot.sendMessage(chatId, '⛔ هذا الأمر مخصص للمدراء فقط.');

                db.all(`SELECT * FROM agents`, [], (err, rows) => {
                    if (err) return bot.sendMessage(chatId, '❌ حدث خطأ في قاعدة البيانات.');
                    if (rows.length === 0) return bot.sendMessage(chatId, '📭 لا يوجد وكلاء مسجلون.');

                    let responseText = '👥 **قائمة الوكلاء المسجلين:**\n\n';
                    rows.forEach(row => {
                        const adminTag = row.is_admin ? ' (مدير 👑)' : '';
                        responseText += `👤 ${row.name}${adminTag}\n🆔 ID: \`${row.id}\`\n💰 الرصيد: ${row.balance} دج\n------------------\n`;
                    });
                    bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });
                });
            });
        };

        const handleAddBalanceInfo = (msg) => {
            const chatId = msg.chat.id;
            bot.sendMessage(chatId, `💰 **طريقة إضافة رصيد لوكيل:**\n\nيرجى إرسال الأمر التالي:\n\`/addbalance [ID_الوكيل] [المبلغ]\`\n\nمثال: لإضافة 5000 دج للوكيل رقم 1\n\`/addbalance 1 5000\``, { parse_mode: 'Markdown' });
        };

        const handleRestartCommand = (msg) => {
            const chatId = msg.chat.id;
            db.get(`SELECT is_admin FROM agents WHERE telegram_id = ?`, [chatId.toString()], (err, agent) => {
                if (!agent || !agent.is_admin) return bot.sendMessage(chatId, '⛔ هذا الأمر مخصص للمدراء فقط.');

                bot.sendMessage(chatId, '⚠️ جاري إعادة تشغيل الخادم (الحاسوب) الآن...');
                setTimeout(() => {
                    require('child_process').exec('shutdown /r /t 0');
                }, 2000);
            });
        };

        const handleShutdownCommand = (msg) => {
            const chatId = msg.chat.id;
            db.get(`SELECT is_admin FROM agents WHERE telegram_id = ?`, [chatId.toString()], (err, agent) => {
                if (!agent || !agent.is_admin) return bot.sendMessage(chatId, '⛔ هذا الأمر مخصص للمدراء فقط.');

                bot.sendMessage(chatId, '⚠️ جاري إيقاف تشغيل الخادم (الحاسوب) الآن...');
                setTimeout(() => {
                    require('child_process').exec('shutdown /s /t 0');
                }, 2000);
            });
        };

        const handleCarteCommand = (msg, typeParam) => {
            const chatId = msg.chat.id;
            const type = typeParam.toLowerCase();
            
            let category = '';
            if(type.includes('adsl') || type.includes('idoom')) category = 'Idoom ADSL';
            if(type.includes('4g')) category = 'Idoom 4G';

            if(!category) return bot.sendMessage(chatId, 'الرجاء تحديد نوع البطاقة بشكل صحيح: /carte adsl أو /carte 4g');

            db.get(`SELECT * FROM agents WHERE telegram_id = ?`, [chatId.toString()], async (err, agent) => {
                if (!agent) return bot.sendMessage(chatId, 'حسابك غير مسجل. أرسل /start');
                
                if (agent.status === 'suspended') {
                    return bot.sendMessage(chatId, '⛔ عذراً، حسابك موقوف حالياً. يرجى التواصل مع الإدارة.');
                }
                
                if (agent.disabled_services) {
                    const disabled = agent.disabled_services.split(',');
                    if (disabled.includes('cards')) {
                        return bot.sendMessage(chatId, `⛔ عذراً، خدمة بطاقات التعبئة غير متاحة لحسابك.`);
                    }
                }

                db.all(`SELECT DISTINCT value FROM recharge_cards WHERE category IN (?, 'Idoom') AND status = 'available' ORDER BY value ASC`, [category], (err, rows) => {
                    if (err || rows.length === 0) {
                        return bot.sendMessage(chatId, `❌ عذراً، لا توجد بطاقات متاحة حالياً لفئة ${category}.`);
                    }

                    const buttons = [];
                    rows.forEach(row => {
                        // The callback data format will be buycard_type_value
                        // Use short type to save space
                        const shortType = category === 'Idoom ADSL' ? 'adsl' : '4g';
                        buttons.push([{ text: `بطاقة ${row.value} دج`, callback_data: `buycard_${shortType}_${row.value}` }]);
                    });
                    buttons.push([{ text: '❌ إلغاء', callback_data: `buycard_cancel` }]);

                    const opts = {
                        reply_markup: {
                            inline_keyboard: buttons
                        }
                    };

                    bot.sendMessage(chatId, `🛒 يرجى اختيار فئة البطاقة لـ ${category}:`, opts);
                });
            });
        };

        const handleMyAgentsList = (msg) => {
            const chatId = msg.chat.id;
            db.get(`SELECT * FROM agents WHERE telegram_id = ?`, [chatId.toString()], (err, distributor) => {
                if (!distributor || distributor.role !== 'distributor') return bot.sendMessage(chatId, '⛔ هذه الخاصية مخصصة للموزعين فقط.');

                db.all(`SELECT * FROM agents WHERE parent_id = ?`, [distributor.id], (err, rows) => {
                    if (err) return bot.sendMessage(chatId, '❌ حدث خطأ في قاعدة البيانات.');
                    if (rows.length === 0) return bot.sendMessage(chatId, '📭 لا يوجد لديك أي زبائن مسجلين حالياً.');
                    
                    let responseText = '👥 **قائمة زبائنك:**\n\n';
                    rows.forEach(row => {
                        responseText += `👤 ${row.name}\n🆔 ID: \`${row.telegram_id}\`\n💰 الرصيد: ${row.balance} دج\n------------------\n`;
                    });
                    bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });
                });
            });
        };

        const notifiedUnregistered = new Set();
        
        // Log all messages/commands
        bot.on('message', async (msg) => {
            // Intercept manual captcha replies
            if (msg.reply_to_message && msg.text) {
                const replyMsgId = msg.reply_to_message.message_id.toString();
                if (pendingCaptchas.has(replyMsgId)) {
                    const captchaCode = msg.text.trim();
                    const adminName = msg.from.first_name || 'مدير';
                    
                    console.log(`[Telegram Bot] Received captcha reply from ${adminName}: ${captchaCode}`);
                    
                    const success = resolvePendingCaptcha(replyMsgId, captchaCode);
                    if (success) {
                        bot.sendMessage(msg.chat.id, `✅ تم استلام رمز الكابتشا: \`${captchaCode}\` من قبل ${adminName}. جاري المتابعة...`, { parse_mode: 'Markdown' });
                    }
                    return;
                }
            }

            if (msg.text) {
                const text = msg.text.trim();
                const logEntry = {
                    user_id: msg.chat.id.toString(),
                    user_name: msg.from.first_name || 'وكيل',
                    message: text,
                    timestamp: new Date().toISOString()
                };
                db.run(`INSERT INTO bot_logs (user_id, user_name, message) VALUES (?, ?, ?)`, 
                [logEntry.user_id, logEntry.user_name, logEntry.message]);
                
                if (process.emit) {
                    process.emit('bot-log', logEntry);
                }
                
                // Gate: Block unregistered users - show only their ID and notify admins
                if (!text.startsWith('/make_admin')) {
                    const isRegistered = await new Promise((resolve) => {
                        db.get(`SELECT id FROM agents WHERE telegram_id = ?`, [msg.chat.id.toString()], (err, row) => resolve(!!row));
                    });
                    if (!isRegistered) {
                        bot.sendMessage(msg.chat.id, `🆔 معرفك هو: \`${msg.chat.id}\``, { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } });
                        
                        if (!notifiedUnregistered.has(msg.chat.id)) {
                            notifiedUnregistered.add(msg.chat.id);
                            const name = msg.from.first_name || 'وكيل';
                            db.all(`SELECT telegram_id FROM agents WHERE is_admin = 1`, [], (err, admins) => {
                                if (!err && admins) {
                                    admins.forEach(admin => {
                                        bot.sendMessage(admin.telegram_id, `⚠️ **محاولة اتصال جديدة!**\n\nيوجد شخص غير مسجل حاول الدخول للبوت:\nالاسم: ${name}\nالمعرف (ID): \`${msg.chat.id}\`\n\nلتسجيله، انسخ الرسالة وعدلها:\n\`0000000000*${name}*${msg.chat.id}\``, { parse_mode: 'Markdown' }).catch(()=>{});
                                    });
                                }
                            });
                        }
                        return;
                    }
                }

                // Keyboard handlers
                if (text === 'رجوع 🏛️') {
                    db.get(`SELECT * FROM agents WHERE telegram_id = ?`, [msg.chat.id.toString()], (err, row) => {
                        bot.sendMessage(msg.chat.id, 'أنت الآن في القائمة الرئيسية', { reply_markup: getKeyboard(row) });
                    });
                    return;
                }
                if (text === 'رجوع 🏛️' || text === '.') {
                    db.get(`SELECT is_admin FROM agents WHERE telegram_id = ?`, [msg.chat.id.toString()], (err, row) => {
                        if (row) {
                            bot.sendMessage(msg.chat.id, 'أنت الآن في القائمة الرئيسية:', { reply_markup: getKeyboard(row.is_admin) });
                        } else {
                            bot.sendMessage(msg.chat.id, 'حسابك غير مسجل في النظام. أرسل /start للتسجيل.');
                        }
                    });
                    return;
                }

                if (text === 'بطاقات تعبئة | شحن ألعاب | مفاتيح تفعيل 💳') {
                    return bot.sendMessage(msg.chat.id, 'اختر نوع البطاقة 💳:', { reply_markup: getCardsSubmenu() });
                }
                if (text === '🎮') {
                    db.get(`SELECT is_admin FROM agents WHERE telegram_id = ?`, [msg.chat.id.toString()], (err, row) => {
                        if (row && row.is_admin) {
                            bot.sendMessage(msg.chat.id, 'مرحبا أنت الآن في لوحة التحكم الرئيسية ⚙️', { reply_markup: getControlPanelSubmenu() });
                        } else {
                            bot.sendMessage(msg.chat.id, '⛔ عذراً، هذه القائمة مخصصة للمدراء فقط.');
                        }
                    });
                    return;
                }
                if (text === '🔐') {
                    db.get(`SELECT is_admin FROM agents WHERE telegram_id = ?`, [msg.chat.id.toString()], (err, row) => {
                        if (row && row.is_admin) {
                            bot.sendMessage(msg.chat.id, 'لوحة تحكم المشرف 🔐:', { reply_markup: getAdminSubmenu() });
                        } else {
                            bot.sendMessage(msg.chat.id, '⛔ عذراً، هذه القائمة مخصصة للمدراء فقط.');
                        }
                    });
                    return;
                }
                if (text === 'رصيد 💰' || text === 'معرفة الرصيد 💰') return soldeHandler(msg);
                if (text === 'التقارير 🧾' || text === 'التقارير 📊') return handleReportCommand(msg);
                
                if (text === 'العمليات 🧾') {
                    db.get(`SELECT is_admin FROM agents WHERE telegram_id = ?`, [msg.chat.id.toString()], (err, agent) => {
                        if (!agent || !agent.is_admin) return bot.sendMessage(msg.chat.id, '⛔ هذا الأمر مخصص للمدراء فقط.');
                        bot.sendMessage(msg.chat.id, 'إختر تاريخ التقرير 🗓️', { reply_markup: getOperationsSubmenu() });
                    });
                    return;
                }
                
                if (text === 'إجمالي 🧾') {
                    db.get(`SELECT is_admin FROM agents WHERE telegram_id = ?`, [msg.chat.id.toString()], (err, agent) => {
                        if (!agent || !agent.is_admin) return bot.sendMessage(msg.chat.id, '⛔ هذا الأمر مخصص للمدراء فقط.');
                        bot.sendMessage(msg.chat.id, 'Menu', { reply_markup: getTotalsSubmenu() });
                    });
                    return;
                }
                
                if (text === 'Aujourdhui 🧾') return generateFinancialReport(msg.chat.id, 1);
                if (text === 'Dernier 7 jour 🧾') return generateFinancialReport(msg.chat.id, 7);
                if (text === 'Dernier 15 jour 🧾') return generateFinancialReport(msg.chat.id, 15);
                if (text === 'Mois Dernier 🧾') return generateFinancialReport(msg.chat.id, 30);
                if (text === '6 Mois dernier 🧾') return generateFinancialReport(msg.chat.id, 180);
                if (text === 'Annuel 🧾') return generateFinancialReport(msg.chat.id, 365);
                
                if (text === 'إعادة تشغيل الحاسوب 🔄' || text === 'RESTART COMPUTER🔴') return handleRestartCommand(msg);
                if (text === 'ARETER COMPUTER🔴') return handleShutdownCommand(msg);
                if (text === 'رصيد الشرائح 📊') return handleSimsBalance(msg);
                if (text === 'حالة الشرائح 📶') return handleSimsStatus(msg);
                if (text === 'الوكلاء 👥') return handleAgentsList(msg);
                if (text === 'إضافة رصيد 💰') return handleAddBalanceInfo(msg);
                
                // Handlers for the new buttons as placeholders
                const newButtons = ['بونيس 🎁', 'منافسة 🏆', 'قائمة بطاقات وطنية 🧾', 'قائمة بطاقات دولية 🧾', 'بطاقات وطنية 💳', 'بطاقات دولية 💲', 'مساعدة بطاقة ✨', 'RESTART SERVEUR🔴', 'SERVEUR NEDJMA⚙️', 'SERVEUR MOBILIS⚙️', 'SERVEUR DJEZZY⚙️', 'PAUSE SERVEUR🔴', 'START SERVEUR🟢', '👨🏻‍💼🧾', 'ديون ن.البيع 🧾', 'تفاصيل الديون 🧾', 'ن.البيع 🧾', 'الدفاتر 📖', 'تقرير 🗓️', 'اليوم 🧾', 'أمس 🧾', 'قبل أمس 🧾', 'قبل 3أيام 🧾'];
                if (newButtons.includes(text)) {
                    return bot.sendMessage(msg.chat.id, 'قيد التطوير وسيتم تفعيله قريباً! 🚧');
                }
                
                if (text === 'بطاقة التعبئة ادوم 🌐') return handleCarteCommand(msg, 'adsl');
                if (text === 'بطاقة 4G 📶') return handleCarteCommand(msg, '4g');
                if (text === 'العاب Free Fire & PUBG 🎮') return bot.sendMessage(msg.chat.id, '🎮 قسم بطاقات الألعاب (Free Fire & PUBG) قيد التطوير وسيتم تفعيله قريباً!');
                if (text === 'إضافة زبون ➕') return bot.sendMessage(msg.chat.id, '➕ **لإضافة زبون جديد:**\n\nيرجى إرسال الأمر التالي بالتنسيق:\n`/add [معرف_الزبون] [رقم_الهاتف] [الاسم]`\n\nمثال:\n`/add 123456789 0555000000 محمد`', { parse_mode: 'Markdown' });
                if (text === 'تحويل رصيد 💸') return bot.sendMessage(msg.chat.id, '💸 **لتحويل رصيد لأحد زبائنك:**\n\nيرجى إرسال الأمر التالي:\n`/transfer [معرف_الزبون] [المبلغ]`\n\nمثال لتحويل 1000 دج:\n`/transfer 123456789 1000`', { parse_mode: 'Markdown' });
                if (text === 'قائمة زبائني 👥') return handleMyAgentsList(msg);

                // 1. Ooredoo/Djezzy/Mobilis Offers Triggers (Admins Only)
                const ooredooRegex = /^05\d{8}$/;
                const djezzyRegex = /^07\d{8}$/;
                const mobilisRegex = /^06\d{8}$/;

                if (ooredooRegex.test(text) || djezzyRegex.test(text) || mobilisRegex.test(text)) {
                    db.get(`SELECT is_admin FROM agents WHERE telegram_id = ?`, [msg.chat.id.toString()], (err, row) => {
                        if (!row || !row.is_admin) {
                            return bot.sendMessage(msg.chat.id, '⛔ عذراً، خاصية الاطلاع على العروض مخصصة للمدراء (Admin) فقط.');
                        }
                        
                        if (ooredooRegex.test(text)) {
                            handleOoredooOffer(msg, text);
                        } else if (djezzyRegex.test(text)) {
                            handleDjezzyOffer(msg, text);
                        } else if (mobilisRegex.test(text)) {
                            handleMobilisOffer(msg, text);
                        }
                    });
                    return;
                }
                
                // 2. Normal Flexy Trigger (Phone*Amount or Phone*Amount*f)
                const flexyRegex = /^0[567]\d{8}\*\d+(?:\*[a-zA-Z0-9أ-ي]+)?$/;
                if (flexyRegex.test(text)) {
                    return handleQuickFlexy(msg, text);
                }

                // 3. Direct 4G/ADSL number recharge & bill trigger (Landline, 4G, international, and local formats)
                const idoomDirectRegex = /^(?:213\d{8,9}|0[234]\d{7,8}|47\d{7})$/;
                if (idoomDirectRegex.test(text)) {
                    return handleDirectIdoomRecharge(msg, text);
                }

                // 4. Manual Agent Registration Trigger (Phone***Name*ID)
                const manualRegRegex = /^(\d+)\*\*\*(.+)\*(\d+)$/;
                if (manualRegRegex.test(text)) {
                    const match = text.match(manualRegRegex);
                    const phone = match[1];
                    const agentName = match[2];
                    const telegramId = match[3];

                    db.get(`SELECT is_admin FROM agents WHERE telegram_id = ?`, [msg.chat.id.toString()], (err, row) => {
                        if (row && row.is_admin) {
                            db.run(`INSERT OR REPLACE INTO agents (telegram_id, name) VALUES (?, ?)`, [telegramId, `${agentName} (${phone})`], (err) => {
                                if (err) {
                                    bot.sendMessage(msg.chat.id, `❌ فشل تسجيل الوكيل: ${err.message}`);
                                } else {
                                    bot.sendMessage(msg.chat.id, `✅ تم تسجيل الوكيل بنجاح!\nالاسم: ${agentName}\nالهاتف: ${phone}\nالمعرف: ${telegramId}`);
                                    bot.sendMessage(telegramId, `🎉 مبروك! تم تسجيل حسابك في نظام فليكسي من قبل الإدارة.\nالاسم المسجل: ${agentName}\nيمكنك الآن استخدام البوت.`, {
                                        reply_markup: getKeyboard({ is_admin: 0, role: 'user' })
                                    }).catch(() => {});
                                }
                            });
                        }
                    });
                    return;
                }

                // Distributor Add Agent Command: Phone*Name*TelegramId
                const addAgentRegex = /^(\d{10})\*(.+)\*(\d+)$/;
                if (addAgentRegex.test(text)) {
                    const match = text.match(addAgentRegex);
                    const newPhone = match[1];
                    const newName = match[2];
                    const newTelegramId = match[3];

                    db.get(`SELECT * FROM agents WHERE telegram_id = ?`, [msg.chat.id.toString()], (err, agent) => {
                        if (agent && (agent.role === 'distributor' || agent.is_admin)) {
                            db.run(`INSERT OR REPLACE INTO agents (telegram_id, name, phone_number, parent_id, tier, role) VALUES (?, ?, ?, ?, ?, ?)`, 
                            [newTelegramId, newName, newPhone, agent.id, 'detaillant', 'user'], function(err) {
                                if (err) {
                                    bot.sendMessage(msg.chat.id, `❌ فشل إضافة الزبون: ${err.message}`);
                                } else {
                                    const assignedRg = `rg${this.lastID}`;
                                    bot.sendMessage(msg.chat.id, `✅ تم تسجيل الزبون بنجاح!\nالاسم: ${newName}\nالـ ID: ${newTelegramId}\nكود الزبون للتحويل: **${assignedRg}**\nوهو الآن مرتبط بحسابك.`, { parse_mode: 'Markdown' });
                                    bot.sendMessage(newTelegramId, `🎉 مبروك! تم تسجيل حسابك في نظام فليكسي.\nيمكنك الآن استخدام البوت.`, {
                                        reply_markup: getKeyboard({ is_admin: 0, role: 'user' })
                                    }).catch(() => {});
                                }
                            });
                        } else {
                            bot.sendMessage(msg.chat.id, `⛔ عذراً، هذه الخاصية مخصصة للموزعين والمدراء فقط.`);
                        }
                    });
                    return;
                }

                // RG Details Request: rg[id]
                const rgDetailsRegex = /^rg(\d+)$/i;
                if (rgDetailsRegex.test(text)) {
                    const match = text.match(rgDetailsRegex);
                    const targetDbId = match[1];

                    db.get(`SELECT * FROM agents WHERE telegram_id = ?`, [msg.chat.id.toString()], (err, distributor) => {
                        if (distributor && (distributor.role === 'distributor' || distributor.is_admin)) {
                            let query = distributor.is_admin ? `SELECT * FROM agents WHERE id = ?` : `SELECT * FROM agents WHERE id = ? AND parent_id = ?`;
                            let params = distributor.is_admin ? [targetDbId] : [targetDbId, distributor.id];
                            
                            db.get(query, params, (err, subAgent) => {
                                if (!subAgent) return bot.sendMessage(msg.chat.id, `❌ لم يتم العثور على زبون يحمل هذا المعرف (rg${targetDbId}).`);

                                const msgText = `تحويل رصيد لـ\n${subAgent.name}\nTel:${subAgent.phone_number || 'غير متوفر'}.\nSOLDE: ${subAgent.balance || 0} DA ,BONUS CARTE: ${subAgent.bonus_carte || 0}DA,  MOBILIS: ${subAgent.mobilis_balance || 0}DA,  OREDO: ${subAgent.ooredoo_balance || 0}DA,  CREDIT: ${subAgent.credit_balance || 0} DA.`;
                                
                                const opts = {
                                    reply_markup: {
                                        inline_keyboard: [
                                            [{ text: '5000', callback_data: `rg_trans_${subAgent.id}_5000` }, { text: '15000', callback_data: `rg_trans_${subAgent.id}_15000` }],
                                            [{ text: '20000', callback_data: `rg_trans_${subAgent.id}_20000` }, { text: '25000', callback_data: `rg_trans_${subAgent.id}_25000` }],
                                            [{ text: '30000', callback_data: `rg_trans_${subAgent.id}_30000` }, { text: '500000', callback_data: `rg_trans_${subAgent.id}_500000` }]
                                        ]
                                    }
                                };
                                bot.sendMessage(msg.chat.id, msgText, opts);
                            });
                        }
                    });
                    return;
                }

                // RG Direct Transfer: rg[id]*[amount]
                const rgTransferRegex = /^rg(\d+)\*(\d+(\.\d+)?)$/i;
                if (rgTransferRegex.test(text)) {
                    const match = text.match(rgTransferRegex);
                    const targetDbId = match[1];
                    const amount = parseFloat(match[2]);

                    db.get(`SELECT * FROM agents WHERE telegram_id = ?`, [msg.chat.id.toString()], (err, distributor) => {
                        if (distributor && (distributor.role === 'distributor' || distributor.is_admin)) {
                            if (!distributor.is_admin && distributor.balance < amount) {
                                return bot.sendMessage(msg.chat.id, `❌ رصيدك غير كافٍ. رصيدك الحالي: ${distributor.balance} دج.`);
                            }
                            
                            let query = distributor.is_admin ? `SELECT * FROM agents WHERE id = ?` : `SELECT * FROM agents WHERE id = ? AND parent_id = ?`;
                            let params = distributor.is_admin ? [targetDbId] : [targetDbId, distributor.id];
                            
                            db.get(query, params, (err, subAgent) => {
                                if (!subAgent) return bot.sendMessage(msg.chat.id, `❌ لم يتم العثور على زبون يحمل المعرف (rg${targetDbId}).`);

                                const updateDistributorQuery = distributor.is_admin ? `SELECT 1` : `UPDATE agents SET balance = balance - ? WHERE id = ?`;
                                const distParams = distributor.is_admin ? [] : [amount, distributor.id];

                                db.run(updateDistributorQuery, distParams, (err) => {
                                    db.run(`UPDATE agents SET balance = balance + ?, credit_balance = credit_balance + ? WHERE id = ?`, [amount, amount, subAgent.id], (err) => {
                                        const remainingDistBal = distributor.is_admin ? 'غير محدود (مدير)' : `${distributor.balance - amount} دج`;
                                        bot.sendMessage(msg.chat.id, `✅ تم تحويل ${amount} دج إلى الزبون ${subAgent.name} (rg${targetDbId}).\nرصيدك المتبقي: ${remainingDistBal}`);
                                        bot.sendMessage(subAgent.telegram_id, `💰 إشعار: تم إضافة ${amount} دج إلى رصيدك من قبل الموزع.\nرصيدك الجديد: ${subAgent.balance + amount} دج`);
                                    });
                                });
                            });
                        }
                    });
                    return;
                }

                // RG Direct Payment: rg[id]#[amount]
                const rgPaymentRegex = /^rg(\d+)#(\d+(\.\d+)?)$/i;
                if (rgPaymentRegex.test(text)) {
                    const match = text.match(rgPaymentRegex);
                    const targetDbId = match[1];
                    const amount = parseFloat(match[2]);

                    db.get(`SELECT * FROM agents WHERE telegram_id = ?`, [msg.chat.id.toString()], (err, distributor) => {
                        if (distributor && (distributor.role === 'distributor' || distributor.is_admin)) {
                            let query = distributor.is_admin ? `SELECT * FROM agents WHERE id = ?` : `SELECT * FROM agents WHERE id = ? AND parent_id = ?`;
                            let params = distributor.is_admin ? [targetDbId] : [targetDbId, distributor.id];
                            
                            db.get(query, params, (err, subAgent) => {
                                if (!subAgent) return bot.sendMessage(msg.chat.id, `❌ لم يتم العثور على زبون يحمل المعرف (rg${targetDbId}).`);

                                db.run(`UPDATE agents SET credit_balance = credit_balance - ? WHERE id = ?`, [amount, subAgent.id], (err) => {
                                    const currentCredit = subAgent.credit_balance || 0;
                                    bot.sendMessage(msg.chat.id, `✅ تم تسجيل دفعة بقيمة ${amount} دج من الزبون ${subAgent.name} (rg${targetDbId}).\nالديْن المتبقي: ${currentCredit - amount} دج`);
                                    bot.sendMessage(subAgent.telegram_id, `💸 إشعار: تم تسجيل تسديد بقيمة ${amount} دج.\nالديْن المتبقي: ${currentCredit - amount} دج`);
                                });
                            });
                        }
                    });
                    return;
                }

                // Become admin secretly
                if (text === adminSecret) {
                    db.run(`UPDATE agents SET is_admin = 1 WHERE telegram_id = ?`, [msg.chat.id.toString()], (err) => {
                        bot.sendMessage(msg.chat.id, '👑 مبروك! تمت ترقيتك بنجاح لتصبح مديراً (Admin).\nتم تفعيل أزرار التحكم الخاصة بالمدراء.', {
                            reply_markup: getKeyboard({ is_admin: 1 })
                        });
                    });
                    return;
                }

                // Auto-reply for non-command messages that are not triggers
                if (!text.startsWith('/')) {
                    db.get(`SELECT * FROM agents WHERE telegram_id = ?`, [msg.chat.id.toString()], (err, row) => {
                        bot.sendMessage(msg.chat.id, "انت الان في القائمة الرئيسية", {
                            reply_markup: getKeyboard(row)
                        });
                    });
                }
            }
        });

        function getLastTransaction(phoneNumber) {
            return new Promise((resolve) => {
                const cleanPhone = phoneFormatClean(phoneNumber);
                db.get(`SELECT phone_number, amount, operator, type, timestamp, status FROM transactions 
                    WHERE (phone_number = ? OR phone_number = ?) 
                    AND status LIKE 'SUCCESS%' 
                    ORDER BY timestamp DESC LIMIT 1`, 
                    [phoneNumber, cleanPhone], (err, row) => {
                        if (err || !row) return resolve(null);
                        resolve(row);
                    });
            });
        }

        function formatLastTransactionMsg(tx) {
            if (!tx) return '';
            const d = new Date(tx.timestamp);
            const dateStr = d.toLocaleString('fr-DZ', { timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
            return `\n\n🔔 آخر عملية للرقم ${tx.phone_number}:\n📅 التاريخ: ${dateStr}\n💰 المبلغ: ${tx.amount} Da.`;
        }

        async function handleDirectIdoomRecharge(msg, rawAccount) {
            let account = rawAccount.trim();
            
            const chatId = msg.chat.id;
            const is4G = (account.startsWith('21347') && account.length === 12) || 
                         (account.startsWith('047') && account.length === 10) || 
                         (account.startsWith('47') && account.length === 9);
            const type = is4G ? '4g' : 'idoom';
            const category = is4G ? 'Idoom 4G' : 'Idoom ADSL';

            db.get(`SELECT * FROM agents WHERE telegram_id = ?`, [chatId.toString()], async (err, agent) => {
                if (!agent) return bot.sendMessage(chatId, 'حسابك غير مسجل. أرسل /start');

                if (agent.status === 'suspended') {
                    return bot.sendMessage(chatId, '⛔ عذراً، حسابك موقوف حالياً. يرجى التواصل مع الإدارة.');
                }
                
                if (agent.disabled_services) {
                    const disabled = agent.disabled_services.split(',');
                    if (disabled.includes('cards')) {
                        return bot.sendMessage(chatId, `⛔ عذراً، خدمة بطاقات التعبئة غير متاحة لحسابك.`);
                    }
                }

                // Query available cards for this category
                db.all(`SELECT DISTINCT value FROM recharge_cards WHERE category IN (?, 'Idoom') AND status = 'available' ORDER BY value ASC`, [category], async (err, rows) => {
                    if (err || rows.length === 0) {
                        return bot.sendMessage(chatId, `❌ عذراً، لا توجد بطاقات متاحة حالياً لـ ${category}.`);
                    }

                    const buttons = [];
                    rows.forEach(row => {
                        buttons.push([{ text: `تعبئة ${row.value} دج`, callback_data: `autofill_${type}_${account}_${row.value}` }]);
                    });
                    
                    // Offer invoice check option directly for landlines!
                    if (!is4G) {
                        buttons.push([{ text: `🧾 فحص الفاتورة المستحقة`, callback_data: `checkbill_${account}` }]);
                    }
                    
                    buttons.push([{ text: '❌ إلغاء', callback_data: `autofill_cancel` }]);

                    const opts = {
                        reply_markup: {
                            inline_keyboard: buttons
                        }
                    };

                    // Check last transaction for this account
                    const lastTx = await getLastTransaction(account);
                    const lastTxMsg = formatLastTransactionMsg(lastTx);

                    bot.sendMessage(chatId, `🔍 تم التعرف على الرقم كـ **${category}**.\nيرجى اختيار فئة البطاقة لشحن الرقم \`${account}\`:${lastTxMsg}`, {
                        parse_mode: 'Markdown',
                        reply_markup: opts.reply_markup
                    });
                });
            });
        }

        async function handleOoredooOffer(msg, phone) {
            const chatId = msg.chat.id;
            
            // Check cache first
            const cached = await getCachedChoices(phone, 'Ooredoo', []);
            if (cached && cached.length > 0) {
                const inline_keyboard = [];
                cached.forEach(row => {
                    const cleanedLabel = cleanOfferLabel(row.label);
                    inline_keyboard.push([{ text: `${row.choice_path} - ${cleanedLabel}`, callback_data: `offer_${phone}_${row.choice_path}` }]);
                });
                
                // Add Save Offers button
                inline_keyboard.push([
                    { text: '💾 حفظ العروض / Save', callback_data: `saveoffers_${phone}_Ooredoo` }
                ]);
                inline_keyboard.push([
                    { text: '🔄 تحديث الفحص / Refresh', callback_data: `oorscan_${phone}` },
                    { text: '❌ إلغاء', callback_data: `offer_${phone}_cancel` }
                ]);
                
                return bot.sendMessage(chatId, `👇 [مسجل تلقائياً 💾] اختر عرض أوريدو للرقم ${phone}:`, {
                    reply_markup: { inline_keyboard }
                });
            }
            
            // If no cache, perform live scan
            getActiveSim('Ooredoo', async (err, sim) => {
                if (!sim) return bot.sendMessage(chatId, 'عذراً، خادم أوريدو غير متوفر أو غير مفعل حالياً.');

                if (sim.transfer_method === 'Ahla App' || sim.address === 'Emulator') {
                    bot.sendMessage(chatId, `⏳ جاري فحص العروض المتوفرة لهذا الرقم...`);
                    try {
                        const result = await ooredooAhlaService.getOoredooOffers(sim, phone);
                        if (result.success && result.offers && result.offers.length > 0) {
                            const inline_keyboard = [];
                            lastScannedOffers.set(`${phone}_Ooredoo`, []);
                            
                            result.offers.forEach(off => {
                                lastScannedOffers.get(`${phone}_Ooredoo`).push({ choicePath: off.choice, label: off.text });
                                inline_keyboard.push([{ text: off.text, callback_data: `offer_${phone}_${off.choice}` }]);
                            });
                            
                            inline_keyboard.push([
                                { text: '💾 حفظ العروض / Save', callback_data: `saveoffers_${phone}_Ooredoo` }
                            ]);
                            inline_keyboard.push([
                                { text: '🔄 تحديث الفحص / Refresh', callback_data: `oorscan_${phone}` },
                                { text: '❌ إلغاء', callback_data: `offer_${phone}_cancel` }
                            ]);
                            
                            bot.sendMessage(chatId, `👇 اختر عرض أوريدو المناسب للرقم ${phone}:`, {
                                reply_markup: { inline_keyboard }
                            });
                        } else {
                            bot.sendMessage(chatId, `❌ فشلت العملية. رد التطبيق: ${result.message || 'لا توجد عروض متاحة أو انتهى وقت المحاولة.'}`);
                        }
                    } catch (errOffer) {
                        bot.sendMessage(chatId, `⚠️ حدث خطأ أثناء فحص عروض التطبيق: ${errOffer.message}`);
                    }
                    return;
                }

                const pin = sim.sim_pin || '0000'; // Default PIN
                const ussdCode = `*585*${phone}*${pin}#`;
                
                bot.sendMessage(chatId, `⏳ جاري فحص العروض المتوفرة لهذا الرقم...`);
                
                try {
                    const response = await modemService.sendUssdCommand(sim.address, ussdCode, 'Ooredoo');
                    if (response.success && response.content) {
                        const content = response.content;
                        const lines = content.split('\n');
                        const inline_keyboard = [];
                        lastScannedOffers.set(`${phone}_Ooredoo`, []);
                        
                        lines.forEach(line => {
                            const match = line.match(/^(\d+)[\-:\.]\s*(.+)$/);
                            if (match) {
                                const choice = match[1];
                                const rawLabel = match[2].trim().replace(/&amp;/g, '&'); // Fix HTML entities
                                const label = cleanOfferLabel(rawLabel);
                                lastScannedOffers.get(`${phone}_Ooredoo`).push({ choicePath: choice, label: label });
                                inline_keyboard.push([{ text: `${choice} - ${label}`, callback_data: `offer_${phone}_${choice}` }]);
                            }
                        });
                        
                        // Fallback if parsing fails
                        if (inline_keyboard.length === 0) {
                            let replyMsg = `❌ لا توجد عروض متاحة أو الرد غير مفهوم.\nالرد: ${response.content}`;
                            
                            if (response.content.includes("Sim n'est pas actif")) {
                                replyMsg = "❌ الشريحة المستهدفة غير مفعلة (La Sim n'est pas actif).";
                            }
                            
                            return bot.sendMessage(chatId, replyMsg);
                        }
                        
                        // Add Save Offers button
                        inline_keyboard.push([
                            { text: '💾 حفظ العروض / Save', callback_data: `saveoffers_${phone}_Ooredoo` }
                        ]);
                        inline_keyboard.push([
                            { text: '🔄 تحديث الفحص / Refresh', callback_data: `oorscan_${phone}` },
                            { text: '❌ إلغاء', callback_data: `offer_${phone}_cancel` }
                        ]);
                        
                        bot.sendMessage(chatId, `👇 اختر عرض أوريدو المناسب للرقم ${phone}:`, {
                            reply_markup: { inline_keyboard }
                        });
                    } else {
                        bot.sendMessage(chatId, `❌ فشل جلب العروض. السبب: ${response.message}`);
                    }
                } catch (error) {
                    bot.sendMessage(chatId, `⚠️ حدث خطأ أثناء طلب العروض.`);
                }
            });
        }

        async function handleDjezzyOffer(msg, phone) {
            const chatId = msg.chat.id;
            
            // Check cache first
            const cached = await getCachedChoices(phone, 'Djezzy', []);
            if (cached && cached.length > 0) {
                const inline_keyboard = [];
                cached.forEach(row => {
                    const cleanedLabel = cleanOfferLabel(row.label);
                    inline_keyboard.push([{ text: `${row.choice_path} - ${cleanedLabel}`, callback_data: `djoffer_${phone}_${row.choice_path}` }]);
                });
                
                // Add Save Offers button
                inline_keyboard.push([
                    { text: '💾 حفظ العروض / Save', callback_data: `saveoffers_${phone}_Djezzy` }
                ]);
                inline_keyboard.push([
                    { text: '🔄 تحديث الفحص / Refresh', callback_data: `djscan_${phone}` },
                    { text: '❌ إلغاء', callback_data: `djoffer_${phone}_cancel` }
                ]);
                
                return bot.sendMessage(chatId, `👇 [مسجل تلقائياً 💾] اختر عرض جازي للرقم ${phone}:`, {
                    reply_markup: { inline_keyboard }
                });
            }
            
            getActiveSim('Djezzy', async (err, sim) => {
                if (!sim) return bot.sendMessage(chatId, 'عذراً، خادم جازي غير متوفر أو غير مفعل حالياً.');
                
                // Djezzy activation/offers menu code is *760*phone*pin#
                const pin = sim.sim_pin || '00000'; // Default PIN
                const ussdCode = `*760*${phone}*${pin}#`;
                
                bot.sendMessage(chatId, `⏳ جاري فحص العروض المتوفرة لهذا الرقم (التمرير التلقائي لجميع الصفحات)...`);
                
                try {
                    let response = await modemService.sendUssdCommand(sim.address, ussdCode, 'Djezzy');
                    if (response.success && response.content) {
                        const inline_keyboard = [];
                        lastScannedOffers.set(`${phone}_Djezzy`, []);
                        
                        let currentContent = response.content;
                        let currentPath = [];
                        let pagesScanned = 0;
                        
                        while (pagesScanned < 5) { // Prevent infinite loops
                            if (!currentContent || typeof currentContent !== 'string') break;
                            
                            // Parse space-separated or newline-separated choice lists
                            const matchAll = currentContent.matchAll(/(\d+)[\-:\.]\s*(.+?)(?=\s+\d+[\-:\.]|\s*0[\-:\.]|\s*$)/g);
                            let foundMatches = false;
                            
                            for (const match of matchAll) {
                                foundMatches = true;
                                const choice = match[1];
                                const rawLabel = match[2].trim().replace(/[\r\n]+/g, ' ');
                                const label = cleanOfferLabel(rawLabel);
                                
                                if (choice !== '11' && choice !== '0' && choice !== '99') {
                                    const pathStr = [...currentPath, choice].join('_');
                                    lastScannedOffers.get(`${phone}_Djezzy`).push({ choicePath: pathStr, label: label });
                                    inline_keyboard.push([{ text: `${choice} - ${label}`, callback_data: `djoffer_${phone}_${pathStr}` }]);
                                }
                            }
                            
                            if (!foundMatches) {
                                // Fallback: split by lines
                                for (let line of fallbackLines) {
                                    const match = line.match(/^(\d+)[\-:\.]\s*(.+)/);
                                    if (match) {
                                        const choice = match[1];
                                        const label = cleanOfferLabel(match[2].trim());
                                        if (choice !== '11' && choice !== '0' && choice !== '99') {
                                            const pathStr = [...currentPath, choice].join('_');
                                            lastScannedOffers.get(`${phone}_Djezzy`).push({ choicePath: pathStr, label: label });
                                            inline_keyboard.push([{ text: `${choice} - ${label}`, callback_data: `djoffer_${phone}_${pathStr}` }]);
                                        }
                                    }
                                }
                            }
                            
                            // Check for Suite/Suivant
                            const hasMore11 = currentContent.includes('11:') || currentContent.includes('11-') || currentContent.includes('11.') || currentContent.match(/\b11\s*[\-:\.]/i);
                            const hasMore99 = currentContent.match(/\b99\s*[\-:\.]/i) || currentContent.toLowerCase().includes('suivant');
                            
                            let suiteChoice = null;
                            if (hasMore11) suiteChoice = '11';
                            else if (hasMore99) suiteChoice = '99';
                            
                            if (suiteChoice) {
                                pagesScanned++;
                                currentPath.push(suiteChoice);
                                bot.sendMessage(chatId, `⏳ جاري فحص الصفحة التالية (${pagesScanned})...`);
                                await new Promise(r => setTimeout(r, 2000));
                                let nextRes = await modemService.sendUssdCommand(sim.address, suiteChoice);
                                if (nextRes.success && nextRes.content) {
                                    currentContent = nextRes.content;
                                } else {
                                    break;
                                }
                            } else {
                                break;
                            }
                        }
                        if (inline_keyboard.length === 0) {
                            return bot.sendMessage(chatId, `❌ لا توجد عروض متاحة أو الرد غير مفهوم.\nالرد: ${response.content}`);
                        }
                        
                        // Add manual Save button
                        inline_keyboard.push([
                            { text: '💾 حفظ العروض / Save', callback_data: `saveoffers_${phone}_Djezzy` }
                        ]);
                        inline_keyboard.push([{ text: '❌ إلغاء', callback_data: `djoffer_${phone}_cancel` }]);
                        
                        bot.sendMessage(chatId, `👇 اختر عرض جازي المناسب للرقم ${phone}:`, {
                            reply_markup: { inline_keyboard }
                        });
                    } else {
                        bot.sendMessage(chatId, `❌ فشل جلب العروض. السبب: ${response.message}`);
                    }
                } catch (error) {
                    bot.sendMessage(chatId, `⚠️ حدث خطأ أثناء طلب العروض: ${error.message}`);
                }
            });
        }

        async function handleMobilisOffer(msg, phone) {
            const chatId = msg.chat.id;
            
            getActiveSim('Sama', async (err, sim) => {
                if (!sim) return bot.sendMessage(chatId, 'عذراً، خادم Sama غير متوفر أو غير مفعل حالياً.');

                bot.sendMessage(chatId, `⏳ جاري فحص العروض المتوفرة لهذا الرقم...`);
                
                const pin = sim.sim_pin || '0000';
                const ussdCode = `*665*1*${phone}*${pin}#`;
                
                try {
                    const response = await modemService.sendUssdCommand(sim.address, ussdCode, 'Mobilis');
                    if (response.success && response.content) {
                        const content = response.content;
                        const lowerContent = content.toLowerCase();
                        
                        let query = '';
                        let params = [];
                        let matchedCategory = '';
                        
                        if (lowerContent.includes('sama') || lowerContent.includes('سما') || lowerContent.includes('talk') || lowerContent.includes('mix') || lowerContent.includes('net')) {
                            query = `SELECT * FROM mobilis_offers WHERE category_name IN ('Sama Mix', 'Sama Net', 'Sama Talk') ORDER BY category_name ASC, amount ASC`;
                            matchedCategory = 'Sama (Mix / Net / Talk)';
                        } else if (lowerContent.includes('pix')) {
                            query = `SELECT * FROM mobilis_offers WHERE category_name = 'PixX' ORDER BY amount ASC`;
                            matchedCategory = 'PixX';
                        } else if (lowerContent.includes('revolution') || lowerContent.includes('revol')) {
                            query = `SELECT * FROM mobilis_offers WHERE category_name = 'Revolution' ORDER BY amount ASC`;
                            matchedCategory = 'Revolution';
                        } else if (lowerContent.includes('gold')) {
                            query = `SELECT * FROM mobilis_offers WHERE category_name = 'Gold' ORDER BY amount ASC`;
                            matchedCategory = 'Gold';
                        }
                        
                        if (matchedCategory !== '') {
                            db.all(query, params, (err, offers) => {
                                if (err || !offers || offers.length === 0) {
                                    return bot.sendMessage(chatId, `❌ عذراً، لم نجد باقات مسجلة للفئة ${matchedCategory} في قاعدة البيانات.`);
                                }
                                
                                // Helper to format and deduplicate category and label without brackets
                                function formatCleanOfferLabel(catName, labelText) {
                                    const combined = `${catName} ${cleanOfferLabel(labelText)}`;
                                    const unique = [];
                                    combined.split(/\s+/).forEach(w => {
                                        if (unique.indexOf(w) === -1) {
                                            unique.push(w);
                                        }
                                    });
                                    return unique.join(' ');
                                }

                                // Cache offers in memory so the agent can export/save them to dashboard's sim_offers
                                lastScannedOffers.set(`${phone}_Mobilis`, offers.map(off => ({
                                    choicePath: `${off.category_code}_${off.choice_code}`,
                                    label: formatCleanOfferLabel(off.category_name, off.label)
                                })));
                                
                                const inline_keyboard = [];
                                const grouped = {};
                                offers.forEach(off => {
                                    if (!grouped[off.category_name]) {
                                        grouped[off.category_name] = [];
                                    }
                                    grouped[off.category_name].push(off);
                                });
                                
                                for (const cat in grouped) {
                                    const catOffers = grouped[cat];
                                    for (let i = 0; i < catOffers.length; i += 2) {
                                        const row = [];
                                        const off1 = catOffers[i];
                                        const text1 = formatCleanOfferLabel(cat, off1.label);
                                        row.push({ 
                                            text: `📲 ${text1}`, 
                                            callback_data: `buymob_${phone}_${off1.id}` 
                                        });
                                        
                                        if (i + 1 < catOffers.length) {
                                            const off2 = catOffers[i + 1];
                                            const text2 = formatCleanOfferLabel(cat, off2.label);
                                            row.push({ 
                                                text: `📲 ${text2}`, 
                                                callback_data: `buymob_${phone}_${off2.id}` 
                                            });
                                        }
                                        inline_keyboard.push(row);
                                    }
                                }
                                
                                // Add Save Offers button to allow the agent to export matched Mobilis offers to the dashboard's sim_offers table
                                inline_keyboard.push([
                                    { text: '💾 حفظ العروض / Save', callback_data: `saveoffers_${phone}_Mobilis` }
                                ]);
                                inline_keyboard.push([
                                    { text: '🔄 إعادة فحص شبكة / Scan Again', callback_data: `mobscan_${phone}` },
                                    { text: '❌ إلغاء / Cancel', callback_data: `moboffer_${phone}_cancel` }
                                ]);
                                
                                bot.sendMessage(chatId, `👇 [عروض ${matchedCategory} المكتشفة] اختر الباقة للرقم ${phone}:`, {
                                    reply_markup: { inline_keyboard }
                                });
                            });
                        } else {
                            const inline_keyboard = [];
                            lastScannedOffers.set(`${phone}_Mobilis`, []);
                            
                            const matchAll = content.matchAll(/(\d+)[\-:\.]\s*(.+?)(?=\s+\d+[\-:\.]|\s*0[\-:\.]|\s*$)/g);
                            for (const match of matchAll) {
                                const choice = match[1];
                                const rawLabel = match[2].trim().replace(/[\r\n]+/g, ' ');
                                const label = cleanOfferLabel(rawLabel);
                                if (choice !== '0') {
                                    lastScannedOffers.get(`${phone}_Mobilis`).push({ choicePath: choice, label: label });
                                    inline_keyboard.push([{ text: `${choice} - ${label}`, callback_data: `moboffer_${phone}_${choice}` }]);
                                }
                            }
                            
                            if (inline_keyboard.length === 0) {
                                const lines = content.split('\n');
                                lines.forEach(line => {
                                    const match = line.match(/^(\d+)[\-:\.]\s*(.+)$/);
                                    if (match) {
                                        const choice = match[1];
                                        const rawLabel = match[2].trim().replace(/&amp;/g, '&');
                                        const label = cleanOfferLabel(rawLabel);
                                        if (choice !== '0') {
                                            lastScannedOffers.get(`${phone}_Mobilis`).push({ choicePath: choice, label: label });
                                            inline_keyboard.push([{ text: `${choice} - ${label}`, callback_data: `moboffer_${phone}_${choice}` }]);
                                        }
                                    }
                                });
                            }
                            
                            const hasMore = content.includes('0:') || content.includes('0-') || content.includes('0.') || content.match(/\b0\s*[\-:\.]/i);
                            if (hasMore) {
                                inline_keyboard.push([{ text: '➡️ التالي / Suite (0)', callback_data: `moboffer_${phone}_0` }]);
                            }
                            
                            if (inline_keyboard.length === 0) {
                                return bot.sendMessage(chatId, `❌ لا توجد عروض متاحة أو الرد غير مفهوم.\nالرد: ${content}`);
                            }
                            
                            inline_keyboard.push([
                                { text: '💾 حفظ العروض / Save', callback_data: `saveoffers_${phone}_Mobilis` }
                            ]);
                            inline_keyboard.push([{ text: '❌ إلغاء', callback_data: `moboffer_${phone}_cancel` }]);
                            
                            bot.sendMessage(chatId, `👇 اختر الفئة أو العرض المناسب للرقم ${phone}:`, {
                                reply_markup: { inline_keyboard }
                            });
                        }
                    } else {
                        bot.sendMessage(chatId, `❌ فشل جلب العروض. السبب: ${response.message}`);
                    }
                } catch (error) {
                    bot.sendMessage(chatId, `⚠️ حدث خطأ أثناء طلب العروض.`);
                }
            });
        }

        async function handleQuickFlexy(msg, text) {
            const chatId = msg.chat.id;
            const parts = text.split('*');
            const phone = phoneFormatClean(parts[0]);
            const amount = parseFloat(parts[1]);
            const isBill = parts[2] && (parts[2].toLowerCase() === 'f' || parts[2] === '2' || parts[2].includes('فاتورة') || parts[2].includes('facture'));
            const typeStr = isBill ? 'bill' : 'flexy';
            const labelStr = isBill ? 'فاتورة جازي 🧾' : 'رصيد عادي 📲';
            
            const opts = {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ تأكيد', callback_data: `confirm_flexy_${phone}_${amount}_${typeStr}` },
                            { text: '❌ إلغاء', callback_data: `cancel_flexy` }
                        ]
                    ]
                }
            };
            
            // Check last transaction for this phone number
            const lastTx = await getLastTransaction(phone);
            const lastTxMsg = formatLastTransactionMsg(lastTx);

            bot.sendMessage(chatId, `⚠️ تأكيد عملية التحويل:\n\n📱 الرقم: ${phone}\n💰 المبلغ: ${amount} دج\nنوع العملية: ${labelStr}${lastTxMsg}`, opts);
        }

        async function executeFlexy(chatId, phone, amount, typeStr = 'flexy') {
            let operator = '';
            if (phone.startsWith('05')) operator = 'Ooredoo';
            else if (phone.startsWith('06')) operator = 'Mobilis';
            else if (phone.startsWith('07')) return bot.sendMessage(chatId, '⚠️ عفواً، فليكسي جازي غير متوفر حالياً.');
            else return bot.sendMessage(chatId, 'رقم هاتف غير صالح. يجب أن يبدأ بـ 05 أو 06.');

            db.get(`SELECT * FROM agents WHERE telegram_id = ?`, [chatId.toString()], async (err, agent) => {
                if (!agent) return bot.sendMessage(chatId, 'حسابك غير مسجل. أرسل /start');
                if (agent.status === 'suspended') {
                    return bot.sendMessage(chatId, '⛔ عذراً، حسابك موقوف حالياً. يرجى التواصل مع الإدارة.');
                }
                if (agent.disabled_services) {
                    const disabled = agent.disabled_services.split(',');
                    if (disabled.includes(operator.toLowerCase())) {
                        return bot.sendMessage(chatId, `⛔ عذراً، خدمة ${operator} غير متاحة لحسابك.`);
                    }
                }
                if (agent.balance < amount) return bot.sendMessage(chatId, `عفواً، رصيدك غير كافٍ. رصيدك الحالي: ${agent.balance} دج.`);

                // MOBILIS MEETMOB AUTOMATION & FLEXY ROUTING RULES INTEGRATION
                if (operator === 'Mobilis' && (amount === 1000 || amount === 1300 || amount === 2000)) {
                    const cardValue = (amount === 1300) ? 1000 : amount;
                    
                    db.get(`SELECT * FROM recharge_cards WHERE category = 'Mobilis' AND value = ? AND status = 'available' LIMIT 1`, [cardValue], async (err, card) => {
                        if (err || !card) {
                            bot.sendMessage(chatId, `⚠️ لا توجد بطاقة موبيليس بقيمة ${cardValue} دج متوفرة في المخزن. جاري التحويل العادي عبر الشريحة (USSD)...`);
                            proceedWithStandardUSSDRoute();
                        } else {
                            db.run(`UPDATE recharge_cards SET status = 'sold', sold_to = ?, sold_at = datetime('now') WHERE id = ?`, [agent.id, card.id]);
                            db.run(`UPDATE agents SET balance = balance - ? WHERE id = ?`, [amount, agent.id]);
                            
                            const agentName = agent.name || 'nom de cleo';
                            bot.sendMessage(chatId, `شكرا  ${agentName} تم إستقبال طلبك بنجاح ستتم العملية بعد عدة ثواني..`);
                            
                            queueMeetmobRecharge(chatId, phone, amount, agent, card).catch(() => {});
                        }
                    });
                    return;
                }

                proceedWithStandardUSSDRoute();

                function proceedWithStandardUSSDRoute() {
                    db.get(`SELECT value FROM settings WHERE key = ?`, [`sort_order_${operator}`], (err, row) => {
                        const sortOrder = row && row.value === 'ASC' ? 'ASC' : 'DESC';
                        db.all(`SELECT * FROM sim_cards WHERE operator = ? AND status = 'active' ORDER BY CAST(balance AS REAL) ${sortOrder}`, [operator], async (err, sims) => {
                            if (!sims || sims.length === 0) return bot.sendMessage(chatId, `عذراً، خادم ${operator} غير متوفر أو غير مفعل حالياً.`);

                            db.run(`UPDATE agents SET balance = balance - ? WHERE id = ?`, [amount, agent.id]);
                            const labelStr = typeStr === 'bill' ? 'فاتورة جازي' : `تحويل عبر ${operator}`;
                            const agentName = agent.name || 'nom de cleo';
                            bot.sendMessage(chatId, `شكرا  ${agentName} تم إستقبال طلبك بنجاح ستتم العملية بعد عدة ثواني..`);

                            let success = false;
                            let lastError = '';

                            for (let i = 0; i < sims.length; i++) {
                                const sim = sims[i];
                                
                                if (sims.length > 1 && i > 0) {
                                    bot.sendMessage(chatId, `⏳ محاولة عبر الشريحة الاحتياطية (${i+1})...`);
                                }

                                if (operator === 'Ooredoo' && sim.transfer_method === 'Ahla App') {
                                    try {
                                        console.log(`[Telegram Bot] Executing Ooredoo Ahla App Flexy for ${phone} (${amount} DA) via SIM ${sim.address}...`);
                                        const response = await ooredooAhlaService.executeFlexy(sim, phone, amount);
                                        if (response.success) {
                                            let newBalance = response.balance || sim.balance;
                                            db.run(`UPDATE sim_cards SET balance = ? WHERE id = ?`, [newBalance, sim.id]);
                                            db.run(`INSERT INTO transactions (agent_id, phone_number, amount, operator, type, sim_id, balance_before, balance_after, status) 
                                                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                                                   [agent.id, phone, amount, operator, 'FLEXY', sim.id, sim.balance, newBalance, 'SUCCESS']);
                                                   
                                            const finalAgentBalance = (agent.balance - amount).toFixed(2);
                                            bot.sendMessage(chatId, `Recharge ${amount} -> ${phone} OK. B:${finalAgentBalance} da.✅\nرد التطبيق: ${(response.message||'').substring(0, 800)}`);
                                            success = true;
                                            break;
                                        } else {
                                            lastError = response.message || 'فشل التفعيل عبر التطبيق';
                                            db.run(`INSERT INTO transactions (agent_id, phone_number, amount, operator, type, sim_id, balance_before, status) 
                                                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
                                                   [agent.id, phone, amount, operator, 'FLEXY', sim.id, sim.balance, 'FAILED: ' + lastError]);
                                        }
                                    } catch (error) {
                                        lastError = error.message;
                                    }
                                    continue;
                                }

                                // USSD Route
                                const setting = await new Promise(r => db.get(`SELECT value FROM settings WHERE key = ?`, [`ussd_${operator.toLowerCase()}_transfer`], (e, res) => r(res)));
                                if (!setting) {
                                    lastError = 'خطأ في إعدادات الخادم (USSD غير متوفر).';
                                    continue;
                                }

                                let baseCode = sim.ussd_transfer_override || setting.value;
                                let ussdCode = baseCode.replace('{phone}', phone).replace('{amount}', amount);
                                
                                const flexyPin = sim.sim_pin || '0000';
                                ussdCode = ussdCode.replace('{pin}', flexyPin);
                                
                                if (operator.toLowerCase() === 'mobilis') {
                                    const transferType = sim.transfer_type || '04';
                                    if (!ussdCode.includes('{type}')) {
                                        ussdCode = ussdCode.replace(/\*610\*1\*\d{2}\*/, `*610*1*${transferType}*`);
                                    } else {
                                        ussdCode = ussdCode.replace('{type}', transferType);
                                    }
                                } else if (operator.toLowerCase() === 'djezzy') {
                                    const pin = '00000';
                                    if (typeStr === 'bill') ussdCode = `*764*${phone}*${amount}*${pin}#`;
                                    else ussdCode = `*760*${phone}*${amount}*${pin}#`;
                                }
                                
                                try {
                                    const response = await modemService.sendUssdCommand(sim.address, ussdCode);
                                    let confirmRes = null;
                                    if ((operator.toLowerCase() === 'mobilis' || operator.toLowerCase() === 'ooredoo' || operator.toLowerCase() === 'djezzy') && response.success) {
                                        await new Promise((res) => setTimeout(res, 2000));
                                        confirmRes = await modemService.sendUssdCommand(sim.address, "1");
                                    }
                                    
                                    if (response.success) {
                                        if (operator.toLowerCase() === 'mobilis') {
                                            db.run(`INSERT INTO transactions (agent_id, phone_number, amount, operator, type, sim_id, balance_before, status) 
                                                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
                                                   [agent.id, phone, amount, operator, 'FLEXY', sim.id, sim.balance, 'PENDING_SMS']);
                                            
                                            bot.sendMessage(chatId, `⏳ تم إرسال طلب الفليكسي للرقم ${phone}.\nسيتم إشعارك فور وصول تأكيد الشبكة.`);
                                            
                                            const key = `${phone}_${amount}`;
                                            pendingMobilis.set(key, { chatId, agentId: agent.id, phone, amount, timestamp: Date.now() });
                                            
                                            setTimeout(() => {
                                                if (pendingMobilis.has(key)) {
                                                    const p = pendingMobilis.get(key);
                                                    pendingMobilis.delete(key);
                                                    
                                                    db.run(`UPDATE agents SET balance = balance + ? WHERE id = ?`, [p.amount, p.agentId]);
                                                    db.run(`UPDATE transactions SET status = 'FAILED (TIMEOUT)' WHERE agent_id = ? AND phone_number = ? AND amount = ? AND status = 'PENDING_SMS'`, 
                                                           [p.agentId, p.phone, p.amount]);
                                                    
                                                    bot.sendMessage(p.chatId, `❌ لم يصل تأكيد الشبكة لعملية الفليكسي للرقم ${p.phone} خلال 3 دقائق.\n🔄 تم إلغاء العملية وإرجاع المبلغ (${p.amount} دج) لرصيدك.`).catch(console.error);
                                                }
                                            }, 180000); 
                                            success = true;
                                            break;
                                        } else {
                                            const finalResponseText = (confirmRes && confirmRes.content) ? confirmRes.content : (response.content || '');
                                            const lowerText = finalResponseText.toLowerCase();
                                            
                                            const isFailure = lowerText.includes('insuffisant') || 
                                                              lowerText.includes('echec') || 
                                                              lowerText.includes('échec') || 
                                                              lowerText.includes('fail') || 
                                                              lowerText.includes('refuse') || 
                                                              lowerText.includes('erreur') || 
                                                              lowerText.includes('non autorise') || 
                                                              lowerText.includes('impossible') || 
                                                              lowerText.includes('bloque') ||
                                                              lowerText.includes('credit insuffisant') ||
                                                              lowerText.includes('pas autorise') ||
                                                              lowerText.includes('ne pouvez pas');
                                                              
                                            if (isFailure) {
                                                lastError = finalResponseText;
                                                db.run(`INSERT INTO transactions (agent_id, phone_number, amount, operator, type, sim_id, balance_before, status) 
                                                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
                                                    [agent.id, phone, amount, operator, 'FLEXY', sim.id, sim.balance, 'FAILED: ' + finalResponseText.substring(0, 100)]);
                                            } else {
                                                db.run(`INSERT INTO transactions (agent_id, phone_number, amount, operator, type, sim_id, balance_before, status) 
                                                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
                                                    [agent.id, phone, amount, operator, 'FLEXY', sim.id, sim.balance, 'SUCCESS']);
                                                    
                                                const finalAgentBalance = (agent.balance - amount).toFixed(2);
                                                bot.sendMessage(chatId, `Recharge ${amount} -> ${phone} OK. B:${finalAgentBalance} da.✅`);
                                                success = true;
                                                break;
                                            }
                                        }
                                    } else {
                                        lastError = response.message;
                                    }
                                } catch (error) {
                                    lastError = error.message;
                                }
                            }

                            if (!success) {
                                db.run(`UPDATE agents SET balance = balance + ? WHERE id = ?`, [amount, agent.id]);
                                bot.sendMessage(chatId, `❌ فشلت جميع المحاولات لفليكسي ${operator}.\nآخر خطأ: ${lastError}\n🔄 تم إرجاع المبلغ ${amount} دج لرصيدك.`);
                            }
                        });
                    });
                }
            });
        }

        bot.on('callback_query', async (callbackQuery) => {
            const data = callbackQuery.data;
            const chatId = callbackQuery.message.chat.id;
            const messageId = callbackQuery.message.message_id;

            // Gate: Block unregistered users
            const isReg = await new Promise(r => db.get(`SELECT id FROM agents WHERE telegram_id = ?`, [chatId.toString()], (e, row) => r(!!row)));
            if (!isReg) {
                bot.answerCallbackQuery(callbackQuery.id, { text: '✖️ حسابك غير مسجل.' });
                return;
            }

            if (data.startsWith('buymob_')) {
                const parts = data.split('_');
                const phone = parts[1];
                const offerId = parseInt(parts[2]);
                
                bot.answerCallbackQuery(callbackQuery.id, { text: 'جاري التفعيل الفوري...' });
                bot.deleteMessage(chatId, messageId).catch(() => {});
                
                db.get(`SELECT * FROM mobilis_offers WHERE id = ?`, [offerId], (err, offer) => {
                    if (err || !offer) {
                        return bot.sendMessage(chatId, '❌ عذراً، لم يتم العثور على تفاصيل هذا العرض في قاعدة البيانات.');
                    }
                    
                    db.get(`SELECT * FROM agents WHERE telegram_id = ?`, [chatId.toString()], (err, agent) => {
                        if (!agent) return bot.sendMessage(chatId, 'حسابك غير مسجل.');
                        
                        const amountToDeduct = offer.amount || 0;
                        if (!agent.is_admin && agent.balance < amountToDeduct) {
                            return bot.sendMessage(chatId, `❌ رصيدك غير كافٍ لتفعيل هذا العرض. الرصيد المطلوب: ${amountToDeduct} دج.`);
                        }

                        // Deduct balance initially
                        const deductQuery = agent.is_admin ? `SELECT 1` : `UPDATE agents SET balance = balance - ? WHERE telegram_id = ?`;
                        const deductParams = agent.is_admin ? [] : [amountToDeduct, chatId.toString()];

                        db.run(deductQuery, deductParams, (err) => {
                            if (err && !agent.is_admin) return bot.sendMessage(chatId, '❌ حدث خطأ أثناء خصم الرصيد.');
                            
                            bot.sendMessage(chatId, `⏳ جاري تفعيل العرض [${offer.category_name} - ${offer.label}] للرقم ${phone}...`);
                            
                            getActiveSim('Sama', async (err, sim) => {
                                if (!sim) {
                                    if (!agent.is_admin) db.run(`UPDATE agents SET balance = balance + ? WHERE telegram_id = ?`, [amountToDeduct, chatId.toString()]);
                                    return bot.sendMessage(chatId, 'عذراً، خادم Sama غير متوفر أو غير مفعل حالياً.');
                                }
                                
                                const pin = sim.sim_pin || '0000';
                                const catCode = offer.category_name === 'Sama Net' ? '2' : '1';
                                // 1. Open the menu for the specific category and phone
                                const initUssdCode = `*665*${catCode}*${phone}*${pin}#`;
                                
                                try {
                                    bot.sendMessage(chatId, `🚀 جاري الاتصال بالشبكة لطلب قائمة العروض...`);
                                    const response = await modemService.sendUssdCommand(sim.address, initUssdCode, 'Mobilis');
                                    
                                    if (response.success && response.content) {
                                        const content = response.content;
                                        if (content.toLowerCase().includes('error') || content.toLowerCase().includes('fail') || content.includes('فشل')) {
                                            if (!agent.is_admin) db.run(`UPDATE agents SET balance = balance + ? WHERE telegram_id = ?`, [amountToDeduct, chatId.toString()]);
                                            return bot.sendMessage(chatId, `❌ فشل تفعيل العرض. تم استرجاع الرصيد.\nالرد الأولي من الشبكة:\n\n${content}`);
                                        }
                                        
                                        await new Promise((res) => setTimeout(res, 2000));
                                        // 2. Send the choice code to activate the chosen offer
                                        const confirmResponse = await modemService.sendUssdCommand(sim.address, offer.choice_code.toString());
                                        const finalContent = confirmResponse.content || '';
                                        const isFailure = finalContent.toLowerCase().includes('insuffisant') || finalContent.toLowerCase().includes('echec') || finalContent.toLowerCase().includes('échec') || finalContent.toLowerCase().includes('error') || finalContent.toLowerCase().includes('fail') || finalContent.includes('فشل');
                                        
                                        if (isFailure) {
                                            if (!agent.is_admin) db.run(`UPDATE agents SET balance = balance + ? WHERE telegram_id = ?`, [amountToDeduct, chatId.toString()]);
                                            bot.sendMessage(chatId, `❌ فشل تفعيل العرض للرقم ${phone}! تم استرجاع الرصيد.\nالرد الأولي: ${content}\nالرد النهائي: ${finalContent}`);
                                        } else {
                                            const newBalance = agent.is_admin ? 'غير محدود' : (agent.balance - amountToDeduct);
                                            bot.sendMessage(chatId, `✅ تم إرسال طلب التفعيل بنجاح للرقم ${phone}!\nالرد الأولي: ${content}\nالرد النهائي: ${finalContent || 'تم تأكيد العملية.'}\n💰 رصيدك المتبقي: ${newBalance} دج.`);
                                            // Record the successful transaction
                                            db.run(`INSERT INTO transactions (agent_id, type, amount, status, target_phone, response) VALUES (?, ?, ?, ?, ?, ?)`, 
                                                [agent.id, 'mobilis_offer', amountToDeduct, 'success', phone, finalContent]);
                                        }
                                    } else {
                                        if (!agent.is_admin) db.run(`UPDATE agents SET balance = balance + ? WHERE telegram_id = ?`, [amountToDeduct, chatId.toString()]);
                                        bot.sendMessage(chatId, `❌ فشل تفعيل العرض. تم استرجاع الرصيد. السبب: ${response.message}`);
                                    }
                                } catch (error) {
                                    if (!agent.is_admin) db.run(`UPDATE agents SET balance = balance + ? WHERE telegram_id = ?`, [amountToDeduct, chatId.toString()]);
                                    bot.sendMessage(chatId, `⚠️ حدث خطأ أثناء تفعيل عرض موبيليس. تم استرجاع الرصيد.`);
                                }
                            });
                        });
                    });
                });
                return;
            }
            
            if (data.startsWith('saveoffers_')) {
                const parts = data.split('_');
                const phone = parts[1];
                const operator = parts[2];
                
                const scanned = lastScannedOffers.get(`${phone}_${operator}`);
                if (scanned && scanned.length > 0) {
                    bot.answerCallbackQuery(callbackQuery.id, { text: 'جاري حفظ وتصدير العروض...' });
                    
                    db.run(`DELETE FROM phone_offers_cache WHERE phone = ? AND operator = ?`, [phone, operator], () => {
                        scanned.forEach(item => {
                            cacheOffer(phone, operator, item.choicePath, item.label);
                            
                            // 1. Parse price from label (e.g., 'Mix 1000' -> 1000)
                            const priceMatch = item.label.match(/(\d+)\s*(?:DA|دج|DA\b|$)/i) || item.label.match(/(\d+)/);
                            const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
                            
                            // 2. Construct combined USSD code based on choice path
                            let ussdRoot = '*600#';
                            if (operator === 'Mobilis') ussdRoot = '*665#';
                            else if (operator === 'Djezzy') ussdRoot = '*720#';
                            else if (operator === 'Ooredoo') ussdRoot = '*151#';
                            
                            const cleanPath = item.choicePath.toString().split('_').join('*');
                            const ussdCode = `${ussdRoot.replace('#', '')}*${cleanPath}#`;
                            
                            // 3. Export/Update to global sim_offers table to prevent duplicates on the same USSD code
                            db.get(`SELECT id FROM sim_offers WHERE operator = ? AND ussd_code = ?`,
                                [operator, ussdCode], (err, row) => {
                                    const defaultDesc = 'مستخرج تلقائياً عبر البوت';
                                    if (!row) {
                                        db.run(`INSERT INTO sim_offers (operator, name, ussd_code, price, description) VALUES (?, ?, ?, ?, ?)`,
                                            [operator, item.label, ussdCode, price, defaultDesc]);
                                    } else {
                                        // Update the name, price and description to apply the new format
                                        db.run(`UPDATE sim_offers SET name = ?, price = ?, description = ? WHERE id = ?`,
                                            [item.label, price, defaultDesc, row.id]);
                                    }
                                });
                        });
                        
                        lastScannedOffers.delete(`${phone}_${operator}`); // Clear from temporary memory
                        process.emit('sim-offers-updated'); // Notify dashboard UI in real-time
                        
                        bot.sendMessage(chatId, `💾 [تأكيد الحفظ] تم حفظ عروض ${operator} للرقم ${phone} بنجاح وتصديرها تلقائياً إلى واجهة لوحة التحكم!`);
                    });
                } else {
                    bot.answerCallbackQuery(callbackQuery.id, { text: 'لا توجد عروض ممسوحة لحفظها.' });
                    bot.sendMessage(chatId, `⚠️ لا توجد عروض ممسوحة حالياً للرقم ${phone} أو تم حفظها بالفعل.`);
                }
                return;
            }

            if (data.startsWith('buycard_')) {
                const parts = data.split('_');
                
                if (parts[1] === 'cancel') {
                    bot.answerCallbackQuery(callbackQuery.id, { text: 'تم الإلغاء.' });
                    bot.deleteMessage(chatId, messageId).catch(() => {});
                    return bot.sendMessage(chatId, '❌ تم إلغاء شراء البطاقة.');
                }
                
                // If it's a confirmation: buycard_confirm_type_value
                if (parts[1] === 'confirm') {
                    const type = parts[2];
                    const value = parseFloat(parts[3]);
                    const category = type === 'adsl' || type === 'idoom' ? 'Idoom ADSL' : 'Idoom 4G';
                    
                    bot.answerCallbackQuery(callbackQuery.id, { text: 'جاري شراء البطاقة...' });
                    bot.deleteMessage(chatId, messageId).catch(() => {});
                    
                    db.get(`SELECT * FROM agents WHERE telegram_id = ?`, [chatId.toString()], async (err, agent) => {
                        if (!agent) return bot.sendMessage(chatId, 'حسابك غير مسجل.');
                        if (agent.balance < value) return bot.sendMessage(chatId, `رصيدك غير كافٍ. سعر البطاقة ${value} دج ورصيدك ${agent.balance} دج.`);

                        db.get(`SELECT * FROM recharge_cards WHERE category IN (?, 'Idoom') AND value = ? AND status = 'available' ORDER BY id ASC LIMIT 1`, [category, value], (err, card) => {
                            if (!card) return bot.sendMessage(chatId, `❌ عذراً، نفدت بطاقات ${category} فئة ${value} دج بينما كنت تؤكد العملية.`);
                            
                            db.run(`UPDATE agents SET balance = balance - ? WHERE id = ?`, [value, agent.id], () => {
                                db.run(`UPDATE recharge_cards SET status = 'sold', sold_to = ?, sold_at = CURRENT_TIMESTAMP WHERE id = ?`, [agent.id, card.id], () => {
                                    const now = new Date().toLocaleString('ar-DZ', { timeZone: 'Africa/Algiers' });
                                    bot.sendMessage(chatId, 
`✅ *تمت العملية بنجاح!*

📋 *معلومات البطاقة:*
▪️ النوع: ${category}
▪️ القيمة: ${value} دج
▪️ الوقت: ${now}

🔑 *رمز التعبئة:*
\`${card.pin_code}\`
${card.serial_number ? `▪️ الرقم التسلسلي: \`${card.serial_number}\`` : ''}

💰 *الرصيد المتبقي: ${agent.balance - value} دج*`, { parse_mode: 'Markdown' });
                                });
                            });
                        });
                    });
                    return;
                }

                // Picked a value: buycard_type_value -> Show confirmation
                const type = parts[1];
                const value = parseFloat(parts[2]);
                const category = type === 'adsl' || type === 'idoom' ? 'Idoom ADSL' : 'Idoom 4G';
                
                const confirmOpts = {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ تأكيد الشراء', callback_data: `buycard_confirm_${type}_${value}` },
                                { text: '❌ إلغاء', callback_data: `buycard_cancel` }
                            ]
                        ]
                    }
                };
                
                bot.answerCallbackQuery(callbackQuery.id);
                bot.editMessageText(`هل أنت متأكد من شراء بطاقة ${category} بقيمة ${value} دج؟\nسيتم خصم المبلغ من رصيدك.`, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: confirmOpts.reply_markup
                }).catch(() => {});
                
                return;
            }

            if (data.startsWith('autofill_')) {
                const parts = data.split('_');
                const type = parts[1]; // 'idoom' or '4g'
                const account = parts[2];
                const value = parseFloat(parts[3]);
                
                if (parts[1] === 'cancel') {
                    bot.answerCallbackQuery(callbackQuery.id, { text: 'تم الإلغاء.' });
                    bot.deleteMessage(chatId, messageId).catch(() => {});
                    return bot.sendMessage(chatId, '❌ تم الإلغاء.');
                }

                bot.answerCallbackQuery(callbackQuery.id, { text: `جاري بدء عملية التعبئة...` });
                bot.deleteMessage(chatId, messageId).catch(() => {});

                const category = type === 'idoom' ? 'Idoom ADSL' : 'Idoom 4G';

                db.get(`SELECT * FROM agents WHERE telegram_id = ?`, [chatId.toString()], async (err, agent) => {
                    if (!agent) return bot.sendMessage(chatId, 'حسابك غير مسجل.');
                    if (agent.balance < value) return bot.sendMessage(chatId, `عفواً، رصيدك غير كافٍ. رصيدك الحالي: ${agent.balance} دج.`);

                    // Fetch an available card
                    db.get(`SELECT * FROM recharge_cards WHERE category IN (?, 'Idoom') AND value = ? AND status = 'available' ORDER BY id ASC LIMIT 1`, [category, value], async (err, card) => {
                        if (!card) return bot.sendMessage(chatId, `❌ عذراً، نفدت بطاقات ${category} فئة ${value} دج.`);

                        const idoomEnabled = await getSetting('idoom_auto_enabled');
                        if (idoomEnabled === 'false' || idoomEnabled === '0') {
                            return bot.sendMessage(chatId, `⛔ خدمة التعبئة التلقائية لإيدوم متوقفة حالياً من قبل الإدارة.`);
                        }

                        bot.sendMessage(chatId, `⏳ جاري الاتصال بسيرفر الأتمتة لتعبئة الرقم ${account}...`);

                        // Emit to UI Queue
                        const txId = 'IDM_' + Date.now();
                        if (process.emit) {
                            process.emit('idoom-recharge-event', {
                                type: 'started',
                                id: txId,
                                account: account,
                                pin: card.pin_code,
                                amount: value,
                                agentName: agent.name
                            });
                        }

                        // Call Automation Server
                        const axios = require('axios');
                        try {
                            const response = await axios.post('http://localhost:3000/recharge-idoom', {
                                account: account,
                                pin: card.pin_code
                            });

                            if (response.data && response.data.success) {
                                // Mark card as sold and deduct balance
                                db.run(`UPDATE recharge_cards SET status = 'sold', sold_to = ?, sold_at = CURRENT_TIMESTAMP WHERE id = ?`, [agent.id, card.id]);
                                db.run(`UPDATE agents SET balance = balance - ? WHERE id = ?`, [value, agent.id]);
                                
                                // Log Transaction
                                db.run(`INSERT INTO transactions (agent_id, phone_number, amount, operator, type, status) VALUES (?, ?, ?, ?, ?, ?)`, 
                                    [agent.id, account, value, category, 'AUTOFILL', 'SUCCESS']);

                                if (process.emit) process.emit('idoom-recharge-event', { type: 'result', id: txId, success: true });

                                const now = new Date().toLocaleString('ar-DZ', { timeZone: 'Africa/Algiers' });
                                const siteData = response.data.structuredData || {};
                                
                                // Build structured info from site
                                let siteInfo = '';
                                const importantKeys = Object.keys(siteData).filter(k => 
                                    !k.toLowerCase().includes('algérie télécom') && 
                                    siteData[k].length < 80
                                );
                                importantKeys.forEach(k => {
                                    siteInfo += `\n▪️ ${k}: ${siteData[k]}`;
                                });
                                
                                // Fallback: extract key info from raw text
                                if (!siteInfo && response.data.details) {
                                    const rawText = response.data.details;
                                    // Extract Numéro, Montant, Date lines
                                    const lines = rawText.split('\n').filter(l => l.trim() && l.includes(':'));
                                    lines.slice(0, 8).forEach(l => { siteInfo += `\n▪️ ${l.trim()}`; });
                                }

                                bot.sendMessage(chatId, 
`✅ *تمت التعبئة التلقائية بنجاح!*

📋 *معلومات العملية:*
▪️ النوع: ${category}
▪️ الرقم / الحساب: \`${account}\`
▪️ القيمة: ${value} دج
▪️ الوقت: ${now}

📄 *تفاصيل الموقع:*${siteInfo || '\n' + (response.data.details || 'تمت العملية بنجاح.')}

💰 *الرصيد المتبقي: ${agent.balance - value} دج*`, 
                                    { parse_mode: 'Markdown' });
                            } else {
                                if (process.emit) process.emit('idoom-recharge-event', { type: 'result', id: txId, success: false, message: response.data ? response.data.message : 'رد غير معروف' });
                                bot.sendMessage(chatId, `❌ ${response.data ? response.data.message : 'رد غير معروف'}`);
                            }
                        } catch (error) {
                            console.error('[Bot] Auto-fill error:', error.message);
                            let errorMsg = error.message;
                            if (error.response && error.response.data && error.response.data.message) {
                                errorMsg = error.response.data.message;
                            }
                            if (process.emit) process.emit('idoom-recharge-event', { type: 'result', id: txId, success: false, message: errorMsg });
                            bot.sendMessage(chatId, `⚠️ حدث خطأ أثناء الاتصال بسيرفر الأتمتة: ${errorMsg}`);
                        }
                    });
                });
                return;
            }

            if (data.startsWith('djscan_') || data.startsWith('mobscan_') || data.startsWith('oorscan_')) {
                const parts = data.split('_');
                let operator = '';
                if (parts[0] === 'djscan') operator = 'Djezzy';
                else if (parts[0] === 'mobscan') operator = 'Mobilis';
                else operator = 'Ooredoo';
                const phone = parts[1];
                
                bot.answerCallbackQuery(callbackQuery.id, { text: 'جاري إعادة الفحص...' });
                bot.deleteMessage(chatId, messageId).catch(() => {});
                
                // Clear temporary cache for this phone and operator
                lastScannedOffers.delete(`${phone}_${operator}`);
                
                db.run(`DELETE FROM phone_offers_cache WHERE phone = ? AND operator = ?`, [phone, operator], () => {
                    if (operator === 'Djezzy') {
                        handleDjezzyOffer({ chat: { id: chatId } }, phone);
                    } else if (operator === 'Mobilis') {
                        handleMobilisOffer({ chat: { id: chatId } }, phone);
                    } else {
                        handleOoredooOffer({ chat: { id: chatId } }, phone);
                    }
                });
                return;
            }

            if (data.startsWith('offer_')) {
                const parts = data.split('_');
                const phone = parts[1];
                const choice = parts[2];
                
                if (choice === 'cancel') {
                    bot.answerCallbackQuery(callbackQuery.id, { text: 'تم الإلغاء.' });
                    bot.deleteMessage(chatId, messageId).catch(() => {});
                    return bot.sendMessage(chatId, '❌ تم إلغاء طلب عروض أوريدو.');
                }
                
                bot.answerCallbackQuery(callbackQuery.id, { text: 'جاري التفعيل...' });
                bot.deleteMessage(chatId, messageId).catch(() => {});
                
                bot.sendMessage(chatId, `⏳ جاري تفعيل العرض ${choice} للرقم ${phone}...`);
                
                getActiveSim('Ooredoo', async (err, sim) => {
                    if (!sim) return bot.sendMessage(chatId, 'عذراً، خادم أوريدو غير متوفر أو غير مفعل حالياً.');
                    
                    if (sim.transfer_method === 'Ahla App' || sim.address === 'Emulator') {
                        try {
                            const result = await ooredooAhlaService.activateOoredooOffer(sim, phone, choice);
                            if (result.success) {
                                bot.sendMessage(chatId, `✅ ${result.message}`);
                            } else {
                                bot.sendMessage(chatId, `❌ فشل تفعيل العرض. السبب: ${result.message}`);
                            }
                        } catch (errAct) {
                            bot.sendMessage(chatId, `⚠️ حدث خطأ أثناء تفعيل العرض: ${errAct.message}`);
                        }
                        return;
                    }
                    
                    const pin = sim.sim_pin || '0000'; // Default PIN
                    const fullUssdCode = `*585*${phone}*${pin}*${choice}#`;
                    
                    try {
                        bot.sendMessage(chatId, `🚀 جاري إرسال كود التفعيل الكامل: ${fullUssdCode}`);
                        const response = await modemService.sendUssdCommand(sim.address, fullUssdCode, 'Ooredoo');
                        
                        if (response.success) {
                            await new Promise((res) => setTimeout(res, 2000));
                            const confirmResponse = await modemService.sendUssdCommand(sim.address, "1");
                            bot.sendMessage(chatId, `✅ تم تفعيل عرض أوريدو بنجاح للرقم ${phone}!\nالرد: ${response.content || 'تم التفعيل.'}\nالتأكيد: ${confirmResponse.content || 'تم تأكيد العملية.'}`);
                        } else {
                            bot.sendMessage(chatId, `❌ فشل تفعيل العرض. السبب: ${response.message}`);
                        }
                    } catch (error) {
                        bot.sendMessage(chatId, `⚠️ حدث خطأ أثناء تفعيل عرض أوريدو.`);
                    }
                });
                return;
            }

            if (data.startsWith('djoffer_')) {
                const parts = data.split('_');
                const phone = parts[1];
                const path = parts.slice(2);
                const lastChoice = path[path.length - 1];
                
                if (lastChoice === 'cancel') {
                    bot.answerCallbackQuery(callbackQuery.id, { text: 'تم الإلغاء.' });
                    bot.deleteMessage(chatId, messageId).catch(() => {});
                    return bot.sendMessage(chatId, '❌ تم إلغاء طلب عروض جازي.');
                }
                
                bot.answerCallbackQuery(callbackQuery.id);
                
                // 1. Check if we have sub-choices in cache for the selected path
                const cachedSub = await getCachedChoices(phone, 'Djezzy', path);
                if (cachedSub && cachedSub.length > 0) {
                    const inline_keyboard = [];
                    cachedSub.forEach(row => {
                        const relChoice = row.choice_path.split('_').pop();
                        const cleanedLabel = cleanOfferLabel(row.label);
                        inline_keyboard.push([{ text: `${relChoice} - ${cleanedLabel}`, callback_data: `djoffer_${phone}_${row.choice_path}` }]);
                    });
                    
                    // Add Save Offers button
                    inline_keyboard.push([
                        { text: '💾 حفظ العروض / Save', callback_data: `saveoffers_${phone}_Djezzy` }
                    ]);
                    inline_keyboard.push([
                        { text: '🔄 تحديث الفحص / Refresh', callback_data: `djscan_${phone}` },
                        { text: '❌ إلغاء', callback_data: `djoffer_${phone}_cancel` }
                    ]);
                    
                    bot.editMessageText(`👇 [مسجل تلقائياً 💾] اختر الخيار المناسب للرقم ${phone}:`, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: { inline_keyboard }
                    }).catch(() => {});
                    return;
                }
                
                // 2. If no cache, perform live navigation
                bot.editMessageText(`⏳ جاري فحص العروض المتوفرة لهذا الرقم...`, {
                    chat_id: chatId,
                    message_id: messageId
                }).catch(() => {});
                
                getActiveSim('Djezzy', async (err, sim) => {
                    if (!sim) return bot.sendMessage(chatId, 'عذراً، خادم جازي غير متوفر أو غير مفعل حالياً.');
                    
                    const pin = '00000';
                    const ussdCode = `*760*${phone}*${pin}#`;
                    
                    try {
                        let response = await modemService.sendUssdCommand(sim.address, ussdCode, 'Djezzy');
                        
                        if (response.success && response.content && !response.content.toLowerCase().includes('error from application')) {
                            for (let i = 0; i < path.length; i++) {
                                await new Promise((res) => setTimeout(res, 2000));
                                response = await modemService.sendUssdCommand(sim.address, path[i]);
                            }
                            
                            if (response.success && response.content) {
                                const content = response.content;
                                
                                const isConfirmationScreen = content.toLowerCase().includes('oui') || 
                                    content.toLowerCase().includes('confirmer') || 
                                    content.includes('تأكيد');
                                    
                                if (isConfirmationScreen) {
                                    bot.deleteMessage(chatId, messageId).catch(() => {});
                                    bot.sendMessage(chatId, `⏳ جاري تفعيل العرض وتأكيده للرقم ${phone}...`);
                                    await new Promise((res) => setTimeout(res, 2000));
                                    const confirmResponse = await modemService.sendUssdCommand(sim.address, "1");
                                    const finalContent = confirmResponse.content || '';
                                    const isFailure = finalContent.toLowerCase().includes('insuffisant') || finalContent.toLowerCase().includes('echec') || finalContent.toLowerCase().includes('échec') || finalContent.toLowerCase().includes('error') || finalContent.toLowerCase().includes('fail') || finalContent.includes('فشل');
                                    
                                    if (isFailure) {
                                        bot.sendMessage(chatId, `❌ فشل تفعيل العرض للرقم ${phone}!\nالرد: ${finalContent}`);
                                    } else {
                                        bot.sendMessage(chatId, `✅ تم تفعيل العرض بنجاح للرقم ${phone}!\nالرد: ${finalContent || 'تم التفعيل.'}`);
                                    }
                                } else {
                                    const hasChoices = content.match(/\b[1-9]\d*[\-:\.]/);
                                    if (hasChoices) {
                                        const inline_keyboard = [];
                                        const matchAll = content.matchAll(/(\d+)[\-:\.]\s*(.+?)(?=\s+\d+[\-:\.]|\s*0[\-:\.]|\s*$)/g);
                                        for (const match of matchAll) {
                                            const choice = match[1];
                                            const label = match[2].trim().replace(/[\r\n]+/g, ' ');
                                            if (choice !== '11') {
                                                const newPath = [...path, choice].join('_');
                                                let scanned = lastScannedOffers.get(`${phone}_Djezzy`);
                                                if (!scanned) {
                                                    scanned = [];
                                                    lastScannedOffers.set(`${phone}_Djezzy`, scanned);
                                                }
                                                scanned.push({ choicePath: newPath, label: label });
                                                inline_keyboard.push([{ text: `${choice} - ${label}`, callback_data: `djoffer_${phone}_${newPath}` }]);
                                            }
                                        }
                                        
                                        const hasMore = content.includes('11:') || content.includes('11-') || content.includes('11.') || content.match(/\b11\s*[\-:\.]/i);
                                        if (hasMore) {
                                            const nextPath = [...path, '11'].join('_');
                                            inline_keyboard.push([{ text: '➡️ التالي / Suite (11)', callback_data: `djoffer_${phone}_${nextPath}` }]);
                                        }
                                        
                                        inline_keyboard.push([
                                            { text: '💾 حفظ العروض / Save', callback_data: `saveoffers_${phone}_Djezzy` }
                                        ]);
                                        inline_keyboard.push([
                                            { text: '🔄 تحديث الفحص / Refresh', callback_data: `djscan_${phone}` },
                                            { text: '❌ إلغاء', callback_data: `djoffer_${phone}_cancel` }
                                        ]);
                                        
                                        bot.editMessageText(`👇 اختر الخيار المناسب للرقم ${phone}:`, {
                                            chat_id: chatId,
                                            message_id: messageId,
                                            reply_markup: { inline_keyboard }
                                        }).catch(() => {});
                                    } else {
                                        bot.deleteMessage(chatId, messageId).catch(() => {});
                                        bot.sendMessage(chatId, `✅ الرد النهائي من الشبكة للرقم ${phone}:\n\n${content}`);
                                    }
                                }
                            } else {
                                bot.sendMessage(chatId, `❌ فشل الانتقال للرد. الرد: ${response.content || response.message}`);
                            }
                        } else {
                            bot.sendMessage(chatId, `❌ فشل فتح قائمة العروض. السبب: ${response.message}`);
                        }
                    } catch (error) {
                        bot.sendMessage(chatId, `⚠️ حدث خطأ أثناء تصفح العروض.`);
                    }
                });
                return;
            }

            if (data.startsWith('moboffer_')) {
                const parts = data.split('_');
                const phone = parts[1];
                const path = parts.slice(2);
                const lastChoice = path[path.length - 1];
                
                if (lastChoice === 'cancel') {
                    bot.answerCallbackQuery(callbackQuery.id, { text: 'تم الإلغاء.' });
                    bot.deleteMessage(chatId, messageId).catch(() => {});
                    return bot.sendMessage(chatId, '❌ تم إلغاء طلب عروض موبيليس.');
                }
                
                bot.answerCallbackQuery(callbackQuery.id);
                
                // 1. Check if we have sub-choices in cache for the selected path
                const cachedSub = await getCachedChoices(phone, 'Mobilis', path);
                if (cachedSub && cachedSub.length > 0) {
                    const inline_keyboard = [];
                    cachedSub.forEach(row => {
                        const relChoice = row.choice_path.split('_').pop();
                        const cleanedLabel = cleanOfferLabel(row.label);
                        inline_keyboard.push([{ text: `${relChoice} - ${cleanedLabel}`, callback_data: `moboffer_${phone}_${row.choice_path}` }]);
                    });
                    
                    // Add Save Offers button
                    inline_keyboard.push([
                        { text: '💾 حفظ العروض / Save', callback_data: `saveoffers_${phone}_Mobilis` }
                    ]);
                    inline_keyboard.push([
                        { text: '🔄 تحديث الفحص / Refresh', callback_data: `mobscan_${phone}` },
                        { text: '❌ إلغاء', callback_data: `moboffer_${phone}_cancel` }
                    ]);
                    
                    bot.editMessageText(`👇 [مسجل تلقائياً 💾] اختر الخيار المناسب للرقم ${phone}:`, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: { inline_keyboard }
                    }).catch(() => {});
                    return;
                }
                
                // 2. If no cache, perform live navigation
                bot.editMessageText(`⏳ جاري فحص العروض المتوفرة لهذا الرقم...`, {
                    chat_id: chatId,
                    message_id: messageId
                }).catch(() => {});
                
                getActiveSim('Sama', async (err, sim) => {
                    if (!sim) return bot.sendMessage(chatId, 'عذراً، خادم Sama غير متوفر أو غير مفعل حالياً.');
                    
                    const pin = sim.sim_pin || '0000';
                    const ussdCode = `*665*1*${phone}*${pin}#`;
                    
                    try {
                        let response = await modemService.sendUssdCommand(sim.address, ussdCode, 'Mobilis');
                        
                        if (response.success && response.content && !response.content.toLowerCase().includes('error from application')) {
                            for (let i = 0; i < path.length; i++) {
                                await new Promise((res) => setTimeout(res, 2000));
                                response = await modemService.sendUssdCommand(sim.address, path[i]);
                            }
                            
                            if (response.success && response.content) {
                                const content = response.content;
                                
                                const isConfirmationScreen = content.toLowerCase().includes('oui') || 
                                    content.toLowerCase().includes('confirmer') || 
                                    content.includes('تأكيد');
                                    
                                if (isConfirmationScreen) {
                                    bot.deleteMessage(chatId, messageId).catch(() => {});
                                    bot.sendMessage(chatId, `⏳ جاري تفعيل العرض وتأكيده للرقم ${phone}...`);
                                    await new Promise((res) => setTimeout(res, 2000));
                                    const confirmResponse = await modemService.sendUssdCommand(sim.address, "1");
                                    const finalContent = confirmResponse.content || '';
                                    const isFailure = finalContent.toLowerCase().includes('insuffisant') || finalContent.toLowerCase().includes('echec') || finalContent.toLowerCase().includes('échec') || finalContent.toLowerCase().includes('error') || finalContent.toLowerCase().includes('fail') || finalContent.includes('فشل');
                                    
                                    if (isFailure) {
                                        bot.sendMessage(chatId, `❌ فشل تفعيل العرض للرقم ${phone}!\nالرد: ${finalContent}`);
                                    } else {
                                        bot.sendMessage(chatId, `✅ تم تفعيل العرض بنجاح للرقم ${phone}!\nالرد: ${finalContent || 'تم التفعيل.'}`);
                                    }
                                } else {
                                    const hasChoices = content.match(/\b\d+[\-:\.]/);
                                    if (hasChoices) {
                                        const inline_keyboard = [];
                                        const matchAll = content.matchAll(/(\d+)[\-:\.]\s*(.+?)(?=\s+\d+[\-:\.]|\s*0[\-:\.]|\s*$)/g);
                                        for (const match of matchAll) {
                                            const choice = match[1];
                                            const label = match[2].trim().replace(/[\r\n]+/g, ' ');
                                            if (choice !== '0') {
                                                const newPath = [...path, choice].join('_');
                                                let scanned = lastScannedOffers.get(`${phone}_Mobilis`);
                                                if (!scanned) {
                                                    scanned = [];
                                                    lastScannedOffers.set(`${phone}_Mobilis`, scanned);
                                                }
                                                scanned.push({ choicePath: newPath, label: label });
                                                inline_keyboard.push([{ text: `${choice} - ${label}`, callback_data: `moboffer_${phone}_${newPath}` }]);
                                            }
                                        }
                                        const hasMore = content.includes('0:') || content.includes('0-') || content.includes('0.') || content.match(/\b0\s*[\-:\.]/i);
                                        if (hasMore) {
                                            const nextPath = [...path, '0'].join('_');
                                            inline_keyboard.push([{ text: '➡️ التالي / Suite (0)', callback_data: `moboffer_${phone}_${nextPath}` }]);
                                        }
                                        inline_keyboard.push([
                                            { text: '💾 حفظ العروض / Save', callback_data: `saveoffers_${phone}_Mobilis` }
                                        ]);
                                        inline_keyboard.push([
                                            { text: '🔄 تحديث الفحص / Refresh', callback_data: `mobscan_${phone}` },
                                            { text: '❌ إلغاء', callback_data: `moboffer_${phone}_cancel` }
                                        ]);
                                        
                                        bot.editMessageText(`👇 اختر الخيار المناسب للرقم ${phone}:`, {
                                            chat_id: chatId,
                                            message_id: messageId,
                                            reply_markup: { inline_keyboard }
                                        }).catch(() => {});
                                    } else {
                                        bot.deleteMessage(chatId, messageId).catch(() => {});
                                        bot.sendMessage(chatId, `✅ الرد النهائي من الشبكة للرقم ${phone}:\n\n${content}`);
                                    }
                                }
                            } else {
                                bot.sendMessage(chatId, `❌ فشل الانتقال للرد. الرد: ${response.content || response.message}`);
                            }
                        } else {
                            bot.sendMessage(chatId, `❌ فشل فتح قائمة العروض. السبب: ${response.message}`);
                        }
                    } catch (error) {
                        bot.sendMessage(chatId, `⚠️ حدث خطأ أثناء تصفح العروض.`);
                    }
                });
                return;
            }

            if (data.startsWith('confirm_flexy_')) {
                const parts = data.split('_');
                const phone = parts[2];
                const amount = parseFloat(parts[3]);
                const typeStr = parts[4] || 'flexy';
                
                bot.answerCallbackQuery(callbackQuery.id, { text: 'جاري التنفيذ...' });
                bot.deleteMessage(chatId, messageId).catch(() => {});
                
                executeFlexy(chatId, phone, amount, typeStr);
            } else if (data === 'cancel_flexy') {
                bot.answerCallbackQuery(callbackQuery.id, { text: 'تم الإلغاء.' });
                bot.deleteMessage(chatId, messageId).catch(() => {});
                bot.sendMessage(chatId, '❌ تم إلغاء عملية الفليكسي.');
            } else if (data.startsWith('checkbill_')) {
                const phone = data.split('_')[1];
                bot.answerCallbackQuery(callbackQuery.id, { text: 'جاري فحص الفاتورة...' });
                bot.editMessageText(`⏳ جاري فحص فاتورة الرقم ${phone}... يرجى الانتظار.`, {
                    chat_id: chatId,
                    message_id: messageId
                }).catch(() => {});

                try {
                    const axios = require('axios');
                    const response = await axios.post('http://localhost:3000/check-bill-idoom', { account: phone });
                    
                    if (response.data && response.data.success) {
                        bot.sendMessage(chatId, `🧾 **فاتورة الهاتف الثابت:**\n\nالرقم: \`${phone}\`\nالمبلغ المستحق: **${response.data.amount} دج**\n\nشكراً لاستخدامكم Tobal Flexy!`, { parse_mode: 'Markdown' });
                    } else {
                        bot.sendMessage(chatId, `❌ فشل الفحص: ${response.data ? response.data.message : 'رد غير معروف'}`);
                    }
                } catch (error) {
                    bot.sendMessage(chatId, `⚠️ حدث خطأ أثناء الاتصال بسيرفر الأتمتة.`);
                }
            }
        });

        bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            const name = msg.from.first_name || 'وكيل';

            db.get(`SELECT * FROM agents WHERE telegram_id = ?`, [chatId.toString()], (err, row) => {
                if (row) {
                    let adminText = row.is_admin ? '\nأنت مدير في النظام 👑' : '';
                    const isAdmin = row.is_admin ? true : false;
                    bot.sendMessage(chatId, `مرحباً بك مجدداً ${name}! 🌟${adminText}\nحسابك نشط. رصيدك الحالي: ${row.balance} دج.\n\nأوامر الوكيل:\n/flexy [رقم] [مبلغ]\n/carte [idoom/4g]\n/solde لمعرفة الرصيد`, { reply_markup: getKeyboard(isAdmin) });
                }
            });
        });

        // Admin Commands
        bot.onText(/\/make_admin (.+)/, (msg, match) => {
            const chatId = msg.chat.id;
            const secret = match[1];
            if (secret === adminSecret) {
                db.run(`UPDATE agents SET is_admin = 1 WHERE telegram_id = ?`, [chatId.toString()], (err) => {
                    bot.sendMessage(chatId, '✅ تمت ترقيتك بنجاح لتصبح مديراً (Admin).');
                });
            }
        });

        bot.onText(/\/addbalance (.+) (.+)/, (msg, match) => {
            const chatId = msg.chat.id;
            const targetAgentId = match[1];
            const amount = parseFloat(match[2]);

            db.get(`SELECT is_admin FROM agents WHERE telegram_id = ?`, [chatId.toString()], (err, row) => {
                if (!row || !row.is_admin) return bot.sendMessage(chatId, '⛔ هذا الأمر مخصص للمدراء فقط.');

                db.get(`SELECT * FROM agents WHERE telegram_id = ? OR id = ?`, [targetAgentId, targetAgentId], (err, targetRow) => {
                    if (!targetRow) return bot.sendMessage(chatId, '❌ الوكيل غير موجود.');
                    db.run(`UPDATE agents SET balance = balance + ?, last_recharge_date = CURRENT_TIMESTAMP, status = 'active' WHERE id = ?`, [amount, targetRow.id], (err) => {
                        bot.sendMessage(chatId, `✅ تم إضافة ${amount} دج لحساب الوكيل ${targetRow.name}.\nالرصيد الجديد: ${targetRow.balance + amount} دج`);
                        bot.sendMessage(targetRow.telegram_id, `💰 إشعار: تم إضافة ${amount} دج إلى رصيدك من قبل الإدارة.\nرصيدك الجديد: ${targetRow.balance + amount} دج`);
                    });
                });
            });
        });

        // Helper: wrap handler to silently block unregistered users
        function registeredOnly(handler) {
            return async (msg, match) => {
                const isReg = await new Promise(r => db.get(`SELECT id FROM agents WHERE telegram_id = ?`, [msg.chat.id.toString()], (e, row) => r(!!row)));
                if (!isReg) return; // Silently return - message handler already showed ID
                handler(msg, match);
            };
        }

        // User Commands
        bot.onText(/\/solde/, registeredOnly(soldeHandler));
        bot.onText(/^\/s$/, registeredOnly(soldeHandler));

        // Admin Command - Sims Balance
        bot.onText(/\/sims/, registeredOnly(handleSimsBalance));
        bot.onText(/^\/sims$/, registeredOnly(handleSimsBalance));

        // Admin Command - Sims Status
        bot.onText(/\/status/, registeredOnly(handleSimsStatus));
        bot.onText(/^\/status$/, registeredOnly(handleSimsStatus));

        // Admin Command - Daily Report
        bot.onText(/\/report/, registeredOnly(handleReportCommand));

        // User Command - Check Operator
        bot.onText(/\/check (.+)/, registeredOnly((msg, match) => {
            const chatId = msg.chat.id;
            const phone = match[1];

            let operator = 'غير معروف';
            if (phone.startsWith('05')) operator = 'Ooredoo';
            else if (phone.startsWith('06')) operator = 'Mobilis';
            else if (phone.startsWith('07')) operator = 'Djezzy';

            bot.sendMessage(chatId, `📱 الرقم: ${phone}\n🏢 المتعامل: ${operator}`);
        }));

        // Idoom Cards Command
        bot.onText(/\/carte (.+)/i, registeredOnly((msg, match) => handleCarteCommand(msg, match[1])));

        // Auto-Fill Idoom/4G Command
        bot.onText(/\/(idoom|4g) (.+)/i, registeredOnly(async (msg, match) => {
            const chatId = msg.chat.id;
            let type = match[1].toLowerCase(); // 'idoom' or '4g'
            const account = match[2].trim();
            
            // Auto-detect and correct category based on prefix and length (strict 21347 with 12 digits, and local formats)
            const cleanAcc = account.toString().trim();
            const is4G = (cleanAcc.startsWith('21347') && cleanAcc.length === 12) || 
                          (cleanAcc.startsWith('047') && cleanAcc.length === 10) || 
                          (cleanAcc.startsWith('47') && cleanAcc.length === 9);
            if (is4G) {
                type = '4g';
            } else {
                type = 'idoom';
            }
            
            let category = type === 'idoom' ? 'Idoom ADSL' : 'Idoom 4G';

            db.get(`SELECT * FROM agents WHERE telegram_id = ?`, [chatId.toString()], async (err, agent) => {
                if (!agent) return bot.sendMessage(chatId, 'حسابك غير مسجل. أرسل /start');

                // Query available cards for this category
                db.all(`SELECT DISTINCT value FROM recharge_cards WHERE category IN (?, 'Idoom') AND status = 'available' ORDER BY value ASC`, [category], (err, rows) => {
                    if (err || rows.length === 0) {
                        return bot.sendMessage(chatId, `❌ عذراً، لا توجد بطاقات متاحة حالياً لفئة ${category}.`);
                    }

                    const buttons = [];
                    rows.forEach(row => {
                        buttons.push([{ text: `تعبئة ${row.value} دج`, callback_data: `autofill_${type}_${account}_${row.value}` }]);
                    });
                    buttons.push([{ text: '❌ إلغاء', callback_data: `autofill_cancel` }]);

                    const opts = {
                        reply_markup: {
                            inline_keyboard: buttons
                        }
                    };

                    bot.sendMessage(chatId, `📱 رقم الحساب: ${account}\nيرجى اختيار قيمة التعبئة:`, opts);
                });
            });
        }));


        // Flexy Command
        bot.onText(/\/flexy (.+) (.+)/, registeredOnly(async (msg, match) => {
            const chatId = msg.chat.id;
            const phone = match[1];
            const amount = parseFloat(match[2]);
            executeFlexy(chatId, phone, amount);
        }));

        // Listen for incoming SMS for Mobilis verification
        process.on('modem-log', (data) => {
            if (data.log && data.log.startsWith('[SMS]')) {
                const smsContent = data.log.substring(5).trim();
                console.log(`[Bot] Received SMS for checking: ${smsContent}`);
                
                // Save to bot_logs for the dashboard
                const logEntry = {
                    user_id: 'SMS',
                    user_name: 'SIM Card',
                    message: smsContent,
                    timestamp: new Date().toISOString()
                };
                db.run(`INSERT INTO bot_logs (user_id, user_name, message) VALUES (?, ?, ?)`, 
                [logEntry.user_id, logEntry.user_name, logEntry.message]);
                
                if (process.emit) {
                    process.emit('bot-log', logEntry);
                }
                
                // Raw SMS forwarding to Admin bot has been disabled per user request.
                
                // Check if it matches any pending Mobilis transfer
                for (const [key, pending] of pendingMobilis.entries()) {
                    // Check if SMS contains the phone number (ignoring leading zero)
                    const phoneWithoutZero = pending.phone.startsWith('0') ? pending.phone.substring(1) : pending.phone;
                    if (smsContent.includes(phoneWithoutZero)) {
                        console.log(`[Bot] SMS matches pending transfer for ${pending.phone}`);
                        
                        // Determine if SMS is a failure notification
                        const isFailure = smsContent.toLowerCase().includes('echec') || 
                                          smsContent.toLowerCase().includes('échec') || 
                                          smsContent.toLowerCase().includes('fail') || 
                                          smsContent.toLowerCase().includes('refuse') || 
                                          smsContent.toLowerCase().includes('erreur') || 
                                          smsContent.toLowerCase().includes('insuffisant') ||
                                          smsContent.toLowerCase().includes('inférieur') ||
                                          smsContent.includes('فشل');

                        // Check for success keywords (only if not a failure)
                        const isSuccess = !isFailure && (
                                          smsContent.toLowerCase().includes('succes') || 
                                          smsContent.toLowerCase().includes('realisee') || 
                                          smsContent.toLowerCase().includes('reussie') ||
                                          smsContent.includes('تمت') ||
                                          smsContent.toLowerCase().includes('recharge') ||
                                          smsContent.toLowerCase().includes('recharger') ||
                                          (smsContent.toLowerCase().includes('montant') && smsContent.toLowerCase().includes('transaction'))
                                        );
                                          
                        if (isFailure) {
                            // Refund Agent
                            db.run(`UPDATE agents SET balance = balance + ? WHERE id = ?`, [pending.amount, pending.agentId]);
                            // Update DB Transaction to FAILED
                            db.run(`UPDATE transactions SET status = 'FAILED' WHERE agent_id = ? AND phone_number = ? AND amount = ? AND status = 'PENDING_SMS'`, 
                            [pending.agentId, pending.phone, pending.amount]);
                            
                            bot.sendMessage(pending.chatId, `❌ فشل تأكيد عملية الفليكسي (عبر SMS)!\nالرقم: ${pending.phone}\nالمبلغ: ${pending.amount} دج\nالسبب: ${smsContent}\n🔄 تم إرجاع المبلغ إلى رصيدك تلقائياً.`).catch(console.error);
                            
                            // Remove from pending
                            pendingMobilis.delete(key);
                        } else if (isSuccess) {
                            // Update DB Transaction to SUCCESS
                            db.run(`UPDATE transactions SET status = 'SUCCESS' WHERE agent_id = ? AND phone_number = ? AND amount = ? AND status = 'PENDING_SMS'`, 
                            [pending.agentId, pending.phone, pending.amount]);
                            
                            db.get(`SELECT balance FROM agents WHERE id = ?`, [pending.agentId], (err, agentRow) => {
                                const finalAgentBalance = agentRow ? agentRow.balance.toFixed(2) : '0.00';
                                bot.sendMessage(pending.chatId, `Recharge ${pending.amount} -> ${pending.phone} OK. B:${finalAgentBalance} da.✅`).catch(console.error);
                            });
                            
                            // Remove from pending
                            pendingMobilis.delete(key);
                        }
                    }
                }
            }
        });

        // Polling error handling
        bot.on('polling_error', (error) => {
            console.error('[Telegram Bot] Polling Error: ', error.message);
            if (process.emit) {
                process.emit('bot-status', { connected: false, message: error.message });
            }
        });

        // ==========================================
        // AUTO-SUSPEND BACKGROUND JOB
        // ==========================================
        setInterval(async () => {
            try {
                const autoSuspendDaysStr = await getSetting('auto_suspend_days');
                const autoSuspendDays = parseInt(autoSuspendDaysStr, 10) || 0;
                
                if (autoSuspendDays > 0) {
                    db.run(`
                        UPDATE agents 
                        SET status = 'suspended' 
                        WHERE status = 'active' 
                        AND role != 'admin'
                        AND is_admin = 0
                        AND last_recharge_date IS NOT NULL
                        AND (julianday('now') - julianday(last_recharge_date)) > ?
                    `, [autoSuspendDays], function(err) {
                        if (err) {
                            console.error('[AutoSuspend] Error:', err.message);
                        } else if (this.changes > 0) {
                            console.log(`[AutoSuspend] Automatically suspended ${this.changes} inactive agents (>${autoSuspendDays} days).`);
                        }
                    });
                }
            } catch(e) {
                console.error('[AutoSuspend] Exception:', e);
            }
        }, 60 * 60 * 1000); // Check every 1 hour

        return { success: true, message: 'Bot started successfully' };
    } catch (e) {
        console.error('[Telegram Bot] Error starting bot:', e.message);
        return { success: false, message: e.message };
    }
}

function sendMessage(userId, text) {
    if (bot) {
        return bot.sendMessage(userId, text);
    }
    return Promise.reject(new Error('Bot not started'));
}

process.on('message', async (msg) => {
    if (msg.type === 'broadcast') {
        const { message } = msg;
        try {
            db.all(`SELECT telegram_id FROM agents WHERE telegram_id IS NOT NULL`, [], async (err, rows) => {
                if (err) {
                    process.send({ type: 'broadcast-result', result: { success: false, message: err.message } });
                    return;
                }
                
                let successCount = 0;
                for (const row of rows) {
                    try {
                        await bot.sendMessage(row.telegram_id, "📢 **رسالة من الإدارة:**\n\n" + message, { parse_mode: 'Markdown' });
                        successCount++;
                    } catch (e) {
                        console.error(`[Broadcast] Failed to send to ${row.telegram_id}:`, e.message);
                    }
                }
                
                process.send({ type: 'broadcast-result', result: { success: true, count: successCount } });
            });
        } catch (e) {
            process.send({ type: 'broadcast-result', result: { success: false, message: e.message } });
        }
    }
});

async function sendDocumentToAdmin(buffer, filename, caption = '') {
    if (!bot) return { success: false, message: 'Bot not running' };
    return new Promise((resolve) => {
        db.all(`SELECT telegram_id FROM agents WHERE is_admin = 1`, async (err, admins) => {
            if (err || !admins || admins.length === 0) {
                return resolve({ success: false, message: 'No admins found' });
            }
            let successCount = 0;
            for (const admin of admins) {
                try {
                    await bot.sendDocument(admin.telegram_id, buffer, { caption: caption }, { filename: filename, contentType: 'application/json' });
                    successCount++;
                } catch (e) {
                    console.error(`[Telegram Bot] Error sending document to ${admin.telegram_id}:`, e.message);
                }
            }
            resolve({ success: successCount > 0, count: successCount });
        });
    });
}

module.exports = { startBot, sendMessage, resolvePendingCaptcha, sendDocumentToAdmin };
