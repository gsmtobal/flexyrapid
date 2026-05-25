const fs = require('fs');
let code = fs.readFileSync('api_server.js', 'utf8');

code = code.replace("if (require.main === module) {", "console.log('HELLO 2');\nif (require.main === module) {\nconsole.log('HELLO 3');");
code = code.replace("app.listen(PORT", "console.log('HELLO 4');\napp.listen(PORT");

fs.writeFileSync('api_server.js_trace', code);
