const fs = require('fs');
const code = fs.readFileSync('api_server.js', 'utf8');
const acorn = require('acorn');
try {
    acorn.parse(code, {ecmaVersion: 2022});
    console.log("No syntax error");
} catch(e) {
    console.log("Syntax error at line", e.loc.line, "col", e.loc.column, ":", e.message);
}
