const fs = require('fs');
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
    
    const html = await page.content();
    fs.writeFileSync('C:/Users/wahab phone/Desktop/server sit web/idoom_html_real.txt', html);
    
    await browser.close();
})();
