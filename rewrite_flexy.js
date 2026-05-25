const fs = require('fs');
const cheerio = require('cheerio');

// 1. Read the extracted flexy content
let flexyHtml = fs.readFileSync('c:\\Users\\wahab phone\\Desktop\\server sit web\\extracted_flexy.html', 'utf8');

// The HTML contains <script> blocks. We want to remove the specific click handlers that do fetch to non-existent endpoints
// and wire them to executeRecharge().
// It's easier to just do string replacements on the script for the fetch.

flexyHtml = flexyHtml.replace(
    /fetch\(RACINE_PATH \+ "\/flexyBalance"[^\)]+\)/s,
    `
    // Instead of calling the remote PHP endpoint, we call our local JS function
    const localAmount = amount || $("#amount").val();
    const localPhone = phoneNumber || $("#phoneNumber").val();
    // executeRecharge handles the UI loading state and API call
    executeRecharge('flexy');
    $(this).prop("disabled", false);
    return Promise.resolve();
    `
);

// Do the same for flexyOffer
flexyHtml = flexyHtml.replace(
    /fetch\(RACINE_PATH \+ "\/flexyOffer"[^\)]+\)/s,
    `
    // Store offer in global var for executeRecharge
    window.selectedOfferData = { type: 'offer', id: offerName, price: amount, name: offerName };
    executeRecharge('flexy');
    $(this).prop("disabled", false);
    return Promise.resolve();
    `
);

// Remove the transactions table block from the extracted flexy tab, 
// because we already have a transactions tab! Or maybe they want it inside the flexy tab?
// "آخر العمليات" is part of the flexy page in tobalflexy.com. 
// We will leave it, but change the ID so it doesn't conflict with our main transactions table if there is one.
flexyHtml = flexyHtml.replace(/id="transactionsTable"/g, 'id="flexySubTransactionsTable"');

// 2. Read index.html
const targetPath = 'c:\\Users\\wahab phone\\Desktop\\server sit web\\Cloud_Portal_Ready\\index.html';
const targetHtml = fs.readFileSync(targetPath, 'utf8');

const $ = cheerio.load(targetHtml);

// Find the flexy tab
const $flexyTab = $('#flexy-tab').length ? $('#flexy-tab') : $('#tab-flexy-recharge');

if ($flexyTab.length) {
    // Replace content
    $flexyTab.empty();
    $flexyTab.append(flexyHtml);
    
    // Save
    fs.writeFileSync(targetPath, $.html());
    console.log('Successfully injected the new flexy interface into index.html');
} else {
    console.log('Error: Could not find flexy tab in index.html');
}

