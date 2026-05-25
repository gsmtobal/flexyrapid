const fs = require('fs');

let css = fs.readFileSync('Cloud_Portal_Ready/css/style.css', 'utf8');

// We want to keep only the specific custom classes for the portal features, and remove Layout, Sidebar, Navbar, Forms, Buttons, Tables which are provided by Sneat.

const keepCSS = `
/* Custom Portal Styles */

.status-badge {
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0.25rem 0.75rem;
  border-radius: 10rem;
}
.status-online {
  background-color: rgba(113, 221, 55, 0.16);
  color: #71dd37;
}
.status-offline {
  background-color: rgba(255, 62, 29, 0.16);
  color: #ff3e1d;
}

/* Modems Signal and Grid */
.modems-grid-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.5rem;
}

.modem-box {
  background: #ffffff;
  border-radius: 0.5rem;
  box-shadow: 0 2px 6px 0 rgba(67, 89, 113, 0.12);
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.modem-box:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px 0 rgba(67, 89, 113, 0.16);
}

.modem-box.active {
  border-color: rgba(105, 108, 255, 0.5);
}

.modem-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.modem-op-badge {
  font-weight: 700;
  font-size: 0.85rem;
  padding: 0.2rem 0.6rem;
  border-radius: 0.25rem;
}

.op-mobilis { background: rgba(113, 221, 55, 0.15); color: #4acc10; }
.op-ooredoo { background: rgba(255, 62, 29, 0.15); color: #e62e12; }
.op-djezzy { background: rgba(255, 171, 0, 0.15); color: #cc8800; }
.op-sama { background: rgba(3, 195, 236, 0.15); color: #03a9cc; }

.modem-ip {
  font-family: 'Rubik', sans-serif;
  font-size: 0.85rem;
  color: #a1acb8;
}

.modem-balance-neon {
  font-size: 1.5rem;
  font-weight: 700;
  color: #566a7f;
  margin-bottom: 0.75rem;
  font-family: 'Rubik', sans-serif;
}

.modem-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.8rem;
  color: #a1acb8;
  margin-bottom: 1rem;
}

.signal-bar-container {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 14px;
}

.signal-bar {
  width: 3px;
  background-color: #d9dee3;
  border-radius: 1px;
}

.signal-bar.filled {
  background-color: #71dd37;
}

.modem-actions-row {
  display: flex;
  gap: 0.5rem;
  margin-top: auto;
}

/* Quick Recharge Center Form styling */
.recharge-form-box {
  background: rgba(105, 108, 255, 0.03);
  border: 1px dashed #696cff;
  border-radius: 0.5rem;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

/* Modals */
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
  z-index: 1040;
  display: none;
  align-items: center;
  justify-content: center;
}

.modal-content {
  background-color: #ffffff;
  border-radius: 0.5rem;
  box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
  width: 100%;
  max-width: 500px;
  overflow: hidden;
  z-index: 1050;
  animation: modalFadeIn 0.2s ease-out;
}

@keyframes modalFadeIn {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.modal-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #d9dee3;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-body {
  padding: 1.5rem;
}

.modal-footer {
  padding: 1.25rem 1.5rem;
  border-top: 1px solid #d9dee3;
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

/* Upload Parsing summary */
.upload-summary {
  background-color: #e8fadf;
  border: 1px solid #c7f2b4;
  color: #3b8712;
  padding: 1rem;
  border-radius: 0.375rem;
  margin-bottom: 1.25rem;
  display: none;
}

/* Pagination */
.pagination {
  display: flex;
  gap: 5px;
  justify-content: center;
  margin-top: 1rem;
}

.page-btn {
  background-color: #ffffff;
  border: 1px solid #d9dee3;
  color: #566a7f;
  padding: 0.35rem 0.75rem;
  border-radius: 0.25rem;
  cursor: pointer;
}

.page-btn:hover {
  background-color: rgba(67, 89, 113, 0.04);
}

.page-btn.active {
  background-color: #696cff;
  border-color: #696cff;
  color: #fff;
}

/* Offer selection styling */
.offer-item {
  border: 1px solid #d9dee3;
  border-radius: 0.375rem;
  background: #ffffff;
  padding: 0.75rem 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
}

.offer-item:hover {
  transform: translateY(-2px);
  border-color: #696cff;
  box-shadow: 0 4px 8px rgba(105, 108, 255, 0.08);
}

.offer-item.selected {
  border-color: #696cff !important;
  background-color: rgba(105, 108, 255, 0.08) !important;
  color: #696cff !important;
  box-shadow: 0 4px 8px rgba(105, 108, 255, 0.12);
}

/* Tab Panels */
.tab-panel {
  display: none;
}
.tab-panel.active {
  display: block;
}
`;

fs.writeFileSync('Cloud_Portal_Ready/css/style.css', keepCSS);
console.log('Successfully cleaned Cloud_Portal_Ready/css/style.css');
