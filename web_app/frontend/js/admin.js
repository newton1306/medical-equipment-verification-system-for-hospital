/* Admin Panel Logic */
const API = '';
let editingId = null;
let appPassword = localStorage.getItem('appPw') || '';

async function apiFetch(url, options = {}) {
    options.headers = options.headers || {};
    options.headers['X-App-Password'] = appPassword;
    options.headers['Content-Type'] = 'application/json';
    const res = await fetch(url, options);
    if (res.status === 401) {
        alert('Unauthorized - Please login from the main page.');
        window.location.href = '/';
        throw new Error('Unauthorized');
    }
    return res;
}

async function loadSets() {
    const res = await apiFetch(API + '/api/sets');
    const sets = await res.json();
    const el = document.getElementById('sets-list');
    if (sets.length === 0) {
        el.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px">ยังไม่มี set — กด "+ เพิ่ม Set" ด้านบน</p>';
        return;
    }
    el.innerHTML = sets.map(s => {
        const n = (s.checklist || []).length;
        const items = (s.checklist || []).map(i => {
            let nName = i.item_name;
            if (i.item_name_th) nName += ` <span>(${i.item_name_th})</span>`;
            const qtyStr = i.mode === 'exact' ? `${i.quantity}x ` : '';
            return `<span class="checklist-chip ${i.mode}">${qtyStr}${nName}</span>`;
        }).join('');
        return `
        <div class="set-card">
            <div class="set-card-header">
                <div>
                    <div class="set-card-title">${s.display_name} ${s.display_name_th ? '(' + s.display_name_th + ')' : ''}</div>
                    <div class="set-card-id">${s.id} · ${n} items</div>
                </div>
                <div class="set-card-actions">
                    <button class="btn btn-outline btn-sm" onclick="openEditModal('${s.id}')">แก้ไข</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteSet('${s.id}')">ลบ</button>
                </div>
            </div>
            <div class="checklist-preview">${items}</div>
        </div>`;
    }).join('');
}

function openAddModal() {
    editingId = null;
    document.getElementById('modal-title').textContent = 'เพิ่ม Set ใหม่';
    document.getElementById('f-id').value = '';
    document.getElementById('f-id').disabled = false;
    document.getElementById('f-name').value = '';
    document.getElementById('f-name-th').value = '';
    document.getElementById('f-ref-url').value = '';
    
    document.getElementById('f-checklist').value = '[\n  {"item_name": "", "quantity": 1, "mode": "exact"}\n]';
    
    document.getElementById('checklist-items-container').innerHTML = '';
    addChecklistItem();
    
    if (isJsonMode) toggleJsonMode(); // switch back to Form mode for new items
    
    document.getElementById('modal-backdrop').classList.remove('hidden');
}

async function openEditModal(id) {
    editingId = id;
    const res = await apiFetch(API + '/api/sets/' + id);
    const s = await res.json();
    document.getElementById('modal-title').textContent = 'แก้ไข: ' + s.display_name;
    document.getElementById('f-id').value = s.id;
    document.getElementById('f-id').disabled = true;
    document.getElementById('f-name').value = s.display_name;
    document.getElementById('f-name-th').value = s.display_name_th || '';
    document.getElementById('f-ref-url').value = s.reference_image_url || '';
    const checklist = s.checklist || [];
    const container = document.getElementById('checklist-items-container');
    container.innerHTML = '';
    if (checklist.length === 0) {
        addChecklistItem();
    } else {
        checklist.forEach(c => addChecklistItem(c));
    }
    
    document.getElementById('f-checklist').value = JSON.stringify(
        (s.checklist || []).map(c => ({
            item_name: c.item_name,
            item_name_th: c.item_name_th || '',
            quantity: c.quantity,
            mode: c.mode,
        })), null, 2
    );

    if (isJsonMode) toggleJsonMode(); // force switch to form mode initially

    document.getElementById('modal-backdrop').classList.remove('hidden');
}

function addChecklistItem(data = {item_name: '', item_name_th: '', quantity: 1, mode: 'exact'}) {
    const container = document.getElementById('checklist-items-container');
    const div = document.createElement('div');
    div.className = 'form-group';
    div.style.display = 'flex';
    div.style.gap = '8px';
    div.style.alignItems = 'center';
    div.style.marginBottom = '4px';
    div.style.background = 'rgba(255,255,255,0.05)';
    div.style.padding = '8px';
    div.style.borderRadius = '8px';

    div.innerHTML = `
        <input class="form-input cl-name" placeholder="ชื่อ (EN)" value="${data.item_name}" style="flex:2" />
        <input class="form-input cl-th" placeholder="ชื่อ (TH/อื่นๆ)" value="${data.item_name_th || ''}" style="flex:1" />
        <input type="number" class="form-input cl-qty" value="${data.quantity}" min="1" style="flex:0.5" />
        <select class="form-input cl-mode" style="flex:1; padding:10px 4px;">
            <option value="exact" ${data.mode === 'exact' ? 'selected' : ''}>ระบุจำนวน</option>
            <option value="present" ${data.mode === 'present' ? 'selected' : ''}>แค่ให้มีก็พอ</option>
        </select>
        <button class="btn btn-outline btn-sm" style="color:var(--danger); border-color:var(--danger);" onclick="this.parentElement.remove()">X</button>
    `;
    container.appendChild(div);
}

function closeModal(e) {
    if (e && e.target !== document.getElementById('modal-backdrop')) return;
    document.getElementById('modal-backdrop').classList.add('hidden');
}

let isJsonMode = false;
function toggleJsonMode() {
    isJsonMode = !isJsonMode;
    const container = document.getElementById('checklist-items-container');
    const ta = document.getElementById('f-checklist');
    const btnAdd = document.getElementById('btn-add-item');
    if (isJsonMode) {
        // Sync Form => JSON
        let checklist = [];
        const nodes = container.children;
        for (let i = 0; i < nodes.length; i++) {
            const item = {
                item_name: nodes[i].querySelector('.cl-name').value.trim(),
                item_name_th: nodes[i].querySelector('.cl-th').value.trim(),
                quantity: parseInt(nodes[i].querySelector('.cl-qty').value) || 1,
                mode: nodes[i].querySelector('.cl-mode').value
            };
            if (item.item_name) checklist.push(item);
        }
        ta.value = JSON.stringify(checklist, null, 2);
        container.classList.add('hidden');
        btnAdd.classList.add('hidden');
        ta.classList.remove('hidden');
    } else {
        // Sync JSON => Form
        try {
            const checklist = JSON.parse(ta.value);
            container.innerHTML = '';
            if (checklist.length === 0) addChecklistItem();
            else checklist.forEach(c => addChecklistItem(c));
        } catch(e) {} // if invalid, it will retain whatever it was
        ta.classList.add('hidden');
        container.classList.remove('hidden');
        btnAdd.classList.remove('hidden');
    }
}

async function saveSet() {
    const id = document.getElementById('f-id').value.trim();
    const name = document.getElementById('f-name').value.trim();
    const nameTh = document.getElementById('f-name-th').value.trim();
    const refUrl = document.getElementById('f-ref-url').value.trim();
    
    let checklist = [];
    if (isJsonMode) {
        try {
            checklist = JSON.parse(document.getElementById('f-checklist').value);
        } catch (e) {
            alert('Checklist JSON ไม่ถูกต้อง: ' + e.message);
            return;
        }
    } else {
        const nodes = document.getElementById('checklist-items-container').children;
        for (let i = 0; i < nodes.length; i++) {
            const item = {
                item_name: nodes[i].querySelector('.cl-name').value.trim(),
                item_name_th: nodes[i].querySelector('.cl-th').value.trim(),
                quantity: parseInt(nodes[i].querySelector('.cl-qty').value) || 1,
                mode: nodes[i].querySelector('.cl-mode').value
            };
            if (item.item_name) checklist.push(item);
        }
    }

    if (!id || !name) { alert('กรุณากรอก ID และชื่อ'); return; }

    const data = {
        id, display_name: name, display_name_th: nameTh,
        reference_image_url: refUrl, checklist,
    };

    try {
        if (editingId) {
            await apiFetch(API + '/api/sets/' + editingId, {
                method: 'PUT',
                body: JSON.stringify(data),
            });
        } else {
            await apiFetch(API + '/api/sets', {
                method: 'POST',
                body: JSON.stringify(data),
            });
        }
        document.getElementById('modal-backdrop').classList.add('hidden');
        loadSets();
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

async function deleteSet(id) {
    if (!confirm('ลบ set นี้?')) return;
    await apiFetch(API + '/api/sets/' + id, { method: 'DELETE' });
    loadSets();
}

document.addEventListener('DOMContentLoaded', loadSets);
