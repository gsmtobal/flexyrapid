const fs = require('fs');

let css = fs.readFileSync('telegram_style.css', 'utf8');

// The SIM Grid & Cards start at around line 542
const startIndex = css.indexOf('/* SIM Grid & Cards */');
if (startIndex !== -1) {
    let specificCss = css.substring(startIndex);
    
    // Define new root variables for light mode matching Sneat
    const newRoot = `
:root {
    --bg-color: #f5f5f9;
    --panel-bg: #ffffff;
    --panel-solid: #ffffff;
    --text-main: #566a7f;
    --text-muted: #a1acb8;
    --primary: #696cff;
    --primary-hover: #5f61e6;
    --primary-glow: rgba(105, 108, 255, 0.2);
    --success: #71dd37;
    --success-glow: rgba(113, 221, 55, 0.25);
    --danger: #ff3e1d;
    --danger-glow: rgba(255, 62, 29, 0.25);
    --warning: #ffab00;
    --warning-glow: rgba(255, 171, 0, 0.25);
    --ooredoo: #ed1c24;
    --djezzy: #e2001a;
    --mobilis: #10b981;
    --border-color: #d9dee3;
    --sim-card-bg: #ffffff;
    --card-shadow: 0 2px 6px 0 rgba(67, 89, 113, 0.12);
    --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

body {
    background-color: var(--bg-color);
    color: var(--text-main);
    font-family: 'Rubik', sans-serif;
}

/* Modals fix for Bootstrap */
.modal {
    background: rgba(3, 7, 18, 0.5);
    backdrop-filter: blur(3px);
}
.modal.active { display: flex; }
.modal-content {
    border: none;
    box-shadow: 0 0.25rem 1rem rgba(161, 172, 184, 0.45);
    padding: 1.5rem;
    border-radius: 0.5rem;
}

`;

    // Also replace some hardcoded dark colors in the sim cards
    specificCss = specificCss.replace(/background: #0b0f19;/g, 'background: transparent; border: none;'); // sims-grid
    specificCss = specificCss.replace(/background: #151b2e;/g, 'background: var(--panel-bg); box-shadow: var(--card-shadow);');
    specificCss = specificCss.replace(/border: 1px solid rgba\(255, 255, 255, 0\.12\);/g, 'border: 1px solid var(--border-color);');
    specificCss = specificCss.replace(/color: white;/g, 'color: var(--text-main);');
    specificCss = specificCss.replace(/color: #fff/g, 'color: var(--text-main)');
    specificCss = specificCss.replace(/background: rgba\(255, 255, 255, 0\.02\);/g, 'background: #f8f9fa;');
    specificCss = specificCss.replace(/background: rgba\(255, 255, 255, 0\.08\);/g, 'background: #e9ecef;');
    specificCss = specificCss.replace(/color: #38bdf8;/g, 'color: #000;'); // terminal text
    specificCss = specificCss.replace(/background: #05070e;/g, 'background: #f8f9fa; border: 1px solid #d9dee3;'); // terminal bg
    specificCss = specificCss.replace(/background: rgba\(0,0,0,0\.3\);/g, 'background: #fff; border: 1px solid #d9dee3;'); // inputs inside sim
    
    fs.writeFileSync('telegram_style.css', newRoot + specificCss);
    console.log('Successfully updated telegram_style.css');
} else {
    console.log('Could not find SIM Grid section');
}
