const https = require('https');
const fs = require('fs');
const path = require('path');

const baseUrl = 'https://tobalflexy.com';
const files = [
  '/assets/fontawesome/css/fontawesome.min.css',
  '/assets/fontawesome/css/all.min.css',
  '/assets/vendor/fonts/boxicons.css',
  '/assets/vendor/css/rtl/core.css',
  '/assets/vendor/css/rtl/theme-default.css',
  '/assets/css/rtl/demo.css',
  '/assets/vendor/css/rtl/pages/page-auth.css',
  '/css/style.css',
  '/assets/vendor/js/helpers.js',
  '/assets/vendor/libs/jquery/jquery.js',
  '/assets/vendor/libs/popper/popper.js',
  '/assets/vendor/js/bootstrap.js',
  '/assets/vendor/libs/perfect-scrollbar/perfect-scrollbar.js',
  '/assets/js/config.js',
  '/js/app.js',
  '/js/passkey-login.js',
  '/assets/js/main.js',
  '/logos/tobalflexy.png',
  '/app.webmanifest',
  '/assets/fontawesome/webfonts/fa-solid-900.woff2',
  '/assets/fontawesome/webfonts/fa-solid-900.ttf',
  '/assets/fontawesome/webfonts/fa-regular-400.woff2',
  '/assets/fontawesome/webfonts/fa-regular-400.ttf',
  '/assets/vendor/fonts/boxicons.woff2',
  '/assets/vendor/fonts/boxicons.woff',
  '/assets/vendor/fonts/boxicons.ttf'
];

const targetDir = path.join(__dirname, 'distributor_ui');

const downloadFile = (urlPath) => {
  return new Promise((resolve, reject) => {
    const fullUrl = baseUrl + urlPath;
    const localPath = path.join(targetDir, urlPath);
    const localDir = path.dirname(localPath);

    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }

    https.get(fullUrl, (res) => {
      if (res.statusCode === 200) {
        const file = fs.createWriteStream(localPath);
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      } else if (res.statusCode === 404) {
        resolve(); // Ignore 404s for guessed fonts
      } else {
        reject(`Failed to download ${fullUrl}, status: ${res.statusCode}`);
      }
    }).on('error', (err) => {
      reject(`Error on ${fullUrl}: ${err.message}`);
    });
  });
};

async function main() {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir);
  }
  console.log('Starting downloads...');
  for (const file of files) {
    try {
      console.log(`Downloading ${file}`);
      await downloadFile(file);
    } catch (e) {
      console.error(e);
    }
  }
  console.log('Finished downloads.');
}

main();
