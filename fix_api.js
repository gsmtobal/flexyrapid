const fs = require('fs');
let code = fs.readFileSync('api_server.js', 'utf8');

// I will just use acorn to see where the syntax error is
// If it's just an extra brace, I'll add it at the end
code += "\n}\n";

try {
    require('acorn').parse(code, {ecmaVersion: 2022});
    fs.writeFileSync('api_server.js', code);
    console.log("Fixed by adding '}' at the end.");
} catch(e) {
    console.log("Still broken:", e.message);
}
