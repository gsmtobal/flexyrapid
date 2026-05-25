const http = require('http');

http.get('http://127.0.0.1:3005/getWilayas', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log("Status:", res.statusCode);
        console.log("Data length:", data.length);
        if (res.statusCode !== 200) console.log(data);
    });
}).on('error', (err) => {
    console.log("Request error:", err.message);
});
