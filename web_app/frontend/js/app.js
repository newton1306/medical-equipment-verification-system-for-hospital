/* ============================================================
   Main App Logic — Verification Flow with Tray Preview
   ============================================================ */

const API = '';

// State
let sets = [];
let selectedSet = null;
let capturedImageBase64 = null;
let webcamStream = null;
let isMobileMode = false;
let trayData = null;
let currentDividers = null;
let cropRotation = 0;

// DOM
const checklistPreview = document.getElementById('checklist-preview');
const stepSelect = document.getElementById('step-select');
const stepCapture = document.getElementById('step-capture');
const stepTrayPreview = document.getElementById('step-tray-preview') || {
    classList: { add() {}, remove() {} },
    scrollIntoView() {}
};
const stepProcessing = document.getElementById('step-processing');
const stepResults = document.getElementById('step-results');
const mobileCameraInput = document.getElementById('mobile-camera-input');
const fileUploadInput = document.getElementById('file-upload-input');
const previewContainer = document.getElementById('preview-container');
const previewImage = document.getElementById('preview-image');
const btnRetake = document.getElementById('btn-retake');
const btnDetect = document.getElementById('btn-detect');
const btnVerifyDirect = document.getElementById('btn-verify-direct');
const btnVerify = document.getElementById('btn-verify');
const btnNext = document.getElementById('btn-next');
const processingStatus = document.getElementById('processing-status');
const mobileReferencePanel = document.getElementById('mobile-reference-panel');
const mobileReferenceImage = document.getElementById('mobile-reference-image');
const mobileReferenceItems = document.getElementById('mobile-reference-items');
const btnMobileAiCapture = document.getElementById('btn-mobile-ai-capture');

// Auth
let appPassword = localStorage.getItem('appPw') || '';
const loginOverlay = document.getElementById('login-overlay');
const loginPwd = document.getElementById('login-password');
const btnLogin = document.getElementById('btn-login');
const loginErr = document.getElementById('login-error');

async function apiFetch(url, options = {}) {
    options.headers = options.headers || {};
    options.headers['X-App-Password'] = appPassword;
    const res = await fetch(url, options);
    if (res.status === 401) {
        showLogin();
        throw new Error('Unauthorized');
    }
    return res;
}

function showLogin() {
    loginOverlay.classList.remove('hidden');
}

btnLogin.addEventListener('click', async () => {
    const pwd = loginPwd.value;
    try {
        const res = await fetch(API + '/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pwd })
        });
        const data = await res.json();
        if (data.success) {
            appPassword = pwd;
            localStorage.setItem('appPw', pwd);
            loginOverlay.classList.add('hidden');
            init(); // reload data
        } else {
            loginErr.textContent = data.error || 'รหัสไม่ถูกต้อง';
        }
    } catch(e) {
        loginErr.textContent = 'การเชื่อมต่อผิดพลาด';
    }
});

// ── Device Mode ──
function detectMobileMode() {
    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
    const narrowScreen = window.matchMedia?.('(max-width: 768px)').matches;
    const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    return Boolean(mobileUa || (coarsePointer && narrowScreen));
}

function applyDeviceModeUI() {
    isMobileMode = detectMobileMode();
    document.body.classList.toggle('mobile-mode', isMobileMode);

    const captureOptions = document.getElementById('capture-options');
    if (isMobileMode && selectedSet) {
        captureOptions.classList.add('hidden');
        mobileReferencePanel.classList.remove('hidden');
        updateMobileReferencePanel();
    } else {
        captureOptions.classList.remove('hidden');
        mobileReferencePanel.classList.add('hidden');
    }
    updateModeUI();
}

function updateMobileReferencePanel() {
    if (!mobileReferencePanel || !selectedSet) return;

    if (selectedSet.reference_image_url) {
        mobileReferenceImage.src = selectedSet.reference_image_url;
        mobileReferenceImage.alt = `${selectedSet.display_name || 'Reference'} tray`;
        mobileReferenceImage.classList.remove('hidden');
    } else {
        mobileReferenceImage.removeAttribute('src');
        mobileReferenceImage.alt = 'No reference image available';
        mobileReferenceImage.classList.add('hidden');
    }

    const items = selectedSet.checklist || [];
    mobileReferenceItems.innerHTML = items.length
        ? items.map(item => `<li>${escapeHtml(getChecklistLabel(item))}</li>`).join('')
        : '<li>No checklist items</li>';
}

window.addEventListener('resize', applyDeviceModeUI);

function updateModeUI() {
    const btnDetect = document.getElementById('btn-detect');
    const btnVerifyDirect = document.getElementById('btn-verify-direct');
    const btnRotateCrop = document.getElementById('btn-rotate-crop');
    const btnWebcamCapture = document.getElementById('btn-webcam-capture');
    const bCanvas = document.getElementById('boundary-canvas');
    const previewHintText = document.getElementById('preview-hint-text');

    if (!previewHintText) return;

    if (btnRotateCrop) {
        btnRotateCrop.classList.add('hidden');
        btnRotateCrop.textContent = `Rotate 90 (${cropRotation}°)`;
    }

    if (btnWebcamCapture) btnWebcamCapture.textContent = 'ตรวจสอบอีกครั้งด้วย AI';
    if (btnDetect) btnDetect.classList.add('hidden');
    if (bCanvas) bCanvas.classList.add('hidden');
    previewHintText.innerHTML = isMobileMode
        ? 'ตรวจสอบด้วย AI จากภาพที่ถ่าย โดยเทียบกับ checklist และภาพ reference'
        : 'ตรวจสอบด้วย AI จากภาพเต็ม โดยใช้ reference tray ด้านซ้ายเป็นแนวทางการจัดถาด';
    btnVerifyDirect.innerHTML = 'ตรวจสอบอีกครั้งด้วย AI';
    btnVerifyDirect.style.backgroundColor = '';
}

async function init() {
    applyDeviceModeUI();
    
    try {
        const res = await apiFetch(API + '/api/sets');
        sets = await res.json();
        if (!Array.isArray(sets)) {
            throw new Error(sets.detail || 'Invalid response from server');
        }
        renderSetSelector();
    } catch (e) {
        if (e.message !== 'Unauthorized') {
            console.error('Failed to load sets:', e);
            const setGrid = document.getElementById('set-grid');
            if (setGrid) {
                setGrid.innerHTML = `<div style="text-align:center; padding: 2rem; color: #ef4444">
                    ไม่สามารถโหลดข้อมูล Set ได้<br><span style="font-size:0.85rem; color:var(--text-muted)">${e.message}<br>โปรดตรวจสอบการเชื่อมต่ออินเทอร์เน็ตหรือรีเฟรชหน้าบราวเซอร์</span>
                </div>`;
            }
        }
    }
}

const setGrid = document.getElementById('set-grid');

function renderSetSelector() {
    if (sets.length === 0) {
        setGrid.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-muted)">ไม่มี set — กรุณาเพิ่มใน Admin</div>';
        return;
    }
    let html = '';
    for (const s of sets) {
        const th = s.display_name_th ? `<br><span style="font-size:0.75rem; color:var(--text-muted)">${s.display_name_th}</span>` : '';
        const n = (s.checklist || []).length;
        const icon = '📦'; // Default icon, can be extended if needed
        html += `
            <div class="set-card" data-id="${s.id}">
                <span class="set-icon">${icon}</span>
                <div class="set-name">${s.display_name}${th}</div>
                <div class="set-count">${n} items</div>
            </div>`;
    }
    setGrid.innerHTML = html;

    // Add click listeners
    const cards = setGrid.querySelectorAll('.set-card');
    cards.forEach(card => {
        card.addEventListener('click', () => {
            cards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            
            const id = card.getAttribute('data-id');
            selectedSet = sets.find(s => s.id === id);
            renderChecklist();
            stepCapture.classList.remove('hidden');
            resetCapture();
            applyDeviceModeUI();
            // Scroll to capture section
            stepCapture.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}

function renderChecklist() {
    if (!selectedSet) return;
    const items = selectedSet.checklist || [];
    
    checklistPreview.innerHTML = items.map(i => {
        let nName = i.item_name;
        if (i.item_name_th) nName += ` <span>(${i.item_name_th})</span>`;
        const cls = i.mode === 'exact' ? 'exact' : 'present';
        const label = i.mode === 'exact' ? `${i.quantity}x ${nName}` : `${nName} ✓`;
        return `<span class="checklist-chip ${cls}">${label}</span>`;
    }).join('');
}

// ── File/Camera input ──
function handleFileInput(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        resizeImage(ev.target.result, 1920, (resized) => {
            capturedImageBase64 = resized;
            if (isMobileMode) {
                executeVerify({
                    set_id: selectedSet.id,
                    image_base64: capturedImageBase64,
                    skip_split: true
                });
                return;
            }
            showPreview(resized);
        });
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset input to allow selecting same file again
}

mobileCameraInput.addEventListener('change', handleFileInput);
fileUploadInput.addEventListener('change', handleFileInput);
if (btnMobileAiCapture) {
    btnMobileAiCapture.addEventListener('click', () => {
        if (!selectedSet) return;
        mobileCameraInput.click();
    });
}

let boundaryOriginalSize = null;
let displayCorners = null;
const bCanvas = document.getElementById('boundary-canvas');
const bCtx = bCanvas ? bCanvas.getContext('2d') : null;

async function showPreview(src) {
    previewImage.src = src;
    cropRotation = 0;
    
    // Reset UI
    stepTrayPreview.classList.add('hidden');
    document.getElementById('capture-options').classList.add('hidden');
    document.getElementById('webcam-container').classList.add('hidden');
    
    updateModeUI();
    
    previewContainer.classList.remove('hidden');
    boundaryOriginalSize = null;
    displayCorners = null;
    return;
    
}

function drawBoundary() {
    if (!displayCorners || !bCtx) return;
    bCtx.clearRect(0, 0, bCanvas.width, bCanvas.height);
    
    // Dark overlay background
    bCtx.fillStyle = 'rgba(0,0,0,0.6)';
    bCtx.fillRect(0, 0, bCanvas.width, bCanvas.height);
    
    // Cutout polygon (transparent tray)
    bCtx.globalCompositeOperation = 'destination-out';
    bCtx.beginPath();
    bCtx.moveTo(displayCorners[0].x, displayCorners[0].y);
    bCtx.lineTo(displayCorners[1].x, displayCorners[1].y);
    bCtx.lineTo(displayCorners[2].x, displayCorners[2].y);
    bCtx.lineTo(displayCorners[3].x, displayCorners[3].y);
    bCtx.closePath();
    bCtx.fill();
    bCtx.globalCompositeOperation = 'source-over';
    
    // Green frame
    bCtx.strokeStyle = '#00ff88'; // vibrant green
    bCtx.lineWidth = 3;
    bCtx.stroke();
    
    // White control points
    bCtx.fillStyle = '#fff';
    displayCorners.forEach(p => {
        bCtx.beginPath();
        bCtx.arc(p.x, p.y, 10, 0, 2*Math.PI);
        bCtx.fill();
        bCtx.stroke();
    });
}

// ── Drag Logic for Boundary Canvas ──
let dragPointIndex = -1;

function getEventPos(e) {
    const rect = bCanvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    const clientX = touch ? touch.clientX : e.clientX;
    const clientY = touch ? touch.clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
}

function handlePointerDown(e) {
    if (!displayCorners) return;
    const pos = getEventPos(e);
    dragPointIndex = displayCorners.findIndex(p => {
        const dx = p.x - pos.x;
        const dy = p.y - pos.y;
        return Math.sqrt(dx*dx + dy*dy) < 30; // 30px touch radius
    });
    if (dragPointIndex !== -1) e.preventDefault();
}

function handlePointerMove(e) {
    if (dragPointIndex === -1 || !displayCorners) return;
    e.preventDefault();
    const pos = getEventPos(e);
    displayCorners[dragPointIndex].x = Math.max(0, Math.min(bCanvas.width, pos.x));
    displayCorners[dragPointIndex].y = Math.max(0, Math.min(bCanvas.height, pos.y));
    drawBoundary();
}

function handlePointerUp() {
    dragPointIndex = -1;
}

if (bCanvas) {
    bCanvas.addEventListener('mousedown', handlePointerDown);
    bCanvas.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    bCanvas.addEventListener('touchstart', handlePointerDown, {passive: false});
    bCanvas.addEventListener('touchmove', handlePointerMove, {passive: false});
    bCanvas.addEventListener('touchend', handlePointerUp);
}

function resizeImage(dataUrl, maxSize, callback) {
    const img = new Image();
    img.onload = () => {
        let w = img.width, h = img.height;
        if (Math.max(w, h) > maxSize) {
            const scale = maxSize / Math.max(w, h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        callback(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = dataUrl;
}

// ── Webcam (for desktop) ──
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function getChecklistLabel(item) {
    const names = [item.item_name, item.item_name_th].filter(Boolean).join(' / ');
    if (item.mode === 'exact' && item.quantity) return `${item.quantity}x ${names}`;
    return names;
}

function updateTrayGuide() {
    const webcamContainer = document.getElementById('webcam-container');
    const guide = document.getElementById('v4-tray-guide');
    const guideImage = document.getElementById('v4-guide-image');
    const guideItems = document.getElementById('v4-guide-items');
    const arOverlay = document.getElementById('ar-overlay-image');
    if (!webcamContainer || !guide || !guideImage || !guideItems || !arOverlay) return;

    const showGuide = true;
    webcamContainer.classList.toggle('v4-guide-active', showGuide);
    guide.classList.toggle('hidden', !showGuide);

    if (!showGuide) {
        guideImage.removeAttribute('src');
        guideItems.innerHTML = '';
        return;
    }

    arOverlay.classList.add('hidden');
    arOverlay.src = '';

    if (selectedSet && selectedSet.reference_image_url) {
        guideImage.src = selectedSet.reference_image_url;
        guideImage.alt = `${selectedSet.display_name || 'Reference'} tray`;
        guideImage.classList.remove('hidden');
    } else {
        guideImage.removeAttribute('src');
        guideImage.alt = 'No reference image available';
        guideImage.classList.add('hidden');
    }

    const items = selectedSet?.checklist || [];
    guideItems.innerHTML = items.length
        ? items.map(item => `<li>${escapeHtml(getChecklistLabel(item))}</li>`).join('')
        : '<li>No checklist items</li>';
}

async function startWebcam() {
    // Check if browser allows webcam access (requires HTTPS or Localhost)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('เบราว์เซอร์ไม่อนุญาตให้เปิดกล้องเว็ปแคมของระบบ!\n\nสาเหตุ: กำลังเข้าใช้งานผ่าน http:// (ไม่มีตัว S)\nกด OK แล้วใช้ปุ่ม "📱 เปิดกล้องมือถือ" หรือ "📂 เลือกรูปภาพ" แทนครับ');
        return;
    }

    try {
        webcamStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
        });
        const video = document.getElementById('webcam-video');
        video.srcObject = webcamStream;
    
        const arOverlay = document.getElementById('ar-overlay-image');
        arOverlay.classList.add('hidden');
        arOverlay.src = '';

        updateTrayGuide();
        document.getElementById('webcam-container').classList.remove('hidden');
        document.getElementById('capture-options').classList.add('hidden');
    } catch (e) {
        alert('ไม่สามารถเปิดเว็บแคมได้: ' + e.message + '\nกรุณาใช้ปุ่มเลือกรูปหรือกล้องมือถือแทนครับ');
    }
}

function stopWebcam() {
    if (webcamStream) {
        webcamStream.getTracks().forEach(t => t.stop());
        webcamStream = null;
    }
    const webcamContainer = document.getElementById('webcam-container');
    webcamContainer.classList.add('hidden');
    webcamContainer.classList.remove('v4-guide-active');
    document.getElementById('v4-tray-guide').classList.add('hidden');
    applyDeviceModeUI();
}

async function captureWebcam() {
    const video = document.getElementById('webcam-video');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    capturedImageBase64 = canvas.toDataURL('image/jpeg', 0.85);
    stopWebcam();

    await executeVerify({
        set_id: selectedSet.id,
        image_base64: capturedImageBase64,
        skip_split: true,
        rotate_crop: 0
    });
}

// ── Retake ──
btnRetake.addEventListener('click', resetCapture);

function resetCapture() {
    if (webcamStream) {
        webcamStream.getTracks().forEach(t => t.stop());
        webcamStream = null;
    }
    const webcamContainer = document.getElementById('webcam-container');
    webcamContainer.classList.add('hidden');
    webcamContainer.classList.remove('v4-guide-active');
    document.getElementById('v4-tray-guide').classList.add('hidden');
    document.getElementById('ar-overlay-image').classList.add('hidden');
    capturedImageBase64 = null;
    previewContainer.classList.add('hidden');
    mobileCameraInput.value = '';
    fileUploadInput.value = '';
    stepTrayPreview.classList.add('hidden');
    stepResults.classList.add('hidden');
    stepProcessing.classList.add('hidden');
    applyDeviceModeUI();
}

function backToCapture() {
    stepTrayPreview.classList.add('hidden');
    stepCapture.classList.remove('hidden');
    resetCapture();
}


// Helper: map corners back to original image size
function getOriginalCorners() {
    if (!displayCorners || !boundaryOriginalSize) return null;
    const scaleX = boundaryOriginalSize.w / bCanvas.width;
    const scaleY = boundaryOriginalSize.h / bCanvas.height;
    return displayCorners.map(c => [
        Math.round(c.x * scaleX),
        Math.round(c.y * scaleY)
    ]);
}

async function doDetectTray() {
    previewContainer.classList.add('hidden');
    stepTrayPreview.classList.add('hidden');
    stepProcessing.classList.remove('hidden');
    processingStatus.textContent = 'กำลังแบ่งช่อง และตรวจสอบความถูกต้อง...';

    const corners = getOriginalCorners();

    try {
        const res = await apiFetch(API + '/api/detect-tray', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                image_base64: capturedImageBase64, 
                corners: corners,
                rotate_crop: cropRotation
            })
        });
        let data;
        const textRes = await res.text();
        try {
            data = JSON.parse(textRes);
        } catch (e) {
            throw new Error(`เซิร์ฟเวอร์ตอบกลับผิดพลาด (น่าจะ Server เต็ม/ล่ม): ${textRes.substring(0, 50)}`);
        }

        stepProcessing.classList.remove('hidden');
        if (!data.success) {
            throw new Error(data.error || data.detail || 'Detection failed');
        }

        // Save tray data
        trayData = data;
        currentDividers = { ...data.dividers };

        // Show tray preview with draggable lines
        const container = document.getElementById('tray-preview-img');
        const imgW = data.tray_size.w;
        const imgH = data.tray_size.h;
        const vPct = (currentDividers.vert_x / imgW) * 100;
        const hPct = (currentDividers.horiz_y / imgH) * 100;

        container.innerHTML = `
            <div class="tray-preview-container" id="tray-container">
                <div class="tray-preview-img"><img src="data:image/jpeg;base64,${data.tray_preview}" alt="Detected tray" draggable="false"></div>
                <div id="div-v" class="divider divider-v" style="left: ${vPct}%;"></div>
                <div id="div-h" class="divider divider-h" style="top: ${hPct}%; right: ${100 - vPct}%;"></div>
            </div>
        `;

        setupDraggableDividers();

        const grid = document.getElementById('tray-compartments');
        grid.innerHTML = '';
        for (const [name, b64] of Object.entries(data.compartment_previews)) {
            grid.innerHTML += `
                <div class="compartment-card">
                    <img src="data:image/jpeg;base64,${b64}" alt="${name}">
                    <div class="label">${name}</div>
                </div>`;
        }

        stepProcessing.classList.add('hidden');
        stepTrayPreview.classList.remove('hidden');
        stepTrayPreview.scrollIntoView({ behavior: 'smooth' });

    } catch (e) {
        alert('Error: ' + e.message);
        stepProcessing.classList.add('hidden');
        previewContainer.classList.remove('hidden');
    }
}

// ── Option 2: Detect Tray (Split) ──
if (btnDetect) {
    btnDetect.addEventListener('click', () => {
        if (!capturedImageBase64) return;
        cropRotation = 0;
        doDetectTray();
    });
}

function setupDraggableDividers() {
    const container = document.getElementById('tray-container');
    const divV = document.getElementById('div-v');
    const divH = document.getElementById('div-h');
    
    let isDraggingV = false;
    let isDraggingH = false;

    function getX(e) { return e.touches ? e.touches[0].clientX : e.clientX; }
    function getY(e) { return e.touches ? e.touches[0].clientY : e.clientY; }

    function onDownV(e) { isDraggingV = true; e.preventDefault(); }
    function onDownH(e) { isDraggingH = true; e.preventDefault(); }

    function onMove(e) {
        if (!isDraggingV && !isDraggingH) return;
        const rect = container.getBoundingClientRect();
        
        if (isDraggingV) {
            let x = getX(e) - rect.left;
            x = Math.max(0, Math.min(x, rect.width));
            const pct = (x / rect.width) * 100;
            divV.style.left = pct + '%';
            divH.style.right = (100 - pct) + '%';
            currentDividers.vert_x = (pct / 100) * trayData.tray_size.w;
        }
        if (isDraggingH) {
            let y = getY(e) - rect.top;
            y = Math.max(0, Math.min(y, rect.height));
            const pct = (y / rect.height) * 100;
            divH.style.top = pct + '%';
            currentDividers.horiz_y = (pct / 100) * trayData.tray_size.h;
        }
    }

    function onUp() { isDraggingV = false; isDraggingH = false; }

    divV.addEventListener('mousedown', onDownV);
    divV.addEventListener('touchstart', onDownV, {passive: false});
    divH.addEventListener('mousedown', onDownH);
    divH.addEventListener('touchstart', onDownH, {passive: false});

    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, {passive: false});
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
}

// Rotate tray helper (rotates only the cropped tray in backend and restarts split)
const btnRotateTray = document.getElementById('btn-rotate-tray');
if (btnRotateTray) {
    btnRotateTray.addEventListener('click', () => {
        cropRotation = (cropRotation + 90) % 360;
        doDetectTray();
    });
}

const btnRotateCrop = document.getElementById('btn-rotate-crop');
if (btnRotateCrop) {
    btnRotateCrop.addEventListener('click', () => {
        cropRotation = (cropRotation + 90) % 360;
        updateModeUI();
    });
}

btnVerifyDirect.addEventListener('click', async () => {
    if (!selectedSet || !capturedImageBase64) return;

    previewContainer.classList.add('hidden');
    document.getElementById('capture-options').classList.add('hidden');

    const payload = {
        set_id: selectedSet.id,
        image_base64: capturedImageBase64,
        skip_split: true,
        rotate_crop: 0
    };
    
    await executeVerify(payload);
});

// ── Step 3: Verify with VLM ──
if (btnVerify) {
    btnVerify.addEventListener('click', async () => {
        if (!selectedSet || !capturedImageBase64) return;
        stepTrayPreview.classList.add('hidden');

        await executeVerify({
            set_id: selectedSet.id,
            image_base64: capturedImageBase64,
            skip_split: true
        });
    });
}


async function executeVerify(payload) {
    stepProcessing.classList.remove('hidden');

    const stages = ['Sending to Gemini AI...', 'Analyzing instruments...', 'Checking checklist...'];
    let i = 0;
    processingStatus.textContent = stages[0];
    const interval = setInterval(() => {
        i = Math.min(i + 1, stages.length - 1);
        processingStatus.textContent = stages[i];
    }, 2000);

    try {
        const res = await apiFetch(API + '/api/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        clearInterval(interval);

        const textRes = await res.text();
        let data;
        try {
            data = JSON.parse(textRes);
        } catch (e) {
            throw new Error(`เซิร์ฟเวอร์ตอบกลับผิดพลาด (น่าจะ Server เต็ม/ล่ม): ${textRes.substring(0, 50)}`);
        }

        if (!res.ok) {
            throw new Error(data.detail || 'Verification failed');
        }
        renderResults(data);

    } catch (e) {
        clearInterval(interval);
        alert('Error: ' + e.message);
        stepProcessing.classList.add('hidden');
        if (payload.skip_split || payload.skip_crop) {
            previewContainer.classList.remove('hidden');
        } else {
            stepTrayPreview.classList.remove('hidden');
        }
    }
}

// ── Results ──
function renderResults(data) {
    stepProcessing.classList.add('hidden');
    stepResults.classList.remove('hidden');

    // Banner
    const banner = document.getElementById('result-banner');
    const statusEl = document.getElementById('result-status');
    const confEl = document.getElementById('result-confidence');
    banner.className = 'result-banner ' + data.status.toLowerCase();
    const icons = { PASS: '✅', FAIL: '❌', UNCERTAIN: '⚠️', ERROR: '⚠️' };
    statusEl.textContent = `${icons[data.status] || '?'} ${data.status}`;
    confEl.textContent = `Confidence: ${data.confidence}%`;

    // Compartments
    const grid = document.getElementById('compartment-grid');
    grid.innerHTML = '';
    if (data.compartment_previews) {
        for (const [name, b64] of Object.entries(data.compartment_previews)) {
            if (name === 'full') continue;
            grid.innerHTML += `
                <div class="compartment-card">
                    <img src="data:image/jpeg;base64,${b64}" alt="${name}">
                    <div class="label">${name}</div>
                </div>`;
        }
    }

    // Items table
    const tc = document.getElementById('items-table-container');
    if (data.items && data.items.length > 0) {
        let rows = data.items.map(it => {
            const cls = it.ok ? 'ok' : 'fail';
            return `<tr>
                <td><span class="status-cell ${cls}">${it.item}</span></td>
                <td>${it.expected}</td><td>${it.found}</td>
                <td class="status-cell ${cls}">${it.ok ? 'OK' : 'FAIL'}</td></tr>`;
        }).join('');
        tc.innerHTML = `<table class="items-table">
            <thead><tr><th>Item</th><th>Expected</th><th>Found</th><th>Status</th></tr></thead>
            <tbody>${rows}</tbody></table>`;
    } else {
        tc.innerHTML = '';
    }

    // Missing/Extra
    const me = document.getElementById('missing-extra');
    let meHtml = '';
    if (data.missing?.length) {
        meHtml += '<div class="finding-group"><div class="finding-title missing">Missing Items</div><ul class="finding-list missing">';
        meHtml += data.missing.map(m => `<li>${m}</li>`).join('');
        meHtml += '</ul></div>';
    }
    if (data.extra?.length) {
        meHtml += '<div class="finding-group"><div class="finding-title extra">Extra Items</div><ul class="finding-list extra">';
        meHtml += data.extra.map(m => `<li>${m}</li>`).join('');
        meHtml += '</ul></div>';
    }
    me.innerHTML = meHtml;

    document.getElementById('result-reason').textContent = data.reason || '';
    document.getElementById('result-meta').textContent =
        `Model: ${data.model_used} | Time: ${data.elapsed_sec}s`;

    // Debug info
    if (data.debug) {
        document.getElementById('debug-info').textContent = JSON.stringify(data.debug, null, 2);
    }

    stepResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Retake (Same Set) ──
const btnRetakeResult = document.getElementById('btn-retake-result');
if (btnRetakeResult) {
    btnRetakeResult.addEventListener('click', () => {
        stepResults.classList.add('hidden');
        stepCapture.classList.remove('hidden');
        resetCapture();
        stepCapture.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

// ── Next ──
btnNext.addEventListener('click', () => {
    // Clear selected set
    const cards = document.querySelectorAll('.set-card');
    cards.forEach(c => c.classList.remove('active'));
    selectedSet = null;

    stepResults.classList.add('hidden');
    stepCapture.classList.add('hidden');
    resetCapture();
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

document.addEventListener('DOMContentLoaded', init);
