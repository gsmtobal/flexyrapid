const fs = require('fs');
const path = require('path');
const https = require('https');

const baseDir = path.join(__dirname, 'Cloud_Portal_Ready', 'assets');

const filesToDownload = [
  { url: 'https://tobalflexy.com/assets/vendor/css/rtl/core.css', dest: 'vendor/css/rtl/core.css' },
  { url: 'https://tobalflexy.com/assets/vendor/css/rtl/theme-default.css', dest: 'vendor/css/rtl/theme-default.css' },
  { url: 'https://tobalflexy.com/assets/css/rtl/demo.css', dest: 'css/rtl/demo.css' },
  { url: 'https://tobalflexy.com/assets/vendor/css/pages/page-auth.css', dest: 'vendor/css/pages/page-auth.css' },
  { url: 'https://tobalflexy.com/assets/vendor/libs/jquery/jquery.js', dest: 'vendor/libs/jquery/jquery.js' },
  { url: 'https://tobalflexy.com/assets/vendor/js/bootstrap.js', dest: 'vendor/js/bootstrap.js' }
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const fullDest = path.join(baseDir, dest);
    fs.mkdirSync(path.dirname(fullDest), { recursive: true });
    const file = fs.createWriteStream(fullDest);
    https.get(url, response => {
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', err => {
      fs.unlink(fullDest, () => {});
      reject(err);
    });
  });
}

async function start() {
  console.log('Downloading assets...');
  for (const file of filesToDownload) {
    console.log('Downloading ' + file.url);
    await download(file.url, file.dest);
  }
  console.log('Assets downloaded successfully.');

  // Replace links in index.html and login.html
  ['index.html', 'login.html'].forEach(htmlFile => {
    const htmlPath = path.join(__dirname, 'Cloud_Portal_Ready', htmlFile);
    if (fs.existsSync(htmlPath)) {
      let content = fs.readFileSync(htmlPath, 'utf8');
      content = content.replace(/https:\/\/tobalflexy\.com\/assets\//g, 'assets/');
      fs.writeFileSync(htmlPath, content);
      console.log('Updated ' + htmlFile);
    }
  });
}

start().catch(err => console.error(err));
