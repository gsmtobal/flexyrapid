(async () => {
    const { default: puppeteer } = await import('puppeteer');
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.goto('https://paiement.at.dz/index.php?p=voucher_internet&produit=in', { waitUntil: 'networkidle2' });
    
    const html = await page.content();
    require('fs').writeFileSync('C:/Users/wahab phone/Desktop/server sit web/idoom_html.txt', html);
    
    await browser.close();
})();
