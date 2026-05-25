const https = require('https');
const fs = require('fs');
const url = 'https://raw.githubusercontent.com/ihahachi/Algeria-Cities/main/json/algeria_cities.json';

https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        fs.writeFileSync('algeria_cities.json', data);
        console.log("Downloaded algeria_cities.json successfully!");
    });
}).on('error', (err) => console.error(err));
