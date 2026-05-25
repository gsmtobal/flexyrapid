const fs = require('fs');

const path = 'Cloud_Portal_Ready/index.html';
let html = fs.readFileSync(path, 'utf8');

// 1. Clean the Recharge Phone input
html = html.replace(
  /<input([^>]*?)id="rechargePhone"([^>]*?)style="[^"]*"([^>]*?)>/g,
  '<input$1id="rechargePhone"$2 class="form-control form-control-lg text-center fs-3 fw-bold text-primary" style="letter-spacing: 2px;"$3>'
);

// 2. Clean the Recharge Amount input
html = html.replace(
  /<input([^>]*?)id="rechargeAmount"([^>]*?)style="[^"]*"([^>]*?)>/g,
  '<input$1id="rechargeAmount"$2 class="form-control form-control-lg text-center fs-3 fw-bold"$3>'
);

// 3. Clean the Idoom Phone input
html = html.replace(
  /<input([^>]*?)id="idoomPhone"([^>]*?)style="[^"]*"([^>]*?)>/g,
  '<input$1id="idoomPhone"$2 class="form-control form-control-lg text-center fs-3 fw-bold text-primary" style="letter-spacing: 2px;"$3>'
);

// 4. Clean the Submit Buttons
html = html.replace(
  /class="btn btn-primary w-100" style="[^"]*"/g,
  'class="btn btn-primary btn-lg w-100 mt-2 fw-bold"'
);
html = html.replace(
  /class="btn btn-secondary w-100" style="[^"]*"/g,
  'class="btn btn-outline-primary btn-lg w-100 mt-2 fw-bold"'
);

// 5. Clean the card title
html = html.replace(
  /class="m-0 fw-bold text-primary" style="[^"]*"/g,
  'class="m-0 fw-bold text-primary fs-4"'
);

// 6. Clean the form box wrapper
html = html.replace(
  /class="recharge-form-box" style="[^"]*"/g,
  'class="p-4 border rounded bg-lighter mb-3"'
);

// 7. Clean tables
html = html.replace(/<table style="[^"]*"/g, '<table class="table table-striped table-hover"');
html = html.replace(/<th style="[^"]*"/g, '<th');
html = html.replace(/<td style="[^"]*"/g, '<td');
html = html.replace(/class="table-responsive" style="[^"]*"/g, 'class="table-responsive text-nowrap"');

fs.writeFileSync(path, html);
console.log('Successfully cleaned up inline styles using Regex!');
