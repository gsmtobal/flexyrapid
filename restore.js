const fs = require('fs');

const transcriptPath = 'C:\\Users\\wahab phone\\.gemini\\antigravity\\brain\\1674522e-575b-42ca-a00b-824f033a31ba\\.system_generated\\logs\\transcript.jsonl';
const cssPath = 'C:\\Users\\wahab phone\\Desktop\\server sit web\\telegram_style.css';
const htmlPath = 'C:\\Users\\wahab phone\\Desktop\\server sit web\\telegram_dashboard.html';
const jsPath = 'C:\\Users\\wahab phone\\Desktop\\server sit web\\ui_script.js';

let lines = fs.readFileSync(transcriptPath, 'utf8').split('\n');

for (let line of lines) {
    if (!line) continue;
    try {
        const step = JSON.parse(line);
        if (step.tool_calls) {
            for (let tc of step.tool_calls) {
                if (tc.name === 'multi_replace_file_content' || tc.name === 'replace_file_content') {
                    if (tc.args.TargetFile.includes('telegram_style.css')) {
                        // find first replacement for css
                        console.log('Found CSS change in step ' + step.step_index);
                    }
                }
            }
        }
    } catch (e) {}
}
