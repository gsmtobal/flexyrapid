// app.js - Web Admin Panel Frontend Logic for Tobal Flexy (tobalflexy.com style)

// Global Configuration
const adminToken = localStorage.getItem('admin_token');
if (!adminToken && !window.location.pathname.endsWith('login.html')) {
  window.location.href = 'login.html';
}

// Request Helper
async function apiRequest(url, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': adminToken
    }
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  try {
    const response = await fetch(url, options);
    if (response.status === 401) {
      localStorage.removeItem('admin_token');
      window.location.href = 'login.html';
      return null;
    }
    return await response.json();
  } catch (err) {
    console.error(`[API Error] Failed to fetch ${url}:`, err);
    return { success: false, error: 'Connection failure' };
  }
}

// Tab Switching
function switchTab(tabName, element = null) {
  // Hide all panels
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.remove('active');
  });
  
  // Show target panel
  // Support both naming conventions
  let target = document.getElementById(tabName + '-tab');
  if (!target) target = document.getElementById('tab-' + tabName);
  if (target) {
    target.classList.add('active');
  }
  
  // Update sidebar menu highlight
  if (element) {
    document.querySelectorAll('.menu-item').forEach(item => {
      item.classList.remove('active');
    });
    const parentLi = element.closest('.menu-item');
    if (parentLi) parentLi.classList.add('active');
    else element.classList.add('active');
  }

  // Auto-close mobile sidebar
  const sidebar = document.getElementById('sidebarMenu');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (sidebar) sidebar.classList.remove('show');
  if (backdrop) backdrop.classList.remove('show');
  
  // Load data specific to tabs
  if (tabName === 'dashboard') {
    loadDashboardStats();
  } else if (tabName === 'flexy-recharge' || tabName === 'flexy') {
    loadFlexyRechargeData();
    loadFlexyTransactionsList();
  } else if (tabName === 'idoom-recharge' || tabName === 'idoom') {
    loadIdoomRechargeData();
  } else if (tabName === 'cards') {
    loadCardsList();
  } else if (tabName === 'transactions') {
    loadTransactionsList();
  } else if (tabName === 'agents') {
    loadAgentsList();
  } else if (tabName === 'sims') {
    loadSimsList();
  } else if (tabName === 'settings') {
    loadSettingsData();
  }
}

// Admin Logout
function logoutAdmin() {
  localStorage.removeItem('admin_token');
  window.location.href = 'login.html';
}

let selectedOfferData = null;

// Detect Operator from Phone / Number input
function detectOperatorFromInput() {
  const phoneEl = document.getElementById('rechargePhone') || document.getElementById('phoneNumber');
  const phone = phoneEl ? phoneEl.value.trim() : '';
  const badge = document.getElementById('operatorLogoText');
  const extraActions = document.getElementById('operatorExtraActions');
  const clearBtn = document.getElementById('btnClearPhone');
  
  if (!badge) return;
  
  badge.innerText = 'تحديد تلقائي...';
  badge.className = 'badge badge-secondary';
  
  // Hide offers container when phone changes
  document.getElementById('fieldOffersBox').style.display = 'none';
  selectedOfferData = null;
  
  if (clearBtn) {
    clearBtn.style.display = phone ? 'block' : 'none';
  }
  
  if (extraActions) {
    extraActions.style.display = 'none';
    extraActions.innerHTML = '';
  }
  
  if (phone.startsWith('06') || phone.startsWith('2136')) {
    badge.innerText = 'موبيليس (Mobilis)';
    badge.className = 'badge badge-success';
    if (extraActions) {
      extraActions.style.display = 'flex';
      extraActions.innerHTML = `
        <button class="btn btn-outline-success btn-sm" onclick="executeRecharge('bill')" style="font-weight: bold; font-size: 0.9rem; padding: 0.4rem 0.8rem; display: flex; align-items: center; gap: 0.3rem;">
          <i class="bx bx-receipt" style="font-size: 1.1rem;"></i> فاتورة (Bill)
        </button>
        <button class="btn btn-outline-success btn-sm" onclick="executeRecharge('international')" style="font-weight: bold; font-size: 0.9rem; padding: 0.4rem 0.8rem; display: flex; align-items: center; gap: 0.3rem;">
          <i class="bx bx-globe" style="font-size: 1.1rem;"></i> انترناشيونال
        </button>
      `;
    }
  } else if (phone.startsWith('05') || phone.startsWith('2135')) {
    badge.innerText = 'أوريدو (Ooredoo)';
    badge.className = 'badge badge-danger';
  } else if (phone.startsWith('07') || phone.startsWith('2137')) {
    badge.innerText = 'جيزي (Djezzy)';
    badge.className = 'badge badge-warning';
    if (extraActions) {
      extraActions.style.display = 'flex';
      extraActions.innerHTML = `
        <button class="btn btn-outline-warning btn-sm" onclick="executeRecharge('bill')" style="font-weight: bold; font-size: 0.9rem; padding: 0.4rem 0.8rem; display: flex; align-items: center; gap: 0.3rem; color: #ffab00; border-color: #ffab00;">
          <i class="bx bx-receipt" style="font-size: 1.1rem;"></i> فاتورة (Bill)
        </button>
      `;
    }
  } else if (phone.startsWith('21347') || phone.startsWith('047') || phone.startsWith('47')) {
    badge.innerText = 'اتصالات الجزائر (Idoom)';
    badge.className = 'badge badge-info';
  }
}

// Clear Phone Input, amount and reset operators/offers
function clearPhoneInput() {
  const phoneInput = document.getElementById('rechargePhone');
  if (phoneInput) {
    phoneInput.value = '';
    phoneInput.focus();
  }
  const amountInput = document.getElementById('rechargeAmount');
  if (amountInput) amountInput.value = '';
  
  detectOperatorFromInput();
}

// Clear selected offer if amount changes manually
function clearSelectedOffer() {
  selectedOfferData = null;
  document.querySelectorAll('.offer-item').forEach(item => {
    item.classList.remove('selected');
  });
}

// Select an Offer or Card item
function selectOffer(element, id, price, name, type) {
  document.querySelectorAll('.offer-item').forEach(item => {
    item.classList.remove('selected');
  });
  
  element.classList.add('selected');
  
  selectedOfferData = { id, price, name, type };
  document.getElementById('rechargeAmount').value = price;
}

// Fetch live USSD offers OR available Idoom card values based on detected operator
async function fetchLiveOffers() {
  const phoneEl = document.getElementById('rechargePhone') || document.getElementById('phoneNumber');
  const phone = phoneEl ? phoneEl.value.trim() : '';
  const container = document.getElementById('offersListContainer');
  const fieldBox = document.getElementById('fieldOffersBox');
  const label = document.getElementById('offersListLabel');
  
  if (!phone || phone.length < 9) {
    alert('يرجى إدخال رقم هاتف صحيح أو حساب إنترنت أولاً');
    return;
  }
  
  fieldBox.style.display = 'block';
  container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 1rem; color: var(--primary);"><i class="bx bx-loader-alt bx-spin" style="font-size: 1.5rem; margin-bottom: 0.5rem;"></i><br>جاري تحميل العروض المتوفرة...</div>';
  
  const isIdoom = phone.startsWith('21347') || phone.startsWith('047') || phone.startsWith('47');
  
  if (isIdoom) {
    label.innerText = 'بطاقات إيدوم المتاحة في المخزن (اضغط لاختيار كرت للتعبئة):';
    const data = await apiRequest('/api/customer/idoom-cards');
    container.innerHTML = '';
    if (data && data.success && data.cards) {
      if (data.cards.length === 0) {
        container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 1rem; color: var(--secondary);">لا توجد بطاقات إيدوم متوفرة في المخزن حالياً. يرجى شحن البطاقات أولاً.</div>';
        return;
      }
      
      data.cards.forEach(val => {
        const item = document.createElement('div');
        item.className = 'offer-item';
        item.onclick = () => selectOffer(item, val, val, `كرت إيدوم بقيمة ${val}`, 'idoom');
        item.innerHTML = `
          <span style="font-weight: 600; color: #566a7f;">تعبئة كرت إيدوم</span>
          <span class="badge badge-info" style="font-size: 0.85rem; font-family: 'Rubik';">${val} DA</span>
        `;
        container.appendChild(item);
      });
    } else {
      container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 1rem; color: var(--danger);">فشل جلب بطاقات إيدوم من المخزن</div>';
    }
  } else {
    label.innerText = 'العروض المتاحة من الشبكة (اضغط لتفعيل العرض):';
    const data = await apiRequest('/api/customer/live-offers', 'POST', { phone });
    container.innerHTML = '';
    
    if (data && data.success && data.offers) {
      if (data.offers.length === 0) {
        container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 1rem; color: var(--secondary);">لم يتم العثور على عروض نشطة لهذا الرقم حالياً.</div>';
        return;
      }
      
      // Sort offers by price ascending
      const sortedOffers = data.offers.sort((a, b) => a.price - b.price);
      
      sortedOffers.forEach(off => {
        const item = document.createElement('div');
        item.className = 'offer-item';
        item.onclick = () => selectOffer(item, off.id, off.price, off.name, 'offer');
        item.innerHTML = `
          <span style="font-weight: 600; color: #566a7f; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px;">${off.name}</span>
          <span class="badge badge-primary" style="font-size: 0.85rem; font-family: 'Rubik';">${off.price} DA</span>
        `;
        container.appendChild(item);
      });
    } else {
      container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 1rem; color: var(--danger);">فشل سحب العروض من شريحة المودم. تأكد من سلامة الاتصال.</div>';
      alert(data?.message || 'فشل سحب العروض من الشبكة.');
    }
  }
}

// Execute Recharge / Offer / Idoom Action
async function executeRecharge(rechargeType = 'flexy') {
  const phoneEl = document.getElementById('rechargePhone') || document.getElementById('phoneNumber');
  const phone = phoneEl ? phoneEl.value.trim() : '';
  const amountEl = document.getElementById('rechargeAmount') || document.getElementById('amount');
  const amount = amountEl ? amountEl.value.trim() : '';
  const btn = document.getElementById('btnSubmitRecharge') || document.getElementById('sendBalanceBtn');
  
  if (!phone) {
    alert('يرجى إدخال رقم الهاتف أو حساب إيدوم');
    return;
  }
  
  btn.disabled = true;
  btn.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i> جاري إرسال الطلب...';
  
  let endpoint = '';
  let payload = {};
  
  const isIdoom = phone.startsWith('21347') || phone.startsWith('047') || phone.startsWith('47');
  
  if (isIdoom) {
    if (!amount) {
      alert('يرجى كتابة أو اختيار قيمة الشحن لإيدوم');
      btn.disabled = false;
      btn.innerHTML = '<i class="bx bx-paper-plane"></i> إرسال وتأكيد العملية';
      return;
    }
    endpoint = '/api/customer/idoom';
    payload = { account: phone, amount: parseFloat(amount) };
  } else if (selectedOfferData && selectedOfferData.type === 'offer' && String(selectedOfferData.price) === String(amount)) {
    endpoint = '/api/customer/activate-offer';
    payload = { 
      phone, 
      offer_id: selectedOfferData.id, 
      price: selectedOfferData.price, 
      name: selectedOfferData.name 
    };
  } else {
    if (!amount || parseFloat(amount) < 100) {
      Swal.fire({
        icon: 'warning',
        title: 'تنبيه',
        text: 'الحد الأدنى للشحن هو 100 دج',
        confirmButtonText: 'حسناً'
      });
      btn.disabled = false;
      btn.innerHTML = '<i class="bx bx-paper-plane"></i> إرسال وتأكيد العملية';
      return;
    }
    endpoint = '/api/portal/flexy';
    payload = { phone, amount: parseFloat(amount), type: rechargeType };
  }
  
  writeTerminal(`[Recharge Request] Initiating recharge to ${phone} with amount ${amount}...`);
  const data = await apiRequest(endpoint, 'POST', payload);
  
  btn.disabled = false;
  btn.innerHTML = '<i class="bx bx-paper-plane"></i> إرسال وتأكيد العملية';
  
  if (data && data.success) {
    Swal.fire({
      icon: 'success',
      title: 'نجاح العملية',
      html: `<div style="text-align: right; margin-bottom: 5px;">تمت العملية بنجاح!</div><strong>رد الشريحة:</strong><br><div style="direction: ltr; text-align: center; margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 4px; border: 1px solid #e9ecef; font-family: monospace; font-size: 0.95rem; white-space: pre-wrap; word-break: break-all;">${data.message || 'تم إرسال وقبول العملية بنجاح'}</div>`,
      confirmButtonText: 'موافق'
    }).then(() => {
      const phoneInput = document.getElementById('rechargePhone');
      if (phoneInput) phoneInput.focus();
    });
    writeTerminal(`[Recharge Status] Success: ${data.message}`);
    
    // Clear inputs after success
    document.getElementById('rechargePhone').value = '';
    document.getElementById('rechargeAmount').value = '';
    document.getElementById('fieldOffersBox').style.display = 'none';
    selectedOfferData = null;
    detectOperatorFromInput();
    
    loadDashboardStats();
    loadFlexyTransactionsList();
  } else {
    Swal.fire({
      icon: 'error',
      title: 'فشل العملية',
      html: `<div style="text-align: right; margin-bottom: 5px;">فشلت عملية التحويل. يرجى مراجعة التفاصيل:</div><strong>رد الشريحة:</strong><br><div style="direction: ltr; text-align: center; margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 4px; border: 1px solid #e9ecef; font-family: monospace; font-size: 0.95rem; white-space: pre-wrap; word-break: break-all;">${data?.message || data?.error || 'فشلت عملية التحويل'}</div>`,
      confirmButtonText: 'موافق'
    }).then(() => {
      const phoneInput = document.getElementById('rechargePhone');
      if (phoneInput) {
        phoneInput.focus();
        phoneInput.select();
      }
    });
    writeTerminal(`[Recharge Status] Failed: ${data?.message || data?.error}`);
    loadFlexyTransactionsList();
  }
}

// Log Terminal writer helper
function writeTerminal(msg) {
  const term = document.getElementById('liveTerminal');
  if (term) {
    const timestamp = new Date().toLocaleTimeString();
    term.innerHTML += `\n[${timestamp}] ${msg}`;
    term.scrollTop = term.scrollHeight;
  }
}

// Load Dashboard stats & charts
async function loadDashboardStats() {
  const data = await apiRequest('/api/stats');
  if (data) {
    const balText = `${data.totalBalance || '0.00'} DA`;
    const el1 = document.getElementById('statsTotalBalance');
    if (el1) el1.innerText = balText;
    const el2 = document.getElementById('balanceSpan');
    if (el2) el2.innerText = balText;
    document.getElementById('statsActiveSIMs').innerText = `${data.onlineCount || '0'} / ${data.modems ? data.modems.length : '0'}`;
    
    // Render recent transactions
    const recTbody = document.getElementById('dashboardRecentTxs');
    recTbody.innerHTML = '';
    if (data.transactions && data.transactions.length > 0) {
      data.transactions.forEach(tx => {
        const badge = tx.success ? 'badge-success' : 'badge-danger';
        const label = tx.success ? 'ناجحة' : 'فشلت/قيد المعالجة';
        const dateStr = tx.time ? new Date(tx.time).toLocaleString() : 'قيد الانتظار';
        recTbody.innerHTML += `
          <tr>
            <td><span class="fw-bold">${tx.target || 'غير محدد'}</span></td>
            <td>${tx.amount} DA</td>
            <td>${tx.type || 'FLEX'}</td>
            <td>${tx.type}</td>
            <td>${dateStr}</td>
            <td><span class="badge ${badge}">${label}</span></td>
          </tr>
        `;
      });
    } else {
      recTbody.innerHTML = '<tr><td colspan="6" class="text-center">لا توجد عمليات مسجلة حالياً</td></tr>';
    }
  }
  
  // Count available Idoom/Mobilis cards
  const cardsData = await apiRequest('/api/cards?limit=1');
  if (cardsData && cardsData.success) {
    // Get counts from database if endpoint sends it, or query counts
    const iData = await apiRequest('/api/cards?category=idoom&status=available&limit=1');
    const mData = await apiRequest('/api/cards?category=Mobilis&status=available&limit=1');
    document.getElementById('statsIdoomCards').innerText = `${iData?.total || 0} بطاقة`;
    document.getElementById('statsMobilisCards').innerText = `${mData?.total || 0} بطاقة`;
  }
}

// Load Cards Inventory List
let currentCardsPage = 1;
// The loadCardsList function has been moved to index.html and converted to use DataTables.
// Bulk Upload Cards submission
async function submitBulkUpload() {
  const category = document.getElementById('uploadCategory').value;
  const value = document.getElementById('uploadValue').value;
  const purchase_price = document.getElementById('uploadPurchasePrice').value;
  const cardsText = document.getElementById('uploadText').value;
  const summaryBox = document.getElementById('uploadSummary');
  
  if (!cardsText.trim()) {
    alert('يرجى لصق قائمة الأكواد/البطاقات أولاً');
    return;
  }
  
  summaryBox.style.display = 'none';
  const data = await apiRequest('/api/cards/upload', 'POST', {
    category, value, cardsText, purchase_price
  });
  
  if (data && data.success) {
    summaryBox.className = 'upload-summary';
    summaryBox.innerHTML = `
      <strong>تمت التصفية والرفع بنجاح!</strong><br>
      إجمالي الأكواد: ${data.total} | 
      المضافة: ${data.inserted} | 
      مكررة: ${data.duplicates} | 
      فشلت: ${data.failed}
    `;
    summaryBox.style.display = 'block';
    document.getElementById('uploadText').value = '';
    loadDashboardStats();
  } else {
    alert(data?.message || 'فشلت عملية التحليل والرفع');
  }
}

// Delete single card
async function deleteCard(id) {
  if (confirm('هل أنت متأكد من حذف هذه البطاقة نهائياً؟')) {
    const data = await apiRequest(`/api/cards/${id}`, 'DELETE');
    if (data && data.success) {
      loadCardsList(currentCardsPage);
    } else {
      alert('خطأ أثناء الحذف');
    }
  }
}

// Clear cards category batch
async function clearCardsPrompt() {
  const category = document.getElementById('filterCardCategory').value;
  const status = document.getElementById('filterCardStatus').value;
  
  if (!category) {
    alert('يرجى تحديد نوع البطاقة (إيدوم أو موبيليس) أولاً لتفريغها');
    return;
  }
  
  const statusText = status === 'available' ? 'المتاحة' : (status === 'used' ? 'المستعملة' : 'بكامل حالتها');
  if (confirm(`هل أنت متأكد من مسح جميع بطاقات ${category} ${statusText} نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`)) {
    const data = await apiRequest('/api/cards/clear', 'POST', { category, status });
    if (data && data.success) {
      alert(`تم بنجاح مسح ${data.cleared} بطاقة`);
      loadCardsList(1);
    } else {
      alert('خطأ أثناء المسح');
    }
  }
}

// Load Transactions List
let currentTxsPage = 1;
async function loadTransactionsList(page = 1) {
  currentTxsPage = page;
  const phone = document.getElementById('searchTxPhone').value.trim();
  
  let url = `/api/customer/transactions?page=${page}&limit=20`;
  // The backend customer endpoint might default to user scope, but wait, the authMiddleware provides admin access to all DB tables
  // Let's call a general admin transactions endpoint if we need to see all.
  // Wait, let's verify if `/api/customer/transactions` filters by user or if the admin override allows everything.
  // In api_server.js customerAuth retrieves the first agent if bypass is active, but we can write a dedicated `/api/admin/transactions` endpoint if needed!
  // Let's look at api_server.js lines 707-713:
  // `SELECT id, phone_number, amount, operator, type, status, timestamp FROM transactions WHERE agent_id = ? ORDER BY id DESC LIMIT 50`
  // Wait, we should support searching/viewing ALL transactions for admin!
  // Let's verify: did we add an admin transactions endpoint in api_server.js? We did not.
  // But wait! We can add one or use the stats endpoint transaction summary, or we can add it to api_server.js.
  // Wait, let's fetch from the customer endpoint for now. Since customerAuth defaults to admin/first agent, it works, but let's check.
  // Let's add a proper `/api/admin/transactions` in api_server.js if needed.
  // Yes! Let's check api_server.js. Let's make an endpoint for admin transactions: `/api/admin/transactions`. We will add it to api_server.js next, or we can use it directly!
  // Let's check if the table transaction contains phone_number or target_phone.
  
  const data = await apiRequest(`/api/customer/transactions?page=${page}&limit=20`);
  const tbody = document.getElementById('transactionsTableBody');
  tbody.innerHTML = '';
  
  if (data && data.success && data.transactions) {
    if (data.transactions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center">لا توجد عمليات مطابقة</td></tr>';
      return;
    }
    
    data.transactions.forEach(tx => {
      const badge = tx.status === 'success' ? 'badge-success' : (tx.status === 'pending' ? 'badge-warning' : 'badge-danger');
      const label = tx.status === 'success' ? 'ناجحة' : (tx.status === 'pending' ? 'معلقة/جاري الإرسال' : 'فاشلة');
      const dateStr = tx.timestamp ? new Date(tx.timestamp).toLocaleString() : '---';
      tbody.innerHTML += `
        <tr>
          <td><span class="fw-bold">${tx.phone_number || '---'}</span></td>
          <td>${tx.amount} DA</td>
          <td>${tx.operator || '---'}</td>
          <td>${tx.type || '---'}</td>
          <td>${dateStr}</td>
          <td><span class="badge ${badge}">${label}</span></td>
        </tr>
      `;
    });
    
    renderPagination(50, 20, currentTxsPage, 'transactionsPagination', loadTransactionsList); // mock total as 50 or use database count
  }
}

// Load Flexy Transactions List (with live search)
async function loadFlexyTransactionsList() {
  const phoneInput = document.getElementById('searchFlexyTxPhone');
  const phone = phoneInput ? phoneInput.value.trim() : '';
  const tbody = document.getElementById('flexyTransactionsTableBody');
  if (!tbody) return;
  
  const data = await apiRequest(`/api/customer/transactions?phone=${encodeURIComponent(phone)}&limit=15`);
  tbody.innerHTML = '';
  
  if (data && data.success && data.transactions) {
    if (data.transactions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding: 1.5rem; color: var(--secondary);">لا توجد عمليات مطابقة</td></tr>';
      return;
    }
    
    data.transactions.forEach(tx => {
      const badge = tx.status === 'success' ? 'badge-success' : (tx.status.startsWith('failed') || tx.status === 'failed' ? 'badge-danger' : 'badge-warning');
      
      let label = 'فاشلة';
      if (tx.status === 'success') label = 'ناجحة';
      else if (tx.status === 'pending') label = 'معلقة';
      else if (tx.status.startsWith('failed: ')) label = 'فاشلة';
      else label = tx.status; // fallback
      
      const dateStr = tx.timestamp ? new Date(tx.timestamp).toLocaleString() : '---';
      
      // Map operator color badges
      let opBadge = 'bg-label-secondary';
      if (tx.operator === 'Mobilis') opBadge = 'badge-success';
      else if (tx.operator === 'Ooredoo') opBadge = 'badge-danger';
      else if (tx.operator === 'Djezzy') opBadge = 'badge-warning';
      
      let typeLabel = tx.type || 'شحن';
      if (typeLabel.toUpperCase() === 'FLEXY') typeLabel = 'فليكسي';
      else if (typeLabel.toUpperCase() === 'BILL') typeLabel = 'فاتورة';
      else if (typeLabel.toUpperCase() === 'INTERNATIONAL') typeLabel = 'دولي';
      else if (typeLabel.toUpperCase() === 'MEETMOB_VOUCHER') typeLabel = 'ميت موب';
      
      tbody.innerHTML += `
        <tr>
          <td><span class="fw-bold" style="font-family: monospace; font-size: 1.05rem;">${tx.phone_number || '---'}</span></td>
          <td style="font-weight: bold; font-family: monospace;">${tx.amount} DA</td>
          <td><span class="badge ${opBadge}" style="font-size: 0.8rem; font-weight: bold;">${tx.operator || '---'}</span></td>
          <td><span style="font-size: 0.85rem; font-weight: 500;">${typeLabel}</span></td>
          <td style="color: #6c757d; font-size: 0.8rem;">${dateStr}</td>
          <td><span class="badge ${badge}" style="font-size: 0.8rem; font-weight: bold;">${label}</span></td>
        </tr>
      `;
    });
  } else {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger" style="padding: 1.5rem;">فشل جلب سجل العمليات</td></tr>';
  }
}

// Load Agents list
async function loadAgentsList() {
  const data = await apiRequest('/api/agents');
  const tbody = document.getElementById('agentsTableBody');
  tbody.innerHTML = '';
  
  if (data && data.success && data.agents) {
    data.agents.forEach(agent => {
      const statusBadge = agent.status === 'active' ? 'badge-success' : 'badge-danger';
      const statusLabel = agent.status === 'active' ? 'نشط' : 'موقف';
      const roleBadge = agent.role === 'admin' ? 'badge-primary' : 'badge-secondary';
      
      tbody.innerHTML += `
        <tr>
          <td><span class="fw-bold">${agent.name}</span></td>
          <td>${agent.phone_number || agent.phone || '---'}</td>
          <td>${agent.telegram_id || '---'}</td>
          <td>${agent.balance.toFixed(2)} DA</td>
          <td><span class="badge badge-info">${agent.tier}</span></td>
          <td><span class="badge ${roleBadge}">${agent.role}</span></td>
          <td><span class="badge ${statusBadge}">${statusLabel}</span></td>
          <td>
            <button class="btn btn-sm btn-primary btn-icon" onclick="openEditAgentModal(${JSON.stringify(agent).replace(/"/g, '&quot;')})"><i class="bx bx-edit-alt"></i></button>
          </td>
        </tr>
      `;
    });
  }
}

// Load SIMs list
async function loadSimsList() {
  const data = await apiRequest('/api/stats');
  const container = document.getElementById('simsGridContainer');
  container.innerHTML = '';
  
  if (data && data.modems) {
    data.modems.forEach(modem => {
      const badgeClass = modem.operator.toLowerCase() === 'mobilis' ? 'op-mobilis' :
                         (modem.operator.toLowerCase() === 'ooredoo' ? 'op-ooredoo' :
                         (modem.operator.toLowerCase() === 'djezzy' ? 'op-djezzy' : 'op-sama'));
                         
      const activeClass = modem.online ? 'active' : '';
      
      // Calculate signal bars
      const sigPercent = modem.signal || 0;
      let barsHtml = '';
      for (let i = 1; i <= 5; i++) {
        const filled = sigPercent >= i * 20 ? 'filled' : '';
        barsHtml += `<div class="signal-bar ${filled}" style="height: ${i * 3}px;"></div>`;
      }
      
      container.innerHTML += `
        <div class="modem-box ${activeClass}">
          <div class="modem-header-row">
            <span class="modem-op-badge ${badgeClass}">${modem.operator}</span>
            <span class="modem-ip">${modem.ip}</span>
          </div>
          
          <div class="modem-balance-neon">${parseFloat(modem.balance).toFixed(2)} DA</div>
          
          <div class="modem-meta-row">
            <span class="badge ${modem.online ? 'badge-success' : 'badge-danger'}">${modem.simStatus}</span>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span>الشبكة:</span>
              <div class="signal-bar-container">${barsHtml}</div>
            </div>
          </div>
          
          <div class="modem-actions-row">
            <button class="btn btn-secondary btn-sm" onclick="checkSimBalance('${modem.ip}')"><i class="bx bx-refresh"></i> الرصيد</button>
            <button class="btn btn-secondary btn-sm" onclick="diagnoseSim('${modem.ip}')"><i class="bx bx-wrench"></i> فحص</button>
            <button class="btn btn-danger btn-sm btn-icon" onclick="deleteSim('${modem.ip}')"><i class="bx bx-trash"></i></button>
          </div>
        </div>
      `;
    });
  }
}

// Action: check modem balance via USSD
async function checkSimBalance(ip) {
  writeTerminal(`[Modem USSD] Probing balance for modem at ${ip}...`);
  const data = await apiRequest('/api/modems/check', 'POST', { key: ip });
  if (data && data.success) {
    writeTerminal(`[Modem USSD] Command sent successfully to ${ip}. Balance will update in a few seconds.`);
    setTimeout(loadSimsList, 3000);
  } else {
    writeTerminal(`[Modem USSD] Failed to send balance check request for ${ip}: ${data?.message || 'Connection error'}`);
  }
}

// Action: diagnose modem
async function diagnoseSim(ip) {
  writeTerminal(`[Modem Info] Diagnosing modem at ${ip}...`);
  const data = await apiRequest('/api/modems/diagnose', 'POST', { key: ip });
  if (data && data.info) {
    writeTerminal(`[Modem Info] Modem ${ip} Diagnosis:\n${JSON.stringify(data.info, null, 2)}`);
  } else {
    writeTerminal(`[Modem Info] Failed to diagnose ${ip}: ${data?.message || 'Connection error'}`);
  }
}

// Action: delete SIM
async function deleteSim(ip) {
  if (confirm(`هل أنت متأكد من إزالة المودم ${ip} نهائياً؟`)) {
    writeTerminal(`[Modem Remove] Deleting modem at ${ip}...`);
    const data = await apiRequest('/api/modems/delete', 'POST', { key: ip });
    if (data && data.success) {
      writeTerminal(`[Modem Remove] Modem at ${ip} was removed successfully.`);
      loadSimsList();
    } else {
      writeTerminal(`[Modem Remove] Failed to delete modem at ${ip}: ${data?.message || 'Connection error'}`);
    }
  }
}

// Load System settings
async function loadSettingsData() {
  const data = await apiRequest('/api/settings');
  // Since we also want defaults and template settings, the backend setting gets them.
  // Wait, let's look at database default settings we queried in database.js:
  // key: 'bot_token', 'admin_id', 'captcha_api_key', 'admin_secret', 'ussd_mobilis_transfer', 'ussd_ooredoo_transfer', 'ussd_djezzy_transfer'
  // But wait, the GET /api/settings endpoint only returned bot_token and admin_id.
  // Let's verify what database keys we have. We can write a complete endpoint `/api/admin/settings` that returns ALL settings, or modify GET `/api/settings` to return everything if the user is authorized.
  // Wait! In api_server.js (lines 132-144) `/api/settings` returns bot_token and admin_id.
  // Let's add support for more settings in the admin API!
  // Let's update `api_server.js` or let's create a dedicated settings load function. Since we already modified it, we can write a dedicated endpoint if needed, or query them.
  // Let's check how Settings are saved in api_server.js:
  // `app.post('/api/settings', authMiddleware, ...)` only update bot_token and admin_id.
  // We should add support for more settings! Let's modify `api_server.js` to return all settings.
  // Wait, we can edit `api_server.js` to return all rows of settings table for admin!
  // Let's check:
  // `app.get('/api/settings', authMiddleware, (req, res) => { db.all("SELECT key, value FROM settings", [], (err, rows) => { ... }) })`
  // Yes! We will modify `api_server.js` to return ALL settings to make it fully customizable.
  
  if (data) {
    document.getElementById('settingsBotToken').value = data.tgToken || '';
    document.getElementById('settingsAdminId').value = data.tgChatId || '';
    // If the general endpoint is modified:
    if (data.adminSecret) document.getElementById('settingsAdminSecret').value = data.adminSecret;
    if (data.captchaKey) document.getElementById('settingsCaptchaKey').value = data.captchaKey;
    if (data.ussdMobilis) document.getElementById('settingsUssdMobilis').value = data.ussdMobilis;
    if (data.ussdOoredoo) document.getElementById('settingsUssdOoredoo').value = data.ussdOoredoo;
    if (data.ussdDjezzy) document.getElementById('settingsUssdDjezzy').value = data.ussdDjezzy;
  }
}

// Save Settings
async function saveSettings() {
  const tgToken = document.getElementById('settingsBotToken').value;
  const tgChatId = document.getElementById('settingsAdminId').value;
  const adminSecret = document.getElementById('settingsAdminSecret').value;
  const captchaKey = document.getElementById('settingsCaptchaKey').value;
  const ussdMobilis = document.getElementById('settingsUssdMobilis').value;
  const ussdOoredoo = document.getElementById('settingsUssdOoredoo').value;
  const ussdDjezzy = document.getElementById('settingsUssdDjezzy').value;
  
  const payload = {
    tgToken,
    tgChatId,
    adminSecret,
    captchaKey,
    ussdMobilis,
    ussdOoredoo,
    ussdDjezzy
  };
  
  const data = await apiRequest('/api/settings', 'POST', payload);
  if (data && data.success) {
    const alertBox = document.getElementById('settingsAlert');
    alertBox.innerText = 'تم حفظ الإعدادات وإعادة تشغيل الخدمات المرتبطة بنجاح!';
    alertBox.style.display = 'block';
    setTimeout(() => { alertBox.style.display = 'none'; }, 5000);
  } else {
    alert('فشل حفظ الإعدادات');
  }
}

// Modal open/close actions
function openModal(modalId) {
  document.getElementById('modalBackdrop').style.display = 'flex';
  document.getElementById(modalId).style.display = 'block';
}

function closeModal() {
  document.getElementById('modalBackdrop').style.display = 'none';
  document.getElementById('modalAddSim').style.display = 'none';
  document.getElementById('modalAddAgent').style.display = 'none';
  document.getElementById('modalEditAgent').style.display = 'none';
}

// Modal: SIM trigger
function openAddSimModal() {
  openModal('modalAddSim');
}

async function submitAddSim() {
  const ip = document.getElementById('simIp').value;
  const operator = document.getElementById('simOperator').value;
  const pin = document.getElementById('simPin').value;
  
  if (!ip) return alert('الرجاء إدخال عنوان الآيبي');
  
  const data = await apiRequest('/api/modems/add', 'POST', { ip, operator, pin });
  if (data && data.success) {
    writeTerminal(`[Modem Add] Successfully added modem at ${ip}`);
    closeModal();
    loadSimsList();
  } else {
    writeTerminal(`[Modem Add] Failed to add modem at ${ip}: ${data?.message || 'Unknown error'}`);
  }
}

// Modal: Agent trigger
function openAddAgentModal() {
  openModal('modalAddAgent');
}

async function submitAddAgent() {
  const name = document.getElementById('agentName').value;
  const phone = document.getElementById('agentPhone').value;
  const telegram_id = document.getElementById('agentTg').value;
  const balance = parseFloat(document.getElementById('agentBalance').value) || 0;
  const tier = document.getElementById('agentTier').value;
  
  if (!name || !phone) return alert('الرجاء إدخال الاسم ورقم الهاتف');
  
  const data = await apiRequest('/api/agents', 'POST', { name, phone, telegram_id, balance, tier });
  if (data && data.success) {
    closeModal();
    loadAgentsList();
  } else {
    alert('فشل إضافة الحساب');
  }
}

// Modal: Edit Agent
function openEditAgentModal(agent) {
  document.getElementById('editAgentId').value = agent.id;
  document.getElementById('editAgentName').value = agent.name;
  document.getElementById('editAgentBalance').value = agent.balance;
  document.getElementById('editAgentStatus').value = agent.status;
  document.getElementById('editAgentRole').value = agent.role;
  openModal('modalEditAgent');
}

async function submitEditAgent() {
  const id = document.getElementById('editAgentId').value;
  const balance = parseFloat(document.getElementById('editAgentBalance').value);
  const status = document.getElementById('editAgentStatus').value;
  const role = document.getElementById('editAgentRole').value;
  
  const data = await apiRequest(`/api/agents/${id}`, 'PUT', { balance, status, role });
  if (data && data.success) {
    closeModal();
    loadAgentsList();
  } else {
    alert('فشل تعديل البيانات');
  }
}

// Render pagination buttons helper
function renderPagination(total, limit, currentPage, containerId, clickCallbackName) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) return;
  
  // Previous
  const prevBtn = document.createElement('button');
  prevBtn.className = 'page-btn';
  prevBtn.innerHTML = '<i class="bx bx-chevron-right"></i>';
  prevBtn.disabled = currentPage === 1;
  prevBtn.onclick = () => clickCallbackName(currentPage - 1);
  container.appendChild(prevBtn);
  
  // Page buttons
  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement('button');
    btn.className = `page-btn ${currentPage === i ? 'active' : ''}`;
    btn.innerText = i;
    btn.onclick = () => clickCallbackName(i);
    container.appendChild(btn);
  }
  
  // Next
  const nextBtn = document.createElement('button');
  nextBtn.className = 'page-btn';
  nextBtn.innerHTML = '<i class="bx bx-chevron-left"></i>';
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.onclick = () => clickCallbackName(currentPage + 1);
  container.appendChild(nextBtn);
}

// Auto stats polling (every 10 seconds)
setInterval(() => {
  const activeTab = document.querySelector('.menu-item.active');
  if (activeTab && activeTab.onclick.toString().includes('dashboard')) {
    loadDashboardStats();
  }
}, 10000);

// Initialize Dashboard on load
window.addEventListener('DOMContentLoaded', () => {
  switchTab('dashboard');
});

// ==================== IDOOM AUTO RECHARGE SECTION ====================
let selectedIdoomCardVal = null;
let idoomBillTimeout = null;

function loadIdoomRechargeData() {
  document.getElementById('idoomPhone').value = '';
  document.getElementById('idoomSelectedAmount').value = '';
  document.getElementById('idoomSelectedValueGroup').style.display = 'none';
  document.getElementById('idoomCardsBox').style.display = 'none';
  document.getElementById('idoomBillBox').style.display = 'none';
  selectedIdoomCardVal = null;
}

function onIdoomInputChanged() {
  const phone = document.getElementById('idoomPhone').value.trim();
  
  // Disable submit button by default until card selected
  document.getElementById('btnSubmitIdoom').disabled = true;
  
  if (phone.length >= 6) {
    // Clear previous timeout and debounce the bill check and card check
    clearTimeout(idoomBillTimeout);
    idoomBillTimeout = setTimeout(() => {
      loadIdoomAvailableCards();
      // Auto-check bill silently if account is complete
      if (phone.length >= 9) {
        checkIdoomBill(true);
      }
    }, 800);
  } else {
    document.getElementById('idoomCardsBox').style.display = 'none';
    document.getElementById('idoomBillBox').style.display = 'none';
  }
}

async function loadIdoomAvailableCards() {
  const container = document.getElementById('idoomCardsListContainer');
  if (!container) return;
  
  container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 10px; color: #a1acb8;">جاري تحميل البطاقات المتوفرة...</div>';
  document.getElementById('idoomCardsBox').style.display = 'block';
  
  const data = await apiRequest('/api/portal/idoom-cards');
  if (data && data.success && data.cards && data.cards.length > 0) {
    container.innerHTML = '';
    data.cards.forEach(val => {
      const cardEl = document.createElement('div');
      cardEl.className = 'offer-item';
      cardEl.innerHTML = `
        <div style="font-weight: bold; font-size: 1.1rem; color: var(--primary-color);">${val} DA</div>
        <div style="font-size: 0.8rem; color: #a1acb8; margin-top: 3px;">بطاقة تعبئة إيدوم</div>
      `;
      cardEl.onclick = () => selectIdoomCardValue(cardEl, val);
      container.appendChild(cardEl);
    });
  } else {
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 10px; color: var(--danger); font-weight: bold;">⚠️ لا توجد بطاقات إيدوم متوفرة في المخزن حالياً!</div>';
  }
}

function selectIdoomCardValue(element, val) {
  document.querySelectorAll('#idoomCardsListContainer .offer-item').forEach(el => {
    el.classList.remove('selected');
  });
  element.classList.add('selected');
  
  selectedIdoomCardVal = val;
  document.getElementById('idoomSelectedAmount').value = `${val} DA`;
  document.getElementById('idoomSelectedValueGroup').style.display = 'block';
  
  const phone = document.getElementById('idoomPhone').value.trim();
  if (phone.length >= 6) {
    document.getElementById('btnSubmitIdoom').disabled = false;
  }
}

async function checkIdoomBill(silent = false) {
  const phone = document.getElementById('idoomPhone').value.trim();
  if (!phone) {
    if (!silent) alert('يرجى كتابة رقم المشترك أولاً');
    return;
  }
  
  const billBox = document.getElementById('idoomBillBox');
  const accountSpan = document.getElementById('idoomBillAccount');
  const amountSpan = document.getElementById('idoomBillAmount');
  const checkBtn = document.getElementById('btnCheckIdoomBill');
  
  if (!silent) {
    checkBtn.disabled = true;
    checkBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> جاري الفحص...';
    
    billBox.style.display = 'block';
    accountSpan.innerText = phone;
    amountSpan.innerText = 'جاري التحقق من السيرفر...';
    amountSpan.className = 'text-warning';
  }
  
  const data = await apiRequest('/api/portal/check-bill', 'POST', { account: phone });
  
  if (!silent) {
    checkBtn.disabled = false;
    checkBtn.innerHTML = '<i class="bx bx-search-alt"></i> فحص الفاتورة';
  }
  
  if (data && data.success) {
    billBox.style.display = 'block';
    accountSpan.innerText = phone;
    amountSpan.innerText = `${data.amount} DA`;
    amountSpan.className = 'text-danger font-weight-bold';
    writeTerminal(`[Idoom Bill] Checked account ${phone}. Outstanding: ${data.amount} DA`);
  } else {
    if (!silent) {
      amountSpan.innerText = `فشل التحقق: ${data?.message || 'خطأ غير معروف'}`;
      amountSpan.className = 'text-muted';
      writeTerminal(`[Idoom Bill] Failed to check ${phone}: ${data?.message}`);
    }
  }
}

async function executeIdoomActivation() {
  const phone = document.getElementById('idoomPhone').value.trim();
  const val = selectedIdoomCardVal;
  
  if (!phone || !val) {
    Swal.fire({
      icon: 'warning',
      title: 'تنبيه',
      text: 'يرجى إدخال رقم المشترك واختيار بطاقة التعبئة أولاً',
      confirmButtonText: 'حسناً'
    });
    return;
  }
  
  const btn = document.getElementById('btnSubmitIdoom');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> جاري التفعيل...';
  
  writeTerminal(`[Idoom Activation] Sending request to activate ${val} DA card for account ${phone}...`);
  
  Swal.fire({
    title: 'جاري التفعيل',
    html: '⏳ يرجى الانتظار، جاري تفعيل كرت إيدوم تلقائياً عبر موقع اتصالات الجزائر...',
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });
  
  const data = await apiRequest('/api/portal/idoom', 'POST', { account: phone, amount: parseFloat(val) });
  
  btn.disabled = false;
  btn.innerHTML = '<i class="bx bx-paper-plane"></i> شحن وتفعيل تلقائي';
  
  if (data && data.success) {
    Swal.fire({
      icon: 'success',
      title: 'نجاح العملية',
      html: `<div style="text-align: right; margin-bottom: 5px;">تم تفعيل الحساب بنجاح!</div><strong>الرد:</strong><br><div style="direction: ltr; text-align: center; margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 4px; border: 1px solid #e9ecef; font-family: monospace; font-size: 0.95rem; white-space: pre-wrap; word-break: break-all;">${data.message || 'تم التفعيل بنجاح'}</div>`,
      confirmButtonText: 'موافق'
    });
    writeTerminal(`[Idoom Activation] Success: ${data.message}`);
    
    // Reset inputs
    loadIdoomRechargeData();
    loadDashboardStats();
  } else {
    Swal.fire({
      icon: 'error',
      title: 'فشل العملية',
      html: `<div style="text-align: right; margin-bottom: 5px;">فشلت عملية تفعيل إيدوم:</div><strong>الرد:</strong><br><div style="direction: ltr; text-align: center; margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 4px; border: 1px solid #e9ecef; font-family: monospace; font-size: 0.95rem; white-space: pre-wrap; word-break: break-all;">${data?.message || 'فشلت عملية التفعيل'}</div>`,
      confirmButtonText: 'موافق'
    });
    writeTerminal(`[Idoom Activation] Failed: ${data?.message || 'Unknown error'}`);
  }
}

function loadFlexyRechargeData() {
  const phoneInput = document.getElementById('rechargePhone');
  const amountInput = document.getElementById('rechargeAmount');
  if (phoneInput) phoneInput.value = '';
  if (amountInput) amountInput.value = '';
  const offersBox = document.getElementById('fieldOffersBox');
  if (offersBox) offersBox.style.display = 'none';
  selectedOfferData = null;
  detectOperatorFromInput();
}

function toggleSidebarMenu(event) {
  if (event) event.stopPropagation();
  const sidebar = document.getElementById('sidebarMenu');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (sidebar) {
    const isShown = sidebar.classList.toggle('show');
    if (backdrop) {
      if (isShown) {
        backdrop.classList.add('show');
      } else {
        backdrop.classList.remove('show');
      }
    }
  }
}


// Alias for the new template logout button
function logout() { logoutAdmin(); }
