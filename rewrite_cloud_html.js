const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('Cloud_Portal_Ready/index.html', 'utf8');
const $ = cheerio.load(html);

// 1. Update Head
$('head').html(`
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, minimum-scale=1.0, maximum-scale=1.0" />
  <title>لوحة التحكم - توبال فليكسي</title>
  
  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Rubik:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700&display=swap" rel="stylesheet">

  <!-- Icons -->
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
  <link href="https://unpkg.com/boxicons@2.1.4/css/boxicons.min.css" rel="stylesheet">

  <!-- Core CSS (Sneat) -->
  <link rel="stylesheet" href="https://tobalflexy.com/assets/vendor/css/rtl/core.css" class="template-customizer-core-css" />
  <link rel="stylesheet" href="https://tobalflexy.com/assets/vendor/css/rtl/theme-default.css" class="template-customizer-theme-css" />
  <link rel="stylesheet" href="https://tobalflexy.com/assets/css/rtl/demo.css" />

  <!-- Core JS -->
  <script src="https://tobalflexy.com/assets/vendor/libs/jquery/jquery.js"></script>
  <script src="https://tobalflexy.com/assets/vendor/js/bootstrap.js"></script>

  <!-- Custom CSS -->
  <link rel="stylesheet" href="css/style.css" />

  <!-- SweetAlert2 -->
  <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
`);

// Add classes to HTML and Body
$('html').addClass('light-style layout-menu-fixed').attr('data-theme', 'theme-default');

// Extract parts from old HTML
const oldApp = $('.app-container');
const oldSidebar = oldApp.find('.sidebar');
const oldMain = oldApp.find('.main-view');
const oldTabs = oldMain.find('.tab-panel');
const oldModals = $('#modalBackdrop');
const scripts = $('script[src="js/app.js"]');

// Wrap everything in Sneat Layout
$('body').empty();
$('body').append(`
    <div class="layout-wrapper layout-content-navbar">
        <div class="layout-container" id="main-layout-container">
            <!-- Sidebar goes here -->
            <div class="layout-page">
                <!-- Navbar goes here -->
                <div class="content-wrapper">
                    <div class="container-xxl flex-grow-1 container-p-y" id="main-content-container">
                        <!-- Content goes here -->
                    </div>
                </div>
            </div>
        </div>
    </div>
`);

// Transform Sidebar
let menuItemsHtml = '';
oldSidebar.find('.menu-inner').children().each((i, el) => {
    const $el = $(el);
    if ($el.hasClass('menu-header')) {
        menuItemsHtml += `<li class="menu-header small text-uppercase"><span class="menu-header-text">${$el.text()}</span></li>`;
    } else if ($el.hasClass('menu-item')) {
        const onClick = $el.attr('onclick');
        const icon = $el.find('i').attr('class');
        const text = $el.find('span').text().trim();
        const isActive = $el.hasClass('active') ? 'active' : '';
        const isDanger = $el.find('.text-danger').length > 0;
        const textColor = isDanger ? 'text-danger' : '';
        menuItemsHtml += `
            <li class="menu-item ${isActive}">
                <a href="javascript:void(0);" class="menu-link ${textColor}" onclick="${onClick}">
                    <i class="menu-icon tf-icons ${icon} ${textColor}"></i>
                    <div>${text}</div>
                </a>
            </li>`;
    }
});

const newSidebar = `
<aside id="layout-menu" class="layout-menu menu-vertical menu bg-menu-theme">
    <div class="app-brand demo justify-content-center mt-3 mb-3">
        <a href="#" class="app-brand-link gap-2">
            <span class="app-brand-logo demo text-primary" style="font-size: 24px;">
                <i class="fas fa-satellite-dish"></i>
            </span>
            <span class="app-brand-text demo text-body fw-bolder" style="font-size: 20px;">TOBAL FLEXY</span>
        </a>
    </div>
    <div class="menu-inner-shadow"></div>
    <ul class="menu-inner py-1">
        ${menuItemsHtml}
    </ul>
</aside>
`;
$('#main-layout-container').prepend(newSidebar);

// Transform Topbar
const newTopbar = `
<nav class="layout-navbar container-xxl navbar navbar-expand-xl navbar-detached align-items-center bg-navbar-theme" id="layout-navbar">
    <div class="layout-menu-toggle navbar-nav align-items-xl-center me-3 me-xl-0 d-xl-none">
        <a class="nav-item nav-link px-0 me-xl-4" href="javascript:void(0)" onclick="$('#layout-menu').toggleClass('layout-menu-expanded')">
            <i class="bx bx-menu bx-sm"></i>
        </a>
    </div>
    <div class="navbar-nav-right d-flex align-items-center" id="navbar-collapse">
        <div class="navbar-nav align-items-center">
            <div class="nav-item d-flex align-items-center">
                <span class="badge bg-success" id="serverStatusBadge">
                    <i class="fas fa-circle me-1"></i> متصل بالسيرفر
                </span>
            </div>
        </div>
        <ul class="navbar-nav flex-row align-items-center ms-auto">
            <li class="nav-item navbar-dropdown dropdown-user dropdown">
                <a class="nav-link dropdown-toggle hide-arrow" href="javascript:void(0);" data-bs-toggle="dropdown">
                    <div class="avatar avatar-online">
                        <div class="rounded-circle bg-primary d-flex align-items-center justify-content-center text-white" style="width: 40px; height: 40px;">
                            A
                        </div>
                    </div>
                </a>
            </li>
        </ul>
    </div>
</nav>
`;
$('.layout-page').prepend(newTopbar);

// Move all tab-panels to container
oldTabs.each((i, tab) => {
    const $tab = $(tab);
    
    // Change basic forms & buttons
    $tab.find('.form-group').addClass('mb-3').removeClass('form-group');
    
    // Convert stats-grid in Dashboard to row layout
    if ($tab.attr('id') === 'tab-dashboard') {
        const statsGrid = $tab.find('.stats-grid');
        statsGrid.removeClass('stats-grid').addClass('row mb-4');
        statsGrid.find('.stat-card').each((j, card) => {
            const $card = $(card);
            $card.removeClass('stat-card').addClass('card h-100');
            $card.wrap('<div class="col-lg-3 col-md-6 col-12 mb-4"></div>');
            
            const icon = $card.find('.stat-icon');
            icon.addClass('avatar flex-shrink-0 me-3').removeClass('stat-icon').css({'width':'42px','height':'42px','display':'flex','align-items':'center','justify-content':'center','border-radius':'0.375rem'});
            
            const title = $card.find('.stat-title').text();
            const value = $card.find('.stat-value').html();
            const valueId = $card.find('.stat-value').attr('id');
            
            $card.empty().append(`
                <div class="card-body d-flex align-items-center">
                    ${$('<div>').append(icon).html()}
                    <div>
                        <span class="d-block mb-1 text-muted" style="font-size: 14px;">${title}</span>
                        <h4 class="card-title text-nowrap mb-2 fw-bold" id="${valueId}">${value}</h4>
                    </div>
                </div>
            `);
        });
    }

    // Convert cards (already have .card but maybe missing card-body structure if they are custom)
    $tab.find('.card').each((j, card) => {
        const $card = $(card);
        $card.addClass('mb-4');
        const $header = $card.find('.card-header');
        if ($header.length) {
            $header.addClass('d-flex justify-content-between align-items-center');
            $header.find('.card-title').addClass('m-0 fw-bold text-primary');
        }
    });

    // Make tables Bootstrap compliant
    $tab.find('table').addClass('table table-hover');
    $tab.find('.table-responsive').addClass('text-nowrap');
    
    $('#main-content-container').append($tab);
});

// Append Modals and script
$('body').append(oldModals);
$('body').append(scripts);

// Add CSS script to fix toggling sidebar on mobile
$('body').append(`
<script>
    // Sneat mobile menu toggle fix for our custom implementation
    $(document).on('click', '.layout-menu-toggle', function(e) {
        e.preventDefault();
        window.Helpers.toggleCollapsed();
    });
</script>
`);

fs.writeFileSync('Cloud_Portal_Ready/index.html', $.html());
console.log('Successfully rewrote Cloud_Portal_Ready/index.html');
