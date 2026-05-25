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

const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');

const ipcHandlers = {};
function registerIpc(channel, handler) {
    ipcHandlers[channel] = handler;
    ipcMain.handle(channel, handler);
}

const db = require('./database');
const { startBot } = require('./telegram_bot');
const modemService = require('./modem_service');

let mainWindow;
let automationProcess;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'ui/icon.ico')
    });

    mainWindow.loadFile('telegram_dashboard.html');

    // Enable right-click Context Menu for Cut, Copy, Paste, and Select All
    mainWindow.webContents.on('context-menu', (e, params) => {
        const { editFlags } = params;
        const contextMenu = Menu.buildFromTemplate([
            { role: 'cut', label: 'قص (Cut)', enabled: editFlags.canCut },
            { role: 'copy', label: 'نسخ (Copy)', enabled: editFlags.canCopy },
            { role: 'paste', label: 'لصق (Paste)', enabled: editFlags.canPaste },
            { type: 'separator' },
            { role: 'selectall', label: 'تحديد الكل (Select All)', enabled: editFlags.canSelectAll }
        ]);
        contextMenu.popup(mainWindow);
    });

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

process.on('sim-offers-updated', () => {
    if (mainWindow) {
        mainWindow.webContents.send('sim-offers-updated');
    }
});

process.on('modem-log', (data) => {
    if (mainWindow) {
        mainWindow.webContents.send('modem-log', data);
    }
});

process.on('bot-log', (data) => {
    if (mainWindow) {
        mainWindow.webContents.send('bot-log', data);
    }
});

process.on('bot-status', (data) => {
    if (mainWindow) {
        mainWindow.webContents.send('bot-status', data);
    }
});

process.on('pending-captcha', (data) => {
    if (mainWindow) {
        mainWindow.webContents.send('pending-captcha', data);
    }
});

process.on('pending-captcha-solved', (data) => {
    if (mainWindow) {
        mainWindow.webContents.send('pending-captcha-solved', data);
    }
});

process.on('idoom-recharge-event', (data) => {
    if (mainWindow) {
        mainWindow.webContents.send('idoom-recharge-event', data);
    }
});

process.on('modem-data-update', (data) => {
    // data: { address, balance, transaction_update }
    db.get(`SELECT * FROM sim_cards WHERE address = ?`, [data.address], (err, sim) => {
        if (err || !sim) return;

        if (data.balance) {
            db.run(`UPDATE sim_cards SET balance = ? WHERE id = ?`, [data.balance, sim.id]);
            
            // Check for low balance notification
            const minBalance = parseFloat(sim.min_balance) || 0;
            const currentBalance = parseFloat(data.balance.toString().replace(/[^\d.-]/g, '')) || 0;
            const previousBalance = parseFloat(sim.balance ? sim.balance.toString().replace(/[^\d.-]/g, '') : '0') || 0;
            
            if (minBalance > 0 && currentBalance < minBalance && previousBalance >= minBalance) {
                db.all(`SELECT telegram_id FROM agents WHERE is_admin = 1`, [], (err, admins) => {
                    if (admins) {
                        const { sendMessage } = require('./telegram_bot');
                        admins.forEach(admin => {
                            sendMessage(admin.telegram_id, `⚠️ **تنبيه: اقتراب نفاذ الرصيد!**\n\nالشريحة: ${sim.operator} (${sim.number || sim.address})\nالرصيد الحالي: ${data.balance}\nالحد الأدنى: ${minBalance}`).catch(()=>null);
                        });
                    }
                });
            }

            // Update ALL recent balance logs that were waiting (within last 5 mins)
            db.run(`UPDATE transactions SET status = ? 
                   WHERE sim_id = ? AND type = 'BALANCE' 
                   AND (status LIKE '%prise en charge%' OR status = 'SUCCESS' OR status = 'FAILED')
                   AND timestamp > ?`, [`SUCCESS: ${data.balance} DA`, sim.id, Date.now() - 300000]);
                   
            // Optional: Delete duplicate balance logs for the same period to keep journal clean
            db.run(`DELETE FROM transactions 
                   WHERE id NOT IN (
                       SELECT MAX(id) FROM transactions 
                       WHERE sim_id = ? AND type = 'BALANCE' AND timestamp > ?
                   ) AND sim_id = ? AND type = 'BALANCE' AND timestamp > ?`, 
                   [sim.id, Date.now() - 60000, sim.id, Date.now() - 60000]);
        }

        if (data.transaction_update) {
            db.run(`UPDATE transactions SET status = ? 
                   WHERE id = (
                       SELECT id FROM transactions 
                       WHERE sim_id = ? AND status LIKE 'PENDING%' 
                       ORDER BY timestamp DESC LIMIT 1
                   )`, [`SUCCESS: ${data.transaction_update.substring(0, 50)}`, sim.id]);
        }

        if (mainWindow) {
            mainWindow.webContents.send('sim-data-fast-update', { 
                simId: sim.id, 
                balance: data.balance, 
                transactionUpdate: data.transaction_update 
            });
            mainWindow.webContents.send('sims-updated'); // Fallback full refresh
        }
    });
});

process.on('ahla-log', (data) => {
    if (mainWindow) mainWindow.webContents.send('sim-log', data);
});

app.whenReady().then(() => {
    // Setup Application Menu to enable standard Copy-Paste (Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A, Ctrl+Z)
    const template = [
        {
            label: 'تعديل (Edit)',
            submenu: [
                { role: 'undo', label: 'تراجع (Undo)', accelerator: 'CmdOrCtrl+Z' },
                { role: 'redo', label: 'إعادة (Redo)', accelerator: 'CmdOrCtrl+Y' },
                { type: 'separator' },
                { role: 'cut', label: 'قص (Cut)', accelerator: 'CmdOrCtrl+X' },
                { role: 'copy', label: 'نسخ (Copy)', accelerator: 'CmdOrCtrl+C' },
                { role: 'paste', label: 'لصق (Paste)', accelerator: 'CmdOrCtrl+V' },
                { role: 'selectall', label: 'تحديد الكل (Select All)', accelerator: 'CmdOrCtrl+A' }
            ]
        }
    ];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    createWindow();

    // Start Automation Server
    const { fork } = require('child_process');
    automationProcess = fork(path.join(__dirname, 'automation_server.js'), [], {
        silent: true // Capture stdout/stderr
    });
    
    automationProcess.stdout.on('data', (data) => {
        const log = data.toString();
        console.log('[Automation Output]', log);
        if (mainWindow) {
            mainWindow.webContents.send('automation-log', log);
        }
    });

    automationProcess.stderr.on('data', (data) => {
        const log = data.toString();
        console.error('[Automation Error]', log);
        if (mainWindow) {
            mainWindow.webContents.send('automation-log', `ERROR: ${log}`);
        }
    });

    console.log('[Main] Started automation_server.js');

    // Load settings and start bot
    db.get(`SELECT value FROM settings WHERE key = 'bot_token'`, (err, tokenRow) => {
        db.get(`SELECT value FROM settings WHERE key = 'admin_secret'`, (err, adminRow) => {
            db.get(`SELECT value FROM settings WHERE key = 'captcha_api_key'`, (err, captchaRow) => {
                if (tokenRow && tokenRow.value) {
                    console.log('[Main] Starting bot with saved token...');
                    startBot(tokenRow.value, adminRow ? adminRow.value : 'SUPERM123');
                } else {
                    console.log('[Main] No bot token found in DB. Bot not started.');
                }

                // Send initial API key to automation server
                if (captchaRow && captchaRow.value) {
                    setTimeout(async () => {
                        const axios = require('axios');
                        try {
                            await axios.post('http://localhost:3000/update-api-key', { key: captchaRow.value });
                        } catch (e) {
                            console.error('[Main] Failed to send initial API key to automation server');
                        }
                    }, 5000);
                }
            });
        });
    });
    // Update Signal Strength for all active SIMs every 10 minutes
    setInterval(async () => {
        console.log('[Main] Background Signal Update Started...');
        db.all(`SELECT * FROM sim_cards WHERE status = 'active'`, [], async (err, sims) => {
            if (err || !sims) return;
            for (const sim of sims) {
                try {
                    const result = await modemService.getSignalStrength(sim.address, sim.operator);
                    if (result.success) {
                        db.run(`UPDATE sim_cards SET signal = ? WHERE id = ?`, [result.bars, sim.id]);
                    }
                    await new Promise(r => setTimeout(r, 2000));
                } catch (e) {
                    console.error(`[Main] Signal Update Failed for ${sim.number}:`, e.message);
                }
            }
        });
    }, 600000); 

    // Start periodic SIM balance checker every 5 minutes
    startScheduledBalanceChecker();

    // Check and auto-isolate active IP modems on startup
    setTimeout(() => {
        autoIsolateIpModems();
    }, 3000);

    // The API-based Ahla service does not require emulator preparation.

    // Update SMS for active HiLink modems every 5 seconds
    setInterval(async () => {
        db.all(`SELECT address FROM sim_cards WHERE status = 'active'`, [], async (err, sims) => {
            if (err || !sims) return;
            for (const sim of sims) {
                const address = sim.address;
                const isIp = address.match(/^\d+\.\d+\.\d+\.\d+$/) || address.startsWith('http');
                if (isIp) {
                    const cleanIp = address.replace(/^https?:\/\//, '').split('/')[0];
                    try {
                        await modemService.pollHiLinkSms(cleanIp);
                    } catch (e) {
                        console.error(`[Main HiLink SMS Poll Error] ${cleanIp}:`, e.message);
                    }
                }
            }
        });
    }, 5000);

    // Start Cloud Admin API Server
    require('./api_server')(db, modemService, ipcHandlers);

    // Auto-backup every 40 minutes
    setInterval(() => {
        console.log('[Backup] Running scheduled backup...');
        sendBackupToAdmin();
    }, 40 * 60 * 1000);
});

async function generateBackup() {
    return new Promise((resolve) => {
        const backup = { timestamp: Date.now(), agents: [], recharge_cards: [], transactions: [] };
        db.all("SELECT * FROM agents", [], (err, agents) => {
            if (agents) backup.agents = agents;
            db.all("SELECT * FROM recharge_cards", [], (err, cards) => {
                if (cards) backup.recharge_cards = cards;
                db.all("SELECT * FROM transactions", [], (err, txs) => {
                    if (txs) backup.transactions = txs;
                    resolve(backup);
                });
            });
        });
    });
}

async function sendBackupToAdmin() {
    const backupData = await generateBackup();
    const backupBuffer = Buffer.from(JSON.stringify(backupData, null, 2), 'utf8');
    const filename = `backup_meetmob_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const { sendDocumentToAdmin } = require('./telegram_bot');
    if (sendDocumentToAdmin) {
        await sendDocumentToAdmin(backupBuffer, filename, `📦 نسخة احتياطية لسيرفر Meetmob (${new Date().toLocaleString('ar-DZ')})\nتتضمن: ${backupData.agents.length} وكيل، ${backupData.recharge_cards.length} بطاقة، ${backupData.transactions.length} عملية.`);
    }
}

app.on('window-all-closed', function () {
    if (automationProcess) automationProcess.kill();
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
    if (mainWindow === null) createWindow();
});

// --- IPC Communication with UI ---

registerIpc('submit-captcha', async (event, { id, captchaCode }) => {
    try {
        const { resolvePendingCaptcha } = require('./telegram_bot');
        const success = resolvePendingCaptcha(id, captchaCode);
        return { success };
    } catch (e) {
        return { success: false, message: e.message };
    }
});

registerIpc('send-telegram-message', async (event, { userId, text }) => {
    try {
        const { sendMessage } = require('./telegram_bot');
        await sendMessage(userId, text);
        
        // Also log this outgoing message to DB and UI
        const logEntry = {
            user_id: 'ADMIN',
            user_name: 'مدير النظام',
            message: `⬅️ إلى ${userId}: ${text}`,
            timestamp: new Date().toISOString()
        };
        db.run(`INSERT INTO bot_logs (user_id, user_name, message) VALUES (?, ?, ?)`, 
        [logEntry.user_id, logEntry.user_name, logEntry.message]);
        
        if (mainWindow) {
            mainWindow.webContents.send('bot-log', logEntry);
        }
        
        return { success: true };
    } catch (e) {
        return { success: false, message: e.message };
    }
});

registerIpc('broadcast-telegram-message', async (event, { text }) => {
    try {
        const { sendMessage } = require('./telegram_bot');
        const agents = await new Promise((resolve) => {
            db.all(`SELECT telegram_id FROM agents WHERE telegram_id IS NOT NULL`, [], (err, rows) => resolve(rows));
        });
        
        let count = 0;
        for (const agent of agents) {
            try {
                await sendMessage(agent.telegram_id, text);
                count++;
            } catch (e) { console.error(`Failed to broadcast to ${agent.telegram_id}`); }
        }
        
        // Log the broadcast
        const logEntry = {
            user_id: 'ADMIN',
            user_name: 'مدير النظام',
            message: `📢 إرسال جماعي (${count} وكيل): ${text}`,
            timestamp: new Date().toISOString()
        };
        db.run(`INSERT INTO bot_logs (user_id, user_name, message) VALUES (?, ?, ?)`, 
        [logEntry.user_id, logEntry.user_name, logEntry.message]);
        
        if (mainWindow) {
            mainWindow.webContents.send('bot-log', logEntry);
        }

        return { success: true, count };
    } catch (e) {
        return { success: false, message: e.message };
    }
});

registerIpc('get-dashboard-stats', async () => {
    return new Promise((resolve) => {
        db.all(`SELECT operator, balance, status FROM sim_cards`, [], (err, sims) => {
            if (err || !sims) return resolve({ ooredoo: '0 دج', djezzy: '0 دج', mobilis: '0 دج', agents: '0 وكيل' });
            
            let ooredooSum = 0;
            let djezzySum = 0;
            let mobilisSum = 0;
            
            sims.forEach(sim => {
                let balVal = 0;
                try {
                    if (sim.operator.toLowerCase() === 'mobilis' || sim.operator === 'Sama') {
                        if (sim.balance && sim.balance.startsWith('{')) {
                            const parsed = JSON.parse(sim.balance);
                            balVal = parseFloat(parsed.gts || 0) + 
                                     parseFloat(parsed.poste || 0) + 
                                     parseFloat(parsed.assilou || 0) + 
                                     parseFloat(parsed.data || 0) + 
                                     parseFloat(parsed.mobilis || 0);
                        } else {
                            balVal = parseFloat(sim.balance) || 0;
                        }
                    } else {
                        balVal = parseFloat(sim.balance) || 0;
                    }
                } catch (e) {
                    balVal = parseFloat(sim.balance) || 0;
                }
                
                if (sim.operator.toLowerCase() === 'ooredoo') {
                    ooredooSum += balVal;
                } else if (sim.operator.toLowerCase() === 'djezzy') {
                    djezzySum += balVal;
                } else if (sim.operator.toLowerCase() === 'mobilis' || sim.operator === 'Sama') {
                    mobilisSum += balVal;
                }
            });
            
            db.get(`SELECT COUNT(*) as count FROM agents WHERE telegram_id IS NOT NULL`, [], (err2, row2) => {
                const agentsCount = row2 ? row2.count : 0;
                resolve({
                    ooredoo: ooredooSum.toLocaleString() + ' دج',
                    djezzy: djezzySum.toLocaleString() + ' دج',
                    mobilis: mobilisSum.toLocaleString() + ' دج',
                    agents: agentsCount + ' وكيل'
                });
            });
        });
    });
});

registerIpc('get-sims', async () => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM sim_cards`, [], (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
});

registerIpc('add-sim', async (event, sim) => {
    return new Promise((resolve, reject) => {
        db.run(`INSERT INTO sim_cards (operator, number, type, address, ussd_transfer_override, ussd_balance_override, transfer_method, ahla_phone, ahla_pin, sim_pin, margin_percent_1, margin_percent_2, min_balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
        [sim.operator, sim.number, sim.type, sim.address, sim.ussd_transfer_override, sim.ussd_balance_override, sim.transfer_method || 'USSD', sim.ahla_phone || '', sim.ahla_pin || '', sim.sim_pin || '', sim.margin_percent_1 || 0, sim.margin_percent_2 || 0, sim.min_balance || 0], function(err) {
            if (err) reject(err);
            else {
                autoIsolateIpModems();
                resolve({ success: true, id: this.lastID });
            }
        });
    });
});

registerIpc('get-cards', async () => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM recharge_cards`, [], (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
});

registerIpc('add-card', async (event, card) => {
    return new Promise((resolve, reject) => {
        db.run(`INSERT INTO recharge_cards (category, pin_code, value) VALUES (?, ?, ?)`, 
        [card.category, card.pin_code, card.value], function(err) {
            if (err) reject(err); else resolve({ success: true, id: this.lastID });
        });
    });
});

registerIpc('update-card-status', async (event, data) => {
    return new Promise((resolve, reject) => {
        const { id, status, reason } = data;
        db.run(`UPDATE recharge_cards SET status = ?, status_reason = ? WHERE id = ?`, 
        [status, reason || null, id], function(err) {
            if (err) reject(err); else resolve({ success: true });
        });
    });
});

registerIpc('import-cards', async (event, cards) => {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(`INSERT OR IGNORE INTO recharge_cards (category, pin_code, value, serial_number, purchase_price) VALUES (?, ?, ?, ?, ?)`);
        
        let count = 0;
        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            cards.forEach(card => {
                stmt.run(card.category, card.pin_code, card.value, card.serial_number, card.purchase_price, function(err) {
                    if (!err && this.changes > 0) count++;
                });
            });
            stmt.finalize();
            db.run("COMMIT", (err) => {
                if (err) {
                    db.run("ROLLBACK");
                    reject(err);
                } else {
                    resolve({ success: true, count: count });
                }
            });
        });
    });
});

registerIpc('get-agents', async () => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM agents`, [], (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
});

registerIpc('send-broadcast', async (event, message) => {
    return new Promise((resolve) => {
        if (!botProcess) {
            return resolve({ success: false, message: 'البوت غير مشتغل حالياً' });
        }
        
        botProcess.send({ type: 'broadcast', message: message });
        
        const responseHandler = (msg) => {
            if (msg.type === 'broadcast-result') {
                botProcess.off('message', responseHandler);
                resolve(msg.result);
            }
        };
        botProcess.on('message', responseHandler);
    });
});

registerIpc('update-agent-balance', async (event, data) => {
    const { id, amount, type } = data;
    return new Promise((resolve, reject) => {
        let query = '';
        if (type === 'add') {
            query = `UPDATE agents SET balance = balance + ?, last_recharge_date = CURRENT_TIMESTAMP, status = 'active' WHERE id = ?`;
        } else if (type === 'remove') {
            query = `UPDATE agents SET balance = balance - ? WHERE id = ?`;
        } else {
            return resolve({ success: false, message: 'Invalid operation type' });
        }
        
        db.run(query, [amount, id], function(err) {
            if (err) return reject(err);
            
            // Fetch agent to get new balance and telegram_id
            db.get(`SELECT * FROM agents WHERE id = ?`, [id], (err, agent) => {
                if (agent && agent.telegram_id) {
                    let msg = '';
                    if (type === 'add') {
                        msg = `💰 إشعار: تم إضافة ${amount} دج إلى رصيدك من قبل الإدارة.\nرصيدك الجديد: ${agent.balance} دج`;
                    } else if (type === 'remove') {
                        msg = `📉 إشعار: تم خصم ${amount} دج من رصيدك من قبل الإدارة.\nرصيدك الجديد: ${agent.balance} دج`;
                    }
                    
                    if (msg) {
                        const { sendMessage } = require('./telegram_bot');
                        sendMessage(agent.telegram_id, msg).catch(console.error);
                    }
                }
                resolve({ success: true });
            });
        });
    });
});

registerIpc('add-agent', async (event, data) => {
    const { name, telegram_id, phone_number, email, wilaya, username, password, tier } = data;
    return new Promise((resolve) => {
        db.run(`INSERT INTO agents (name, telegram_id, phone_number, email, wilaya, username, password, tier, balance, is_admin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`, 
            [name, telegram_id, phone_number, email || null, wilaya || null, username || null, password || null, tier || 'detaillant'], 
            function(err) {
                if (err) {
                    resolve({ success: false, message: err.message });
                } else {
                    resolve({ success: true, id: this.lastID });
                }
            }
        );
    });
});

registerIpc('update-agent', async (event, data) => {
    const { id, name, telegram_id, phone_number, email, wilaya, username, password, tier } = data;
    return new Promise((resolve) => {
        // If password is provided, update it. If empty string, ignore updating password.
        let query = `UPDATE agents SET name = ?, telegram_id = ?, phone_number = ?, email = ?, wilaya = ?, username = ?, tier = ?`;
        let params = [name, telegram_id, phone_number, email || null, wilaya || null, username || null, tier || 'detaillant'];
        
        if (password && password.trim() !== '') {
            query += `, password = ?`;
            params.push(password);
        }
        query += ` WHERE id = ?`;
        params.push(id);

        db.run(query, params, function(err) {
                if (err) {
                    resolve({ success: false, message: err.message });
                } else {
                    resolve({ success: true });
                }
            }
        );
    });
});

registerIpc('update-agent-options', async (event, data) => {
    const { id, status, disabled_services, tier, role } = data;
    return new Promise((resolve) => {
        db.run(`UPDATE agents SET status = ?, disabled_services = ?, tier = ?, role = ? WHERE id = ?`, 
            [status || 'active', disabled_services || '', tier || 'detaillant', role || 'user', id], 
            function(err) {
                if (err) {
                    resolve({ success: false, message: err.message });
                } else {
                    resolve({ success: true });
                }
            }
        );
    });
});

registerIpc('delete-agent', async (event, id) => {
    return new Promise((resolve) => {
        db.run(`DELETE FROM agents WHERE id = ?`, [id], function(err) {
            if (err) {
                resolve({ success: false, message: err.message });
            } else {
                resolve({ success: true });
            }
        });
    });
});

// --- Products CRUD ---
registerIpc('get-products', async () => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM products ORDER BY operator, name`, [], (err, rows) => {
            if (err) reject(err); else resolve(rows || []);
        });
    });
});

registerIpc('add-product', async (event, product) => {
    return new Promise((resolve, reject) => {
        db.run(`INSERT INTO products (operator, name, base_price, margin_admin, margin_super_grossiste, margin_grossiste, margin_detaillant) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [product.operator, product.name, product.base_price || 0, product.margin_admin || 0, product.margin_super_grossiste || 0, product.margin_grossiste || 0, product.margin_detaillant || 0],
        function(err) {
            if (err) reject(err); else resolve({ success: true, id: this.lastID });
        });
    });
});

registerIpc('update-product', async (event, product) => {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE products SET operator = ?, name = ?, base_price = ?, margin_admin = ?, margin_super_grossiste = ?, margin_grossiste = ?, margin_detaillant = ? WHERE id = ?`,
        [product.operator, product.name, product.base_price || 0, product.margin_admin || 0, product.margin_super_grossiste || 0, product.margin_grossiste || 0, product.margin_detaillant || 0, product.id],
        function(err) {
            if (err) reject(err); else resolve({ success: true });
        });
    });
});

registerIpc('delete-product', async (event, id) => {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM products WHERE id = ?`, [id], function(err) {
            if (err) reject(err); else resolve({ success: true });
        });
    });
});


registerIpc('get-settings', async () => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM settings`, [], (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
});

registerIpc('save-settings', async (event, settingsArray) => {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`);
        settingsArray.forEach(s => stmt.run(s.key, s.value));
        stmt.finalize((err) => {
            if (err) reject(err);
            else {
                // Restart bot if token changed
                const tokenSetting = settingsArray.find(s => s.key === 'bot_token');
                const adminSetting = settingsArray.find(s => s.key === 'admin_secret');
                if (tokenSetting && tokenSetting.value) {
                    startBot(tokenSetting.value, adminSetting ? adminSetting.value : 'SUPERM123');
                }

                // Update automation server if captcha key changed
                const captchaSetting = settingsArray.find(s => s.key === 'captcha_api_key');
                if (captchaSetting && captchaSetting.value) {
                    const axios = require('axios');
                    axios.post('http://localhost:3000/update-api-key', { key: captchaSetting.value }).catch(console.error);
                }

                resolve({ success: true });
            }
        });
    });
});

registerIpc('get-logs', async () => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM bot_logs ORDER BY id DESC LIMIT 50`, [], (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
});

registerIpc('get-com-ports', async () => {
    const { SerialPort } = require('serialport');
    try {
        const ports = await SerialPort.list();
        return ports.map(p => `${p.path} (${p.manufacturer || 'Unknown Device'})`);
    } catch (e) {
        return [];
    }
});

registerIpc('auto-detect-sim', async (event, comPort) => {
    return modemService.probeModem(comPort);
});

registerIpc('delete-sim', async (event, simId) => {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM sim_cards WHERE id = ?`, [simId], function(err) {
            if (err) reject(err); else resolve({ success: true });
        });
    });
});

registerIpc('update-sim', async (event, sim) => {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE sim_cards SET operator = ?, number = ?, type = ?, address = ?, ussd_transfer_override = ?, ussd_balance_override = ?, transfer_method = ?, ahla_phone = ?, ahla_pin = ?, sim_pin = ?, margin_percent_1 = ?, margin_percent_2 = ?, min_balance = ? WHERE id = ?`, 
        [sim.operator, sim.number, sim.type, sim.address, sim.ussd_transfer_override, sim.ussd_balance_override, sim.transfer_method || 'USSD', sim.ahla_phone || '', sim.ahla_pin || '', sim.sim_pin || '', sim.margin_percent_1 || 0, sim.margin_percent_2 || 0, sim.min_balance || 0, sim.id], function(err) {
            if (err) reject(err);
            else {
                autoIsolateIpModems();
                resolve({ success: true });
            }
        });
    });
});

registerIpc('update-sim-transfer-override', async (event, { id, transferOverride }) => {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE sim_cards SET ussd_transfer_override = ? WHERE id = ?`, [transferOverride, id], function(err) {
            if (err) reject(err); else resolve({ success: true });
        });
    });
});

registerIpc('update-sim-pin-override', async (event, { id, pinOverride }) => {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE sim_cards SET sim_pin = ? WHERE id = ?`, [pinOverride, id], function(err) {
            if (err) reject(err); else resolve({ success: true });
        });
    });
});

registerIpc('update-sim-sort-order', async (event, { operator, isAsc }) => {
    return new Promise((resolve) => {
        db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [`sort_order_${operator}`, isAsc ? 'ASC' : 'DESC'], function(err) {
            resolve({ success: !err });
        });
    });
});

registerIpc('get-sim-sort-order', async () => {
    return new Promise(resolve => {
        db.all(`SELECT key, value FROM settings WHERE key LIKE 'sort_order_%'`, [], (err, rows) => {
            const result = {};
            if (rows) rows.forEach(r => result[r.key] = r.value);
            resolve(result);
        });
    });
});

registerIpc('toggle-sim-status', async (event, { id, status }) => {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE sim_cards SET status = ? WHERE id = ?`, [status, id], function(err) {
            if (err) reject(err); else resolve({ success: true });
        });
    });
});
registerIpc('update-transfer-type', async (event, { simId, value }) => {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE sim_cards SET transfer_type = ? WHERE id = ?`, [value, simId], function(err) {
            if (err) reject(err); else resolve({ success: true });
        });
    });
});

async function executeCheckBalance(simId) {
    try {
        const sim = await new Promise((resolve, reject) => {
            db.get(`SELECT * FROM sim_cards WHERE id = ?`, [simId], (err, row) => err ? reject(err) : resolve(row));
        });
        if (!sim) return { success: false, message: "SIM not found" };

        if (sim.operator === 'Ooredoo' && sim.transfer_method === 'Ahla App') {
            const ooredooAhlaService = require('./ooredoo_ahla_service');
            db.run(`INSERT INTO transactions (agent_id, sim_id, type, amount, status) VALUES (0, ?, 'BALANCE', 0, 'PENDING...')`, [simId]);
            if (mainWindow) mainWindow.webContents.send('sims-updated');

            const result = await ooredooAhlaService.checkBalance(sim);
            if (result.success) {
                const statusMsg = (result.balance && result.balance !== '0.00' && result.balance !== 'شاهد الشاشة المباشرة') ? `SUCCESS: ${result.balance} DA` : `SUCCESS: شاهد الشاشة المباشرة`;
                db.run(`UPDATE transactions SET status = ? 
                       WHERE id = (
                           SELECT id FROM transactions 
                           WHERE sim_id = ? AND type = 'BALANCE' AND status LIKE 'PENDING%'
                           ORDER BY timestamp DESC LIMIT 1
                       )`, [statusMsg, simId]);
            } else {
                db.run(`UPDATE transactions SET status = ? 
                       WHERE id = (
                           SELECT id FROM transactions 
                           WHERE sim_id = ? AND type = 'BALANCE' AND status LIKE 'PENDING%'
                           ORDER BY timestamp DESC LIMIT 1
                       )`, ['FAILED: ' + (result.message || 'Unknown error'), simId]);
            }
            if (mainWindow) mainWindow.webContents.send('sims-updated');
            return result;
        }

        let ussdCode = sim.ussd_balance_override;
        if (!ussdCode) {
            const codeKey = `ussd_${sim.operator.toLowerCase()}_balance`;
            const setting = await new Promise((res) => db.get(`SELECT value FROM settings WHERE key = ?`, [codeKey], (err, row) => res(row)));
            ussdCode = setting ? setting.value : null;
        }

        if (!ussdCode) return { success: false, message: "USSD code not configured" };

        // Log the check as PENDING immediately for UI feedback
        db.run(`INSERT INTO transactions (agent_id, sim_id, type, amount, status) VALUES (0, ?, 'BALANCE', 0, 'PENDING...')`, [simId]);
        if (mainWindow) mainWindow.webContents.send('sims-updated');

        // Removed Signal check and 2-second wait here to make balance checking instantaneous.
        // The background loop (checkAllSims) already updates the signal every 60 seconds.

        // Step 2: Execute USSD
        const result = await modemService.sendUssdCommand(sim.address, ussdCode, sim.operator);
        
        if (result.success && result.content) {
            let balance = sim.balance;
            const content = result.content;
            
            // Parsing Logic
            if (content.includes('GTS est') || content.includes('Votre Balance:') || content.includes('POSTE est') || content.includes('ASSILOU est')) {
                // Mobilis multi-balance parsing
                const balances = {};
                const posteMatch = content.match(/POSTE est\s*:\s*([\d.]+)/i);
                const assilouMatch = content.match(/ASSILOU est\s*:\s*([\d.]+)/i);
                const dataMatch = content.match(/DATA est\s*:\s*([\d.]+)/i);
                const gtsMatch = content.match(/GTS est\s*:\s*([\d.]+)/i);
                const mobilisMatch = content.match(/MOBILIS est\s*:\s*([\d.]+)/i);
                
                if (posteMatch) balances.poste = posteMatch[1];
                if (assilouMatch) balances.assilou = assilouMatch[1];
                if (dataMatch) balances.data = dataMatch[1];
                if (gtsMatch) balances.gts = gtsMatch[1];
                if (mobilisMatch) balances.mobilis = mobilisMatch[1];
                
                if (Object.keys(balances).length > 0) {
                    balance = JSON.stringify(balances);
                }
            } else {
                // Standard balance match (Ooredoo, Djezzy, generic)
                // Patterns matched:
                // - VOTRE SOLDE EST 36.00 DA
                // - Votre credit Storm-Credit est 450.00 DA
                // - Solde: 450.00
                const stormMatch = content.match(/Votre credit Storm-Credit est\s*([\d.]+)/i);
                const soldeEstMatch = content.match(/SOLDE\s*(?:EST)?\s*[:\s]*([\d.,]+)/i);
                const genericMatch = content.match(/(?:credit|solde|balance|sama)\s*(?:est)?\s*[:\s]*([\d.,]+)/i);
                
                if (stormMatch) {
                    balance = stormMatch[1];
                } else if (soldeEstMatch) {
                    balance = soldeEstMatch[1].replace(/,/g, '');
                } else if (genericMatch) {
                    balance = genericMatch[1].replace(/,/g, '');
                }
            }
            
            // Update Balance in DB
            db.run(`UPDATE sim_cards SET balance = ? WHERE id = ?`, [balance, simId]);
            
            // Format dynamic status balance based on transfer type for Mobilis
            let displayBalance = balance;
            if (sim.operator.toLowerCase() === 'mobilis') {
                try {
                    const parsed = JSON.parse(balance);
                    const typeMap = {
                        '04': parsed.gts || '0.00',
                        '01': parsed.poste || '0.00',
                        '02': parsed.assilou || '0.00',
                        '03': parsed.data || '0.00',
                        '05': parsed.mobilis || '0.00'
                    };
                    displayBalance = typeMap[sim.transfer_type] || parsed.gts || '0.00';
                } catch(e) {
                    // Fallback
                }
            }
            
            // Update the latest PENDING balance log for this SIM
            db.run(`UPDATE transactions SET status = ? 
                   WHERE id = (
                       SELECT id FROM transactions 
                       WHERE sim_id = ? AND type = 'BALANCE' AND status LIKE 'PENDING%'
                       ORDER BY timestamp DESC LIMIT 1
                   )`, [`SUCCESS: ${displayBalance} DA`, simId]);
        } else {
            // Update last log as FAILED
            db.run(`UPDATE transactions SET status = ? 
                   WHERE id = (
                       SELECT id FROM transactions 
                       WHERE sim_id = ? AND type = 'BALANCE' AND status LIKE 'PENDING%'
                       ORDER BY timestamp DESC LIMIT 1
                   )`, ['FAILED: ' + (result.message || 'Unknown error'), simId]);
        }
        
        if (mainWindow) mainWindow.webContents.send('sims-updated');
        return result;
    } catch (e) {
        return { success: false, message: e.message };
    }
}

registerIpc('check-balance', async (event, simId) => {
    return executeCheckBalance(simId);
});

registerIpc('test-ahla-connection', async (event, simId) => {
    try {
        const ooredooAhlaService = require('./ooredoo_ahla_service');
        const sim = await new Promise((resolve) => {
            db.get(`SELECT * FROM sim_cards WHERE id = ?`, [simId], (err, row) => resolve(row));
        });
        if (!sim) throw new Error('الشريحة غير موجودة');
        return await ooredooAhlaService.testConnection(sim);
    } catch (e) {
        return { success: false, status: 'error', message: `خطأ تحميل الخدمة: ${e.message}` };
    }
});

registerIpc('execute-raw-ussd', async (event, { ip, code }) => {
    return modemService.sendUssdCommand(ip, code, 'HiLink');
});

registerIpc('send-ip-sms', async (event, { ip, recipient, text }) => {
    const cleanIp = ip.replace(/^https?:\/\//, '').split('/')[0];
    return modemService.sendSmsHiLink(cleanIp, recipient, text);
});

registerIpc('get-ip-sms-list', async (event, { ip }) => {
    const cleanIp = ip.replace(/^https?:\/\//, '').split('/')[0];
    return modemService.getSmsListHiLink(cleanIp);
});

registerIpc('dial-number', async (event, { ip, number }) => {
    const cleanIp = ip.replace(/^https?:\/\//, '').split('/')[0];
    return modemService.dialNumber(cleanIp, number);
});

registerIpc('check-hilink-connection', async (event, { ip }) => {
    const cleanIp = ip.replace(/^https?:\/\//, '').split('/')[0];
    return modemService.probeModem(cleanIp);
});

registerIpc('change-modem-ip', async (event, { oldIp, newIp }) => {
    return modemService.changeHiLinkIp(oldIp, newIp);
});

registerIpc('hangup-call', async (event, { ip }) => {
    const cleanIp = ip.replace(/^https?:\/\//, '').split('/')[0];
    return modemService.hangupCall(cleanIp);
});

registerIpc('fix-modem-routing', async (event, { simId, address }) => {
    return new Promise((resolve) => {
        try {
            console.log(`[Routing Fix] Starting routing fix for modem IP: ${address}`);
            const cleanIp = address.replace(/^https?:\/\//, '').split('/')[0];
            const isIp = cleanIp.match(/^\d+\.\d+\.\d+\.\d+$/);
            
            if (!isIp) {
                return resolve({ success: false, message: "هذا الخيار متاح فقط لمودمات HiLink التي تعمل بـ IP!" });
            }

            const { exec } = require('child_process');

            // Find the subnet (e.g. 192.168.8.x -> 192.168.8.*)
            const parts = cleanIp.split('.');
            const subnet = `${parts[0]}.${parts[1]}.${parts[2]}.*`;

            // Complete robust PowerShell script to:
            // 1. Set interface metric to 500 persistently (stops Windows from routing internet traffic to it)
            // 2. Immediately delete the default gateway route for this modem IP
            const psScript = `
                $ip = "${cleanIp}"
                $subnet = "${subnet}"
                
                # 1. Find adapter matching the subnet and set metric to 500
                $adapters = Get-NetIPAddress | Where-Object { $_.IPAddress -like $subnet }
                if ($adapters) {
                    foreach ($a in $adapters) {
                        Get-NetIPInterface -InterfaceIndex $a.InterfaceIndex | Set-NetIPInterface -InterfaceMetric 500
                    }
                }
                
                # 2. Delete the active default gateway route going through this modem
                route delete 0.0.0.0 $ip
                
                # 3. Add static routes for Mobilis Meetmob portal and network ranges to go through this modem gateway
                $meetmobIp = "197.202.164.2"
                try {
                    $resolved = [System.Net.Dns]::GetHostAddresses("meetmob.mobilis.dz")
                    if ($resolved) {
                        $meetmobIp = $resolved[0].IPAddressToString
                    }
                } catch {}
                
                route add $meetmobIp mask 255.255.255.255 $ip metric 1
                route add 197.202.0.0 mask 255.255.0.0 $ip metric 1
                route add 197.200.0.0 mask 255.255.0.0 $ip metric 1
                route add 10.0.0.0 mask 255.0.0.0 $ip metric 1
            `;

            // Run command via elevated PowerShell (triggers UAC prompt)
            const encodedScript = Buffer.from(psScript, 'utf16le').toString('base64');
            const command = `powershell -NoProfile -Command "try { Start-Process powershell -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList '-NoProfile -WindowStyle Hidden -EncodedCommand ${encodedScript}' } catch { exit 1 }"`;

            exec(command, (err, stdout, stderr) => {
                if (err) {
                    console.error('[Routing Fix] Elevated execution failed or denied:', stderr || err.message);
                    resolve({ 
                        success: false, 
                        message: "فشل عزل المودم: يجب الموافقة على نافذة الصلاحيات (UAC) التي تظهر من نظام Windows لمنح صلاحيات المسؤول المطلوبة لتعديل مسار الشبكة!" 
                    });
                } else {
                    console.log('[Routing Fix] Elevated execution succeeded');
                    resolve({ 
                        success: true, 
                        message: "تم عزل شبكة المودم وتعديل الأولوية بنجاح! لن يقوم هذا المودم بقطع إنترنت الكمبيوتر نهائياً بعد الآن، وسيعمل مع السيرفر فقط." 
                    });
                }
            });

        } catch (e) {
            resolve({ success: false, message: e.message });
        }
    });
});

registerIpc('get-agent-journal-list', async () => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT id, name, telegram_id, balance, 
               (SELECT SUM(amount) FROM transactions WHERE agent_id = agents.id AND status LIKE 'SUCCESS%') as total_sales
               FROM agents ORDER BY name ASC`, [], (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
});

registerIpc('get-agent-transactions', async (event, { agentId, period }) => {
    let dateFilter = "";
    if (period === 'today') dateFilter = "AND date(timestamp) = date('now')";
    else if (period === 'month') dateFilter = "AND strftime('%m', timestamp) = strftime('%m', 'now')";

    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM transactions WHERE agent_id = ? ${dateFilter} ORDER BY timestamp DESC`, [agentId], (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
});

registerIpc('get-server-transactions', async (event, { simId, period }) => {
    let filters = ["t.type != 'BALANCE'"];
    if (simId !== 'all') filters.push(`t.sim_id = ${simId}`);
    if (period === 'today') filters.push("date(t.timestamp) = date('now')");
    else if (period === 'month') filters.push("strftime('%m', t.timestamp) = strftime('%m', 'now')");

    const filterStr = filters.length > 0 ? "WHERE " + filters.join(" AND ") : "";

    return new Promise((resolve, reject) => {
        db.all(`SELECT t.*, s.number as sim_number FROM transactions t 
               LEFT JOIN sim_cards s ON t.sim_id = s.id 
               ${filterStr} ORDER BY t.timestamp DESC`, [], (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
});

registerIpc('get-sim-transactions', async (event, simId) => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT amount, status, timestamp, type FROM transactions 
               WHERE sim_id = ? AND type IN ('FLEXY', 'BALANCE') 
               ORDER BY timestamp DESC LIMIT 8`, [simId], (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
});

registerIpc('get-sim-offers', async () => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM sim_offers ORDER BY operator ASC, price ASC`, [], (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
});

registerIpc('add-sim-offer', async (event, offer) => {
    return new Promise((resolve, reject) => {
        db.get(`SELECT id FROM sim_offers WHERE operator = ? AND (ussd_code = ? OR name = ?)`, 
        [offer.operator, offer.ussd_code, offer.name], (err, row) => {
            if (err) return reject(err);
            if (row) {
                return resolve({ success: false, message: 'هذا العرض موجود بالفعل (نفس الرمز أو الاسم) لدى هذا المتعامل!' });
            }
            db.run(`INSERT INTO sim_offers (operator, name, ussd_code, price, description) VALUES (?, ?, ?, ?, ?)`,
            [offer.operator, offer.name, offer.ussd_code, offer.price, offer.description || ''], function(err) {
                if (err) reject(err); else resolve({ success: true, id: this.lastID });
            });
        });
    });
});

registerIpc('update-sim-offer', async (event, offer) => {
    return new Promise((resolve, reject) => {
        db.get(`SELECT id FROM sim_offers WHERE operator = ? AND (ussd_code = ? OR name = ?) AND id != ?`,
        [offer.operator, offer.ussd_code, offer.name, offer.id], (err, row) => {
            if (err) return reject(err);
            if (row) {
                return resolve({ success: false, message: 'توجد باقة أخرى بنفس الرمز أو الاسم مسجلة بالفعل!' });
            }
            db.run(`UPDATE sim_offers SET operator = ?, name = ?, ussd_code = ?, price = ?, description = ? WHERE id = ?`,
            [offer.operator, offer.name, offer.ussd_code, offer.price, offer.description || '', offer.id], function(err) {
                if (err) reject(err); else resolve({ success: true });
            });
        });
    });
});

registerIpc('delete-sim-offer', async (event, offerId) => {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM sim_offers WHERE id = ?`, [offerId], function(err) {
            if (err) reject(err); else resolve({ success: true });
        });
    });
});

// Start the 5-minute automatic balance checker scheduler
function startScheduledBalanceChecker() {
    const doCheck = async () => {
        try {
            console.log('[Scheduler] Executing periodic automatic balance check for active SIMs...');
            db.all(`SELECT id, operator, address, balance FROM sim_cards WHERE status = 'active'`, [], async (err, sims) => {
                if (err || !sims || sims.length === 0) return;
                
                const { sendMessage } = require('./telegram_bot');
                
                // Run sequentially to avoid port collision
                for (const sim of sims) {
                    console.log(`[Scheduler] Auto-checking balance for SIM ID: ${sim.id}`);
                    
                    // Get latest balance right before check
                    const oldSim = await new Promise(r => db.get('SELECT balance FROM sim_cards WHERE id = ?', [sim.id], (e, row) => r(row)));
                    const oldBalance = oldSim ? (oldSim.balance || '0') : '0';
                    
                    await executeCheckBalance(sim.id);
                    
                    // Wait a moment for DB update to finish
                    await new Promise(r => setTimeout(r, 1000));
                    
                    const newSim = await new Promise(r => db.get('SELECT balance FROM sim_cards WHERE id = ?', [sim.id], (e, row) => r(row)));
                    const newBalance = newSim ? (newSim.balance || '0') : '0';
                    
                    const oldFloat = parseFloat(oldBalance.replace(/[^\d.]/g, '')) || 0;
                    const newFloat = parseFloat(newBalance.replace(/[^\d.]/g, '')) || 0;
                    
                    // If balance changed, notify admins
                    if (Math.abs(oldFloat - newFloat) > 0.1) {
                        db.all(`SELECT telegram_id FROM agents WHERE is_admin = 1`, [], (err, admins) => {
                            if (admins) {
                                admins.forEach(admin => {
                                    sendMessage(admin.telegram_id, `⚠️ **تنبيه تغير الرصيد تلقائياً**\n\nشريحة: ${sim.operator} (${sim.address})\nالرصيد القديم: ${oldBalance} دج\nالرصيد الجديد: ${newBalance} دج`).catch(()=>null);
                                });
                            }
                        });
                    }
                    
                    // Add 15 seconds gap between each check
                    await new Promise(r => setTimeout(r, 15000));
                }
            });
        } catch (e) {
            console.error('[Scheduler] Error in automatic balance checker:', e);
        }
    };

    // Run once on startup (wait 15 seconds for systems to initialize)
    setTimeout(doCheck, 15000);

    // Run every 5 minutes (300000 ms)
    setInterval(doCheck, 300000);
}

// Automatically check and isolate all active IP modems persistently
function autoIsolateIpModems() {
    db.all(`SELECT address FROM sim_cards WHERE status = 'active'`, [], async (err, rows) => {
        if (err || !rows) return;
        
        const ipAddresses = rows
            .map(r => r.address.replace(/^https?:\/\//, '').split('/')[0])
            .filter(addr => addr.match(/^\d+\.\d+\.\d+\.\d+$/) && addr !== '192.168.1.1' && addr !== '192.168.0.1');
            
        if (ipAddresses.length === 0) return;
        
        console.log(`[Auto Isolate] Checking active IP modems:`, ipAddresses);
        
        const { exec } = require('child_process');
        
        for (const ip of ipAddresses) {
            const parts = ip.split('.');
            const subnet = `${parts[0]}.${parts[1]}.${parts[2]}.*`;
            
            // Check if already isolated (InterfaceMetric = 500)
            const checkCmd = `powershell -NoProfile -Command "Get-NetIPAddress | Where-Object { $_.IPAddress -like '${subnet}' } | ForEach-Object { Get-NetIPInterface -InterfaceIndex $_.InterfaceIndex } | Where-Object { $_.InterfaceMetric -eq 500 }"`;
            
            exec(checkCmd, (errCheck, stdoutCheck) => {
                if (stdoutCheck && stdoutCheck.trim()) {
                    console.log(`[Auto Isolate] Modem at ${ip} is already persistently isolated (InterfaceMetric=500).`);
                } else {
                    console.log(`[Auto Isolate] Modem at ${ip} is NOT isolated yet. Requesting UAC elevation...`);
                    
                    const psScript = `
                        $ip = "${ip}"
                        $subnet = "${subnet}"
                        $adapters = Get-NetIPAddress | Where-Object { $_.IPAddress -like $subnet }
                        if ($adapters) {
                            foreach ($a in $adapters) {
                                Get-NetIPInterface -InterfaceIndex $a.InterfaceIndex | Set-NetIPInterface -InterfaceMetric 500
                            }
                        }
                        route delete 0.0.0.0 $ip
                    `;
                    
                    const encodedScript = Buffer.from(psScript, 'utf16le').toString('base64');
                    const elevateCmd = `powershell -NoProfile -Command "try { Start-Process powershell -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList '-NoProfile -WindowStyle Hidden -EncodedCommand ${encodedScript}' } catch { exit 1 }"`;
                    
                    exec(elevateCmd, (errElevate) => {
                        if (errElevate) {
                            console.error(`[Auto Isolate] User denied UAC or failed to isolate ${ip}`);
                        } else {
                            console.log(`[Auto Isolate] Successfully isolated ${ip} persistently.`);
                        }
                    });
                }
            });
        }
    });
}

// Data Management IPC Handlers
registerIpc('wipe-data', async (event, { adminPass }) => {
    return new Promise((resolve, reject) => {
        db.get("SELECT value FROM settings WHERE key = 'admin_secret'", [], (err, row) => {
            if (err) return reject(err);
            if (!row || row.value !== adminPass) {
                return resolve({ success: false, message: 'كلمة مرور الإدارة غير صحيحة.' });
            }
            
            // Password correct, proceed to wipe data
            db.serialize(() => {
                db.run("DELETE FROM agents", []);
                db.run("DELETE FROM recharge_cards", []);
                db.run("DELETE FROM transactions", []);
                db.run("DELETE FROM bot_logs", []);
                // Keep settings and sim_cards untouched
                resolve({ success: true });
            });
        });
    });
});

registerIpc('trigger-backup', async (event) => {
    try {
        await sendBackupToAdmin();
        return { success: true };
    } catch (e) {
        return { success: false, message: e.message };
    }
});

registerIpc('get-recent-idoom', async (event) => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT t.*, a.name as agentName FROM transactions t LEFT JOIN agents a ON t.agent_id = a.id WHERE t.type = 'AUTOFILL' AND t.operator LIKE 'Idoom%' ORDER BY t.id DESC LIMIT 50`, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

registerIpc('restore-data', async (event, data) => {
    return new Promise((resolve, reject) => {
        if (!data || !Array.isArray(data.agents)) return resolve({ success: false, message: 'ملف غير صالح.' });
        
        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            
            // Wipe current data
            db.run("DELETE FROM agents");
            db.run("DELETE FROM recharge_cards");
            db.run("DELETE FROM transactions");
            
            // Restore Agents
            const stmtAgent = db.prepare(`INSERT INTO agents (id, telegram_id, name, phone_number, is_admin, balance) VALUES (?, ?, ?, ?, ?, ?)`);
            data.agents.forEach(a => stmtAgent.run(a.id, a.telegram_id, a.name, a.phone_number, a.is_admin, a.balance));
            stmtAgent.finalize();
            
            // Restore Cards
            const stmtCard = db.prepare(`INSERT INTO recharge_cards (id, category, pin_code, value, serial_number, purchase_price, status, status_reason, sold_to, sold_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            if (data.recharge_cards) {
                data.recharge_cards.forEach(c => stmtCard.run(c.id, c.category, c.pin_code, c.value, c.serial_number, c.purchase_price, c.status, c.status_reason, c.sold_to, c.sold_at));
            }
            stmtCard.finalize();
            
            // Restore Transactions
            const stmtTx = db.prepare(`INSERT INTO transactions (id, agent_id, phone_number, amount, operator, type, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
            if (data.transactions) {
                data.transactions.forEach(t => stmtTx.run(t.id, t.agent_id, t.phone_number, t.amount, t.operator, t.type, t.status, t.timestamp));
            }
            stmtTx.finalize();
            
            db.run("COMMIT", (err) => {
                if (err) return resolve({ success: false, message: err.message });
                resolve({ success: true });
            });
        });
    });
});
