const fs = require('fs');
const cheerio = require('cheerio');

const htmlPath = 'Cloud_Portal_Ready/index.html';
const html = fs.readFileSync(htmlPath, 'utf8');
const $ = cheerio.load(html);

// Clean up massive inline styles from inputs and buttons
$('#rechargePhone')
  .removeAttr('style')
  .addClass('form-control-lg fs-2 text-primary')
  .css({ 'text-align': 'center', 'font-family': 'monospace', 'letter-spacing': '2px', 'border-width': '2px' });

$('#rechargeAmount')
  .removeAttr('style')
  .addClass('form-control-lg fs-3')
  .css({ 'text-align': 'center', 'font-family': 'monospace', 'border-width': '2px' });

$('#idoomPhone')
  .removeAttr('style')
  .addClass('form-control-lg fs-3')
  .css({ 'text-align': 'center', 'font-family': 'monospace', 'letter-spacing': '2px', 'border-width': '2px' });

$('#btnSubmitRecharge, #btnSubmitIdoom, #btnCheckIdoomBill')
  .removeAttr('style')
  .addClass('btn-lg w-100 mt-2 fw-bold');

$('#btnShowOffers')
  .removeAttr('style')
  .addClass('btn-lg');

// Fix the flex layout of rechargeAmount and btnShowOffers
$('#rechargeAmount').parent().removeClass().addClass('input-group input-group-lg');
$('#btnShowOffers').removeClass('btn-secondary').addClass('btn-outline-primary');

// Clean up inline styles on stat cards (we already replaced them in previous script, but let's make sure)
$('.card-title').removeClass('m-0 fw-bold text-primary').addClass('m-0 fw-bold');
$('.card-header').css('border-bottom', '1px solid #d9dee3').addClass('pb-3');

// Recharge Form Box
$('.recharge-form-box').removeAttr('style').removeClass('recharge-form-box').addClass('p-4 border rounded bg-lighter');

// Buttons in modals and everywhere else
$('button[style*="padding: 0.75rem"]').removeAttr('style');

// Replace table inline styles
$('table').removeAttr('style').addClass('table table-striped table-hover');
$('th, td').removeAttr('style');
$('.table-responsive').removeAttr('style');

// Search inputs
$('#searchFlexyTxPhone, #searchTxPhone').removeAttr('style').addClass('form-control');

// Write back
fs.writeFileSync(htmlPath, $.html());
console.log('Successfully refined UI inside Cloud_Portal_Ready/index.html');
