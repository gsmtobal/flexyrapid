const db = require('./database');
const AhlaAPI = require('./ahla_api_client.js');

let apiInstances = {};

// Helper to get settings from database
function getSetting(key, defaultValue = '') {
    return new Promise(resolve => {
        db.get(`SELECT value FROM settings WHERE key = ?`, [key], (err, row) => {
            resolve(row && row.value ? row.value.trim() : defaultValue);
        });
    });
}

function simLog(sim, message) {
    console.log(`[Ahla API Service] ${message}`);
    if (sim && sim.id) {
        process.emit('ahla-log', { id: sim.id, message: `[Ahla] ${message}`, type: 'info' });
        if (sim.address) {
            process.emit('modem-log', { address: sim.address, log: message });
        }
    }
}

// Ensures we are logged in to the API
async function ensureApiLoggedIn(sim) {
    if (!sim || !sim.id) {
        simLog(sim, "Error: ensureApiLoggedIn called without valid sim object!");
        return false;
    }

    if (!apiInstances[sim.id]) {
        apiInstances[sim.id] = new AhlaAPI();
    }
    const apiInstance = apiInstances[sim.id];

    if (apiInstance.loggedIn) {
        return true;
    }

    const phone = sim && sim.ahla_phone ? sim.ahla_phone : await getSetting('ooredoo_ahla_phone', '0558606784');
    const pin = sim && sim.ahla_pin ? sim.ahla_pin : await getSetting('ooredoo_ahla_pin', '7840');

    try {
        const result = await apiInstance.login(phone, pin);
        if (result && result.code === 0 && result.data && result.data.status === 'logged') {
            simLog(sim, 'Succès: Connexion Ahla réussie');
            return true;
        }
        simLog(sim, `Login failed: ${result.message}`);
        return false;
    } catch (e) {
        simLog(sim, `Login error: ${e.message}`);
        return false;
    }
}

// Extract text from API response (supports data.msg string and data.text array formats)
function extractMsgFromResult(result) {
    if (!result) return '';
    const d = result.data || result;
    if (d && d.msg) return d.msg;
    if (d && Array.isArray(d.text)) {
        return d.text.map(row => {
            if (Array.isArray(row)) {
                return row.filter(Boolean).join(' - ');
            }
            return String(row);
        }).filter(Boolean).join('\n');
    }
    return '';
}

// Parses string to find DZD/Dinar amount, prioritizing Storm account
function parseBalance(text) {
    if (!text) return null;
    // Priority: look for 'Compte Storm' first (dealer balance)
    const stormMatch = text.match(/Compte Storm\s*:\s*([\d]+[\.,][\d]+)\s*(?:Dinar|DA|دج)?/i);
    if (stormMatch) return stormMatch[1].replace(',', '.');
    // Standard DA pattern
    const matchDA = text.match(/(\d+[\.,]\d+)\s*(?:DA|Dinar|دينار|د\.ج|دج)/i) || text.match(/(?:DA|Dinar|دينار|د\.ج|دج)\s*(\d+[\.,]\d+)/i);
    if (matchDA) return matchDA[1].replace(',', '.');
    // Numeric fallback
    const matchNum = text.match(/\b(\d+[\.,]\d{2})\b/);
    if (matchNum) return matchNum[1].replace(',', '.');
    return null;
}

// Helper to safely call NBService and handle ErrorMultipleNBSessions on new sessions
async function safeCallNBService(sim, serviceCode, msg = '', sessionId = '', sessionContinue = '1') {
    if (!sim || !sim.id || !apiInstances[sim.id]) return null;
    let apiInstance = apiInstances[sim.id];
    let res = await apiInstance.callNBService(serviceCode, msg, sessionId, sessionContinue);
    
    // Auto-retry once on multiple sessions error, usually happens when starting a new session
    if (res && res.code === 1 && res.message === 'ErrorMultipleNBSessions') {
        simLog(sim, 'ErrorMultipleNBSessions detected. Clearing session and retrying...');
        await apiInstance.endNBService();
        res = await apiInstance.callNBService(serviceCode, msg, sessionId, sessionContinue);
    }
    
    // Auto-relogin on 401 Unauthorized
    if (res && (res.message === '401 Unauthorized' || res.error === '401 Unauthorized' || res.auth === false)) {
        simLog(sim, '401 Unauthorized detected. Clearing session and Re-logging in...');
        delete apiInstances[sim.id]; // Force a fresh instance to clear bad cookies
        const loggedIn = await ensureApiLoggedIn(sim);
        if (loggedIn) {
            res = await apiInstances[sim.id].callNBService(serviceCode, msg, sessionId, sessionContinue);
            if (res && (res.message === '401 Unauthorized' || res.error === '401 Unauthorized' || res.auth === false)) {
                res = { code: 1, message: "فشل استدعاء الخدمة بعد تسجيل الدخول بنجاح (استمرار ظهور 401). قد يكون الحساب محظوراً من أوريدو مؤقتاً." };
            }
        } else {
            simLog(sim, 'Re-login failed! Please check Ahla phone/pin in settings.');
            res = { code: 1, message: "فشل تسجيل الدخول إلى تطبيق أهلاً. تأكد من صحة رقم الهاتف و PIN في الإعدادات، أو قد يكون الحساب محظوراً." };
        }
    }
    
    return res;
}

// 1. Check Balance via *BalancePDV (Ahla specific hidden code)
async function checkBalance(sim) {
    try {
        simLog(sim, 'En cours: Vérification du solde via Ahla...');
        
        // Ensure logged in
        const isLoggedIn = await ensureApiLoggedIn(sim);
        if (!isLoggedIn) {
            return { success: false, message: 'فشل تسجيل الدخول إلى تطبيق أهلاً' };
        }

        // Get PIN code from SIM or fallback
        const simPin = sim && sim.sim_pin ? sim.sim_pin : '0000';

        // 1. Dial *BalancePDV
        let res = await safeCallNBService(sim, '*BalancePDV');
        let msg = extractMsgFromResult(res);
        let sessionId = (res && res.data && res.data.nb_session_id) ? res.data.nb_session_id.toString() : '';
        // Removed intermediate response log to keep balance check clean

        if (!msg || !msg.toLowerCase().includes('pin')) {
            const raw = JSON.stringify(res).substring(0, 300);
            return { success: false, message: `لم يطلب الخادم رمز PIN للرصيد. الرد الخام: ${raw}` };
        }

        // 2. Send PIN code with session_continue = '1' so we receive the final response!
        simLog(sim, `Sending PIN (${simPin}) for balance...`);
        res = await apiInstances[sim.id].callNBService('', simPin, sessionId, '1');
        const finalMsg = extractMsgFromResult(res);
        simLog(sim, `Final Balance response: "${finalMsg.replace(/\n/g, ' ')}"`);

        // Try to parse balance from the response
        const foundBalance = parseBalance(finalMsg);
        if (foundBalance) {
            const balanceToSave = `${foundBalance} DA`;
            db.run(`UPDATE sim_cards SET balance = ? WHERE operator = 'Ooredoo' AND transfer_method = 'Ahla App'`, [balanceToSave]);
            return { success: true, balance: foundBalance, message: `✅ رصيد أهلاً: ${balanceToSave}` };
        }

        // Return raw response text even if we couldn't parse it
        return {
            success: false,
            message: `رد التطبيق: ${finalMsg ? finalMsg.substring(0, 200) : 'استجابة فارغة من خادم أوريدو'}`
        };

    } catch (e) {
        simLog(sim, `checkBalance error: ${e.message}`);
        return { success: false, message: `خطأ API: ${e.message}` };
    }
}

// 2. Execute Flexy (Storm) via *580# interactive USSD
async function executeFlexy(sim, phone, amount) {
    try {
        simLog(sim, `En cours: Transfert de ${amount} DA vers ${phone} via Ahla...`);
        const isLoggedIn = await ensureApiLoggedIn(sim);
        if (!isLoggedIn) {
            return { success: false, message: 'فشل تسجيل الدخول إلى تطبيق أهلاً' };
        }

        const simPin = sim && sim.sim_pin ? sim.sim_pin : '0000';
        
        let sessionId = '';
        simLog(sim, 'En cours: Étape 1 (*580#)');
        let res = await safeCallNBService(sim, '*580#');
        if (!res || (res.code !== 0 && res.code !== "0")) {
             return { success: false, message: res ? `خطأ الخطوة 1: ${res.message}` : 'فشل الاتصال بخدمة أوريدو.' };
        }
        sessionId = (res.data && res.data.nb_session_id) ? res.data.nb_session_id.toString() : (res.data && res.data.session_id || '');
        if (res.data && res.data.session_continue == 0) return { success: false, message: extractMsgFromResult(res) };

        simLog(sim, `En cours: Étape 2 (Envoi numéro)`);
        res = await apiInstances[sim.id].callNBService('', phone, sessionId, '1');
        if (!res || (res.code !== 0 && res.code !== "0")) return { success: false, message: `خطأ الخطوة 2: ${res ? res.message : 'بدون رد'}` };
        sessionId = (res.data && res.data.nb_session_id) ? res.data.nb_session_id.toString() : (res.data && res.data.session_id) || sessionId;
        if (res.data && res.data.session_continue == 0) return { success: false, message: extractMsgFromResult(res) };

        simLog(sim, `En cours: Étape 3 (Envoi montant)`);
        res = await apiInstances[sim.id].callNBService('', amount.toString(), sessionId, '1');
        if (!res || (res.code !== 0 && res.code !== "0")) return { success: false, message: `خطأ الخطوة 3: ${res ? res.message : 'بدون رد'}` };
        sessionId = (res.data && res.data.nb_session_id) ? res.data.nb_session_id.toString() : (res.data && res.data.session_id) || sessionId;
        if (res.data && res.data.session_continue == 0) return { success: false, message: extractMsgFromResult(res) };

        simLog(sim, `En cours: Étape 4 (Envoi PIN)`);
        res = await apiInstances[sim.id].callNBService('', simPin, sessionId, '1');
        if (!res || (res.code !== 0 && res.code !== "0")) return { success: false, message: `خطأ الخطوة 4: ${res ? res.message : 'بدون رد'}` };
        sessionId = (res.data && res.data.nb_session_id) ? res.data.nb_session_id.toString() : (res.data && res.data.session_id) || sessionId;
        if (res.data && res.data.session_continue == 0) {
            let earlyMsg = extractMsgFromResult(res);
            // Verify if it's an error message.
            const msgKeywords = ['incorrect', 'inexistant', 'erreur', 'désactivé', 'invalide', 'impossible', 'insuffisant', 'suffisamment', 'dépassé', 'refusé', 'échoué', 'échec', 'non autorisé', 'non autorise', 'غير كافي', 'رصيدك', 'عفوا', 'خطأ', 'فشل', 'غير موجود', 'غير صالح', 'minimal'];
            if (msgKeywords.some(kw => earlyMsg.toLowerCase().includes(kw))) {
                return { success: false, message: earlyMsg };
            }
            // If it closed the session but isn't a known error, we still shouldn't continue to step 5.
            return { success: false, message: earlyMsg || 'انتهت الجلسة مبكراً.' };
        }

        simLog(sim, `En cours: Étape 5 (Confirmation)`);
        res = await apiInstances[sim.id].callNBService('', '1', sessionId, '1');
        
        let finalMsg = extractMsgFromResult(res);
        const rawRes = JSON.stringify(res);
        simLog(sim, `Réponse finale: ${finalMsg.replace(/\n/g, ' ')}`);

        if (!finalMsg) {
            if (res && (res.code === 0 || res.code === "0")) {
                finalMsg = 'تم إرسال الطلب بنجاح (بدون رسالة تأكيد من الشبكة).';
            } else {
                finalMsg = `بدون رد صريح. الرد الخام: ${rawRes}`;
            }
        }

        const msgKeywords = [
            'incorrect', 'inexistant', 'erreur', 'désactivé', 'invalide', 'impossible', 
            'insuffisant', 'suffisamment', 'dépassé', 'refusé', 'échoué', 'échec', 'non autorisé', 'non autorise',
            'غير كافي', 'رصيدك', 'عفوا', 'خطأ', 'فشل', 'غير موجود', 'غير صالح'
        ];
        
        if (msgKeywords.some(kw => finalMsg.toLowerCase().includes(kw))) {
            return { success: false, message: finalMsg };
        }
        
        // If it's a raw JSON response without a success code, be suspicious
        if (res && res.code !== 0 && res.code !== "0") {
            return { success: false, message: `رمز خطأ من التطبيق: ${finalMsg}` };
        }

        return { success: true, message: finalMsg };
    } catch (e) {
        simLog(sim, `executeFlexy error: ${e.message}`);
        return { success: false, message: `خطأ اتصال API: ${e.message}` };
    }
}

// 3. Test Connection
async function testConnection(sim) {
    try {
        console.log('[Ahla API Service] Testing API connection...');
        const isLoggedIn = await ensureApiLoggedIn(sim);
        
        if (isLoggedIn) {
            return {
                success: true,
                status: 'ready',
                message: `تطبيق اهلا مفتوح وينتضر الاوامر`
            };
        } else {
            return {
                success: false,
                status: 'error',
                message: `❌ فشل الاتصال بتطبيق أهلاً. يرجى التأكد من صحة رقم الهاتف والرقم السري في الإعدادات.`
            };
        }
    } catch (e) {
        return { success: false, status: 'error', message: `خطأ: ${e.message}` };
    }
}

// 4. Get Ooredoo Offers via *585# USSD interactive session
async function getOoredooOffers(sim, phone) {
    try {
        const isLoggedIn = await ensureApiLoggedIn(sim);
        if (!isLoggedIn) return { success: false, message: 'فشل تسجيل الدخول إلى تطبيق أهلاً' };

        simLog(sim, `En cours: Recherche des offres pour ${phone} (*585#)...`);
        
        // Step 1: dial *585#
        let res = await safeCallNBService(sim, '*585#');
        let msg = extractMsgFromResult(res);
        let sessionId = (res.data && res.data.nb_session_id) ? res.data.nb_session_id.toString() : '';
        simLog(sim, `Réponse: ${msg.replace(/\n/g, ' ')}`);

        if (!msg) {
            const rawResponse = res ? JSON.stringify(res) : 'بدون رد';
            return { success: false, message: `لا يوجد نص من خدمة العروض *585#. الرد الخام: ${rawResponse}` };
        }

        // Step 2: send destination phone number
        res = await apiInstances[sim.id].callNBService('', phone, sessionId, '1');
        msg = extractMsgFromResult(res);
        sessionId = (res.data && res.data.nb_session_id) ? res.data.nb_session_id.toString() : sessionId;
        simLog(sim, `Réponse finale: <br>&nbsp;&nbsp;${msg.replace(/\n/g, '<br>&nbsp;&nbsp;')}`);

        // Parse available offers from response
        const offers = [];
        if (msg) {
            const lines = msg.split(/[\n,]+/);
            for (let i = 0; i < lines.length; i++) {
                let line = lines[i].trim();
                if (!line) continue;
                
                // Try format "1- Offer text"
                let match = line.match(/^(\d+)[\s\-\.\:\)]+(.+)$/);
                if (match && match[1] !== '0') {
                    offers.push({ choice: match[1], text: `${match[1]} - ${match[2].trim()}` });
                    continue;
                }
                
                // Try format where number is on one line, text on next
                let numMatch = line.match(/^(\*?\d+\#?)$/);
                if (numMatch && numMatch[1] !== '0' && i + 1 < lines.length) {
                    let nextLine = lines[i+1].trim();
                    // if next line is not just a number, it's the description
                    if (!nextLine.match(/^(\*?\d+\#?)$/)) {
                        offers.push({ choice: numMatch[1], text: `${numMatch[1]} - ${nextLine}` });
                        i++; // skip next line since we consumed it
                        continue;
                    }
                }
            }
            
            // Fallback: If still empty, maybe they are just spaced out like "1 MAXY 2 YOOZ"
            if (offers.length === 0) {
                const parts = msg.split(/\s+/);
                for(let i = 0; i < parts.length - 1; i++) {
                    if (parts[i].match(/^\d+$/) && parts[i] !== '0' && !parts[i+1].match(/^\d+$/)) {
                        offers.push({ choice: parts[i], text: `${parts[i]} - ${parts[i+1]}` });
                    }
                }
            }
        }

        if (offers.length === 0) {
            const rawResponse2 = res ? JSON.stringify(res) : '';
            return { success: false, message: msg || `لم يتم العثور على عروض. الرد: ${rawResponse2}` };
        }

        return { success: true, offers, sessionId, rawMsg: msg };
    } catch (e) {
        simLog(sim, `getOoredooOffers error: ${e.message}`);
        return { success: false, message: `خطأ API: ${e.message}` };
    }
}

// 5. Activate Ooredoo Offer
async function activateOoredooOffer(sim, phone, choiceOrText) {
    try {
        const isLoggedIn = await ensureApiLoggedIn(sim);
        if (!isLoggedIn) return { success: false, message: 'فشل تسجيل الدخول إلى تطبيق أهلاً' };

        const choice = choiceOrText.toString().trim().split('-')[0].trim();
        simLog(sim, `En cours: Activation de l'offre (${choice}) pour ${phone}...`);

        let res = await safeCallNBService(sim, '*585#');
        if (!res || (res.code !== 0 && res.code !== "0")) {
            return { success: false, message: res ? `خطأ الخطوة 1: ${res.message}` : 'فشل الاتصال بخدمة أوريدو.' };
        }
        let sessionId = (res.data && res.data.nb_session_id) ? res.data.nb_session_id.toString() : '';

        // Step 2: Send Phone
        res = await apiInstances[sim.id].callNBService('', phone, sessionId, '1');
        if (!res || (res.code !== 0 && res.code !== "0")) return { success: false, message: `خطأ الخطوة 2: ${res ? res.message : 'بدون رد'}` };
        sessionId = (res.data && res.data.nb_session_id) ? res.data.nb_session_id.toString() : sessionId;

        // Step 3: Send Choice
        res = await apiInstances[sim.id].callNBService('', choice, sessionId, '1');
        if (!res || (res.code !== 0 && res.code !== "0")) return { success: false, message: `خطأ الخطوة 3: ${res ? res.message : 'بدون رد'}` };
        sessionId = (res.data && res.data.nb_session_id) ? res.data.nb_session_id.toString() : sessionId;
        
        let msg = extractMsgFromResult(res);
        simLog(sim, `Réponse après choix: ${msg.replace(/\n/g, ' ')}`);

        const errorKeywords = [
            'incorrect', 'inexistant', 'erreur', 'désactivé', 'invalide', 'impossible', 
            'insuffisant', 'refusé', 'échoué', 'not found', 'dépassé', 'non autorisé', 'non autorise',
            'غير كافي', 'عفوا', 'خطأ', 'فشل', 'غير صالح'
        ];

        if (errorKeywords.some(kw => msg.toLowerCase().includes(kw))) {
            return { success: false, message: msg };
        }

        // Step 4: Send PIN if requested
        if (msg && msg.toLowerCase().includes('pin')) {
            const simPin = sim && sim.sim_pin ? sim.sim_pin : '0000';
            simLog(sim, `En cours: Envoi du code PIN (${simPin}) pour l'activation...`);
            res = await apiInstances[sim.id].callNBService('', simPin, sessionId, '1');
            if (!res || (res.code !== 0 && res.code !== "0")) return { success: false, message: `خطأ إدخال PIN: ${res ? res.message : 'بدون رد'}` };
            sessionId = (res.data && res.data.nb_session_id) ? res.data.nb_session_id.toString() : sessionId;
            msg = extractMsgFromResult(res);
            simLog(sim, `Réponse après PIN: ${msg.replace(/\n/g, ' ')}`);
            
            if (errorKeywords.some(kw => msg.toLowerCase().includes(kw))) {
                return { success: false, message: msg };
            }
        }

        // Step 5: Send 1 to confirm if session is still continuing
        if (res.data && res.data.session_continue == 1) {
            simLog(sim, `En cours: Envoi de la confirmation (1)...`);
            res = await apiInstances[sim.id].callNBService('', '1', sessionId, '1');
            if (!res || (res.code !== 0 && res.code !== "0")) return { success: false, message: `خطأ التأكيد: ${res ? res.message : 'بدون رد'}` };
            msg = extractMsgFromResult(res);
            simLog(sim, `Réponse finale après confirmation: ${msg.replace(/\n/g, ' ')}`);
            
            if (errorKeywords.some(kw => msg.toLowerCase().includes(kw))) {
                return { success: false, message: msg };
            }
        }

        return { success: true, message: msg || 'تم تفعيل العرض بنجاح.' };
    } catch (e) {
        simLog(sim, `activateOoredooOffer error: ${e.message}`);
        return { success: false, message: `خطأ API: ${e.message}` };
    }
}

// Dummy functions for backward compatibility with main.js
async function prepareDevice(adbPath) {
    console.log('[Ahla API Service] prepareDevice called, using API instead of ADB.');
    return true;
}

async function getAdbPath() {
    return 'API_MODE_NO_ADB';
}

module.exports = {
    checkBalance,
    executeFlexy,
    testConnection,
    getOoredooOffers,
    activateOoredooOffer,
    prepareDevice,
    getAdbPath
};
