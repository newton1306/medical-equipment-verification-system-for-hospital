/* Admin Panel Logic */
const API = '';
let editingId = null;

async function loadSets() {
    const res = await fetch(API + '/api/sets');
    const sets = await res.json();
    const el = document.getElementById('sets-list');
    if (sets.length === 0) {
        el.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px">ยังไม่มี set — กด "+ เพิ่ม Set" ด้านบน</p>';
        return;
    }
    el.innerHTML = sets.map(s => {
        const n = (s.checklist || []).length;
        const items = (s.checklist || []).map(i =>
            `<span class="checklist-chip ${i.mode}">${i.mode === 'exact' ? i.quantity + 'x ' : ''}${i.item_name}</span>`
        ).join('');
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
    document.getElementById('modal-backdrop').classList.remove('hidden');
}

async function openEditModal(id) {
    editingId = id;
    const res = await fetch(API + '/api/sets/' + id);
    const s = await res.json();
    document.getElementById('modal-title').textContent = 'แก้ไข: ' + s.display_name;
    document.getElementById('f-id').value = s.id;
    document.getElementById('f-id').disabled = true;
    document.getElementById('f-name').value = s.display_name;
    document.getElementById('f-name-th').value = s.display_name_th || '';
    document.getElementById('f-ref-url').value = s.reference_image_url || '';
    document.getElementById('f-checklist').value = JSON.stringify(
        (s.checklist || []).map(c => ({
            item_name: c.item_name,
            item_name_th: c.item_name_th || '',
            quantity: c.quantity,
            mode: c.mode,
        })), null, 2
    );
    document.getElementById('modal-backdrop').classList.remove('hidden');
}

function closeModal(e) {
    if (e && e.target !== document.getElementById('modal-backdrop')) return;
    document.getElementById('modal-backdrop').classList.add('hidden');
}

async function saveSet() {
    const id = document.getElementById('f-id').value.trim();
    const name = document.getElementById('f-name').value.trim();
    const nameTh = document.getElementById('f-name-th').value.trim();
    const refUrl = document.getElementById('f-ref-url').value.trim();
    let checklist;
    try {
        checklist = JSON.parse(document.getElementById('f-checklist').value);
    } catch (e) {
        alert('Checklist JSON ไม่ถูกต้อง: ' + e.message);
        return;
    }

    if (!id || !name) { alert('กรุณากรอก ID และชื่อ'); return; }

    const data = {
        id, display_name: name, display_name_th: nameTh,
        reference_image_url: refUrl, checklist,
    };

    try {
        if (editingId) {
            await fetch(API + '/api/sets/' + editingId, {
                method: 'PUT', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data),
            });
        } else {
            await fetch(API + '/api/sets', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
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
    await fetch(API + '/api/sets/' + id, { method: 'DELETE' });
    loadSets();
}

document.addEventListener('DOMContentLoaded', loadSets);
