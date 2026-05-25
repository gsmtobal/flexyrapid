(async () => {
    const { default: puppeteer } = await import('puppeteer');
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    // Log console messages
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    
    // Log failed requests
    page.on('requestfailed', request => {
        console.log('FAILED REQUEST:', request.url(), request.failure().errorText);
    });

    console.log('Navigating to http://localhost:3005...');
    
    try {
        await page.goto('http://localhost:3005', { waitUntil: 'networkidle0', timeout: 10000 });
        console.log('Page loaded.');
        
        console.log('Current URL:', page.url());
        
        const info = await page.evaluate(() => {
            return {
                title: document.title,
                bodyClass: document.body.className,
                htmlClass: document.documentElement.className,
                styles: Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => l.href)
            };
        });
        
        console.log('Page Info:', info);
        
    } catch (e) {
        console.log('Error navigating:', e.message);
    }

    await browser.close();
})();
