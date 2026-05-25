const fs = require('fs');
const path = require('path');

const uploadSourcePath = path.join('C:\\Users\\wahab phone\\Desktop', 'upload_source.txt.txt');
const indexHtmlPath = path.join(__dirname, 'Cloud_Portal_Ready', 'index.html');

let uploadSource = fs.readFileSync(uploadSourcePath, 'utf8');
let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

// Extract the content from upload_source.txt.txt
// It starts with <h3 class="m-4">الحسابات and ends before </div><!-- / Content -->
let startIndex = uploadSource.indexOf('<h3 class="m-4">الحسابات');
let endIndex = uploadSource.indexOf('<!-- / Content -->');
if (startIndex === -1 || endIndex === -1) {
    console.error("Could not find the start or end markers in upload_source.txt.txt");
    process.exit(1);
}

// Find the last </div> before <!-- / Content -->
let extractedContent = uploadSource.substring(startIndex, endIndex);
extractedContent = extractedContent.substring(0, extractedContent.lastIndexOf('</div>'));

// Now we need to inject this into index.html, replacing the contents of <div id="tab-agents" class="tab-panel">
let tabAgentsStart = indexHtml.indexOf('<div id="tab-agents" class="tab-panel">');
if (tabAgentsStart === -1) {
    console.error("Could not find <div id=\"tab-agents\" class=\"tab-panel\"> in index.html");
    process.exit(1);
}

// Find where <div id="tab-agents" class="tab-panel"> ends. It ends when the next <div id="tab-... starts, or at the end of the tabs.
let tabAgentsInnerStart = tabAgentsStart + '<div id="tab-agents" class="tab-panel">'.length;
let nextTabStart = indexHtml.indexOf('<div id="tab-', tabAgentsInnerStart);
let tabAgentsEnd = indexHtml.lastIndexOf('</div>', nextTabStart); 
if (nextTabStart === -1) {
    // If it's the last tab
    nextTabStart = indexHtml.indexOf('</div><!-- / Tabs -->', tabAgentsInnerStart);
    tabAgentsEnd = indexHtml.lastIndexOf('</div>', nextTabStart);
}

// Replace the content
let newIndexHtml = indexHtml.substring(0, tabAgentsInnerStart) + "\n" + extractedContent + "\n" + indexHtml.substring(nextTabStart);

fs.writeFileSync(indexHtmlPath, newIndexHtml, 'utf8');
console.log("Successfully injected Accounts Management into index.html!");
