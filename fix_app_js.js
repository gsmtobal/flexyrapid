const fs = require('fs');

const path = 'Cloud_Portal_Ready/js/app.js';
let content = fs.readFileSync(path, 'utf8');

// 1. Alias logout() to logoutAdmin()
if (!content.includes('function logout()')) {
    content += '\n// Alias for the new template logout button\nfunction logout() { logoutAdmin(); }\n';
}

// 2. Fix switchTab logic to handle the new tab IDs ('dashboard-tab', 'flexy-tab') instead of 'tab-dashboard'
content = content.replace(
    /const target = document.getElementById\(`tab-\$\{tabName\}`\);/g,
    `// Support both naming conventions
  let target = document.getElementById(tabName + '-tab');
  if (!target) target = document.getElementById('tab-' + tabName);`
);

// 3. Fix the element highlight to add .active to the parent li.menu-item
content = content.replace(
    /element\.classList\.add\('active'\);/g,
    `const parentLi = element.closest('.menu-item');
    if (parentLi) parentLi.classList.add('active');
    else element.classList.add('active');`
);

// 4. Update the Balance display to update the new #balanceSpan
content = content.replace(
    /document\.getElementById\('statsTotalBalance'\)\.innerText = `\$\{data\.totalBalance \|\| '0\.00'\} DA`;/g,
    `const balText = \`\$\{data.totalBalance || '0.00'\} DA\`;
    const el1 = document.getElementById('statsTotalBalance');
    if (el1) el1.innerText = balText;
    const el2 = document.getElementById('balanceSpan');
    if (el2) el2.innerText = balText;`
);

// 5. Some links passed 'flexy-recharge' instead of 'flexy', let's map them
content = content.replace(
    /if \(tabName === 'flexy-recharge'\)/g,
    "if (tabName === 'flexy-recharge' || tabName === 'flexy')"
);
content = content.replace(
    /else if \(tabName === 'idoom-recharge'\)/g,
    "else if (tabName === 'idoom-recharge' || tabName === 'idoom')"
);

fs.writeFileSync(path, content);
console.log('Successfully patched app.js to support the new TobalFlexy Layout!');
