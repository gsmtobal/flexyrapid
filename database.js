const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');
const fs = require('fs');

let dbPath;
// If running in a packaged Electron app, store the SQLite database in AppData
if (process.resourcesPath || __dirname.includes('app.asar')) {
    const appDataDir = path.join(os.homedir(), 'AppData', 'Roaming', 'tobal-flexy-desktop');
    if (!fs.existsSync(appDataDir)) {
        fs.mkdirSync(appDataDir, { recursive: true });
    }
    dbPath = path.join(appDataDir, 'superm_clone.db');
    console.log(`[DB] Packaged mode active. Database path: ${dbPath}`);
} else {
    // Development mode: keep using the local directory
    dbPath = path.resolve(__dirname, 'superm_clone.db');
    console.log(`[DB] Development mode active. Database path: ${dbPath}`);
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('[DB] Error opening database', err.message);
    } else {
        console.log('[DB] Connected to SQLite database.');
        // Initialize tables
        db.run(`CREATE TABLE IF NOT EXISTS agents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id TEXT UNIQUE,
            name TEXT,
            phone_number TEXT,
            balance REAL DEFAULT 0,
            is_admin BOOLEAN DEFAULT 0
        )`);

        // Migrations for agents
        db.run(`ALTER TABLE agents ADD COLUMN phone_number TEXT`, (err) => {});
        db.run(`ALTER TABLE agents ADD COLUMN email TEXT`, (err) => {});
        db.run(`ALTER TABLE agents ADD COLUMN wilaya TEXT`, (err) => {});
        db.run(`ALTER TABLE agents ADD COLUMN username TEXT`, (err) => { if(err) console.log(err.message) });
        db.run(`ALTER TABLE agents ADD COLUMN password TEXT`, (err) => { if(err) console.log(err.message) });

        db.run(`CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id INTEGER,
            phone_number TEXT,
            amount REAL,
            operator TEXT,
            type TEXT,
            sim_id INTEGER,
            balance_before REAL,
            balance_after REAL,
            status TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(agent_id) REFERENCES agents(id)
        )`);

        // Migrations for transactions
        db.run(`ALTER TABLE transactions ADD COLUMN operator TEXT`, (err) => {});
        db.run(`ALTER TABLE transactions ADD COLUMN type TEXT`, (err) => {});
        db.run(`ALTER TABLE transactions ADD COLUMN sim_id INTEGER`, (err) => {});
        db.run(`ALTER TABLE transactions ADD COLUMN balance_before REAL`, (err) => {});
        db.run(`ALTER TABLE transactions ADD COLUMN balance_after REAL`, (err) => {});

        db.run(`CREATE TABLE IF NOT EXISTS sim_cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            operator TEXT,
            number TEXT,
            type TEXT,
            address TEXT,
            balance TEXT DEFAULT '0',
            status TEXT DEFAULT 'active',
            ussd_transfer_override TEXT,
            ussd_balance_override TEXT,
            signal INTEGER DEFAULT 0,
            transfer_type TEXT DEFAULT '04'
        )`);
        
        db.run(`ALTER TABLE sim_cards ADD COLUMN ussd_transfer_override TEXT`, (err) => {});
        db.run(`ALTER TABLE sim_cards ADD COLUMN ussd_balance_override TEXT`, (err) => {});
        db.run(`ALTER TABLE sim_cards ADD COLUMN signal INTEGER DEFAULT 0`, (err) => {});
        db.run(`ALTER TABLE sim_cards ADD COLUMN transfer_type TEXT DEFAULT '04'`, (err) => {});
        db.run(`ALTER TABLE sim_cards ADD COLUMN transfer_method TEXT DEFAULT 'USSD'`, (err) => {});
        db.run(`ALTER TABLE sim_cards ADD COLUMN ahla_phone TEXT`, (err) => {});
        db.run(`ALTER TABLE sim_cards ADD COLUMN sim_pin TEXT`, (err) => {});
        db.run(`ALTER TABLE sim_cards ADD COLUMN ahla_pin TEXT`, (err) => {});
        db.run(`ALTER TABLE sim_cards ADD COLUMN margin_percent_1 REAL DEFAULT 0`, (err) => {});
        db.run(`ALTER TABLE sim_cards ADD COLUMN margin_percent_2 REAL DEFAULT 0`, (err) => {});
        db.run(`ALTER TABLE sim_cards ADD COLUMN min_balance REAL DEFAULT 0`, (err) => {});

        // Products table for operator pricing tiers
        db.run(`CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            operator TEXT,
            name TEXT,
            base_price REAL DEFAULT 0,
            margin_admin REAL DEFAULT 0,
            margin_super_grossiste REAL DEFAULT 0,
            margin_grossiste REAL DEFAULT 0,
            margin_detaillant REAL DEFAULT 0
        )`);

        // Agent tier migration
        db.run(`ALTER TABLE agents ADD COLUMN tier TEXT DEFAULT 'detaillant'`, (err) => {});

        // Agent advanced management migrations
        db.run(`ALTER TABLE agents ADD COLUMN status TEXT DEFAULT 'active'`, (err) => {});
        db.run(`ALTER TABLE agents ADD COLUMN disabled_services TEXT DEFAULT ''`, (err) => {});
        db.run(`ALTER TABLE agents ADD COLUMN role TEXT DEFAULT 'user'`, (err) => {});
        db.run(`ALTER TABLE agents ADD COLUMN parent_id INTEGER NULL`, (err) => {});
        db.run(`ALTER TABLE agents ADD COLUMN last_recharge_date DATETIME DEFAULT CURRENT_TIMESTAMP`, (err) => {});
        db.run(`ALTER TABLE agents ADD COLUMN bonus_carte REAL DEFAULT 0`, (err) => {});
        db.run(`ALTER TABLE agents ADD COLUMN mobilis_balance REAL DEFAULT 0`, (err) => {});
        db.run(`ALTER TABLE agents ADD COLUMN ooredoo_balance REAL DEFAULT 0`, (err) => {});
        db.run(`ALTER TABLE agents ADD COLUMN credit_balance REAL DEFAULT 0`, (err) => {});

        db.run(`CREATE TABLE IF NOT EXISTS recharge_cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT,
            pin_code TEXT UNIQUE,
            value REAL,
            serial_number TEXT,
            purchase_price REAL,
            status TEXT DEFAULT 'available',
            sold_to INTEGER NULL,
            sold_at DATETIME NULL,
            FOREIGN KEY(sold_to) REFERENCES agents(id)
        )`);

        // Migrations for recharge_cards
        db.run(`ALTER TABLE recharge_cards ADD COLUMN serial_number TEXT`, (err) => {});
        db.run(`ALTER TABLE recharge_cards ADD COLUMN purchase_price REAL`, (err) => {});
        db.run(`ALTER TABLE recharge_cards ADD COLUMN status_reason TEXT`, (err) => {});

        db.run(`CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS sim_offers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            operator TEXT,
            name TEXT,
            ussd_code TEXT,
            price REAL
        )`);

        // Migrations for sim_offers
        db.run(`ALTER TABLE sim_offers ADD COLUMN description TEXT`, (err) => {});

        db.run(`CREATE TABLE IF NOT EXISTS bot_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            user_name TEXT,
            message TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS phone_offers_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT,
            operator TEXT,
            choice_path TEXT,
            label TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        const defaultSettings = [
            { key: 'bot_token', value: '' },
            { key: 'admin_secret', value: 'SUPERM123' },
            { key: 'captcha_api_key', value: 'c524ac5fde2b1a1b3f5f2c1707639e85' },
            { key: 'ussd_mobilis_transfer', value: '*630*{phone}*{type}*{amount}*0000#' },
            { key: 'ussd_mobilis_balance', value: '*222#' },
            { key: 'ussd_djezzy_transfer', value: '*760*{phone}*{amount}*00000#' },
            { key: 'ussd_djezzy_balance', value: '*766#' },
            { key: 'ussd_ooredoo_transfer', value: '*115*{phone}*{amount}*0000#' },
            { key: 'ussd_ooredoo_balance', value: '*200*0000#' },
            { key: 'ussd_pix_balance', value: '*222#' },
            { key: 'meetmob_phone', value: '' },
            { key: 'meetmob_pin', value: '' },
            { key: 'meetmob_modem', value: '192.168.8.1' },
            { key: 'meetmob_idoom_sync_code', value: 'TOBAL_SYNC_123' },
            { key: 'ooredoo_ahla_adb_path', value: 'adb' },
            { key: 'ooredoo_ahla_phone', value: '' },
            { key: 'ooredoo_ahla_pin', value: '' },
            { key: 'ooredoo_sim_pin', value: '0000' },
            { key: 'auto_suspend_days', value: '0' }
        ];

        defaultSettings.forEach(s => {
            db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, [s.key, s.value]);
        });

        // Ensure Ooredoo Ahla PIN has a default value if empty
        db.run("UPDATE settings SET value = '7840' WHERE key = 'ooredoo_ahla_pin' AND (value = '' OR value IS NULL OR value = '0000')");
        // Ensure Ooredoo SIM PIN has a default value if empty
        db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('ooredoo_sim_pin', '0000')");
        db.run("UPDATE settings SET value = '0000' WHERE key = 'ooredoo_sim_pin' AND (value = '' OR value IS NULL)");

        // Seed Default SIM Offers if not exists
        db.get(`SELECT COUNT(*) as count FROM sim_offers`, [], (err, row) => {
            if (!err && row && row.count === 0) {
                const defaultOffers = [
                    { operator: 'Mobilis', name: 'Pix 1000', ussd_code: '*600*1#', price: 1000 },
                    { operator: 'Mobilis', name: 'Pix 2000', ussd_code: '*600*2#', price: 2000 },
                    { operator: 'Djezzy', name: 'Hayla 1000', ussd_code: '*720*1000#', price: 1000 },
                    { operator: 'Djezzy', name: 'Hayla 2000', ussd_code: '*720*2000#', price: 2000 },
                    { operator: 'Ooredoo', name: 'Gold 1000', ussd_code: '*151*1000#', price: 1000 },
                    { operator: 'Ooredoo', name: 'Gold 2000', ussd_code: '*151*2000#', price: 2000 }
                ];
                defaultOffers.forEach(o => {
                    db.run(`INSERT INTO sim_offers (operator, name, ussd_code, price) VALUES (?, ?, ?, ?)`, [o.operator, o.name, o.ussd_code, o.price]);
                });
            }
        });
    }
});

// Database Diagnostic Logger
setTimeout(() => {
    const diagFile = 'c:\\Users\\wahab phone\\Desktop\\server sit web\\db_diagnostic.txt';
    let diagContent = `=== DATABASE DIAGNOSTIC LOG ===\nDate: ${new Date().toISOString()}\nDatabase Path: ${dbPath}\n\n`;
    
    db.all("SELECT * FROM settings", [], (err, settingsRows) => {
        if (err) {
            diagContent += `Error querying settings: ${err.message}\n`;
        } else {
            diagContent += `--- Settings Table ---\n`;
            settingsRows.forEach(r => {
                diagContent += `[${r.key}] = "${r.value}"\n`;
            });
        }
        
        db.all("SELECT * FROM sim_cards", [], (err, simRows) => {
            if (err) {
                diagContent += `\nError querying sim_cards: ${err.message}\n`;
            } else {
                diagContent += `\n--- SIM Cards Table ---\n`;
                simRows.forEach(r => {
                    diagContent += `ID: ${r.id} | Op: ${r.operator} | Num: ${r.number} | Method: ${r.transfer_method} | Status: ${r.status} | Addr: ${r.address}\n`;
                });
            }
            
            try {
                fs.writeFileSync(diagFile, diagContent, 'utf8');
                console.log(`[Diagnostic] Successfully wrote DB status to ${diagFile}`);
            } catch (e) {
                console.error(`[Diagnostic] Failed to write diag file:`, e);
            }
        });
    });
}, 2000);

module.exports = db;
