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

const express = require('express');
let puppeteer;
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const modemService = require('./modem_service');

async function getPuppeteer() {
    if (!puppeteer) {
        const module = await import('puppeteer');
        puppeteer = module.default || module;
    }
    return puppeteer;
}

const app = express();
app.use(express.json());
app.use(cors());

let idoomBrowser = null;
let meetmobBrowser = null;
let meetmobPage = null;
let isMeetmobRecharging = false;
let meetmobCredentials = {};
let API_KEY = 'c524ac5fde2b1a1b3f5f2c1707639e85';

app.post('/update-api-key', (req, res) => {
    const { key } = req.body;
    if (key) {
        API_KEY = key;
        return res.json({ success: true });
    }
    res.json({ success: false });
});

app.post('/recharge-idoom', async (req, res) => {
    const { account, pin } = req.body;
    console.log(`\n[RECHARGE] 📱 Numéro: ${account} | 💳 PIN: ${pin.substring(0,4)}****`);

    try {
        if (!idoomBrowser) {
            const puppeteerLib = await getPuppeteer();
            idoomBrowser = await puppeteerLib.launch({ 
                headless: false, 
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox',
                    '--window-position=0,10000', 
                    '--window-size=1280,800',
                    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                ]
            });
        }

        const page = await idoomBrowser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        page.setDefaultNavigationTimeout(30000);
        
        await page.setRequestInterception(true);
        page.on('request', req => {
            const rt = req.resourceType();
            const url = req.url().toLowerCase();
            
            if (['font', 'media'].includes(rt)) {
                req.abort();
            } else if (url.includes('google-analytics') || url.includes('facebook') || url.includes('youtube')) {
                req.abort();
            } else {
                req.continue();
            }
        });

        let currentDialogMessage = '';
        page.on('dialog', async dialog => {
            currentDialogMessage = dialog.message();
            await page.evaluate((msg) => window.__currentDialogMessage = msg, currentDialogMessage).catch(() => {});
            await dialog.accept();
        });

        const cleanAcc = account.toString().trim();
        const is4G = (cleanAcc.startsWith('21347') && cleanAcc.length === 12) || 
                      (cleanAcc.startsWith('047') && cleanAcc.length === 10) || 
                      (cleanAcc.startsWith('47') && cleanAcc.length === 9);
        const targetUrl = `https://paiement.at.dz/index.php?p=voucher_internet&produit=${is4G ? '4g' : 'in'}`;
        
        await page.goto(targetUrl, { waitUntil: 'networkidle0' });

        console.log(`[RECHARGE] Type: ${is4G ? 'Idoom 4G' : 'Idoom ADSL/Fibre'}`);

        async function solveCaptcha(page) {
            const captchaSelector = 'img#captcha';
            await page.waitForSelector(captchaSelector, { visible: true, timeout: 15000 });
            
            const captchaElement = await page.$(captchaSelector);
            if (!captchaElement) throw new Error('Captcha element not found');

            await page.waitForFunction((sel) => {
                const img = document.querySelector(sel);
                return img && img.complete && img.naturalWidth > 0;
            }, { timeout: 10000 }, captchaSelector);

            const captchaBuffer = await captchaElement.screenshot({ encoding: 'base64' });
            return sendTo2Captcha(captchaBuffer);
        }

        async function sendTo2Captcha(captchaBuffer) {
            const submitRes = await axios.post('https://2captcha.com/in.php', {
                key: API_KEY,
                method: 'base64',
                body: captchaBuffer,
                json: 1
            });
            if (submitRes.data.status !== 1) throw new Error('API Error: ' + submitRes.data.request);
            
            const captchaId = submitRes.data.request;
            // Wait 3s first (2captcha needs minimum processing time), then poll every 500ms
            await new Promise(r => setTimeout(r, 3000));
            for (let i = 0; i < 30; i++) {
                const resultRes = await axios.get(`https://2captcha.com/res.php?key=${API_KEY}&action=get&id=${captchaId}&json=1`);
                if (resultRes.data.status === 1) return resultRes.data.request;
                if (resultRes.data.request !== 'CAPCHA_NOT_READY') throw new Error('API Error: ' + resultRes.data.request);
                await new Promise(r => setTimeout(r, 500));
            }
            throw new Error('API Timeout');
        }

        // STEP 1: Account
        let step1Success = false;
        for (let i = 1; i <= 2 && !step1Success; i++) {
            console.log(`[STAGE 1] 🔄 Tentative ${i}...`);
            try {
                const currentUrl = page.url();
                const needsNavigation = i > 1 || !currentUrl.includes(is4G ? 'produit=4g' : 'produit=in');
                if (needsNavigation) {
                    console.log(`[STAGE 1] 🔄 Navigation vers la page cible...`);
                    await page.goto(targetUrl, { waitUntil: 'networkidle2' });
                }

                await page.waitForSelector('input#nd', { visible: true, timeout: 15000 });
                await page.click('input#nd', { clickCount: 3 });
                await page.keyboard.press('Backspace');
                await page.type('input#nd', account);
                
                const captchaCode = await solveCaptcha(page);
                
                // Stage 1 captcha field is input[name="userCode"]
                await page.waitForSelector('input[name="userCode"]', { visible: true, timeout: 10000 });
                await page.type('input[name="userCode"]', captchaCode);

                const confirmBtnSelector = 'input.btn-green, input[type="submit"], .btn-green';
                await page.waitForSelector(confirmBtnSelector, { visible: true, timeout: 5000 }).catch(() => {});
                
                await page.click(confirmBtnSelector);

                // Wait up to 10 seconds for the page state to transition or display results
                console.log(`[STAGE 1] ⏳ Attente de la transition de page...`);
                let transitioned = false;
                for (let j = 0; j < 30; j++) {
                    await new Promise(r => setTimeout(r, 200));
                    const status = await page.evaluate((is4G) => {
                        const hasPinField = !!document.querySelector('input[name="voucher"], input[name="v_code"]');
                        const hasError = !!document.querySelector('.alert-danger, font[color="red"], .text-danger, .titre-rouge') ||
                                         document.body.innerText.match(/(code de sécurité incorrect|code saisi incorrect|numéro de téléphone est erroné|numéro 4g lte n'existe pas|numéro inexistant|veuillez saisir|champs obligatoires)/i);
                        
                        const url = window.location.href;
                        const redirected = !url.includes(is4G ? 'produit=4g' : 'produit=in');
                        
                        return hasPinField || hasError || redirected;
                    }, is4G).catch(() => false);
                    
                    if (status) {
                        transitioned = true;
                        break;
                    }
                }
                
                if (!transitioned) {
                    console.log(`[STAGE 1] ⚠️ Timeout de transition. Vérification finale...`);
                }

                // Check for success or error
                const siteStatus = await page.evaluate(() => {
                    const hasPinField = !!document.querySelector('input[name="voucher"], input[name="v_code"]');
                    const domError = document.querySelector('.alert-danger, font[color="red"], .text-danger, .titre-rouge')?.innerText.trim() ||
                        (() => { const m = document.body.innerText.match(/(code saisi incorrect|numéro de téléphone est erroné|numéro inexistant|champs obligatoires)/i); return m ? m[0] : null; })();
                    return { hasPinField, domError };
                });
                
                const error = siteStatus.domError || currentDialogMessage || null;
                
                if (siteStatus.hasPinField) {
                    step1Success = true;
                    console.log(`[STAGE 1] ✅ PIN form detected.`);
                } else if (error) {
                    currentDialogMessage = '';
                    const lowerErr = error.toLowerCase();
                    const isCaptchaError = lowerErr.includes('sécurité') || lowerErr.includes('captcha') || lowerErr.includes('image') || lowerErr.includes('code saisi');
                    if (!isCaptchaError) {
                        await page.close();
                        return res.json({ success: false, message: error });
                    }
                }
            } catch (e) {
                console.log(`[ERROR] Step 1 (Attempt ${i}): ${e.message}`);
            }
        }

        if (!step1Success) {
            await page.close();
            return res.json({ success: false, message: '❌ فشل التحقق من رقم الحساب بعد محاولتين.' });
        }

        // STEP 2: PIN
        let step2Success = false;
        let step2Details = '';
        for (let i = 1; i <= 1 && !step2Success; i++) {
            try {
                await page.waitForSelector('input[name="voucher"], input[name="v_code"]', { visible: true, timeout: 10000 });
                
                const pinSelector = await page.$('input[name="voucher"]') ? 'input[name="voucher"]' : 'input[name="v_code"]';
                await page.click(pinSelector, { clickCount: 3 });
                await page.keyboard.press('Backspace');
                await page.type(pinSelector, pin);
                
                const captchaCode = await solveCaptcha(page);
                
                // Stage 2 captcha field is always input[name="userCode"]
                await page.waitForSelector('input[name="userCode"]', { visible: true, timeout: 5000 });
                await page.click('input[name="userCode"]');
                await page.type('input[name="userCode"]', captchaCode);
                
                const rechargeBtnSelector = 'input.btn-green[value="Recharger"], input.btn-green, input[type="submit"]';
                await page.waitForSelector(rechargeBtnSelector, { visible: true, timeout: 5000 }).catch(() => {});
                
                await page.click(rechargeBtnSelector);

                // Wait up to 10 seconds for the page state to transition or display results
                console.log(`[STAGE 2] ⏳ Attente de la transition de page...`);
                let transitioned = false;
                for (let j = 0; j < 40; j++) {
                    await new Promise(r => setTimeout(r, 200));
                    const status = await page.evaluate(() => {
                        const bodyText = document.body.innerText.toLowerCase();
                        const hasSuccess = bodyText.includes('succès') || bodyText.includes('rechargement') || bodyText.includes('success');
                        const hasError = !!document.querySelector('.alert-danger, font[color="red"], .text-danger, .titre-rouge, .titre-rouge-connexion') ||
                                         document.body.innerText.match(/(code de sécurité incorrect|code saisi incorrect|veuillez saisir|champs obligatoires|invalide|déjà utilisé|incorrect|non valide)/i);
                        return hasSuccess || hasError;
                    }).catch(() => false);
                    
                    if (status || currentDialogMessage) {
                        transitioned = true;
                        break;
                    }
                }
                
                if (!transitioned) {
                    console.log(`[STAGE 2] ⚠️ Timeout de transition. Vérification finale...`);
                }

                // Check for success or error
                const result = await page.evaluate(() => {
                    const bodyText = document.body.innerText;
                    const body = bodyText.toLowerCase();
                    
                    // Precise success: "Rechargement effectué" or "avec succès"
                    const isSuccess = body.includes('rechargement effectu') || 
                                      body.includes('avec succès') || 
                                      body.includes('opération réussie') ||
                                      (body.includes('succès') && !body.includes('erreur'));
                    
                    if (isSuccess) {
                        // Extract structured data from the success page
                        const data = {};
                        const rows = document.querySelectorAll('table tr, .panel tr, .info-row');
                        rows.forEach(row => {
                            const cells = row.querySelectorAll('td, th');
                            if (cells.length >= 2) {
                                const key = cells[0].innerText.trim().replace(':', '');
                                const val = cells[1].innerText.trim();
                                if (key && val) data[key] = val;
                            }
                        });
                        
                        // Also extract from labeled paragraphs or divs
                        document.querySelectorAll('p, .field, .row, li').forEach(el => {
                            const text = el.innerText.trim();
                            const match = text.match(/^([^:]+):\s*(.+)$/);
                            if (match) data[match[1].trim()] = match[2].trim();
                        });
                        
                        const fullText = document.body.innerText.trim();
                        return { success: true, details: fullText, structuredData: data };
                    }
                    
                    // Expanded error detection
                    let domError = document.querySelector('.alert-danger, font[color="red"], .text-danger, .titre-rouge, .titre-rouge-connexion')?.innerText.trim();
                    if (!domError) {
                        const bodyMatch = bodyText.match(/(carte non existante|code de recharge invalide|déjà utilisée?|non valide|invalide|erroné|carte invalide|rechargement refusé|code incorrect)/i);
                        if (bodyMatch) domError = bodyMatch[0];
                    }
                    // Also check page title/heading for error
                    if (!domError && body.includes('erreur')) {
                        const h2 = document.querySelector('h2, h3, .titre');
                        if (h2) domError = h2.innerText.trim();
                    }
                    return { success: false, domError };
                });
 
                const step2Error = result.domError || currentDialogMessage || null;
 
                if (result.success) {
                    step2Success = true;
                    step2Details = result.details;
                } else if (step2Error) {
                    console.log(`[SITE ERROR] ⚠️ ${step2Error}`);
                    
                    // Clear current dialog message
                    await page.evaluate(() => window.__currentDialogMessage = '').catch(() => {});
                    currentDialogMessage = '';
 
                    const lowerErr = step2Error.toLowerCase();
                    const isCaptchaError = lowerErr.includes('sécurité') || lowerErr.includes('captcha') || lowerErr.includes('image');
                    
                    if (!isCaptchaError) {
                        // If it's a real error (not captcha), stop retrying
                        await page.close();
                        return res.json({ success: false, message: step2Error });
                    }
                }
            } catch (e) {
                console.log(`[ERROR] Step 2 Exception (Attempt ${i}): ${e.message}`);
            }
        }
 
        await page.close();
        if (step2Success) {
            console.log(`[SUCCESS] ✅ TESSAHLI ! Rechargement réussi pour ${account}`);
            res.json({ 
                success: true, 
                message: 'تمت التعبئة بنجاح!', 
                details: step2Details || 'تمت عملية الشحن بنجاح عبر البوابة.',
                structuredData: result.structuredData || {}
            });
        } else {
            // Get last error from page before closing
            res.json({ success: false, message: '❌ فشل تفعيل البطاقة. تأكد من صحة الكود أو أنه غير مستعمل.' });
        }

    } catch (error) {
        if (idoomBrowser) {
            const pages = await idoomBrowser.pages();
            for (const p of pages) await p.close();
        }
        console.log(`[ERROR] 🛑 ${error.message}`);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/check-bill-idoom', async (req, res) => {
    const { account } = req.body;
    
    // Auto-convert to local format starting with 0 if it starts with 213 (required by billing portal)
    let cleanAccount = account.toString().trim();
    if (cleanAccount.startsWith('213') && cleanAccount.length >= 11) {
        cleanAccount = '0' + cleanAccount.substring(3);
    }
    
    console.log(`\n[BILL CHECK] 📱 Numéro: ${cleanAccount} (Original: ${account})`);

    try {
        if (!idoomBrowser) {
            const puppeteerLib = await getPuppeteer();
            idoomBrowser = await puppeteerLib.launch({ 
                headless: false, 
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox',
                    '--window-position=0,10000', 
                    '--window-size=1280,800',
                    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                ]
            });
        }

        const page = await idoomBrowser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        page.setDefaultNavigationTimeout(30000);
        
        await page.setRequestInterception(true);
        page.on('request', req => {
            const rt = req.resourceType();
            if (['font', 'media'].includes(rt)) req.abort();
            else req.continue();
        });

        await page.goto('https://paiement.at.dz/index.php?p=dette_paiement', { waitUntil: 'networkidle0' });

        async function solveCaptcha(page) {
            const captchaSelector = 'img#captcha';
            await page.waitForSelector(captchaSelector, { visible: true, timeout: 15000 });
            const captchaElement = await page.$(captchaSelector);
            if (!captchaElement) throw new Error('Captcha element not found');
            await page.waitForFunction((sel) => {
                const img = document.querySelector(sel);
                return img && img.complete && img.naturalWidth > 0;
            }, { timeout: 10000 }, captchaSelector);
            const captchaBuffer = await captchaElement.screenshot({ encoding: 'base64' });
            const submitRes = await axios.post('https://2captcha.com/in.php', {
                key: API_KEY, method: 'base64', body: captchaBuffer, json: 1
            });
            if (submitRes.data.status !== 1) throw new Error('API Error: ' + submitRes.data.request);
            const captchaId = submitRes.data.request;
            await new Promise(r => setTimeout(r, 3000));
            for (let i = 0; i < 30; i++) {
                const resultRes = await axios.get(`https://2captcha.com/res.php?key=${API_KEY}&action=get&id=${captchaId}&json=1`);
                if (resultRes.data.status === 1) return resultRes.data.request;
                if (resultRes.data.request !== 'CAPCHA_NOT_READY') throw new Error('API Error: ' + resultRes.data.request);
                await new Promise(r => setTimeout(r, 500));
            }
            throw new Error('API Timeout');
        }

        let checkSuccess = false;
        let amount = '0.00';
        let errorMessage = '';

        for (let i = 1; i <= 3 && !checkSuccess; i++) {
            try {
                if (i > 1) await page.goto('https://paiement.at.dz/index.php?p=dette_paiement', { waitUntil: 'networkidle2' });

                await page.waitForSelector('input[name="nd"]', { visible: true, timeout: 15000 });
                await page.type('input[name="nd"]', cleanAccount);
                
                const captchaCode = await solveCaptcha(page);
                await page.type('input[name="userCode"]', captchaCode);
                
                await Promise.all([
                    page.click('input[name="valider"]'),
                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {})
                ]);

                const result = await page.evaluate(() => {
                    const error = document.querySelector('.titre-rouge, .alert-danger, .text-danger')?.innerText.trim();
                    if (error) return { success: false, error };

                    // Priority 1: Check for #montant input value (found on dette_paiement_suite)
                    const montantInput = document.getElementById('montant');
                    if (montantInput && montantInput.value) {
                        const val = montantInput.value.replace('Le montant à payer', '').replace('DA', '').trim();
                        if (val) return { success: true, amount: val };
                    }

                    // Priority 2: Regex check on body text
                    const bodyText = document.body.innerText;
                    const amountMatch = bodyText.match(/(\d+[\.,]\d{2,})\s*DA/i) || bodyText.match(/المبلغ\s*:\s*(\d+[\.,]\d{2,})/);
                    
                    if (amountMatch) return { success: true, amount: amountMatch[1] };
                    
                    // Fallback: check if we are on the payment selection page
                    if (document.body.innerText.includes('Saisissez le montant') || document.body.innerText.includes('اختيار مبلغ')) {
                         return { success: true, amount: 'موجودة (يرجى مراجعة الموقع)' };
                    }

                    return { success: false, error: 'لم يتم العثور على المبلغ' };
                });

                if (result.success) {
                    checkSuccess = true;
                    amount = result.amount;
                } else if (result.error) {
                    errorMessage = result.error;
                    if (errorMessage.includes('inexistant') || errorMessage.includes('incorrect') && !errorMessage.toLowerCase().includes('sécurité')) {
                        break; // Stop retrying for fatal errors
                    }
                }
            } catch (e) {
                console.log(`[ERROR] Check Attempt ${i}: ${e.message}`);
            }
        }

        await page.close();
        if (checkSuccess) {
            console.log(`[SUCCESS] ✅ Facture pour ${account}: ${amount} DA`);
            res.json({ success: true, amount: amount });
        } else {
            res.json({ success: false, message: errorMessage || 'فشلت العملية' });
        }

    } catch (error) {
        if (idoomBrowser) {
            const pages = await idoomBrowser.pages();
            for (const p of pages) await p.close();
        }
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// MOBILIS MEETMOB AUTOMATION ENDPOINTS
// ==========================================

// Helper to initialize browser session with cookie/localStorage persistence
async function initMeetmobBrowserSession() {
    if (!meetmobBrowser) {
        const userDataDir = path.join(__dirname, 'meetmob_profile');
        console.log(`[Meetmob] Launching browser with persistent profile directory: ${userDataDir}`);
        const puppeteerLib = await getPuppeteer();
        meetmobBrowser = await puppeteerLib.launch({ 
            headless: false, 
            userDataDir: userDataDir,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--ignore-certificate-errors',
                '--ignore-certificate-errors-spki-list'
            ]
        });
    }

    if (!meetmobPage) {
        meetmobPage = await meetmobBrowser.newPage();
        await meetmobPage.setViewport({ width: 1280, height: 800 });
        meetmobPage.setDefaultNavigationTimeout(30000);
    }
}

app.post('/meetmob/send-otp', async (req, res) => {
    const { phone, pin, modemAddress } = req.body;
    console.log(`\n[Meetmob] 🔑 Demande OTP pour: ${phone} | Modem: ${modemAddress}`);
    meetmobCredentials = { phone, pin, modemAddress };

    try {
        // Automatically enforce static routing for Mobilis portal via the specified modem IP if it is a HiLink IP modem
        const cleanModemIp = modemAddress.replace(/^https?:\/\//, '').split('/')[0];
        const isIpAddress = cleanModemIp.match(/^\d+\.\d+\.\d+\.\d+$/);
        if (false && isIpAddress) {
            console.log(`[Meetmob Routing] 🌐 Enforcing Mobilis static route through: ${cleanModemIp}`);
            
            await new Promise((resolveRoute) => {
                const { exec } = require('child_process');
                
                // Safety guard: force resolve the Promise after 3.5 seconds to prevent any potential hangs!
                const safetyTimeout = setTimeout(() => {
                    console.log(`[Meetmob Routing] ⚠️ Routing Promise took too long or is waiting for UAC. Proceeding to browser launch...`);
                    resolveRoute();
                }, 3500);

                const originalResolve = resolveRoute;
                resolveRoute = () => {
                    clearTimeout(safetyTimeout);
                    originalResolve();
                };

                let resolvedIp = "197.202.164.2";
                
                const directCmd = `route delete ${resolvedIp} & route delete 197.202.0.0 & route delete 197.200.0.0 & route delete 10.0.0.0 & route add ${resolvedIp} mask 255.255.255.255 ${cleanModemIp} metric 1 & route add 197.202.0.0 mask 255.255.0.0 ${cleanModemIp} metric 1 & route add 197.200.0.0 mask 255.255.0.0 ${cleanModemIp} metric 1 & route add 10.0.0.0 mask 255.0.0.0 ${cleanModemIp} metric 1`;
                
                const verifyRoutes = (callback) => {
                    exec('route print | findstr "197.202. 197.200. 10.0.0."', (printErr, printStdout) => {
                        if (!printErr && printStdout && printStdout.trim()) {
                            console.log(`[Meetmob Routing] 📋 Active routes in Windows:\n${printStdout.trim()}`);
                        } else {
                            console.log(`[Meetmob Routing] ⚠️ No active routes detected for Mobilis subnets! Check network connection.`);
                        }
                        callback();
                    });
                };
                
                console.log(`[Meetmob Routing] ⚡ Executing direct route command...`);
                exec(directCmd, (directErr, stdout, stderr) => {
                    if (!directErr) {
                        console.log(`[Meetmob Routing] ✅ Direct route addition succeeded!`);
                        verifyRoutes(resolveRoute);
                    } else {
                        // If direct execution fails (e.g. requires elevation), fallback to UAC prompt
                        console.log(`[Meetmob Routing] ⚠️ Direct execution failed (needs admin rights). Spawning UAC elevation prompt...`);
                        const routeCmd = `powershell -NoProfile -Command "Start-Process cmd -Verb RunAs -WindowStyle Hidden -ArgumentList '/c ${directCmd.replace(/"/g, '\\"')}'"`;
                        
                        exec(routeCmd, (uacErr) => {
                            if (uacErr) {
                                console.error(`[Meetmob Routing Error] UAC route enforcement failed: ${uacErr.message}`);
                                resolveRoute();
                            } else {
                                console.log(`[Meetmob Routing] ✅ Enforced static routes via UAC elevation successfully!`);
                                verifyRoutes(resolveRoute);
                            }
                        });
                    }
                });
            });
            
            // Wait an extra 1.5 seconds for network routes to refresh
            await new Promise(r => setTimeout(r, 1500));
        }

        // Close previous page if any, and initialize a new clean page for the fresh login OTP flow
        if (meetmobPage) {
            await meetmobPage.close().catch(() => {});
            meetmobPage = null;
        }
        await initMeetmobBrowserSession();

        console.log(`[Meetmob] 🌐 Navigation vers la page d'accueil pour connexion...`);
        try {
            await meetmobPage.goto('https://meetmob.mobilis.dz/EcareWeb/#/login', { waitUntil: 'domcontentloaded', timeout: 25000 });
        } catch (gotoErr) {
            console.log(`[Meetmob Warning] Navigation timeout or warning: ${gotoErr.message}. Checking page elements...`);
        }

        // Fill credentials using highly robust native typing
        try {
            console.log(`[Meetmob] Waiting for login form to be fully rendered...`);
            await meetmobPage.waitForFunction(() => {
                const phoneInput = document.querySelector('input[placeholder="Numéro de téléphone"]');
                const pinInput = document.querySelector('input[placeholder="Mot de passe"]');
                if (phoneInput && pinInput) return true;

                const visibleInputs = Array.from(document.querySelectorAll('input')).filter(i => {
                    const style = window.getComputedStyle(i);
                    const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && i.offsetWidth > 0 && i.offsetHeight > 0;
                    const isValidType = ['text', 'password', 'number', 'tel', 'email'].includes((i.type || '').toLowerCase());
                    return isVisible && isValidType;
                });
                return visibleInputs.length >= 2;
            }, { timeout: 15000 });
        } catch (err) {
            console.log(`[Meetmob Warning] Inputs not fully loaded by exact matches: ${err.message}. Using general visible inputs check...`);
        }

        // Run smart DOM element identifier
        const fieldsFound = await meetmobPage.evaluate(() => {
            // Check exact Element Plus selectors first (highly robust)
            let phoneInput = document.querySelector('input[placeholder="Numéro de téléphone"]');
            let pinInput = document.querySelector('input[placeholder="Mot de passe"]');

            if (phoneInput && pinInput) {
                phoneInput.setAttribute('data-puppeteer-field', 'phone');
                pinInput.setAttribute('data-puppeteer-field', 'pin');
                return { hasPhone: true, hasPin: true };
            }

            const visibleInputs = Array.from(document.querySelectorAll('input')).filter(i => {
                const style = window.getComputedStyle(i);
                return style.display !== 'none' && style.visibility !== 'hidden' && i.offsetWidth > 0 && i.offsetHeight > 0;
            });
            const textFields = visibleInputs.filter(i => ['text', 'tel', 'number', 'password'].includes((i.type || '').toLowerCase()));
            
            // Find Phone input
            phoneInput = textFields.find(i => {
                const id = (i.id || '').toLowerCase();
                const placeholder = (i.placeholder || '').toLowerCase();
                const name = (i.name || '').toLowerCase();
                return id.includes('phone') || id.includes('user') || id.includes('login') ||
                       placeholder.includes('هاتف') || placeholder.includes('phone') || placeholder.includes('user') ||
                       name.includes('phone') || name.includes('user') || name.includes('username');
            });

            // Find PIN/Password input
            pinInput = textFields.find(i => {
                const id = (i.id || '').toLowerCase();
                const placeholder = (i.placeholder || '').toLowerCase();
                const name = (i.name || '').toLowerCase();
                return i.type === 'password' || id.includes('pin') || id.includes('pass') ||
                       placeholder.includes('رمز') || placeholder.includes('pin') || placeholder.includes('pass') ||
                       name.includes('pin') || name.includes('pass') || name.includes('password');
            });

            // Fallback to index if not found by keywords
            if (!phoneInput && textFields.length > 0) phoneInput = textFields[0];
            if (!pinInput && textFields.length > 1) {
                pinInput = textFields.find(i => i !== phoneInput) || textFields[1];
            }

            if (phoneInput) phoneInput.setAttribute('data-puppeteer-field', 'phone');
            if (pinInput) pinInput.setAttribute('data-puppeteer-field', 'pin');

            return {
                hasPhone: !!phoneInput,
                hasPin: !!pinInput
            };
        });

        console.log(`[Meetmob] Field identification results:`, fieldsFound);

        if (fieldsFound.hasPhone && fieldsFound.hasPin) {
            // Type Phone Number (Field 0)
            await meetmobPage.focus('[data-puppeteer-field="phone"]');
            await meetmobPage.keyboard.down('Control');
            await meetmobPage.keyboard.press('KeyA');
            await meetmobPage.keyboard.up('Control');
            await meetmobPage.keyboard.press('Backspace');
            await meetmobPage.type('[data-puppeteer-field="phone"]', phone, { delay: 100 });

            // Type PIN (Field 1)
            await meetmobPage.focus('[data-puppeteer-field="pin"]');
            await meetmobPage.keyboard.down('Control');
            await meetmobPage.keyboard.press('KeyA');
            await meetmobPage.keyboard.up('Control');
            await meetmobPage.keyboard.press('Backspace');
            await meetmobPage.type('[data-puppeteer-field="pin"]', pin, { delay: 100 });
            
            console.log(`[Meetmob] Credentials successfully entered natively.`);
        } else {
            console.log(`[Meetmob Warning] Fallback to evaluate filling...`);
            // Fallback just in case
            await meetmobPage.evaluate((u, p) => {
                const inputs = Array.from(document.querySelectorAll('input'));
                const phoneInput = inputs.find(i => i.type === 'text' || i.type === 'number' || i.placeholder.includes('هاتف') || i.placeholder.toLowerCase().includes('phone') || i.placeholder.toLowerCase().includes('user')) || inputs[0];
                const pinInput = inputs.find(i => i.type === 'password' || i.placeholder.includes('رمز') || i.placeholder.toLowerCase().includes('pin') || i.placeholder.toLowerCase().includes('pass')) || inputs[1];

                const triggerInputEvents = (el, val) => {
                    el.value = val;
                    el.dispatchEvent(new Event('focus', { bubbles: true }));
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    el.dispatchEvent(new Event('blur', { bubbles: true }));
                };
                if (phoneInput) triggerInputEvents(phoneInput, u);
                if (pinInput) triggerInputEvents(pinInput, p);
            }, phone, pin);
        }

        // Get list of pre-existing SMS messages to avoid picking up old OTP codes
        const preExistingSmsIds = new Set();
        try {
            console.log(`[Meetmob] 🔍 Fetching pre-existing SMS messages to prevent matching old OTPs...`);
            const initialSms = await modemService.getSmsList(modemAddress);
            if (initialSms.success && initialSms.list) {
                initialSms.list.forEach(sms => {
                    if (sms.index) preExistingSmsIds.add(sms.index);
                });
                console.log(`[Meetmob] Found ${preExistingSmsIds.size} pre-existing SMS in modem inbox.`);
            }
        } catch (e) {
            console.log(`[Meetmob] Warning: Could not fetch initial SMS list: ${e.message}`);
        }

        // Wait a brief 1.2 seconds to allow Angular's form validation and disabled states to settle
        await new Promise(r => setTimeout(r, 1200));

        // Click login button natively
        await meetmobPage.evaluate(() => {
            // Try exact Element Plus class "brownButton" first (extremely robust)
            let loginBtn = document.querySelector('button.brownButton');

            if (!loginBtn) {
                const allElements = Array.from(document.querySelectorAll('button, input, a, div, span, img')).filter(el => {
                    const style = window.getComputedStyle(el);
                    return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0 && el.offsetHeight > 0;
                });

                // Phase 1: Exact matches (highest precision)
                loginBtn = allElements.find(el => {
                    const text = (el.innerText || el.value || '').toLowerCase().trim();
                    return text === 'envoyer' || text === 'valider' || text === 'دخول' || text === 'إرسال' || text === 'validation' || text === 'connecter';
                });

                // Phase 2: Inclusions (very high matching rate)
                if (!loginBtn) {
                    loginBtn = allElements.find(el => {
                        const text = (el.innerText || el.value || '').toLowerCase().trim();
                        return text.includes('envoyer') || text.includes('valider') || text.includes('دخول') || text.includes('إرسال') ||
                               text.includes('login') || text.includes('connect') || text.includes('submit') || text.includes('send') || 
                               text.includes('continuer') || text.includes('suivant') || text.includes('next') || text.includes('go') || el.type === 'submit';
                    });
                }

                // Phase 3: Class name check
                if (!loginBtn) {
                    loginBtn = allElements.find(el => {
                        const className = (el.className || '').toLowerCase();
                        return className.includes('btn') && (className.includes('primary') || className.includes('submit') || className.includes('login') || className.includes('send') || className.includes('connexion'));
                    });
                }

                // Phase 4: Fallback to the first found button or input type submit
                if (!loginBtn) {
                    loginBtn = allElements.find(el => el.tagName === 'BUTTON' || el.type === 'submit' || el.type === 'button') || allElements[0];
                }
            }

            if (loginBtn) {
                // Programmatically force-enable the button if Angular/Vue validation is slow
                loginBtn.removeAttribute('disabled');
                loginBtn.disabled = false;
                loginBtn.setAttribute('data-puppeteer-btn', 'login');
                console.log(`[Meetmob DOM Match] Selected Tag: ${loginBtn.tagName}, ID: ${loginBtn.id}, Text: "${loginBtn.innerText}", Value: "${loginBtn.value}"`);
            }
        });

        try {
            await meetmobPage.click('[data-puppeteer-btn="login"]');
        } catch (clickErr) {
            console.log(`[Meetmob Warning] Native click failed: ${clickErr.message}. Fallback to evaluate click.`);
            await meetmobPage.evaluate(() => {
                // Try exact "brownButton" first
                let loginBtn = document.querySelector('button.brownButton');
                
                if (!loginBtn) {
                    const allElements = Array.from(document.querySelectorAll('button, input, a, div, span, img')).filter(el => {
                        const style = window.getComputedStyle(el);
                        return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0 && el.offsetHeight > 0;
                    });

                    loginBtn = allElements.find(el => {
                        const text = (el.innerText || el.value || '').toLowerCase().trim();
                        return text === 'envoyer' || text === 'valider' || text === 'دخول' || text === 'إرسال';
                    }) || allElements.find(el => {
                        const text = (el.innerText || el.value || '').toLowerCase().trim();
                        return text.includes('envoyer') || text.includes('valider') || text.includes('دخول') || text.includes('إرسال') ||
                               text.includes('login') || text.includes('connect') || text.includes('submit') || text.includes('send') || 
                               text.includes('continuer') || text.includes('suivant') || el.type === 'submit';
                    }) || allElements.find(el => el.tagName === 'BUTTON' || el.type === 'submit') || allElements[0];
                }

                if (loginBtn) {
                    loginBtn.removeAttribute('disabled');
                    loginBtn.disabled = false;
                    loginBtn.click();
                }
            });
        }

        console.log(`[Meetmob] ⏳ Attente de la page OTP...`);
        await new Promise(r => setTimeout(r, 4500));

        // Start SMS Interception
        let otpFound = null;
        console.log(`[Meetmob] 🔍 Lancement de la surveillance SMS sur: ${modemAddress}...`);
        
        // Loop to check SMS
        for (let attempt = 1; attempt <= 24; attempt++) {
            console.log(`[Meetmob OTP] 🔍 Polling SMS (Tentative ${attempt}/24)...`);
            try {
                const smsResult = await modemService.getSmsList(modemAddress);
                if (smsResult.success && smsResult.list) {
                    const newestList = smsResult.list;
                    for (const sms of newestList) {
                        // Skip pre-existing SMS messages to guarantee we only capture the newly arrived OTP!
                        if (sms.index && preExistingSmsIds.has(sms.index)) {
                            continue;
                        }

                        const sender = sms.phone || '';
                        const content = sms.content || '';
                        const codeMatch = content.match(/\b(\d{4,6})\b/);
                        
                        const isMeetmobSms = 
                            sender.toLowerCase().includes('mobilis') ||
                            sender.toLowerCase().includes('meetmob') ||
                            sender.toLowerCase().includes('ecare') ||
                            content.toLowerCase().includes('meetmob') ||
                            content.toLowerCase().includes('ecare') ||
                            content.toLowerCase().includes('confirmation') ||
                            content.toLowerCase().includes('verification') ||
                            content.toLowerCase().includes('code') ||
                            content.includes('رمز') ||
                            content.includes('موبيليس') ||
                            content.includes('تأكيد') ||
                            content.includes('تفعيل');

                        if (codeMatch && isMeetmobSms) {
                            otpFound = codeMatch[1];
                            console.log(`[Meetmob OTP] 🎉 Code OTP intercepté avec succès: ${otpFound}`);
                            break;
                        }
                    }
                }
            } catch (e) {
                console.log(`[Meetmob OTP Error] Polling failed: ${e.message}`);
            }

            if (otpFound) break;
            await new Promise(r => setTimeout(r, 2500));
        }

        if (otpFound) {
            console.log(`[Meetmob OTP] ⌨️ Saisie automatique du code OTP: ${otpFound}`);
            
            // Wait for exact Element Plus verification code input to appear
            try {
                await meetmobPage.waitForSelector('input[placeholder="Code de vérification par SMS"]', { visible: true, timeout: 12000 });
            } catch (err) {
                console.log(`[Meetmob Warning] OTP input not found by exact placeholder: ${err.message}. Using fallback...`);
            }

            const submitted = await meetmobPage.evaluate((otpCode) => {
                // Try exact placeholder selector first (highly robust)
                let otpInput = document.querySelector('input[placeholder="Code de vérification par SMS"]');
                
                if (!otpInput) {
                    const inputs = Array.from(document.querySelectorAll('input'));
                    otpInput = inputs.find(i => i.type === 'text' || i.type === 'number' || i.placeholder.includes('OTP') || i.placeholder.includes('رمز') || i.placeholder.toLowerCase().includes('code')) || inputs[0];
                }

                if (otpInput) {
                    otpInput.value = otpCode;
                    otpInput.dispatchEvent(new Event('focus', { bubbles: true }));
                    otpInput.dispatchEvent(new Event('input', { bubbles: true }));
                    otpInput.dispatchEvent(new Event('change', { bubbles: true }));
                    otpInput.dispatchEvent(new Event('blur', { bubbles: true }));
                    
                    // Try exact Element Plus connection button (el-button--primary but NOT brownButton)
                    let confirmBtn = Array.from(document.querySelectorAll('button.el-button--primary')).find(b => !b.classList.contains('brownButton'));
                    
                    if (!confirmBtn) {
                        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], .btn'));
                        confirmBtn = buttons.find(b => b.innerText.includes('تأكيد') || b.innerText.includes('تحقق') || b.innerText.toLowerCase().includes('verify') || b.innerText.toLowerCase().includes('confirm') || b.innerText.toLowerCase().includes('valider') || b.innerText.toLowerCase().includes('connecter') || b.innerText.includes('دخول')) || buttons[0];
                    }

                    if (confirmBtn) {
                        confirmBtn.removeAttribute('disabled');
                        confirmBtn.disabled = false;
                        confirmBtn.click();
                        return true;
                    }
                }
                return false;
            }, otpFound);

            if (submitted) {
                await new Promise(r => setTimeout(r, 4000));
                const loggedIn = await meetmobPage.evaluate(() => {
                    const bodyText = document.body.innerText;
                    return bodyText.includes('خروج') || bodyText.toLowerCase().includes('logout') || bodyText.toLowerCase().includes('recharge') || !document.querySelector('input[type="password"]');
                });

                if (loggedIn) {
                    console.log(`[Meetmob] ✅ Connexion réussie via OTP automatique!`);
                    return res.json({ success: true, loggedIn: true, otp: otpFound, message: "تم تسجيل الدخول بنجاح وتخطي كود OTP تلقائياً!" });
                }
            }
        }

        console.log(`[Meetmob] 📱 OTP envoyé. En attente de saisie manuelle.`);
        res.json({ success: true, loggedIn: false, message: "تم إرسال كود OTP للشريحة. يرجى إدخاله يدوياً في حال لم يتم الشحن تلقائياً." });

    } catch (e) {
        console.error(`[Meetmob Error]`, e);
        res.status(500).json({ success: false, message: e.message });
    }
});

app.post('/meetmob/verify-otp', async (req, res) => {
    const { otp } = req.body;
    console.log(`[Meetmob] ⌨️ Saisie manuelle du code OTP: ${otp}`);
    
    if (!meetmobPage) {
        return res.status(400).json({ success: false, message: "يرجى بدء تسجيل الدخول أولاً." });
    }

    try {
        const submitted = await meetmobPage.evaluate((otpCode) => {
            // Try exact placeholder selector first (highly robust)
            let otpInput = document.querySelector('input[placeholder="Code de vérification par SMS"]');
            
            if (!otpInput) {
                const inputs = Array.from(document.querySelectorAll('input'));
                otpInput = inputs.find(i => i.type === 'text' || i.type === 'number' || i.placeholder.includes('OTP') || i.placeholder.includes('رمز') || i.placeholder.toLowerCase().includes('code')) || inputs[0];
            }

            if (otpInput) {
                otpInput.value = otpCode;
                otpInput.dispatchEvent(new Event('focus', { bubbles: true }));
                otpInput.dispatchEvent(new Event('input', { bubbles: true }));
                otpInput.dispatchEvent(new Event('change', { bubbles: true }));
                otpInput.dispatchEvent(new Event('blur', { bubbles: true }));
                
                // Try exact Element Plus connection button (el-button--primary but NOT brownButton)
                let confirmBtn = Array.from(document.querySelectorAll('button.el-button--primary')).find(b => !b.classList.contains('brownButton'));
                
                if (!confirmBtn) {
                    const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], .btn'));
                    confirmBtn = buttons.find(b => b.innerText.includes('تأكيد') || b.innerText.includes('تحقق') || b.innerText.toLowerCase().includes('verify') || b.innerText.toLowerCase().includes('confirm') || b.innerText.toLowerCase().includes('valider') || b.innerText.toLowerCase().includes('connecter') || b.innerText.includes('دخول')) || buttons[0];
                }

                if (confirmBtn) {
                    confirmBtn.removeAttribute('disabled');
                    confirmBtn.disabled = false;
                    confirmBtn.click();
                    return true;
                }
            }
            return false;
        }, otp);

        if (submitted) {
            await new Promise(r => setTimeout(r, 4000));
            const loggedIn = await meetmobPage.evaluate(() => {
                const bodyText = document.body.innerText;
                return bodyText.includes('خروج') || bodyText.toLowerCase().includes('logout') || bodyText.toLowerCase().includes('recharge') || !document.querySelector('input[type="password"]');
            });

            if (loggedIn) {
                return res.json({ success: true, loggedIn: true, message: "تم التحقق وتسجيل الدخول بنجاح!" });
            }
        }
        res.json({ success: false, message: "كود التحقق غير صحيح أو انتهت صلاحيته." });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

app.get('/meetmob/captcha', async (req, res) => {
    try {
        // Auto-initialize browser and page if not already done
        await initMeetmobBrowserSession();

        const currentUrl = meetmobPage.url();
        console.log(`[Meetmob] Current page URL: ${currentUrl}`);

        // Navigate only if the browser is not already initialized or is on a different site
        if (!currentUrl || !currentUrl.includes('meetmob.mobilis.dz')) {
            console.log(`[Meetmob] Browser is not on Mobilis portal. Navigating to home...`);
            await meetmobPage.goto('https://meetmob.mobilis.dz/EcareWeb/#/login', { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
            await new Promise(r => setTimeout(r, 3000));
        }

        // If we are on the login page, check if we can transition to recharge, or if OTP is needed
        const urlAfterHome = meetmobPage.url();
        if (urlAfterHome.includes('/login')) {
            // Try hash routing to recharge (if session cookies are valid, Ecare will stay on recharge)
            console.log(`[Meetmob] Page is on login. Attempting silent hash routing transition to recharge...`);
            await meetmobPage.evaluate(() => {
                window.location.hash = '#/recharge';
            });
            await new Promise(r => setTimeout(r, 3500));
        }

        // Verify if we are currently on the recharge form
        const finalUrl = meetmobPage.url();
        if (finalUrl.includes('/login')) {
            console.log(`[Meetmob] Silent transition failed (session expired). OTP login is required.`);
            return res.json({ success: false, loggedIn: false, message: "يتطلب تسجيل الدخول عبر OTP." });
        }

        // If we are already on recharge, DO NOT reload the page! Just clean up dialogs and refresh captcha natively
        if (finalUrl.includes('/recharge')) {
            console.log(`[Meetmob] Session is active. Cleaving active error dialogs and refreshing captcha natively...`);
            await meetmobPage.evaluate(() => {
                // 1. Close any Element Plus dialogs/messages/notifications
                const closeBtns = Array.from(document.querySelectorAll('.el-message-box__btns button, .el-dialog__headerbtn, .el-message-box__headerbtn, .el-message__closeBtn'));
                closeBtns.forEach(btn => btn.click());

                // 2. Click the captcha image to trigger native AJAX refresh without reloading
                const captchaImg = document.querySelector('img[src*="captcha"], img[src*="security"], img[src*="Ecare"]');
                if (captchaImg) {
                    captchaImg.click();
                }
            });
            // Wait 2 seconds for AJAX image load to complete
            await new Promise(r => setTimeout(r, 2000));
        }

        // Wait for captcha image element to render in DOM
        console.log(`[Meetmob] Waiting for captcha image...`);
        await meetmobPage.waitForSelector('img[src*="captcha"], img[src*="security"], img[src*="Ecare"]', { timeout: 10000 }).catch(() => {});

        const imgElement = await meetmobPage.$('img[src*="captcha"], img[src*="security"], img[src*="Ecare"]');
        if (imgElement) {
            // Wait until image is fully loaded from the network and has natural dimensions
            await meetmobPage.waitForFunction((el) => {
                return el.naturalWidth > 0 && el.naturalHeight > 0;
            }, { timeout: 5000 }, imgElement).catch(() => {});

            // Capture the element screenshot natively (fail-safe and crystal clear)
            const buffer = await imgElement.screenshot({ encoding: 'base64' });
            console.log(`[Meetmob] ✅ Captcha image captured successfully via Puppeteer element screenshot.`);
            return res.json({ success: true, captcha: `data:image/png;base64,${buffer}` });
        }

        res.json({ success: false, message: "لم يتم العثور على صورة التحقق الكابتشا." });
    } catch (e) {
        console.error(`[Meetmob Captcha Error] ${e.message}`);
        res.status(500).json({ success: false, message: e.message });
    }
});

app.post('/meetmob/recharge', async (req, res) => {
    const { customerPhone, voucherCode, captchaCode } = req.body;
    const cleanPhone = (customerPhone || '').trim().replace(/^0/, '');
    console.log(`[Meetmob Recharge] ⚡ Recharge pour: ${cleanPhone} | Carte: ${voucherCode}`);

    if (!meetmobPage) {
        return res.status(400).json({ success: false, message: "يرجى تسجيل الدخول إلى Meetmob أولاً." });
    }

    try {
        isMeetmobRecharging = true;
        // Fail-safe: ensure page is actually on the recharge form before starting to fill fields
        const currentUrl = meetmobPage.url();
        if (!currentUrl.includes('/recharge')) {
            console.log(`[Meetmob Recharge Fail-Safe] Enforcing hash-route navigation to recharge page...`);
            await meetmobPage.evaluate(() => {
                window.location.hash = '#/recharge';
            });
            await new Promise(r => setTimeout(r, 3500));
        }

        // 1. Wait until inputs are rendered in DOM and visible
        console.log(`[Meetmob Recharge] ⏳ Waiting for recharge inputs to render...`);
        try {
            await meetmobPage.waitForFunction(() => {
                const inputs = Array.from(document.querySelectorAll('input')).filter(i => {
                    const style = window.getComputedStyle(i);
                    return style.display !== 'none' && style.visibility !== 'hidden' && i.offsetWidth > 0 && i.offsetHeight > 0;
                });
                return inputs.length >= 3;
            }, { timeout: 15000 });
            console.log(`[Meetmob Recharge] ✅ Inputs loaded in DOM.`);
        } catch (waitErr) {
            console.log(`[Meetmob Recharge Warning] Timeout waiting for inputs: ${waitErr.message}`);
        }

        // Run smart DOM element identifier for recharge inputs
        const fieldsFound = await meetmobPage.evaluate(() => {
            const getInputByLabelText = (labelText) => {
                // Restrict search of labels to form/card containers to avoid header/sidebar false positives
                const elements = Array.from(document.querySelectorAll('.el-form label, .el-form span, form label, form span, .el-card label, .el-card span, main label, main span, .main label, .main span'))
                    .filter(el => {
                        const text = (el.innerText || '').trim().toLowerCase();
                        return text.includes(labelText.toLowerCase());
                    });

                for (const el of elements) {
                    if (el.tagName === 'LABEL' && el.getAttribute('for')) {
                        const targetInput = document.getElementById(el.getAttribute('for'));
                        if (targetInput) return targetInput;
                    }
                    const nestedInput = el.querySelector('input');
                    if (nestedInput) return nestedInput;

                    let parent = el.parentElement;
                    for (let depth = 0; depth < 4 && parent; depth++) {
                        const siblingInput = parent.querySelector('input');
                        if (siblingInput && siblingInput.offsetWidth > 0 && siblingInput.offsetHeight > 0) {
                            return siblingInput;
                        }
                        parent = parent.parentElement;
                    }
                }
                return null;
            };

            // Get all visible text inputs inside the main form card container
            const textFields = Array.from(document.querySelectorAll('.el-form input, form input, .el-card input, main input, .main input, .content input'))
                .filter(i => {
                    const style = window.getComputedStyle(i);
                    const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && i.offsetWidth > 0 && i.offsetHeight > 0;
                    const isTextInput = ['text', 'tel', 'number', 'password'].includes((i.type || '').toLowerCase());
                    return isVisible && isTextInput;
                });

            // Sort layout-aware: Row-by-Row (vertical threshold < 25px), then Left-to-Right
            textFields.sort((a, b) => {
                const rectA = a.getBoundingClientRect();
                const rectB = b.getBoundingClientRect();
                if (Math.abs(rectA.top - rectB.top) < 25) {
                    return rectA.left - rectB.left;
                }
                return rectA.top - rectB.top;
            });

            // 1. Try finding by visual labels (French/Arabic supported)
            let voucherInput = getInputByLabelText('recharge') || getInputByLabelText('carte') || getInputByLabelText('تعبئة') || getInputByLabelText('كود');
            let phoneInput = getInputByLabelText('téléphone') || getInputByLabelText('phone') || getInputByLabelText('هاتف') || getInputByLabelText('زبون');
            let captchaInput = getInputByLabelText('vérification') || getInputByLabelText('verification') || getInputByLabelText('security') || getInputByLabelText('sécurité') || getInputByLabelText('كابتشا') || getInputByLabelText('تحقق');

            // 2. Fallback to physical layout sorting (100% fail-safe Element Plus ordering in main container)
            // Row 1 Left: Code de recharge (Index 0)
            // Row 1 Right: Numéro de téléphone (Index 1)
            // Row 2 Left: Code de vérification (Index 2)
            if (textFields.length >= 3) {
                if (!voucherInput) voucherInput = textFields[0];
                if (!phoneInput) phoneInput = textFields[1];
                if (!captchaInput) captchaInput = textFields[2];
            }

            // Tag identified inputs with custom data attributes for direct Puppeteer targeting
            if (voucherInput) voucherInput.setAttribute('data-recharge-field', 'voucher');
            if (phoneInput) phoneInput.setAttribute('data-recharge-field', 'phone');
            if (captchaInput) captchaInput.setAttribute('data-recharge-field', 'captcha');

            return {
                hasPhone: !!phoneInput,
                hasVoucher: !!voucherInput,
                hasCaptcha: !!captchaInput,
                totalTextFields: textFields.length
            };
        });

        console.log(`[Meetmob Recharge] Field identification results:`, fieldsFound);

        let solved = false;
        try {
            // Natively type each field using Puppeteer keyboard actions
            if (fieldsFound.hasVoucher) {
                console.log(`[Meetmob Recharge] Typing voucher PIN Code natively...`);
                await meetmobPage.focus('[data-recharge-field="voucher"]');
                await meetmobPage.keyboard.down('Control');
                await meetmobPage.keyboard.press('KeyA');
                await meetmobPage.keyboard.up('Control');
                await meetmobPage.keyboard.press('Backspace');
                await meetmobPage.type('[data-recharge-field="voucher"]', voucherCode, { delay: 60 });
            }
            
            if (fieldsFound.hasPhone) {
                console.log(`[Meetmob Recharge] Typing customer phone number natively...`);
                await meetmobPage.focus('[data-recharge-field="phone"]');
                await meetmobPage.keyboard.down('Control');
                await meetmobPage.keyboard.press('KeyA');
                await meetmobPage.keyboard.up('Control');
                await meetmobPage.keyboard.press('Backspace');
                await meetmobPage.type('[data-recharge-field="phone"]', cleanPhone, { delay: 60 });
            }

            if (fieldsFound.hasCaptcha) {
                console.log(`[Meetmob Recharge] Typing verification captcha code natively...`);
                await meetmobPage.focus('[data-recharge-field="captcha"]');
                await meetmobPage.keyboard.down('Control');
                await meetmobPage.keyboard.press('KeyA');
                await meetmobPage.keyboard.up('Control');
                await meetmobPage.keyboard.press('Backspace');
                await meetmobPage.type('[data-recharge-field="captcha"]', captchaCode, { delay: 60 });
            }

            // Programmatic event dispatch reinforcement to ensure Vue state is fully synced
            solved = await meetmobPage.evaluate(() => {
                const voucherInput = document.querySelector('[data-recharge-field="voucher"]');
                const phoneInput = document.querySelector('[data-recharge-field="phone"]');
                const captchaInput = document.querySelector('[data-recharge-field="captcha"]');

                const triggerEvents = (el) => {
                    if (el) {
                        el.dispatchEvent(new Event('focus', { bubbles: true }));
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        el.dispatchEvent(new Event('blur', { bubbles: true }));
                        return true;
                    }
                    return false;
                };

                const vOk = voucherInput ? triggerEvents(voucherInput) : false;
                const pOk = phoneInput ? triggerEvents(phoneInput) : false;
                const cOk = captchaInput ? triggerEvents(captchaInput) : false;
                return vOk && pOk && cOk;
            });

            console.log(`[Meetmob Recharge] Native typing and event synchronization completed. Result: ${solved}`);
        } catch (fillErr) {
            console.log(`[Meetmob Recharge Error] Input filling process failed: ${fillErr.message}`);
        }

        // Wait a brief 1.2 seconds to allow Vue validation and disabled states to settle
        await new Promise(r => setTimeout(r, 1200));

        // Click recharge button natively
        await meetmobPage.evaluate(() => {
            // Find all buttons, links, and inputs that are visible
            const interactiveElements = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a, [role="button"], .el-button'))
                .filter(el => {
                    const style = window.getComputedStyle(el);
                    const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0 && el.offsetHeight > 0;
                    if (!isVisible) return false;

                    // Filter out header, nav, menu, sidebar elements to avoid false matches
                    let isExcluded = false;
                    let p = el.parentElement;
                    while (p) {
                        const id = (p.id || '').toLowerCase();
                        const cls = (p.className || '').toString().toLowerCase();
                        if (id.includes('header') || id.includes('nav') || id.includes('menu') || id.includes('sidebar') ||
                            cls.includes('header') || cls.includes('nav') || cls.includes('menu') || cls.includes('sidebar')) {
                            isExcluded = true;
                            break;
                        }
                        p = p.parentElement;
                    }
                    return !isExcluded;
                });

            // Phase 1: Exact matches on interactive elements
            let submitBtn = interactiveElements.find(el => {
                const text = (el.innerText || el.value || '').toLowerCase().trim();
                return text === 'valider' || text === 'recharger' || text === 'تعبئة' || text === 'شحن' || text === 'validation';
            });

            // Phase 2: Inclusions on interactive elements (no div/span/img false positives)
            if (!submitBtn) {
                submitBtn = interactiveElements.find(el => {
                    const text = (el.innerText || el.value || '').toLowerCase().trim();
                    return text.includes('valider') || text.includes('recharger') || text.includes('تعبئة') || text.includes('شحن') ||
                           text.includes('submit') || text.includes('confirm') || el.type === 'submit';
                });
            }

            // Phase 3: Fallback within the main form container
            if (!submitBtn) {
                submitBtn = document.querySelector('button.el-button--success') || 
                            document.querySelector('button.el-button--primary') ||
                            document.querySelector('.el-form button') ||
                            interactiveElements[0];
            }

            if (submitBtn) {
                submitBtn.removeAttribute('disabled');
                submitBtn.disabled = false;
                submitBtn.setAttribute('data-puppeteer-btn', 'recharge-submit');
                console.log(`[Meetmob Recharge DOM Match] Selected submit button: Tag: ${submitBtn.tagName}, Text: "${submitBtn.innerText.trim()}"`);
            }
        });

        try {
            await meetmobPage.click('[data-puppeteer-btn="recharge-submit"]');
            console.log(`[Meetmob Recharge] Native click sent successfully.`);
        } catch (clickErr) {
            console.log(`[Meetmob Warning] Native click failed: ${clickErr.message}. Fallback to evaluate click.`);
            await meetmobPage.evaluate(() => {
                let btn = document.querySelector('[data-puppeteer-btn="recharge-submit"]');
                if (!btn) {
                    const interactiveElements = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a, [role="button"], .el-button'))
                        .filter(el => {
                            const style = window.getComputedStyle(el);
                            return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0 && el.offsetHeight > 0;
                        });
                    btn = interactiveElements.find(el => {
                        const text = (el.innerText || el.value || '').toLowerCase().trim();
                        return text.includes('valider') || text.includes('recharger') || text.includes('تعبئة') || text.includes('شحن');
                    }) || document.querySelector('button.el-button--success') || document.querySelector('button.el-button--primary') || interactiveElements[0];
                }
                if (btn) {
                    btn.removeAttribute('disabled');
                    btn.disabled = false;
                    btn.click();
                }
            });
        }

        await new Promise(r => setTimeout(r, 4500));

        const result = await meetmobPage.evaluate(() => {
            // Priority 0: Inline form validation errors (typical Element Plus form error state)
            const formError = document.querySelector('.el-form-item__error');
            if (formError && formError.innerText.trim()) {
                return { success: false, message: formError.innerText.trim() };
            }

            // Priority 1: Look for Element Plus alert/dialog components which display results dynamically
            const elMessages = Array.from(document.querySelectorAll('.el-message, .el-message-box, .el-dialog, .el-notification'));
            for (const el of elMessages) {
                const text = el.innerText.trim();
                const isErr = el.classList.contains('el-message--error') || el.querySelector('.el-message-box__status.el-icon-error') || text.toLowerCase().includes('erreur') || text.includes('خطأ') || text.includes('فشل') || text.toLowerCase().includes('échec');
                const isSucc = el.classList.contains('el-message--success') || el.querySelector('.el-message-box__status.el-icon-success') || text.toLowerCase().includes('succès') || text.includes('نجاح') || text.toLowerCase().includes('réussie');
                
                if (isSucc) return { success: true, message: text };
                if (isErr) return { success: false, message: text };
            }

            // Priority 2: Standard classes check
            const errorElement = document.querySelector('.titre-rouge, .alert-danger, .text-danger, .error, .failed, .el-message--error');
            const successElement = document.querySelector('.titre-vert, .alert-success, .text-success, .success, .modal-body, .el-message--success');
            
            if (successElement) {
                return { success: true, message: successElement.innerText.trim() };
            }
            if (errorElement) {
                return { success: false, message: errorElement.innerText.trim() };
            }
            
            // Priority 3: Deep text match
            const bodyText = document.body.innerText;
            if (bodyText.includes('ناجحة') || bodyText.toLowerCase().includes('reussie') || bodyText.toLowerCase().includes('success') || bodyText.toLowerCase().includes('effectue')) {
                return { success: true, message: "تم شحن البطاقة بنجاح!" };
            }

            if (bodyText.includes('incorrect') || bodyText.includes('خطأ') || bodyText.includes('غير صحيح') || bodyText.includes('فشل') || bodyText.toLowerCase().includes('échec') || bodyText.toLowerCase().includes('déjà utilisé')) {
                return { success: false, message: bodyText.substring(0, 200) };
            }
            
            return { success: false, message: bodyText.substring(0, 200) };
        });

        await meetmobPage.screenshot({ path: path.join(__dirname, 'last_recharge_status.png') }).catch(() => {});

        res.json(result);

    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    } finally {
        isMeetmobRecharging = false;
    }
});

// Background keep-alive interval to keep the Meetmob session active 24/7
setInterval(async () => {
    if (meetmobPage && !isMeetmobRecharging) {
        try {
            const currentUrl = meetmobPage.url();
            if (currentUrl && currentUrl.includes('meetmob.mobilis.dz')) {
                if (currentUrl.includes('/recharge')) {
                    console.log(`[Meetmob Keep-Alive] 🔄 Reloading page to maintain active session...`);
                    await meetmobPage.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
                    await new Promise(r => setTimeout(r, 2000));
                    await meetmobPage.evaluate(() => {
                        const closeBtns = Array.from(document.querySelectorAll('.el-message-box__btns button, .el-dialog__headerbtn, .el-message-box__headerbtn, .el-message__closeBtn'));
                        closeBtns.forEach(btn => btn.click());
                    });
                    console.log(`[Meetmob Keep-Alive] ✅ Session refreshed via reload.`);
                } else if (currentUrl.includes('/login')) {
                    console.warn(`[Meetmob Keep-Alive Warning] Session expired (on login page)!`);
                }
            }
        } catch (e) {
            console.log(`[Meetmob Keep-Alive Error] ${e.message}`);
        }
    }
}, 150000); // Every 2.5 minutes (150,000 ms)

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`[Tobal Scan] Automation Server running at http://localhost:${PORT}`);
});
