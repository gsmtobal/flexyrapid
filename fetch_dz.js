const https = require('https');
const fs = require('fs');

const url = 'https://raw.githubusercontent.com/lotfio/algeria-administrative-divisions/master/json/algeria_cities.json';
const fallbackUrl = 'https://raw.githubusercontent.com/ihahachi/Algeria-Cities/master/algeria_cities.json';

function fetchUrl(url, filename) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error('Status ' + res.statusCode));
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    JSON.parse(data); // Validate JSON
                    fs.writeFileSync(filename, data);
                    resolve(true);
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function main() {
    try {
        await fetchUrl('https://raw.githubusercontent.com/ihahachi/Algeria-Cities/master/algeria_cities.json', 'algeria_cities.json');
        console.log("Downloaded algeria_cities.json from ihahachi");
    } catch(e) {
        try {
            await fetchUrl('https://raw.githubusercontent.com/lotfio/algeria-administrative-divisions/master/json/algeria.json', 'algeria_cities.json');
            console.log("Downloaded algeria_cities.json from lotfio");
        } catch(e2) {
            console.error("Failed to download JSON:", e2.message);
        }
    }
}
main();
