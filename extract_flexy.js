const fs = require('fs');
const cheerio = require('cheerio');

const sourceHtml = fs.readFileSync('c:\\Users\\wahab phone\\Desktop\\source.txt.txt', 'utf8');
const $ = cheerio.load(sourceHtml);

const content = $('.content-wrapper .container-fluid').html() || $('.content-wrapper').html();
fs.writeFileSync('c:\\Users\\wahab phone\\Desktop\\server sit web\\extracted_flexy.html', content);
console.log('Flexy content extracted to extracted_flexy.html');
