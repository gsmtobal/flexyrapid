const fs = require('fs');

const endpoints = `
// --- Accounts Endpoints for Cloud Portal ---
app.get('/getAccounts', authMiddleware, (req, res) => {
    const db = require('./database.js');
    db.all("SELECT id, name as fullName, phone_number as phone, email, username, wilaya as wilaya_name_ascii, tier as role, balance as solde, is_admin FROM agents ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        // Send format expected by DataTables: { success: true, data: [...] }
        res.json({ success: true, data: rows });
    });
});

app.post('/addAccount', authMiddleware, (req, res) => {
    const db = require('./database.js');
    const { fullName, phone, email, username, password, wilaya, role, daira, city_id } = req.body;
    db.run("INSERT INTO agents (name, phone_number, email, username, password, wilaya, tier, balance, is_admin) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)",
        [fullName, phone, email, username, password, wilaya, role || 'detaillant'], function(err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, message: "تمت إضافة الحساب بنجاح" });
    });
});

app.post('/editAccount', authMiddleware, (req, res) => {
    const db = require('./database.js');
    const { id, fullName, phone, email, username, password, wilaya, role, daira, city_id } = req.body;
    if (password) {
        db.run("UPDATE agents SET name=?, phone_number=?, email=?, username=?, password=?, wilaya=?, tier=? WHERE id=?",
            [fullName, phone, email, username, password, wilaya, role, id], err => {
                if (err) return res.status(500).json({ success: false, message: err.message });
                res.json({ success: true, message: "تم التعديل بنجاح" });
        });
    } else {
        db.run("UPDATE agents SET name=?, phone_number=?, email=?, username=?, wilaya=?, tier=? WHERE id=?",
            [fullName, phone, email, username, wilaya, role, id], err => {
                if (err) return res.status(500).json({ success: false, message: err.message });
                res.json({ success: true, message: "تم التعديل بنجاح" });
        });
    }
});

app.delete('/deleteAccount', authMiddleware, (req, res) => {
    const db = require('./database.js');
    const id = req.body.id;
    db.run("DELETE FROM agents WHERE id=?", [id], err => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, message: "تم الحذف بنجاح" });
    });
});
`;

let code = fs.readFileSync('api_server.js', 'utf8');

// Insert the endpoints right before app.get('/getWilayas'
code = code.replace("app.get('/getWilayas',", endpoints + "\napp.get('/getWilayas',");

fs.writeFileSync('api_server.js', code);
console.log("Added accounts endpoints.");
