const fs = require('fs');

const path = 'c:\\Users\\wahab phone\\Desktop\\server sit web\\Cloud_Portal_Ready\\js\\app.js';
let content = fs.readFileSync(path, 'utf8');

// Update phone reading
content = content.replace(
    /const phone = document\.getElementById\('rechargePhone'\)\.value\.trim\(\);/g,
    `const phoneEl = document.getElementById('rechargePhone') || document.getElementById('phoneNumber');
  const phone = phoneEl ? phoneEl.value.trim() : '';`
);

// Update amount reading
content = content.replace(
    /const amount = document\.getElementById\('rechargeAmount'\)\.value\.trim\(\);/g,
    `const amountEl = document.getElementById('rechargeAmount') || document.getElementById('amount');
  const amount = amountEl ? amountEl.value.trim() : '';`
);

// Update button reading
content = content.replace(
    /const btn = document\.getElementById\('btnSubmitRecharge'\);/g,
    `const btn = document.getElementById('btnSubmitRecharge') || document.getElementById('sendBalanceBtn');`
);

fs.writeFileSync(path, content);
console.log('Successfully patched app.js for new Flexy UI inputs!');
