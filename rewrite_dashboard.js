const fs = require('fs');
const cheerio = require('cheerio');

const sourcePath = 'C:\\Users\\wahab phone\\Desktop\\source.txt.txt';
const targetPath = 'C:\\Users\\wahab phone\\Desktop\\server sit web\\Cloud_Portal_Ready\\index.html';

const sourceHtml = fs.readFileSync(sourcePath, 'utf8');
const targetHtml = fs.readFileSync(targetPath, 'utf8');

const $source = cheerio.load(sourceHtml);
const $target = cheerio.load(targetHtml);

// Build the new HTML Document
const $new = cheerio.load('<!DOCTYPE html><html lang="ar" class="light-style layout-menu-fixed" dir="rtl" data-theme="theme-default"><body></body></html>');

// 1. Copy the head from our existing Cloud_Portal_Ready/index.html (because it has the local assets links and custom css)
$new('head').remove();
$new('html').prepend($target('head').clone());

// 2. Build the Layout Wrapper
$new('body').append('<div class="layout-wrapper layout-content-navbar"><div class="layout-container"></div></div>');
const $container = $new('.layout-container');

// 3. Extract and append Sidebar
const $sidebar = $source('aside#layout-menu').clone();
// Modify Sidebar links to use switchTab
$sidebar.find('a.menu-link').each((i, el) => {
    const $a = $source(el);
    const href = $a.attr('href');
    if (href && href.startsWith('/distributor')) {
        const parts = href.split('/');
        const tabName = parts.length > 2 ? parts[2] : 'dashboard'; // e.g. flexy, idoom, transactions
        
        // Exclude some that might not be handled locally or just map them roughly
        let localTabName = tabName;
        if (tabName === 'flexyBulk') localTabName = 'flexy';
        if (tabName === 'vouchersOrders') localTabName = 'cards';
        if (tabName === 'vouchers') localTabName = 'cards';
        if (tabName === 'accounts') localTabName = 'agents';
        
        $a.attr('href', 'javascript:void(0)');
        $a.attr('onclick', `switchTab('${localTabName}', this)`);
    } else {
        $a.attr('href', 'javascript:void(0)');
    }
});
$container.append($sidebar);

// 4. Create Layout Page
$container.append('<div class="layout-page"></div>');
const $page = $new('.layout-page');

// 5. Extract and append Navbar
const $navbar = $source('nav#layout-navbar').clone();
// Clean up Navbar user dropdown
$navbar.find('.dropdown-menu a[href="/logout"]').attr('href', 'javascript:void(0)').attr('onclick', 'logout()');
$page.append($navbar);

// 6. Extract and append Mobile Navbar
const $mobileNavbar = $source('nav.navbar.fixed-bottom').clone();
$mobileNavbar.find('a').each((i, el) => {
    const $a = $source(el);
    const href = $a.attr('href');
    if (href && href.includes("window.location.href")) {
        if (href.includes("flexy")) $a.attr('href', 'javascript:void(0)').attr('onclick', "switchTab('flexy', this)");
        else if (href.includes("idoom")) $a.attr('href', 'javascript:void(0)').attr('onclick', "switchTab('idoom', this)");
        else if (href.includes("vouchers")) $a.attr('href', 'javascript:void(0)').attr('onclick', "switchTab('cards', this)");
        else if (href.includes("transactions")) $a.attr('href', 'javascript:void(0)').attr('onclick', "switchTab('transactions', this)");
    } else if (href === '/') {
        $a.attr('href', 'javascript:void(0)').attr('onclick', "switchTab('dashboard', this)");
    }
});
$page.append($mobileNavbar);

// 7. Extract Content Wrapper and add to Page
$page.append('<div class="content-wrapper"><div class="container-fluid grow container-p-y" id="main-content-container"></div></div>');
const $contentContainer = $new('#main-content-container');

// 8. Inject our existing local Tab Panels into the Content Container
// First, create the dashboard panel with the percentages from source.txt
const $sourceDashboardContent = $source('#percentagesAccordion').parent().clone();
const $newDashboardTab = $new('<div id="dashboard-tab" class="tab-panel active"></div>');
$newDashboardTab.append($sourceDashboardContent);
$contentContainer.append($newDashboardTab);

// Then, inject the rest of our tabs (Flexy, Idoom, Cards, Transactions, Agents, SIMs, Settings)
$target('.tab-panel').each((i, el) => {
    const $tab = $target(el);
    const tabId = $tab.attr('id');
    
    // Skip old dashboard tab because we replaced it
    if (tabId === 'dashboard-tab') return;
    
    // Hide all these initially
    $tab.removeClass('active');
    $contentContainer.append($tab.clone());
});

// 9. Append Main JS and Core Scripts
$new('body').append(`
  <script src="assets/js/main.js"></script>
  <script src="js/app.js"></script>
`);

// Write the new file
fs.writeFileSync(targetPath, $new.html());
console.log('Successfully cloned layout from source.txt.txt into index.html');
