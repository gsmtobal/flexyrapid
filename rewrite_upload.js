const fs = require('fs');
const cheerio = require('cheerio');

const sourcePath = 'c:\\Users\\wahab phone\\Desktop\\upload_source.txt.txt';
const targetPath = 'c:\\Users\\wahab phone\\Desktop\\server sit web\\Cloud_Portal_Ready\\index.html';

let sourceHtml = fs.readFileSync(sourcePath, 'utf8');

// Extract the content block between the header and the end of the content container
const startMarker = '<h3 class="m-4 mb-0">تحميل القسائم</h3>';
const endMarker = '<!-- / Content -->';

let startIndex = sourceHtml.indexOf(startMarker);
let endIndex = sourceHtml.indexOf(endMarker, startIndex);

if (startIndex !== -1 && endIndex !== -1) {
    // Extract the block and remove the closing </div> that belongs to the container
    let uploadHtml = sourceHtml.substring(startIndex, endIndex);
    
    // Remove the last </div> before the end marker
    let lastDivIndex = uploadHtml.lastIndexOf('</div>');
    if (lastDivIndex !== -1) {
        uploadHtml = uploadHtml.substring(0, lastDivIndex) + uploadHtml.substring(lastDivIndex + 6);
    }

    let targetHtml = fs.readFileSync(targetPath, 'utf8');
    const $ = cheerio.load(targetHtml);

    // Make sure tab-uploadVouchers exists
    if ($('#tab-uploadVouchers').length) {
        $('#tab-uploadVouchers').empty();
        $('#tab-uploadVouchers').append(uploadHtml);

        fs.writeFileSync(targetPath, $.html());
        console.log('Successfully injected upload vouchers UI!');
    } else {
        console.log('Error: tab-uploadVouchers not found in index.html');
    }
} else {
    console.log('Error: Could not find start or end markers in the source file.');
}
