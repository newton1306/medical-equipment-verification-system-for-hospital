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
    const el = document.getElementById('sets-list');
    try {
        const res = await apiFetch(API + '/api/sets');
        const sets = await res.json();
        if (!Array.isArray(sets)) {
            throw new Error(sets.detail || 'Invalid response from server');
        }
        if (sets.length === 0) {
            el.innerHTML = '<div style="text-align:center; padding: 4rem 1rem; color: var(--ink-secondary);"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:1rem; opacity:0.5;"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg><p>ยังไม่มี Instrument Set</p><p class="text-small" style="margin-top:0.5rem;">กดปุ่ม "Add Set" ด้านบนเพื่อเริ่มต้น</p></div>';
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
        <div class="admin-item">
            <div>
                <div class="admin-item-title">${s.display_name} ${s.display_name_th ? '(' + s.display_name_th + ')' : ''}</div>
                <div class="admin-item-id">${s.id} · ${n} items</div>
                <div class="checklist-preview mt-4">${items}</div>
            </div>
            <div style="display:flex; gap: 0.5rem; flex-direction:column;">
                <button class="btn btn-outline" style="padding:0.5rem; font-size:0.8125rem;" onclick="openEditModal('${s.id}')">Edit</button>
                <button class="btn btn-outline" style="padding:0.5rem; font-size:0.8125rem; color:var(--fail); border-color:var(--fail);" onclick="deleteSet('${s.id}')">Delete</button>
            </div>
        </div>`;
    }).join('');
    } catch (e) {
        if (e.message !== 'Unauthorized') {
            console.error(e);
            el.innerHTML = `<p style="color:#ef4444;text-align:center;padding:40px">ไม่สามารถโหลดข้อมูล Set ได้: ${e.message}</p>`;
        }
    }
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

// --- Admin Webcam & Capture Logic ---
let adminWebcamStream = null;
let adminCapturedBase64 = null;
let adminCropState = null;
let adminCropDrag = null;

function getAdminCanvasPoint(e) {
    const canvas = document.getElementById('admin-webcam-canvas');
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
        x: (clientX - rect.left) * (canvas.width / rect.width),
        y: (clientY - rect.top) * (canvas.height / rect.height)
    };
}

function getAdminOrientedSize() {
    if (!adminCropState?.image) return { w: 0, h: 0 };
    const img = adminCropState.image;
    return adminCropState.rotation % 180 === 0
        ? { w: img.naturalWidth, h: img.naturalHeight }
        : { w: img.naturalHeight, h: img.naturalWidth };
}

function drawImageWithRotation(ctx, img, width, height, rotation) {
    ctx.save();
    if (rotation === 90) {
        ctx.translate(width, 0);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(img, 0, 0, height, width);
    } else if (rotation === 180) {
        ctx.translate(width, height);
        ctx.rotate(Math.PI);
        ctx.drawImage(img, 0, 0, width, height);
    } else if (rotation === 270) {
        ctx.translate(0, height);
        ctx.rotate(-Math.PI / 2);
        ctx.drawImage(img, 0, 0, height, width);
    } else {
        ctx.drawImage(img, 0, 0, width, height);
    }
    ctx.restore();
}

function renderAdminCropCanvas() {
    if (!adminCropState?.image) return;
    const canvas = document.getElementById('admin-webcam-canvas');
    const ctx = canvas.getContext('2d');
    const container = document.getElementById('admin-webcam-container');
    const size = getAdminOrientedSize();
    const maxWidth = Math.min(720, container.clientWidth - 32 || 720);
    canvas.width = Math.max(240, Math.round(maxWidth));
    canvas.height = Math.max(180, Math.round(canvas.width * (size.h / size.w)));

    if (!adminCropState.rect) {
        const padX = canvas.width * 0.08;
        const padY = canvas.height * 0.08;
        adminCropState.rect = {
            x: padX,
            y: padY,
            w: canvas.width - (padX * 2),
            h: canvas.height - (padY * 2)
        };
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawImageWithRotation(ctx, adminCropState.image, canvas.width, canvas.height, adminCropState.rotation);

    const r = adminCropState.rect;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.clearRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 3;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = '#ffffff';
    for (const p of getAdminCropHandles()) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }
    ctx.restore();
}

function getAdminCropHandles() {
    if (!adminCropState?.rect) return [];
    const r = adminCropState.rect;
    return [
        { id: 'nw', x: r.x, y: r.y },
        { id: 'ne', x: r.x + r.w, y: r.y },
        { id: 'sw', x: r.x, y: r.y + r.h },
        { id: 'se', x: r.x + r.w, y: r.y + r.h }
    ];
}

function clampAdminCropRect() {
    const r = adminCropState.rect;
    const canvas = document.getElementById('admin-webcam-canvas');
    const minSize = 40;
    r.x = Math.max(0, Math.min(r.x, canvas.width - minSize));
    r.y = Math.max(0, Math.min(r.y, canvas.height - minSize));
    r.w = Math.max(minSize, Math.min(r.w, canvas.width - r.x));
    r.h = Math.max(minSize, Math.min(r.h, canvas.height - r.y));
}

function startAdminCropDrag(e) {
    if (!adminCropState?.rect) return;
    e.preventDefault();
    const p = getAdminCanvasPoint(e);
    const handle = getAdminCropHandles().find(h => Math.hypot(h.x - p.x, h.y - p.y) < 24);
    const r = adminCropState.rect;
    const inside = p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
    if (!handle && !inside) return;
    adminCropDrag = {
        mode: handle?.id || 'move',
        start: p,
        rect: { ...r }
    };
}

function moveAdminCropDrag(e) {
    if (!adminCropDrag || !adminCropState?.rect) return;
    e.preventDefault();
    const p = getAdminCanvasPoint(e);
    const dx = p.x - adminCropDrag.start.x;
    const dy = p.y - adminCropDrag.start.y;
    const r0 = adminCropDrag.rect;
    const r = adminCropState.rect;

    if (adminCropDrag.mode === 'move') {
        r.x = r0.x + dx;
        r.y = r0.y + dy;
    } else {
        const left = adminCropDrag.mode.includes('w') ? r0.x + dx : r0.x;
        const top = adminCropDrag.mode.includes('n') ? r0.y + dy : r0.y;
        const right = adminCropDrag.mode.includes('e') ? r0.x + r0.w + dx : r0.x + r0.w;
        const bottom = adminCropDrag.mode.includes('s') ? r0.y + r0.h + dy : r0.y + r0.h;
        r.x = Math.min(left, right);
        r.y = Math.min(top, bottom);
        r.w = Math.abs(right - left);
        r.h = Math.abs(bottom - top);
    }

    clampAdminCropRect();
    renderAdminCropCanvas();
}

function stopAdminCropDrag() {
    adminCropDrag = null;
}

function buildAdminCroppedImage() {
    if (!adminCropState?.image || !adminCropState?.rect) return adminCapturedBase64;
    const canvas = document.getElementById('admin-webcam-canvas');
    const size = getAdminOrientedSize();
    const oriented = document.createElement('canvas');
    oriented.width = size.w;
    oriented.height = size.h;
    drawImageWithRotation(oriented.getContext('2d'), adminCropState.image, size.w, size.h, adminCropState.rotation);

    const scaleX = size.w / canvas.width;
    const scaleY = size.h / canvas.height;
    const r = adminCropState.rect;
    const sx = Math.max(0, Math.round(r.x * scaleX));
    const sy = Math.max(0, Math.round(r.y * scaleY));
    const sw = Math.min(size.w - sx, Math.round(r.w * scaleX));
    const sh = Math.min(size.h - sy, Math.round(r.h * scaleY));

    const cropped = document.createElement('canvas');
    cropped.width = sw;
    cropped.height = sh;
    cropped.getContext('2d').drawImage(oriented, sx, sy, sw, sh, 0, 0, sw, sh);
    return cropped.toDataURL('image/jpeg', 0.9);
}

async function openAdminWebcam() {
    const container = document.getElementById('admin-webcam-container');
    const video = document.getElementById('admin-webcam-video');
    const canvas = document.getElementById('admin-webcam-canvas');
    const btnCapture = document.getElementById('btn-admin-capture');
    const btnUpload = document.getElementById('btn-admin-upload');
    const btnRotate = document.getElementById('btn-admin-rotate');
    const cropHint = document.getElementById('admin-crop-hint');

    container.classList.remove('hidden');
    video.classList.remove('hidden');
    canvas.classList.add('hidden');
    btnCapture.classList.remove('hidden');
    btnUpload.classList.add('hidden');
    btnRotate.classList.add('hidden');
    cropHint.classList.add('hidden');
    adminCapturedBase64 = null;
    adminCropState = null;
    adminCropDrag = null;

    try {
        adminWebcamStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = adminWebcamStream;
    } catch (err) {
        alert('Could not access camera: ' + err.message);
    }
}

function closeAdminWebcam() {
    if (adminWebcamStream) {
        adminWebcamStream.getTracks().forEach(track => track.stop());
        adminWebcamStream = null;
    }
    document.getElementById('admin-webcam-container').classList.add('hidden');
    adminCropState = null;
    adminCropDrag = null;
}

function captureAdminReference() {
    const video = document.getElementById('admin-webcam-video');
    const canvas = document.getElementById('admin-webcam-canvas');
    const btnCapture = document.getElementById('btn-admin-capture');
    const btnUpload = document.getElementById('btn-admin-upload');
    const btnRotate = document.getElementById('btn-admin-rotate');
    const cropHint = document.getElementById('admin-crop-hint');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    
    adminCapturedBase64 = canvas.toDataURL('image/jpeg', 0.85);

    if (adminWebcamStream) {
        adminWebcamStream.getTracks().forEach(track => track.stop());
        adminWebcamStream = null;
    }

    video.classList.add('hidden');
    canvas.classList.remove('hidden');
    btnCapture.classList.add('hidden');
    btnRotate.classList.remove('hidden');
    btnUpload.classList.remove('hidden');
    cropHint.classList.remove('hidden');

    const img = new Image();
    img.onload = () => {
        adminCropState = { image: img, rotation: 0, rect: null };
        renderAdminCropCanvas();
    };
    img.src = adminCapturedBase64;
}

function rotateAdminReference() {
    if (!adminCropState) return;
    adminCropState.rotation = (adminCropState.rotation + 90) % 360;
    adminCropState.rect = null;
    renderAdminCropCanvas();
}

async function uploadAdminReference() {
    const setId = document.getElementById('f-id').value.trim();
    if (!setId) {
        alert('Please fill out the Set ID first before uploading an image.');
        return;
    }
    if (!adminCapturedBase64) return;
    const croppedBase64 = buildAdminCroppedImage();

    const btnUpload = document.getElementById('btn-admin-upload');
    const originalText = btnUpload.innerHTML;
    btnUpload.innerHTML = 'Uploading...';
    btnUpload.disabled = true;

    try {
        const res = await apiFetch(`${API}/api/sets/${setId}/reference-image`, {
            method: 'POST',
            body: JSON.stringify({ image_base64: croppedBase64 })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Upload failed');
        
        document.getElementById('f-ref-url').value = data.url;
        alert('Reference image uploaded successfully!');
        closeAdminWebcam();
    } catch (e) {
        alert('Error uploading image: ' + e.message);
    } finally {
        btnUpload.innerHTML = originalText;
        btnUpload.disabled = false;
    }
}

const adminCropCanvas = document.getElementById('admin-webcam-canvas');
if (adminCropCanvas) {
    adminCropCanvas.addEventListener('mousedown', startAdminCropDrag);
    adminCropCanvas.addEventListener('mousemove', moveAdminCropDrag);
    window.addEventListener('mouseup', stopAdminCropDrag);
    adminCropCanvas.addEventListener('touchstart', startAdminCropDrag, { passive: false });
    adminCropCanvas.addEventListener('touchmove', moveAdminCropDrag, { passive: false });
    window.addEventListener('touchend', stopAdminCropDrag);
}
