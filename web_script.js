const API_PORT = window.location.port ? window.location.port : 3005;
const API_BASE = `http://${window.location.hostname || 'localhost'}:${API_PORT}/api`;
const TOKEN = localStorage.getItem('admin_token') || 'SUPERM123';

// Utility: Show Toast Notification
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';
    if (type === 'warning') icon = 'fa-exclamation-triangle';
    
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease-out forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Utility: Fast API Fetch
async function fetchApi(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': TOKEN
        }
    };
    if (body) options.body = JSON.stringify(body);
    
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, options);
        if (!res.ok) {
            // Handle 401 Unauthorized
            if (res.status === 401) {
                showToast('غير مصرح. يرجى التحقق من مفتاح الحماية.', 'error');
                return null;
            }
            throw new Error(`HTTP ${res.status}`);
        }
        return await res.json();
    } catch (e) {
        console.error('API Error:', e);
        showToast('خطأ في الاتصال بالخادم', 'error');
        return null;
    }
}

// IPC Wrapper
async function ipcInvoke(channel, data = {}) {
    const res = await fetchApi(`/ipc/${channel}`, 'POST', { data });
    if (res && res.success === false) {
        showToast(res.error || res.message || 'حدث خطأ', 'error');
        throw new Error(res.error || res.message);
    }
    return res;
}

// Global State
let simCards = [];

// Navigation & Tabs
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Update Nav
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        
        // Update Title
        document.getElementById('currentTabTitle').textContent = item.textContent.trim();
        
        // Switch Tab
        const targetId = item.getAttribute('data-tab');
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.getElementById(targetId).classList.add('active');
        
        if (targetId === 'tab-stats') loadStats();
        if (targetId === 'tab-offers') loadOffers();
    });
});

// Sub-tabs for Idoom
document.querySelectorAll('.sub-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.sub-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const target = btn.getAttribute('data-target');
        const phoneInput = document.getElementById('idoomPhoneInput');
        if (target === 'idoom-adsl') {
            phoneInput.placeholder = "021... أو 023... (ثابت)";
        } else {
            phoneInput.placeholder = "025... (4G)";
        }
    });
});

// Detect Operator from Phone
function detectOperator(phone) {
    if (!phone || phone.length < 2) return null;
    if (phone.startsWith('05')) return 'Ooredoo';
    if (phone.startsWith('06')) return 'Mobilis';
    if (phone.startsWith('07')) return 'Djezzy';
    return null;
}

const phoneInput = document.getElementById('phoneInput');
const operatorLogo = document.getElementById('operatorLogo');

phoneInput.addEventListener('input', (e) => {
    let val = e.target.value.replace(/\D/g, '');
    e.target.value = val;
    
    const op = detectOperator(val);
    operatorLogo.className = 'operator-logo'; // reset
    if (op) {
        operatorLogo.classList.add(op.toLowerCase());
        let icon = 'fa-mobile-alt';
        if (op === 'Mobilis') operatorLogo.innerHTML = '<img src="https://upload.wikimedia.org/wikipedia/commons/4/41/Mobilis_Logo.svg" height="40" style="filter: grayscale(1) brightness(2) drop-shadow(0 0 10px var(--mobilis))" />';
        else if (op === 'Ooredoo') operatorLogo.innerHTML = '<img src="https://upload.wikimedia.org/wikipedia/commons/8/87/Ooredoo_logo_2023.svg" height="40" style="filter: grayscale(1) brightness(2) drop-shadow(0 0 10px var(--ooredoo))" />';
        else if (op === 'Djezzy') operatorLogo.innerHTML = '<img src="https://upload.wikimedia.org/wikipedia/commons/7/7b/Djezzy_logo.svg" height="40" style="filter: grayscale(1) brightness(2) drop-shadow(0 0 10px var(--djezzy))" />';
    } else {
        operatorLogo.innerHTML = '<i class="fas fa-mobile-alt"></i>';
    }
});

// Fetch Offers Button Logic
document.getElementById('btnFetchOffers').addEventListener('click', async () => {
    const phone = phoneInput.value;
    if (phone.length !== 10) return showToast('يرجى إدخال رقم هاتف صحيح (10 أرقام) قبل كشف العروض', 'warning');
    
    const btn = document.getElementById('btnFetchOffers');
    const resultDiv = document.getElementById('dynamicOffersResult');
    const originalHtml = btn.innerHTML;
    
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الكشف...';
    btn.disabled = true;
    resultDiv.style.display = 'none';
    
    try {
        const res = await fetchApi('/sama/offers', 'POST', { phone });
        if (res && res.success && res.content) {
            resultDiv.textContent = '🌟 العروض المتاحة:\n\n' + res.content;
            resultDiv.style.display = 'block';
            showToast('تم استخراج العروض بنجاح!', 'success');
        } else {
            showToast(res ? (res.error || res.message) : 'فشل استخراج العروض من الشريحة', 'error');
        }
    } catch(e) {
        showToast('خطأ أثناء التواصل مع الشريحة', 'error');
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
});

// Quick Picks
document.querySelectorAll('.amount-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        document.getElementById('amountInput').value = btn.getAttribute('data-amt');
    });
});
document.getElementById('amountInput').addEventListener('input', () => {
    document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('selected'));
});

// Load Total Balance
async function loadTotalBalance() {
    const res = await ipcInvoke('get-sims');
    if (res) {
        simCards = res;
        let total = 0;
        simCards.forEach(sim => {
            try {
                let bal = 0;
                if (typeof sim.balance === 'string' && sim.balance.startsWith('{')) {
                    const obj = JSON.parse(sim.balance);
                    bal = parseFloat(obj[sim.transfer_type || '04'] || obj.gts || Object.values(obj)[0] || 0);
                } else {
                    bal = parseFloat(sim.balance || 0);
                }
                if (!isNaN(bal)) total += bal;
            } catch(e){}
        });
        document.getElementById('totalBalance').textContent = total.toLocaleString() + ' دج';
        document.getElementById('connStatus').className = 'connection-status connected';
        document.getElementById('connStatus').innerHTML = '<i class="fas fa-circle"></i> متصل بالسيرفر';
    } else {
        document.getElementById('connStatus').className = 'connection-status disconnected';
        document.getElementById('connStatus').innerHTML = '<i class="fas fa-times-circle"></i> غير متصل';
    }
}

// Fast Flexy Send
document.getElementById('btnSendFlexy').addEventListener('click', async () => {
    const phone = phoneInput.value;
    const amount = document.getElementById('amountInput').value;
    
    if (phone.length !== 10) return showToast('رقم الهاتف يجب أن يتكون من 10 أرقام', 'warning');
    if (!amount || amount <= 0) return showToast('يرجى تحديد المبلغ', 'warning');
    
    const btn = document.getElementById('btnSendFlexy');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';
    btn.disabled = true;
    
    try {
        const res = await fetchApi('/flexy', 'POST', { phone, amount });
        if (res && res.success) {
            showToast(`تم إرسال ${amount} دج إلى ${phone} بنجاح`, 'success');
            phoneInput.value = '';
            document.getElementById('amountInput').value = '';
            document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('selected'));
            loadTotalBalance();
        } else {
            showToast(res ? res.error || res.message : 'فشل الإرسال', 'error');
        }
    } catch(e) {
        showToast('خطأ أثناء الإرسال', 'error');
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
});

// Load Offers
async function loadOffers() {
    const operator = document.getElementById('operatorSelect').value;
    const grid = document.getElementById('offersGrid');
    grid.innerHTML = '<div class="loading-offers"><i class="fas fa-spinner fa-spin"></i> جاري تحميل العروض...</div>';
    
    try {
        const res = await ipcInvoke('get-sim-offers');
        if (res) {
            grid.innerHTML = '';
            const ops = res.filter(o => o.category_name && o.category_name.length > 0);
            
            // Temporary static mock for Mobilis if database is empty for this view
            const fallbackOffers = [
                { category_name: 'PixX', label: 'PixX 100', amount: 100, operator: 'Mobilis' },
                { category_name: 'PixX', label: 'PixX 500 (5Go)', amount: 500, operator: 'Mobilis' },
                { category_name: 'PixX', label: 'PixX 1000 (13Go)', amount: 1000, operator: 'Mobilis' },
                { category_name: 'PixX', label: 'PixX 2000 (30Go)', amount: 2000, operator: 'Mobilis' },
                { category_name: 'Sama Mix', label: 'Sama Mix 1000', amount: 1000, operator: 'Mobilis' },
                
                { category_name: 'Hashta', label: 'Hashta 500', amount: 500, operator: 'Ooredoo' },
                { category_name: 'Hashta', label: 'Hashta 1000', amount: 1000, operator: 'Ooredoo' },
                
                { category_name: 'Hayla', label: 'Hayla Maxi 1000', amount: 1000, operator: 'Djezzy' },
            ];
            
            const displayOffers = (ops.length > 0 ? ops : fallbackOffers).filter(o => !o.operator || o.operator === operator);
            
            if (displayOffers.length === 0) {
                grid.innerHTML = '<div class="loading-offers">لا توجد عروض متوفرة لهذا المتعامل</div>';
                return;
            }
            
            displayOffers.forEach(offer => {
                const card = document.createElement('div');
                card.className = 'offer-card';
                card.innerHTML = `
                    <div>
                        <div class="offer-title">${offer.label || offer.category_name}</div>
                        <div class="offer-price">${offer.amount} دج</div>
                    </div>
                    <button class="offer-btn" onclick="sendOffer('${offer.label}', ${offer.amount})">
                        <i class="fas fa-gift"></i> تفعيل العرض
                    </button>
                `;
                grid.appendChild(card);
            });
        }
    } catch(e) {
        grid.innerHTML = '<div class="loading-offers" style="color:var(--danger)">فشل تحميل العروض</div>';
    }
}
document.getElementById('operatorSelect').addEventListener('change', loadOffers);

// Send Offer
window.sendOffer = async function(label, amount) {
    const phone = document.getElementById('offerPhoneInput').value;
    const operator = document.getElementById('operatorSelect').value;
    
    if (phone.length !== 10) return showToast('يرجى إدخال رقم هاتف الزبون (10 أرقام)', 'warning');
    
    if (!confirm(`هل أنت متأكد من تفعيل ${label} للرقم ${phone}؟`)) return;
    
    showToast(`جاري تفعيل ${label}...`, 'info');
    try {
        const res = await fetchApi('/offers/send', 'POST', {
            phone,
            operator,
            offerCode: label,
            amount
        });
        
        if (res && res.success) {
            showToast(`تم تفعيل العرض بنجاح!`, 'success');
        } else {
            showToast(res ? res.error || res.message : 'فشل تفعيل العرض', 'error');
        }
    } catch (e) {
        showToast('خطأ أثناء التفعيل', 'error');
    }
};

// Idoom Send
document.getElementById('btnSendIdoom').addEventListener('click', async () => {
    const phone = document.getElementById('idoomPhoneInput').value;
    const amount = document.getElementById('idoomAmountInput').value;
    const isAdsl = document.querySelector('.sub-tab[data-target="idoom-adsl"]').classList.contains('active');
    
    if (phone.length < 8) return showToast('رقم الهاتف الثابت غير صالح', 'warning');
    if (!amount || amount < 100) return showToast('المبلغ غير صالح', 'warning');
    
    const btn = document.getElementById('btnSendIdoom');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التسديد...';
    btn.disabled = true;
    
    try {
        // Fallback to Meetmob ADSL API if actual idoom api is not exposed
        const res = await fetch('http://localhost:3000/meetmob/recharge-adsl', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                phoneNumber: phone,
                amount: amount,
                is4G: !isAdsl
            })
        });
        
        const json = await res.json();
        if (json.success) {
            showToast(`تم تسديد ${amount} دج للرقم ${phone} بنجاح!`, 'success');
        } else {
            showToast(json.message || 'فشلت عملية التسديد', 'error');
        }
    } catch(e) {
        showToast('لم يتمكن من الاتصال بخدمة إيدوم المحلية', 'error');
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
});

// Load Stats (Basic)
async function loadStats() {
    const grid = document.getElementById('statsGrid');
    grid.innerHTML = '<div class="loading-offers"><i class="fas fa-spinner fa-spin"></i> جاري تحميل الإحصائيات...</div>';
    
    if (simCards.length > 0) {
        grid.innerHTML = '';
        simCards.forEach(sim => {
            let bal = 0;
            try {
                if (typeof sim.balance === 'string' && sim.balance.startsWith('{')) {
                    const obj = JSON.parse(sim.balance);
                    bal = parseFloat(obj[sim.transfer_type || '04'] || obj.gts || Object.values(obj)[0] || 0);
                } else {
                    bal = parseFloat(sim.balance || 0);
                }
            } catch(e){}
            
            const card = document.createElement('div');
            card.className = 'glass-panel';
            card.style.padding = '1.5rem';
            card.style.marginBottom = '1rem';
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="color:var(--text-muted); font-size:0.9rem;">${sim.operator} - ${sim.number || sim.address}</div>
                        <div style="font-size:1.5rem; font-weight:700;">${bal.toLocaleString()} دج</div>
                    </div>
                    <div class="operator-logo ${sim.operator.toLowerCase()}" style="font-size:2rem; margin:0;">
                        <i class="fas fa-sim-card"></i>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
    } else {
        grid.innerHTML = '<div class="loading-offers">لا توجد بيانات متاحة حالياً</div>';
    }
}

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
    loadTotalBalance();
    setInterval(loadTotalBalance, 30000); // refresh balance every 30s
});
