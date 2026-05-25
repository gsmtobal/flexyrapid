const axios = require('axios');
const fs = require('fs');

const API_KEY = 'c524ac5fde2b1a1b3f5f2c1707639e85';
const account = '044866880';

(async () => {
    const { default: puppeteer } = await import('puppeteer');
    const browser = await puppeteer.launch({ 
        headless: false,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        ]
    });
    const page = await browser.newPage();
    
    await page.goto('https://paiement.at.dz/index.php?p=voucher_internet&produit=in', { waitUntil: 'networkidle2' });

    await page.waitForSelector('input#nd', { visible: true, timeout: 15000 });
    await page.type('input#nd', account);
    
    // Solve Captcha
    const captchaSelector = 'img#captcha';
    await page.waitForSelector(captchaSelector);
    const captchaElement = await page.$(captchaSelector);
    const captchaBuffer = await captchaElement.screenshot({ encoding: 'base64' });

    console.log('Solving captcha...');
    const submitRes = await axios.post('https://2captcha.com/in.php', {
        key: API_KEY, method: 'base64', body: captchaBuffer, json: 1
    });
    
    const captchaId = submitRes.data.request;
    let captchaCode = '';
    for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const resultRes = await axios.get(`https://2captcha.com/res.php?key=${API_KEY}&action=get&id=${captchaId}&json=1`);
        if (resultRes.data.status === 1) {
            captchaCode = resultRes.data.request;
            break;
        }
    }
    
    console.log('Captcha solved:', captchaCode);
    await page.type('input.champ:not(#nd)', captchaCode);
    
    await page.click('.btn-green');
    
    console.log('Waiting for transition...');
    await new Promise(r => setTimeout(r, 5000));
    
    const html = await page.content();
    fs.writeFileSync('C:/Users/wahab phone/Desktop/server sit web/idoom_stage2_html.txt', html);
    
    await browser.close();
})();
