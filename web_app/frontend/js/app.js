/* ============================================================
   Main App Logic — Verification Flow with Tray Preview
   ============================================================ */

const API = '';

// State
let sets = [];
let selectedSet = null;
let capturedImageBase64 = null;
let webcamStream = null;

// DOM
const setSelector = document.getElementById('set-selector');
const checklistPreview = document.getElementById('checklist-preview');
const stepSelect = document.getElementById('step-select');
const stepCapture = document.getElementById('step-capture');
const stepTrayPreview = document.getElementById('step-tray-preview');
const stepProcessing = document.getElementById('step-processing');
const stepResults = document.getElementById('step-results');
const cameraInput = document.getElementById('camera-input');
const previewContainer = document.getElementById('preview-container');
const previewImage = document.getElementById('preview-image');
const btnRetake = document.getElementById('btn-retake');
const btnDetect = document.getElementById('btn-detect');
const btnVerify = document.getElementById('btn-verify');
const btnNext = document.getElementById('btn-next');
const processingStatus = document.getElementById('processing-status');

// ── Init ──
async function init() {
    try {
        const res = await fetch(API + '/api/sets');
        sets = await res.json();
        renderSetSelector();
    } catch (e) {
        console.error('Failed to load sets:', e);
        setSelector.innerHTML = '<option value="">Error loading sets</option>';
    }
}

function renderSetSelector() {
    if (sets.length === 0) {
        setSelector.innerHTML = '<option value="">ไม่มี set — กรุณาเพิ่มใน Admin</option>';
        return;
    }
    let html = '<option value="">-- เลือก Set --</option>';
    for (const s of sets) {
        const th = s.display_name_th ? ` (${s.display_name_th})` : '';
        const n = (s.checklist || []).length;
        html += `<option value="${s.id}">${s.display_name}${th} — ${n} items</option>`;
    }
    setSelector.innerHTML = html;
}

// ── Set selection ──
setSelector.addEventListener('change', () => {
    const id = setSelector.value;
    if (!id) {
        selectedSet = null;
        checklistPreview.innerHTML = '';
        stepCapture.classList.add('hidden');
        return;
    }
    selectedSet = sets.find(s => s.id === id);
    renderChecklist();
    stepCapture.classList.remove('hidden');
    resetCapture();
});

function renderChecklist() {
    if (!selectedSet) return;
    const items = selectedSet.checklist || [];
    checklistPreview.innerHTML = items.map(i => {
        const cls = i.mode === 'exact' ? 'exact' : 'present';
        const label = i.mode === 'exact' ? `${i.quantity}x ${i.item_name}` : `${i.item_name} ✓`;
        return `<span class="checklist-chip ${cls}">${label}</span>`;
    }).join('');
}

// ── File/Camera input ──
cameraInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        resizeImage(ev.target.result, 1920, (resized) => {
            capturedImageBase64 = resized;
            showPreview(resized);
        });
    };
    reader.readAsDataURL(file);
});

function showPreview(src) {
    previewImage.src = src;
    previewContainer.classList.remove('hidden');
    document.getElementById('capture-options').classList.add('hidden');
    document.getElementById('webcam-container').classList.add('hidden');
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
async function startWebcam() {
    try {
        webcamStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
        });
        const video = document.getElementById('webcam-video');
        video.srcObject = webcamStream;
        document.getElementById('webcam-container').classList.remove('hidden');
        document.getElementById('capture-options').classList.add('hidden');
    } catch (e) {
        alert('ไม่สามารถเปิดกล้องได้: ' + e.message);
    }
}

function stopWebcam() {
    if (webcamStream) {
        webcamStream.getTracks().forEach(t => t.stop());
        webcamStream = null;
    }
    document.getElementById('webcam-container').classList.add('hidden');
    document.getElementById('capture-options').classList.remove('hidden');
}

function captureWebcam() {
    const video = document.getElementById('webcam-video');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    capturedImageBase64 = canvas.toDataURL('image/jpeg', 0.85);
    stopWebcam();
    showPreview(capturedImageBase64);
}

// ── Retake ──
btnRetake.addEventListener('click', resetCapture);

function resetCapture() {
    capturedImageBase64 = null;
    previewContainer.classList.add('hidden');
    document.getElementById('capture-options').classList.remove('hidden');
    cameraInput.value = '';
    stepTrayPreview.classList.add('hidden');
    stepResults.classList.add('hidden');
    stepProcessing.classList.add('hidden');
}

function backToCapture() {
    stepTrayPreview.classList.add('hidden');
    stepCapture.classList.remove('hidden');
    resetCapture();
}

// ── Step 2.5: Detect Tray ──
btnDetect.addEventListener('click', async () => {
    if (!capturedImageBase64) return;

    stepCapture.classList.add('hidden');
    stepProcessing.classList.remove('hidden');
    processingStatus.textContent = 'Detecting tray...';

    try {
        const res = await fetch(API + '/api/detect-tray', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_base64: capturedImageBase64 }),
        });
        let data;
        const textRes = await res.text();
        try {
            data = JSON.parse(textRes);
        } catch (e) {
            throw new Error(`เซิร์ฟเวอร์ตอบกลับผิดพลาด (น่าจะ Server เต็ม/ล่ม): ${textRes.substring(0, 50)}`);
        }

        stepProcessing.classList.add('hidden');

        if (!data.success) {
            alert('ตรวจจับถาดไม่ได้: ' + (data.error || 'Unknown error') + '\nลองถ่ายใหม่ให้เห็นถาดชัดๆ');
            stepCapture.classList.remove('hidden');
            return;
        }

        // Show tray preview
        document.getElementById('tray-preview-img').innerHTML =
            `<img src="data:image/jpeg;base64,${data.tray_preview}" alt="Detected tray" style="max-width:100%;border-radius:8px;border:1px solid var(--border)">`;

        const grid = document.getElementById('tray-compartments');
        grid.innerHTML = '';
        for (const [name, b64] of Object.entries(data.compartment_previews)) {
            grid.innerHTML += `
                <div class="compartment-card">
                    <img src="data:image/jpeg;base64,${b64}" alt="${name}">
                    <div class="label">${name}</div>
                </div>`;
        }

        stepTrayPreview.classList.remove('hidden');

    } catch (e) {
        stepProcessing.classList.add('hidden');
        stepCapture.classList.remove('hidden');
        alert('Error: ' + e.message);
    }
});

// ── Step 3: Verify with VLM ──
btnVerify.addEventListener('click', async () => {
    if (!selectedSet || !capturedImageBase64) return;

    stepTrayPreview.classList.add('hidden');
    stepProcessing.classList.remove('hidden');

    const stages = ['Sending to Gemini AI...', 'Analyzing instruments...', 'Checking checklist...'];
    let i = 0;
    processingStatus.textContent = stages[0];
    const interval = setInterval(() => {
        i = Math.min(i + 1, stages.length - 1);
        processingStatus.textContent = stages[i];
    }, 2000);

    try {
        const res = await fetch(API + '/api/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                set_id: selectedSet.id,
                image_base64: capturedImageBase64,
            }),
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
        stepTrayPreview.classList.remove('hidden');
    }
});

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
            return `<tr class="${cls}">
                <td><span class="status-dot ${cls}"></span>${it.item}</td>
                <td>${it.expected}</td><td>${it.found}</td>
                <td>${it.ok ? 'OK' : 'FAIL'}</td></tr>`;
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
        meHtml += '<div style="margin-bottom:6px"><strong style="color:var(--danger);font-size:0.8rem">Missing:</strong> ';
        meHtml += data.missing.map(m => `<span class="tag tag-missing">${m}</span>`).join('');
        meHtml += '</div>';
    }
    if (data.extra?.length) {
        meHtml += '<div><strong style="color:var(--warning);font-size:0.8rem">Extra:</strong> ';
        meHtml += data.extra.map(m => `<span class="tag tag-extra">${m}</span>`).join('');
        meHtml += '</div>';
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

// ── Next ──
btnNext.addEventListener('click', () => {
    stepResults.classList.add('hidden');
    stepCapture.classList.remove('hidden');
    resetCapture();
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

document.addEventListener('DOMContentLoaded', init);
