const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const crypto = require('crypto');
const fs = require('fs');

const originalFetch = globalThis.fetch;
const fetch = async function(resource, options = {}) {
    const timeout = options.timeout || 2000;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    
    const cleanOptions = { ...options };
    delete cleanOptions.timeout;
    cleanOptions.signal = controller.signal;
    
    try {
        const response = await originalFetch(resource, cleanOptions);
        clearTimeout(id);
        return response;
    } catch (err) {
        clearTimeout(id);
        throw err;
    }
};

const processedHiLinkSms = new Set();
const serverStartupTime = Date.now();
const hiLinkSessions = new Map();

function decodeHtmlEntities(text) {
    if (!text) return "";
    return text
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'");
}

class ModemService {
    constructor(config) {
        this.config = config;
        this.config.port = config.port || config.ip; 
        this.key = this.config.port || 'unknown';
        
        this.data = {
            key: this.key,
            port: this.config.port,
            operator: config.operator || 'Unknown',
            online: false,
            signal: 0,
            simStatus: 'Checking...',
            networkType: '---',
            balance: '0.00',
            lastUpdate: Date.now()
        };
        this.ussdInProgress = false;
        
        if (this.config.port) {
            this.initSerial();
        }
    }

    initSerial() {
        try {
            this.port = new SerialPort({ path: this.config.port, baudRate: 115200, autoOpen: true });
            this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }));
            this.port.on('open', () => { 
                this.data.online = true; 
                this.sendCommand('AT+CMEE=2'); 
                this.sendCommand('AT+COPS=0'); 
                this.sendCommand('AT+CMGF=1'); 
                this.sendCommand('AT+CPMS="SM","SM","SM"'); // Use SIM memory
                this.sendCommand('AT+CMGD=1,4'); // Delete all SMS messages from SIM card memory on startup to clear old messages and prevent card congestion
                this.sendCommand('AT+CNMI=2,2,0,0,0'); // Direct SMS indication
                
                // Force registration after a delay
                setTimeout(async () => {
                    let op = this.config.operator.toLowerCase();
                    let netCode = null;
                    if (op === 'mobilis' || op === 'sama') netCode = "60301";
                    else if (op === 'ooredoo') netCode = "60303";
                    else if (op === 'djezzy') netCode = "60302";
                    
                    if (netCode) {
                        console.log(`[SERIAL] Forcing registration to ${op} (${netCode})`);
                        await this.sendCommand(`AT+COPS=1,2,"${netCode}"`);
                    }
                }, 5000);
            });
            this.parser.on('data', (line) => this.handleSerialData(line));
            this.port.on('error', () => { this.data.online = false; });
        } catch (e) { console.error(`❌ [SERIAL][${this.key}] Init Failed:`, e.message); }
    }

    async sendCommand(cmd, timeout = 3000) {
        if (!this.port || !this.port.isOpen) return null;
        console.log(`[SERIAL SEND] ${cmd}`);
        return new Promise((resolve) => {
            let response = '';
            const timer = setTimeout(() => resolve(response), timeout);
            const onData = (line) => {
                response += line + '\n';
                if (line.includes('OK') || line.includes('ERROR')) {
                    clearTimeout(timer);
                    this.parser.removeListener('data', onData);
                    resolve(response);
                }
            };
            this.parser.on('data', onData);
            this.port.write(cmd + '\r');
        });
    }

    handleSerialData(line) {
        console.log(`[SERIAL RAW] ${line}`);
        if (line.includes('+CSQ:') || line.includes('^RSSI:')) {
            const match = line.match(/(?:\+CSQ:|\^RSSI:)\s*(\d+)/);
            if (match) {
                let rssi = parseInt(match[1]);
                if (rssi === 99) rssi = 0;
                // Normalize RSSI if it's on a 0-99 scale
                if (rssi > 31 && rssi < 99) rssi = Math.round((rssi / 99) * 31);
                this.data.signal = Math.min(100, Math.round((rssi / 31) * 100));
            }
        }
        if (line.includes('+COPS:')) {
            const match = line.match(/\+COPS:.*"(.*)"/);
            if (match) this.data.operator = match[1];
        }
        if (line.includes('+CMTI:')) {
            const match = line.match(/\+CMTI:\s*"SM",\s*(\d+)/);
            if (match) {
                console.log(`[SERIAL] New SMS received at index ${match[1]}, reading...`);
                this.sendCommand(`AT+CMGR=${match[1]}`);
            }
        }
        if (line.includes('+CMGR:') || line.includes('+CMT:')) {
            this.readingSms = true;
        } else if (this.readingSms) {
            const decodedSms = this.decodeUCS2(line);
            console.log(`[SMS CONTENT DECODED] ${decodedSms}`);
            process.emit('modem-log', { address: this.config.port, log: `[SMS] ${decodedSms}` });
            this.readingSms = false;
            
            // Parse Mobilis Balance
            if (decodedSms.includes('Votre Balance:') || decodedSms.includes('GTS est') || decodedSms.includes('Solde') || decodedSms.includes('Sama') || decodedSms.includes('POSTE est') || decodedSms.includes('ASSILOU est') || decodedSms.includes('DATA est')) {
                const balances = {};
                const posteMatch = decodedSms.match(/POSTE est\s*:\s*([\d.]+)/i);
                const assilouMatch = decodedSms.match(/ASSILOU est\s*:\s*([\d.]+)/i);
                const dataMatch = decodedSms.match(/DATA est\s*:\s*([\d.]+)/i);
                const gtsMatch = decodedSms.match(/GTS est\s*:\s*([\d.]+)/i);
                const mobilisMatch = decodedSms.match(/MOBILIS est\s*:\s*([\d.]+)/i);
                const soldeMatch = decodedSms.match(/(?:Solde|Sama|Balance|POSTE est)\s*[:\s]*(\d+[\d,.]*)/i);
                
                if (posteMatch) balances.poste = posteMatch[1];
                if (assilouMatch) balances.assilou = assilouMatch[1];
                if (dataMatch) balances.data = dataMatch[1];
                if (gtsMatch) balances.gts = gtsMatch[1];
                if (mobilisMatch) balances.mobilis = mobilisMatch[1];
                
                let balanceText = "";
                if (soldeMatch && Object.keys(balances).length === 0) {
                    balanceText = soldeMatch[1].replace(/\./g, '').replace(',', '.');
                } else if (Object.keys(balances).length > 0) {
                    balanceText = JSON.stringify(balances);
                }
                
                if (balanceText) {
                    this.data.balance = balanceText;
                    process.emit('modem-log', { address: this.config.port, log: `الرصيد المستخرج: ${balanceText}` });
                    process.emit('modem-data-update', { address: this.config.port, balance: this.data.balance });
                }
            }
            
            // Parse Mobilis Transaction Success
            if (decodedSms.includes('Transaction reussie') || decodedSms.includes('reussie') || decodedSms.includes('transfere') || decodedSms.includes('succes') || decodedSms.includes('تمت العملية')) {
                process.emit('modem-data-update', { address: this.config.port, transaction_update: decodedSms });
            }

            // Parse Ooredoo Balance
            if (decodedSms.includes('Votre credit Storm-Credit est')) {
                const match = decodedSms.match(/Votre credit Storm-Credit est\s*([\d.]+)/);
                if (match) {
                    this.data.balance = match[1];
                    process.emit('modem-log', { address: this.config.port, log: `الرصيد المستخرج: ${match[1]} دج` });
                    process.emit('modem-data-update', { address: this.config.port, balance: this.data.balance });
                }
            }
        }
    }

    async updateStatus() {
        if (this.ussdInProgress) return;
        await this.sendCommand('AT+CPIN?');
        await this.sendCommand('AT+CSQ');
        await this.sendCommand('AT+COPS?');
    }

    async getHiLinkSignal(ip) {
        try {
            // First get Session and Token! HiLink modems strictly require this for most APIs!
            let session = null;
            let token = null;
            const authRes = await fetch(`http://${ip}/api/webserver/SesTokInfo`, { timeout: 2000 }).catch(() => null);
            if (authRes) {
                const authText = await authRes.text();
                session = authText.match(/<SesInfo>(.*?)<\/SesInfo>/)?.[1];
                token = authText.match(/<TokInfo>(.*?)<\/TokInfo>/)?.[1];
            }
            
            const headers = {};
            if (session && token) {
                headers['Cookie'] = session;
                headers['__RequestVerificationToken'] = token;
            }

            // Try different Hilink API endpoints for signal
            let res = await fetch(`http://${ip}/api/device/signal`, { headers, timeout: 2000 }).catch(() => null);
            let text = res ? await res.text() : '';
            
            if (!text || !text.includes('<rssi>')) {
                res = await fetch(`http://${ip}/api/monitoring/status`, { headers, timeout: 2000 }).catch(() => null);
                text = res ? await res.text() : '';
            }

            if (!text || text.includes('error')) return 0;
            
            const rssiMatch = text.match(/<rssi>(.*?)<\/rssi>/i);
            const signalIconMatch = text.match(/<SignalIcon>(.*?)<\/SignalIcon>/i);

            if (signalIconMatch && signalIconMatch[1]) {
                const bars = parseInt(signalIconMatch[1]);
                if (!isNaN(bars)) return bars;
            }

            if (rssiMatch && rssiMatch[1]) {
                let val = parseInt(rssiMatch[1].replace(/[^\d-]/g, ''));
                if (!isNaN(val)) {
                    if (val > -65) return 5;
                    if (val > -75) return 4;
                    if (val > -85) return 3;
                    if (val > -95) return 2;
                    if (val > -105) return 1;
                }
            }
            return 0;
        } catch (e) { return 0; }
    }

    async sendUssdSerial(code, logLabel = null) {
        if (!this.port || !this.port.isOpen) return 'DISCONNECTED';
        return new Promise((resolve) => {
            let response = '';
            const timer = setTimeout(() => {
                this.parser.removeListener('data', onData);
                resolve(null);
            }, 15000);
            
            const onData = (line) => {
                response += line + '\n';
                console.log(`[SERIAL USSD RAW] ${line}`);
                if (line.includes('+CUSD:')) {
                    clearTimeout(timer);
                    this.parser.removeListener('data', onData);
                    
                    const match = line.match(/\+CUSD:\s*\d+,\s*"(.*)"/);
                    let decoded = line;
                    if (match) decoded = this.decodeUCS2(match[1]);
                    else if (line.includes('+CUSD: 2')) decoded = "تم إنهاء الجلسة من الشبكة.";
                    
                    process.emit('modem-log', { address: this.config.port, log: `الرد: ${decoded}` });
                    resolve(response);
                }
                if (line.includes('ERROR')) {
                    clearTimeout(timer);
                    this.parser.removeListener('data', onData);
                    process.emit('modem-log', { address: this.config.port, log: `الرد: خطأ غير معروف.` });
                    resolve(null);
                }
            };
            
            this.parser.on('data', onData);
            
            const isReply = !code.startsWith('*');
            if (!isReply) {
                this.port.write(`AT+CSCS="IRA"\r\n`);
                setTimeout(() => {
                    console.log(`[SERIAL SEND] AT+CUSD=1,"${code}"`);
                    const logText = logLabel ? `جاري ${logLabel}` : `جاري طلب (IRA): ${code}`;
                    process.emit('modem-log', { address: this.config.port, log: logText });
                    this.port.write(`AT+CUSD=1,"${code}"\r\n`);
                }, 1000);
            } else {
                console.log(`[SERIAL SEND REPLY] AT+CUSD=1,"${code}"`);
                const logText = logLabel ? `تأكيد/مواصلة (USSD): ${code}` : `جاري إرسال رد (USSD): ${code}`;
                process.emit('modem-log', { address: this.config.port, log: logText });
                this.port.write(`AT+CUSD=1,"${code}"\r\n`);
            }
        });
    }

    async dialSerial(number) {
        if (!this.port || !this.port.isOpen) return 'DISCONNECTED';
        console.log(`[SERIAL DIAL] ATD${number};`);
        process.emit('modem-log', { address: this.config.port, log: `جاري إجراء مكالمة هاتفية للرقم ${number}...` });
        return await this.sendCommand(`ATD${number};`);
    }

    async hangupSerial() {
        if (!this.port || !this.port.isOpen) return 'DISCONNECTED';
        console.log(`[SERIAL HANGUP] ATH`);
        process.emit('modem-log', { address: this.config.port, log: `إنهاء المكالمة...` });
        return await this.sendCommand(`ATH`);
    }

    async sendSms(number, text) {
        if (!this.port || !this.port.isOpen) return false;
        await this.sendCommand('AT+CMGF=1');
        
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this.parser.removeListener('data', onData);
                resolve(false);
            }, 10000);

            const onData = (line) => {
                if (line.includes('>')) {
                    this.port.write(`${text}\x1A`);
                }
                if (line.includes('+CMGS:')) {
                    clearTimeout(timer);
                    this.parser.removeListener('data', onData);
                    resolve(true);
                }
                if (line.includes('ERROR')) {
                    clearTimeout(timer);
                    this.parser.removeListener('data', onData);
                    resolve(false);
                }
            };
            this.parser.on('data', onData);
            this.port.write(`AT+CMGS="${number}"\r\n`);
        });
    }

    async getSmsListSerial() {
        if (!this.port || !this.port.isOpen) return [];
        await this.sendCommand('AT+CMGF=1');
        const response = await this.sendCommand('AT+CMGL="ALL"');
        if (!response) return [];
        
        const list = [];
        const lines = response.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('+CMGL:')) {
                const parts = line.split(',');
                const index = parts[0].replace('+CMGL: ', '').trim();
                const phone = parts[2] ? parts[2].replace(/"/g, '').trim() : '';
                const date = parts[4] ? (parts[4] + ' ' + (parts[5] || '')).replace(/"/g, '').trim() : '';
                
                let content = '';
                let j = i + 1;
                while (j < lines.length && !lines[j].trim().startsWith('+CMGL:') && lines[j].trim() !== 'OK') {
                    if (lines[j].trim()) {
                        content += (content ? '\n' : '') + lines[j].trim();
                    }
                    j++;
                }
                
                if (/^[0-9A-Fa-f]{10,}$/.test(content)) {
                    content = this.decodeUCS2(content);
                }
                
                list.push({ index, phone, date, content });
                i = j - 1;
            }
        }
        return list;
    }

    decodeUCS2(text, dcs = null) {
        try {
            if (!text) return "";
            const trimmed = text.trim();
            if (trimmed === 'OK' || trimmed === 'ERROR' || trimmed.includes('^RSSI')) return trimmed;
            
            if (trimmed.length > 5 && /[a-zA-Z\s]/.test(trimmed) && !/^[0-9A-Fa-f]+$/.test(trimmed)) {
                return trimmed;
            }

            let cleanText = trimmed.replace(/FEFF/g, '').replace(/["']/g, '');
            return cleanText.replace(/([0-9A-Fa-f]{4})/g, (match, p1) => {
                const code = parseInt(p1, 16);
                if (code >= 0x0600 && code <= 0x06FF) {
                    return String.fromCharCode(code);
                }
                if (code >= 32 && code <= 126) {
                    return String.fromCharCode(code);
                }
                if (code === 0) return "";
                
                if (code > 255) {
                    const utf8 = String.fromCharCode(code);
                    if (/[\u00C0-\u00FF]/.test(utf8)) {
                        try { return decodeURIComponent(escape(utf8)); } catch(e) {}
                    }
                    return utf8;
                }
                return match;
            });
        } catch (e) { return text; }
    }

    encode7bit(str) {
        try {
            let bytes = [];
            let bitBuffer = 0, bitCount = 0;
            for (let i = 0; i < str.length; i++) {
                let charCode = str.charCodeAt(i) & 0x7F;
                bitBuffer |= (charCode << bitCount);
                bitCount += 7;
                if (bitCount >= 8) {
                    bytes.push(bitBuffer & 0xFF);
                    bitBuffer >>= 8;
                    bitCount -= 8;
                }
            }
            if (bitCount > 0) bytes.push(bitBuffer & 0xFF);
            return bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
        } catch (e) { return str; }
    }

    toUCS2Hex(text) {
        let hex = "";
        for (let i = 0; i < text.length; i++) {
            hex += text.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
        }
        return hex;
    }
}

// Wrapper for current project
const instances = {};

function getModem(address, operator = 'Unknown') {
    const match = address.match(/^(COM\d+)/);
    const cleanPort = match ? match[1] : address;
    
    if (!instances[cleanPort]) {
        instances[cleanPort] = new ModemService({ port: cleanPort, operator: operator });
    }
    return instances[cleanPort];
}

async function sendUssdCommand(address, code, operator) {
    const isIp = address.match(/^\d+\.\d+\.\d+\.\d+$/) || address.startsWith('http');
    const cleanIp = address.replace(/^https?:\/\//, '').split('/')[0];

    // Identify USSD code type for professional logging
    let logLabel = `إرسال كود USSD: ${code}`;
    if (code === '1' || code === '0') {
        logLabel = `تأكيد العملية (USSD): ${code}`;
    } else if (code.includes('*630*') || code.includes('*605*') || code.includes('*606*') || code.includes('*115*')) {
        logLabel = `تحويل الرصيد (Flexy USSD): ${code}`;
    } else if (code.includes('*222#') || code.includes('*100#') || code.includes('*200#') || code.includes('*222') || code.includes('*100')) {
        logLabel = `استعلام الرصيد (USSD): ${code}`;
    }

    if (isIp) {
        process.emit('modem-log', { address: address, log: `جاري ${logLabel} عبر HiLink` });
        return await sendUssdHiLink(cleanIp, code);
    } else {
        const modem = getModem(address, operator);
        const result = await modem.sendUssdSerial(code, logLabel);
        if (result === 'DISCONNECTED') {
            return { success: false, message: "⚠️ إنذار: الشريحة غير متصلة أو المودم مفصول عن السيرفر!" };
        } else if (result) {
            let decoded = result;
            const lines = result.split('\n');
            for (let line of lines) {
                if (line.includes('+CUSD:')) {
                    const match = line.match(/\+CUSD:\s*\d+,\s*"(.*?)"/);
                    if (match) {
                        decoded = modem.decodeUCS2(match[1]);
                        break;
                    } else if (line.includes('+CUSD: 2')) {
                        decoded = "تم إنهاء الجلسة من الشبكة.";
                        break;
                    }
                }
            }
            decoded = decoded.trim().replace(/^"|"$/g, '');
            return { success: true, content: decoded };
        } else {
            return { success: false, message: "⚠️ الشريحة لم ترد على طلب الشبكة (تجاوزت مهلة الانتظار)." };
        }
    }
}

async function sendUssdHiLink(ip, code) {
    try {
        let session = null;
        let token = null;
        
        const isReply = !code.startsWith('*');
        if (isReply && hiLinkSessions.has(ip)) {
            const cached = hiLinkSessions.get(ip);
            session = cached.session;
            console.log(`[HiLink USSD] Reusing active session ${session} for ${ip} to maintain interactive USSD session`);
        }
        
        // Fetch SesTokInfo. If session cookie exists, pass it so the modem keeps the session alive and gives us a fresh token for it!
        let fetchHeaders = session ? { 'Cookie': session } : {};
        console.log(`[HiLink USSD] Fetching initial token for ${isReply ? 'active' : 'new'} session on ${ip}`);
        let res = await fetch(`http://${ip}/api/webserver/SesTokInfo`, { 
            headers: fetchHeaders,
            timeout: 3000 
        }).catch(() => null);
        
        if (!res) {
            process.emit('modem-log', { address: ip, log: `الرد: فشل الاتصال بالمودم (${ip}). تأكد من الشبكة!` });
            return { success: false, message: "⚠️ إنذار: المودم غير متصل بالشبكة (HiLink Disconnected)!" };
        }
        let text = await res.text();
        session = text.match(/<SesInfo>(.*?)<\/SesInfo>/)?.[1];
        token = text.match(/<TokInfo>(.*?)<\/TokInfo>/)?.[1];
        
        if (!session || !token) {
            process.emit('modem-log', { address: ip, log: `الرد: فشل الحصول على رمز الأمان من المودم.` });
            return { success: false, message: "⚠️ المودم لا يستجيب لطلبات الأمان (HiLink Token Error)." };
        }
        
        // Release active USSD session if this is a fresh initiation
        if (!isReply) {
            console.log(`[HiLink USSD] Releasing any active USSD session on ${ip} before initiating a new one`);
            const releaseHeaders = { 'Cookie': session, '__RequestVerificationToken': token };
            const releaseRes = await fetch(`http://${ip}/api/ussd/release`, { headers: releaseHeaders }).catch(() => null);
            if (releaseRes) {
                const releaseText = await releaseRes.text();
                console.log(`[HiLink USSD] Release session response: ${releaseText}`);
            }
            await new Promise(r => setTimeout(r, 200));
            
            // Re-fetch token after release because release might have consumed/invalidated the token
            console.log(`[HiLink USSD] Re-fetching fresh token after USSD release for ${ip}`);
            res = await fetch(`http://${ip}/api/webserver/SesTokInfo`, { 
                headers: { 'Cookie': session },
                timeout: 3000 
            }).catch(() => null);
            
            if (res) {
                text = await res.text();
                session = text.match(/<SesInfo>(.*?)<\/SesInfo>/)?.[1] || session;
                token = text.match(/<TokInfo>(.*?)<\/TokInfo>/)?.[1] || token;
            }
        }
        
        // Update cached session and token
        hiLinkSessions.set(ip, { session, token });
        
        const headers = { 'Cookie': session, '__RequestVerificationToken': token, 'Content-Type': 'application/xml' };
        
        // Fetch old USSD content before sending a reply
        let oldContent = '';
        if (isReply) {
            const oldRes = await fetch(`http://${ip}/api/ussd/get`, { headers, timeout: 2000 }).then(r => r.text()).catch(() => '');
            if (oldRes.includes('<content>')) {
                oldContent = oldRes.match(/<content>([\s\S]*?)<\/content>/)?.[1] || '';
            }
        }
        
        const xml = `<?xml version="1.0" encoding="UTF-8"?><request><content>${code}</content><codeType>15</codeType></request>`;
        await fetch(`http://${ip}/api/ussd/send`, { method: 'POST', headers, body: xml });
        
        for (let i = 0; i < 45; i++) {
            await new Promise(r => setTimeout(r, 300));
            const getRes = await fetch(`http://${ip}/api/ussd/get`, { headers }).then(r => r.text()).catch(() => '');
            if (getRes.includes('<content>')) {
                let content = getRes.match(/<content>([\s\S]*?)<\/content>/)?.[1];
                if (content && !getRes.includes('USSD process')) {
                    // Prevent returning the exact same old content unless it's a new session
                    if (!isReply || content !== oldContent || i > 20) {
                        process.emit('modem-log', { address: ip, log: `الرد: ${content}` });
                        return { success: true, content: content };
                    }
                }
            }
        }
        
        // Fallback to SMS for Mobilis
        process.emit('modem-log', { address: ip, log: `لم يصل رد USSD. جاري التحقق من الرسائل (SMS)...` });
        await new Promise(r => setTimeout(r, 3000));
        
        // Refresh token for SMS request
        const res2 = await fetch(`http://${ip}/api/webserver/SesTokInfo`, { timeout: 3000 }).catch(() => null);
        if (res2) {
            const text2 = await res2.text();
            const session2 = text2.match(/<SesInfo>(.*?)<\/SesInfo>/)?.[1];
            const token2 = text2.match(/<TokInfo>(.*?)<\/TokInfo>/)?.[1];
            if (session2 && token2) {
                headers['Cookie'] = session2;
                headers['__RequestVerificationToken'] = token2;
            }
        }
        
        const xmlBody = `<?xml version="1.0" encoding="UTF-8"?><request><PageIndex>1</PageIndex><ReadCount>5</ReadCount><BoxType>1</BoxType><SortType>0</SortType><Ascending>0</Ascending><UnreadPreferred>0</UnreadPreferred></request>`;
        const smsResObj = await fetch(`http://${ip}/api/sms/sms-list`, { method: 'POST', headers, body: xmlBody }).catch(() => null);
        let smsRes = '';
        if (smsResObj) {
            const arrayBuffer = await smsResObj.arrayBuffer();
            smsRes = new TextDecoder('utf-8').decode(arrayBuffer);
        }
        
        if (smsRes.includes('<Message>')) {
            const messages = smsRes.match(/<Message>([\s\S]*?)<\/Message>/g);
            if (messages) {
                for (let m of messages) {
                    let content = m.match(/<Content>([\s\S]*?)<\/Content>/)?.[1] || '';
                    content = decodeHtmlEntities(content);
                    if (content.includes('Votre Balance:') || content.includes('GTS est') || content.includes('Votre credit Storm-Credit') || content.includes('Solde')) {
                        process.emit('modem-log', { address: ip, log: `الرد (SMS): ${content}` });
                        return { success: true, content: content };
                    }
                }
            }
        }
        
        return { success: false, message: "⚠️ الشريحة لم ترد على طلب الشبكة ولم تصل رسالة تأكيد (Timeout)." };
    } catch (e) {
        return { success: false, message: "⚠️ خطأ في المودم: " + e.message };
    }
}

async function getSignalStrength(address, operator) {
    const isIp = address.match(/^\d+\.\d+\.\d+\.\d+$/) || address.startsWith('http');
    const cleanIp = address.replace(/^https?:\/\//, '').split('/')[0];

    if (isIp) {
        const dummyModem = new ModemService({ port: null, operator });
        const bars = await dummyModem.getHiLinkSignal(cleanIp);
        return { success: true, bars: bars };
    } else {
        const modem = getModem(address, operator);
        await modem.updateStatus();
        const bars = Math.min(5, Math.floor(modem.data.signal / 20));
        return { success: true, bars: bars };
    }
}

async function probeModem(address) {
    const isIp = address.match(/^\d+\.\d+\.\d+\.\d+$/) || address.startsWith('http');
    const cleanIp = address.replace(/^https?:\/\//, '').split('/')[0];

    if (isIp) {
        const dummyModem = new ModemService({ port: null, operator: 'HiLink' });
        const bars = await dummyModem.getHiLinkSignal(cleanIp);
        return { success: true, operator: 'HiLink (IP)', bars: bars };
    } else {
        const modem = getModem(address);
        await modem.updateStatus();
        return { success: true, operator: modem.data.operator, bars: Math.min(5, Math.floor(modem.data.signal / 20)) };
    }
}

async function pollHiLinkSms(ip) {
    try {
        const res = await fetch(`http://${ip}/api/webserver/SesTokInfo`, { timeout: 3000 }).catch(() => null);
        if (!res) return;
        const text = await res.text();
        const session = text.match(/<SesInfo>(.*?)<\/SesInfo>/)?.[1];
        const token = text.match(/<TokInfo>(.*?)<\/TokInfo>/)?.[1];
        
        if (!session || !token) return;
        
        const headers = { 'Cookie': session, '__RequestVerificationToken': token, 'Content-Type': 'application/xml' };
        const xmlBody = `<?xml version="1.0" encoding="UTF-8"?><request><PageIndex>1</PageIndex><ReadCount>5</ReadCount><BoxType>1</BoxType><SortType>0</SortType><Ascending>0</Ascending><UnreadPreferred>0</UnreadPreferred></request>`;
        
        const smsResObj = await fetch(`http://${ip}/api/sms/sms-list`, { method: 'POST', headers, body: xmlBody }).catch(() => null);
        let smsRes = '';
        if (smsResObj) {
            const arrayBuffer = await smsResObj.arrayBuffer();
            smsRes = new TextDecoder('utf-8').decode(arrayBuffer);
        }
        
        if (smsRes.includes('<Message>')) {
            const messages = smsRes.match(/<Message>([\s\S]*?)<\/Message>/g);
            if (messages) {
                for (let m of messages) {
                    const index = m.match(/<Index>(.*?)<\/Index>/)?.[1] || '';
                    const date = m.match(/<Date>(.*?)<\/Date>/)?.[1] || '';
                    let content = m.match(/<Content>([\s\S]*?)<\/Content>/)?.[1] || '';
                    content = decodeHtmlEntities(content);
                    
                    const smsKey = `${ip}_${index}_${date}`;
                    if (processedHiLinkSms.has(smsKey)) continue;
                    processedHiLinkSms.add(smsKey);
                    
                    // Keep size in check
                    if (processedHiLinkSms.size > 500) {
                        const firstKey = processedHiLinkSms.values().next().value;
                        processedHiLinkSms.delete(firstKey);
                    }
                    
                    // Filter out old pre-startup SMS
                    let isOld = false;
                    if (date) {
                        const smsTime = new Date(date).getTime();
                        if (smsTime < serverStartupTime - 10000) {
                            isOld = true;
                        }
                    }
                    
                    if (!isOld) {
                        // Log the SMS in the terminal
                        process.emit('modem-log', { address: ip, log: `[SMS] ${content}` });
                    }
                    
                    // Parse Balance from SMS
                    if (content.includes('Votre Balance:') || content.includes('GTS est') || content.includes('Solde') || content.includes('Sama') || content.includes('POSTE est') || content.includes('ASSILOU est') || content.includes('DATA est')) {
                        const balances = {};
                        const posteMatch = content.match(/POSTE est\s*:\s*([\d.]+)/i);
                        const assilouMatch = content.match(/ASSILOU est\s*:\s*([\d.]+)/i);
                        const dataMatch = content.match(/DATA est\s*:\s*([\d.]+)/i);
                        const gtsMatch = content.match(/GTS est\s*:\s*([\d.]+)/i);
                        const mobilisMatch = content.match(/MOBILIS est\s*:\s*([\d.]+)/i);
                        const soldeMatch = content.match(/(?:Solde|Sama|Balance|POSTE est)\s*[:\s]*(\d+[\d,.]*)/i);
                        
                        if (posteMatch) balances.poste = posteMatch[1];
                        if (assilouMatch) balances.assilou = assilouMatch[1];
                        if (dataMatch) balances.data = dataMatch[1];
                        if (gtsMatch) balances.gts = gtsMatch[1];
                        if (mobilisMatch) balances.mobilis = mobilisMatch[1];
                        
                        let balanceText = "";
                        if (soldeMatch && Object.keys(balances).length === 0) {
                            balanceText = soldeMatch[1].replace(/\./g, '').replace(',', '.');
                        } else if (Object.keys(balances).length > 0) {
                            balanceText = JSON.stringify(balances);
                        }
                        
                        if (balanceText) {
                            process.emit('modem-log', { address: ip, log: `الرصيد المستخرج: ${balanceText}` });
                            process.emit('modem-data-update', { address: ip, balance: balanceText });
                        }
                    }
                    
                    // Parse Transaction Success from SMS
                    if (content.includes('Transaction reussie') || content.includes('reussie') || content.includes('transfere') || content.includes('succes') || content.includes('تمت العملية')) {
                        process.emit('modem-data-update', { address: ip, transaction_update: content });
                    }
                }
            }
        }
    } catch (e) {
        console.error(`[HiLink SMS Poll Error]`, e.message);
    }
}

async function sendSmsHiLink(ip, recipient, text) {
    try {
        const res = await fetch(`http://${ip}/api/webserver/SesTokInfo`, { timeout: 3000 }).catch(() => null);
        if (!res) return { success: false, message: "⚠️ لا يمكن الاتصال بالمودم. تأكد من عنوان الـ IP والشبكة!" };
        const textRes = await res.text();
        const session = textRes.match(/<SesInfo>(.*?)<\/SesInfo>/)?.[1];
        const token = textRes.match(/<TokInfo>(.*?)<\/TokInfo>/)?.[1];
        
        if (!session || !token) {
            return { success: false, message: "⚠️ فشل الحصول على رموز الأمان (Session/Token) من المودم!" };
        }
        
        const headers = { 
            'Cookie': session, 
            '__RequestVerificationToken': token, 
            'Content-Type': 'application/xml' 
        };
        const dateStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
        const xml = `<?xml version="1.0" encoding="UTF-8"?><request><Index>-1</Index><Phones><Phone>${recipient}</Phone></Phones><Sca></Sca><Content>${text}</Content><Length>${text.length}</Length><Reserved>1</Reserved><Date>${dateStr}</Date></request>`;
        
        const sendRes = await fetch(`http://${ip}/api/sms/send-sms`, { method: 'POST', headers, body: xml }).catch(() => null);
        if (!sendRes) return { success: false, message: "⚠️ فشل إرسال الطلب للمودم." };
        const resultText = await sendRes.text();
        if (resultText.includes('OK') || resultText.includes('success')) {
            process.emit('modem-log', { address: ip, log: `[SMS Outgoing] تم إرسال رسالة إلى ${recipient}: ${text}` });
            return { success: true };
        } else {
            const errCode = resultText.match(/<code>(.*?)<\/code>/)?.[1] || 'Unknown';
            return { success: false, message: `⚠️ المودم رفض الإرسال. رمز الخطأ: ${errCode}` };
        }
    } catch (e) {
        return { success: false, message: e.message };
    }
}

async function getSmsListHiLink(ip) {
    try {
        const res = await fetch(`http://${ip}/api/webserver/SesTokInfo`, { timeout: 3000 }).catch(() => null);
        if (!res) return { success: false, message: "⚠️ لا يمكن الاتصال بالمودم." };
        const textRes = await res.text();
        const session = textRes.match(/<SesInfo>(.*?)<\/SesInfo>/)?.[1];
        const token = textRes.match(/<TokInfo>(.*?)<\/TokInfo>/)?.[1];
        
        if (!session || !token) return { success: false, message: "⚠️ فشل رموز الأمان." };
        
        const headers = { 
            'Cookie': session, 
            '__RequestVerificationToken': token, 
            'Content-Type': 'application/xml' 
        };
        const xmlBody = `<?xml version="1.0" encoding="UTF-8"?><request><PageIndex>1</PageIndex><ReadCount>20</ReadCount><BoxType>1</BoxType><SortType>0</SortType><Ascending>0</Ascending><UnreadPreferred>0</UnreadPreferred></request>`;
        
        const smsResObj = await fetch(`http://${ip}/api/sms/sms-list`, { method: 'POST', headers, body: xmlBody }).catch(() => null);
        if (!smsResObj) return { success: false, message: "⚠️ لم يستجب المودم لطلب الرسائل." };
        
        const arrayBuffer = await smsResObj.arrayBuffer();
        const smsRes = new TextDecoder('utf-8').decode(arrayBuffer);
        
        const list = [];
        if (smsRes.includes('<Message>')) {
            const messages = smsRes.match(/<Message>([\s\S]*?)<\/Message>/g);
            if (messages) {
                for (let m of messages) {
                    const index = m.match(/<Index>(.*?)<\/Index>/)?.[1] || '';
                    const phone = m.match(/<Phone>(.*?)<\/Phone>/)?.[1] || '';
                    const date = m.match(/<Date>(.*?)<\/Date>/)?.[1] || '';
                    let content = m.match(/<Content>([\s\S]*?)<\/Content>/)?.[1] || '';
                    content = decodeHtmlEntities(content);
                    list.push({ index, phone, date, content });
                }
            }
        }
        return { success: true, list };
    } catch (e) {
        return { success: false, message: e.message };
    }
}

async function dialNumberHiLink(ip, number) {
    try {
        const res = await fetch(`http://${ip}/api/webserver/SesTokInfo`, { timeout: 3000 }).catch(() => null);
        if (!res) return { success: false, message: "⚠️ لا يمكن الاتصال بالمودم. تأكد من الشبكة!" };
        const textRes = await res.text();
        const session = textRes.match(/<SesInfo>(.*?)<\/SesInfo>/)?.[1];
        const token = textRes.match(/<TokInfo>(.*?)<\/TokInfo>/)?.[1];
        
        if (!session || !token) return { success: false, message: "⚠️ فشل الحصول على رموز الأمان." };
        
        const headers = { 
            'Cookie': session, 
            '__RequestVerificationToken': token, 
            'Content-Type': 'application/xml' 
        };
        const xml = `<?xml version="1.0" encoding="UTF-8"?><request><ConnectionIndex>1</ConnectionIndex><DialNumber>${number}</DialNumber><DialType>0</DialType></request>`;
        
        const dialRes = await fetch(`http://${ip}/api/voice/dial`, { method: 'POST', headers, body: xml }).catch(() => null);
        if (!dialRes) return { success: false, message: "⚠️ فشل إرسال طلب الاتصال للمودم." };
        const resultText = await dialRes.text();
        
        if (resultText.includes('<code>')) {
            const errCode = resultText.match(/<code>(\d+)<\/code>/)?.[1];
            let errorMsg = "⚠️ المودم رفض إجراء الاتصال.";
            if (errCode === '100002') {
                errorMsg = "⚠️ المودم لا يدعم المكالمات الصوتية (100002: ERROR_NOT_SUPPORT). نوع المودم أو نسخة البرنامج المثبتة عليه لا تدعم هذه الخاصية (مخصص للبيانات فقط).";
            } else if (errCode === '100003') {
                errorMsg = "⚠️ لا توجد صلاحيات كافية لإجراء الاتصال (100003: NO_RIGHTS). الرجاء تسجيل الدخول أو التحقق من رموز الأمان.";
            } else if (errCode === '100004') {
                errorMsg = "⚠️ المودم مشغول حالياً بمكالمة أو عملية أخرى (100004: BUSY).";
            } else {
                errorMsg = `⚠️ فشل الاتصال. رمز الخطأ من المودم: ${errCode}`;
            }
            return { success: false, message: errorMsg };
        }
        
        if (resultText.includes('OK') || resultText.includes('success') || (resultText && !resultText.includes('<error>'))) {
            process.emit('modem-log', { address: ip, log: `[Call Outgoing] جاري طلب الرقم: ${number}` });
            return { success: true };
        } else {
            return { success: false, message: "⚠️ المودم رفض إجراء الاتصال (قد لا تدعم الشريحة أو المودم المكالمات الصوتية)." };
        }
    } catch (e) {
        return { success: false, message: e.message };
    }
}

async function hangupCallHiLink(ip) {
    try {
        const res = await fetch(`http://${ip}/api/webserver/SesTokInfo`, { timeout: 3000 }).catch(() => null);
        if (!res) return { success: false, message: "⚠️ لا يمكن الاتصال بالمودم." };
        const textRes = await res.text();
        const session = textRes.match(/<SesInfo>(.*?)<\/SesInfo>/)?.[1];
        const token = textRes.match(/<TokInfo>(.*?)<\/TokInfo>/)?.[1];
        
        if (!session || !token) return { success: false, message: "⚠️ فشل الحصول على رموز الأمان." };
        
        const headers = { 
            'Cookie': session, 
            '__RequestVerificationToken': token, 
            'Content-Type': 'application/xml' 
        };
        const xml = `<?xml version="1.0" encoding="UTF-8"?><request><ConnectionIndex>1</ConnectionIndex></request>`;
        
        const hangRes = await fetch(`http://${ip}/api/voice/hangup`, { method: 'POST', headers, body: xml }).catch(() => null);
        if (!hangRes) return { success: false, message: "⚠️ فشل إرسال طلب إنهاء المكالمة." };
        const resultText = await hangRes.text();
        if (resultText.includes('OK') || resultText.includes('success')) {
            process.emit('modem-log', { address: ip, log: `[Call Ended] تم إنهاء المكالمة.` });
            return { success: true };
        } else {
            return { success: false, message: "⚠️ المودم رفض إنهاء المكالمة." };
        }
    } catch (e) {
        return { success: false, message: e.message };
    }
}

async function dialNumber(address, number, operator = 'Unknown') {
    const isIp = address.match(/^\d+\.\d+\.\d+\.\d+$/) || address.startsWith('http');
    const cleanIp = address.replace(/^https?:\/\//, '').split('/')[0];
    
    if (isIp) {
        return await dialNumberHiLink(cleanIp, number);
    } else {
        const modem = getModem(address, operator);
        const result = await modem.dialSerial(number);
        if (result === 'DISCONNECTED') {
            return { success: false, message: "⚠️ إنذار: المودم مفصول عن السيرفر!" };
        } else if (result) {
            return { success: true };
        } else {
            return { success: false, message: "⚠️ فشل إرسال أمر الاتصال للمودم السيريال." };
        }
    }
}

async function hangupCall(address, operator = 'Unknown') {
    const isIp = address.match(/^\d+\.\d+\.\d+\.\d+$/) || address.startsWith('http');
    const cleanIp = address.replace(/^https?:\/\//, '').split('/')[0];
    
    if (isIp) {
        return await hangupCallHiLink(cleanIp);
    } else {
        const modem = getModem(address, operator);
        const result = await modem.hangupSerial();
        if (result === 'DISCONNECTED') {
            return { success: false, message: "⚠️ إنذار: المودم مفصول!" };
        } else if (result) {
            return { success: true };
        } else {
            return { success: false, message: "⚠️ فشل إرسال أمر إنهاء المكالمة للمودم السيريال." };
        }
    }
}

async function getSmsList(address, operator = 'Unknown') {
    const isIp = address.match(/^\d+\.\d+\.\d+\.\d+$/) || address.startsWith('http');
    const cleanIp = address.replace(/^https?:\/\//, '').split('/')[0];
    
    if (isIp) {
        return await getSmsListHiLink(cleanIp);
    } else {
        const modem = getModem(address, operator);
        if (!modem) return { success: false, message: "⚠️ المودم غير متصل." };
        const list = await modem.getSmsListSerial();
        return { success: true, list };
    }
}

async function changeHiLinkIp(oldIp, newIp) {
    try {
        const cleanOldIp = oldIp.replace(/^https?:\/\//, '').split('/')[0];
        const res = await fetch(`http://${cleanOldIp}/api/webserver/SesTokInfo`, { timeout: 3000 }).catch(() => null);
        if (!res) return { success: false, message: "⚠️ لا يمكن الاتصال بالمودم القديم." };
        
        const textRes = await res.text();
        const session = textRes.match(/<SesInfo>(.*?)<\/SesInfo>/)?.[1];
        const token = textRes.match(/<TokInfo>(.*?)<\/TokInfo>/)?.[1];
        
        if (!session || !token) return { success: false, message: "⚠️ فشل الحصول على رموز الأمان." };
        
        const headers = { 
            'Cookie': session, 
            '__RequestVerificationToken': token, 
            'Content-Type': 'application/xml' 
        };
        
        // Fetch current DHCP settings
        const dhcpRes = await fetch(`http://${cleanOldIp}/api/dhcp/settings`, { headers, timeout: 3000 }).catch(() => null);
        if (!dhcpRes) return { success: false, message: "⚠️ فشل قراءة إعدادات DHCP الحالية." };
        
        let xmlConfig = await dhcpRes.text();
        
        if (!xmlConfig.includes('<DhcpIPAddress>')) {
            return { success: false, message: "⚠️ استجابة المودم لا تحتوي على إعدادات DHCP صحيحة." };
        }
        
        // Replace IPs based on the new subnet
        const ipParts = newIp.split('.');
        if (ipParts.length !== 4) return { success: false, message: "⚠️ صيغة IP الجديدة غير صحيحة." };
        
        const subnet = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}`;
        const startIp = `${subnet}.100`;
        const endIp = `${subnet}.200`;
        
        xmlConfig = xmlConfig.replace(/<DhcpIPAddress>.*?<\/DhcpIPAddress>/, `<DhcpIPAddress>${newIp}</DhcpIPAddress>`);
        xmlConfig = xmlConfig.replace(/<DhcpStartIPAddress>.*?<\/DhcpStartIPAddress>/, `<DhcpStartIPAddress>${startIp}</DhcpStartIPAddress>`);
        xmlConfig = xmlConfig.replace(/<DhcpEndIPAddress>.*?<\/DhcpEndIPAddress>/, `<DhcpEndIPAddress>${endIp}</DhcpEndIPAddress>`);
        
        // Post updated settings
        const postRes = await fetch(`http://${cleanOldIp}/api/dhcp/settings`, { method: 'POST', headers, body: xmlConfig }).catch(() => null);
        if (!postRes) return { success: false, message: "⚠️ فشل إرسال الإعدادات الجديدة للمودم." };
        
        const resultText = await postRes.text();
        if (resultText.includes('OK') || resultText.includes('success')) {
            // إرسال أمر إعادة التشغيل لتطبيق الـ IP الجديد
            const rebootXml = `<?xml version="1.0" encoding="UTF-8"?><request><Control>1</Control></request>`;
            await fetch(`http://${cleanOldIp}/api/device/control`, { method: 'POST', headers, body: rebootXml }).catch(() => null);
            
            return { success: true, message: `✅ تم تغيير الـ IP بنجاح. يتم الآن إعادة تشغيل المودم لتطبيق الـ IP الجديد: ${newIp}` };
        } else {
            return { success: false, message: "⚠️ المودم رفض التغيير." };
        }
    } catch (e) {
        return { success: false, message: e.message };
    }
}

module.exports = {
    sendUssdCommand,
    getSignalStrength,
    probeModem,
    pollHiLinkSms,
    sendSmsHiLink,
    getSmsListHiLink,
    dialNumber,
    hangupCall,
    getSmsList,
    changeHiLinkIp
};
