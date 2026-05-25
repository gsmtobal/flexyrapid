const fs = require('fs');
const cheerio = require('cheerio');

const targetPath = 'c:\\Users\\wahab phone\\Desktop\\server sit web\\Cloud_Portal_Ready\\index.html';
const sourcePath = 'c:\\Users\\wahab phone\\Desktop\\server sit web\\cards_source.html';

let targetHtml = fs.readFileSync(targetPath, 'utf8');
let newCardsHtml = fs.readFileSync(sourcePath, 'utf8');

const $ = cheerio.load(targetHtml);

// Save the old cards content to move it into uploadVouchers and stockVouchers
const oldCardsHtml = $('#tab-cards').html();

// We need to extract the "upload" section and "stock" section.
// Looking at the old HTML, there are two main .card elements inside #tab-cards
// The first one is "رفع وتخزين البطاقات" (Upload)
// The second one is "مخزون بطاقات التعبئة" (Stock)

const $old = cheerio.load(oldCardsHtml);
const $cards = $old('.card.mb-4'); // There should be two

let uploadHtml = '';
let stockHtml = '';

if ($cards.length >= 2) {
    uploadHtml = $.html($cards.eq(0));
    stockHtml = $.html($cards.eq(1));
} else {
    // Fallback
    uploadHtml = '<div>' + oldCardsHtml + '</div>';
    stockHtml = '<div>Stock</div>';
}

// Update tab-cards with the new UI
$('#tab-cards').empty();
$('#tab-cards').append(newCardsHtml);

// Check if tab-uploadVouchers exists
if ($('#tab-uploadVouchers').length === 0) {
    // Add it after tab-cards
    $('<div id="tab-uploadVouchers" class="tab-panel">' + uploadHtml + '</div>').insertAfter('#tab-cards');
} else {
    $('#tab-uploadVouchers').empty().append(uploadHtml);
}

// Check if tab-stockVouchers exists
if ($('#tab-stockVouchers').length === 0) {
    // Add it after tab-uploadVouchers
    $('<div id="tab-stockVouchers" class="tab-panel">' + stockHtml + '</div>').insertAfter('#tab-uploadVouchers');
} else {
    $('#tab-stockVouchers').empty().append(stockHtml);
}

fs.writeFileSync(targetPath, $.html());
console.log('Successfully updated tab-cards and created tab-uploadVouchers and tab-stockVouchers');
