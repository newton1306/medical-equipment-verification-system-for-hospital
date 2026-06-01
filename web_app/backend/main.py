# -*- coding: utf-8 -*-
"""FastAPI main application — serves API + static frontend."""

import base64
import json
import traceback
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.config import ALLOWED_ORIGINS, APP_PASSWORD
from backend.models import DEFAULT_WARNINGS, VerifyResponse, Warning
from backend import database as db
# V1 imports (Legacy Crop & Split)
from backend.services.v1.tray_detector import (
    process_tray_image, stage1_sanity_check, crop_tray, extract_manual_compartments
)
from backend.services.v1.vlm_verifier import verify_with_vlm as verify_with_vlm_v1

# V2 imports (Smart V2)
from backend.services.v2.sanity_checker import check_full_image_sanity as stage1_sanity_check_v2
from backend.services.v2.vlm_verifier import verify_with_vlm as verify_with_vlm_v2

# V3 imports (AR-Guided Dual-Image)
from backend.services.v3.vlm_verifier import verify_tray_v3

app = FastAPI(title='Surgical Instrument Verification', version='4.0')

@app.middleware("http")
async def check_password(request, call_next):
    if APP_PASSWORD and request.url.path.startswith("/api/") and request.url.path != "/api/login":
        pwd = request.headers.get("X-App-Password", "")
        if pwd != APP_PASSWORD:
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


def _decode_image(base64_str: str) -> np.ndarray:
    """Decode base64 string to BGR numpy array."""
    if ',' in base64_str:
        base64_str = base64_str.split(',', 1)[1]
    img_bytes = base64.b64decode(base64_str)
    arr = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError('Cannot decode image')
    return img


def _encode_image(img: np.ndarray, max_size: int = 400) -> str:
    """Encode BGR image to base64 JPEG (small preview)."""
    h, w = img.shape[:2]
    scale = min(1.0, max_size / max(h, w))
    if scale < 1.0:
        img = cv2.resize(img, None, fx=scale, fy=scale)
    _, buf = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 75])
    return base64.b64encode(buf).decode('utf-8')


# ── Tray Detection Preview ──

@app.post('/api/detect_boundary')
def api_detect_boundary(payload: dict):
    image_b64 = payload.get('image_base64', '')
    if not image_b64:
        return {'success': False, 'error': 'image_base64 required'}
        
    try:
        image = _decode_image(image_b64)
        from backend.services.v1.tray_detector import detect_tray
        import numpy as np
        
        corners = detect_tray(image)
        if corners is None:
            h, w = image.shape[:2]
            p = min(h, w) // 10
            corners = np.array([[p, p], [w-p, p], [w-p, h-p], [p, h-p]])
            
        return {
            'success': True,
            'corners': corners.tolist(),
            'image_size': {'w': image.shape[1], 'h': image.shape[0]}
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {'success': False, 'error': str(e)}

@app.post('/api/detect-tray')
async def detect_tray_preview(payload: dict):
    """Detect tray and show compartments for user confirmation.

    Input: { "image_base64": "..." }
    Output: tray preview, compartment previews, dividers, corners.
    """
    image_b64 = payload.get('image_base64', '')
    if not image_b64:
        raise HTTPException(400, 'image_base64 required')

    try:
        image = _decode_image(image_b64)
        from backend.services.v1.tray_detector import detect_tray, crop_tray, split_compartments
        import numpy as np
        
        corners_input = payload.get('corners')
        if corners_input:
            corners = np.array(corners_input, dtype=int)
        else:
            corners = detect_tray(image)
            if corners is None:
                h, w = image.shape[:2]
                pad = int(min(h, w) * 0.05)
                corners = np.array([[pad, pad], [w-pad, pad], [w-pad, h-pad], [pad, h-pad]])
            
        tray = crop_tray(image, corners)
        
        rotate_angle = int(payload.get('rotate_crop', 0))
        if rotate_angle:
            import cv2
            if rotate_angle == 90:
                tray = cv2.rotate(tray, cv2.ROTATE_90_CLOCKWISE)
            elif rotate_angle == 180:
                tray = cv2.rotate(tray, cv2.ROTATE_180)
            elif rotate_angle == 270:
                tray = cv2.rotate(tray, cv2.ROTATE_90_COUNTERCLOCKWISE)
                
        compartments, vx, hy = split_compartments(tray)
        th, tw = tray.shape[:2]

        comp_previews = {}
        for name, comp_img in compartments.items():
            if name != 'full':
                comp_previews[name] = _encode_image(comp_img, 300)

        return {
            'success': True,
            'method': 'auto',
            'tray_preview': _encode_image(tray, 600),
            'compartment_previews': comp_previews,
            'dividers': {'vert_x': vx, 'horiz_y': hy},
            'tray_size': {'w': tw, 'h': th},
            'corners': corners.tolist()
        }
    except ValueError as e:
        return {'success': False, 'error': str(e)}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {'success': False, 'error': f'Detection failed: {str(e)[:200]}'}


# ── Verification Endpoint ──

@app.post('/api/verify')
async def verify_tray(payload: dict):
    """Main verification endpoint.

    Input: { "set_id": "...", "image_base64": "...", "corners": [...], "manual_dividers": {...} }
    Output: VerifyResponse with status, items, warnings, previews.
    """
    set_id = payload.get('set_id', '')
    image_b64 = payload.get('image_base64', '')

    if not set_id or not image_b64:
        raise HTTPException(400, 'set_id and image_base64 required')

    # Load set from database
    set_config = await db.get_set(set_id)
    if set_config is None:
        raise HTTPException(404, f'Set not found: {set_id}')

    try:
        # Decode image
        image = _decode_image(image_b64)
        from backend.services.v1.tray_detector import process_tray_image, crop_tray, extract_manual_compartments
        import numpy as np

        corners = payload.get('corners')
        manual_dividers = payload.get('manual_dividers')
        
        # Step 1: Detect tray + split compartments
        version = int(payload.get('version', 1))

        if version == 2:
            tray = image
            compartments = {'full': image}
            method = 'full_image_direct'
            vx, hy = 0, 0
            
            s1 = stage1_sanity_check_v2(image)
        elif payload.get('skip_crop') or payload.get('skip_split'):
            if corners:
                corners_arr = np.array(corners, dtype=int)
                tray = crop_tray(image, corners_arr)
            else:
                tray = image
                
            rotate_angle = int(payload.get('rotate_crop', 0))
            if rotate_angle:
                if rotate_angle == 90:
                    tray = cv2.rotate(tray, cv2.ROTATE_90_CLOCKWISE)
                elif rotate_angle == 180:
                    tray = cv2.rotate(tray, cv2.ROTATE_180)
                elif rotate_angle == 270:
                    tray = cv2.rotate(tray, cv2.ROTATE_90_COUNTERCLOCKWISE)

            compartments = {'full': tray}
            method = 'skip_split'
            vx, hy = 0, 0
            s1 = stage1_sanity_check(tray, compartments)
        elif corners and manual_dividers:
            # Validate and use manual coordinates
            corners_arr = np.array(corners, dtype=int)
            tray = crop_tray(image, corners_arr)
            
            rotate_angle = int(payload.get('rotate_crop', 0))
            if rotate_angle:
                if rotate_angle == 90:
                    tray = cv2.rotate(tray, cv2.ROTATE_90_CLOCKWISE)
                elif rotate_angle == 180:
                    tray = cv2.rotate(tray, cv2.ROTATE_180)
                elif rotate_angle == 270:
                    tray = cv2.rotate(tray, cv2.ROTATE_90_COUNTERCLOCKWISE)

            vx = max(5, min(tray.shape[1]-5, int(manual_dividers.get('vert_x', tray.shape[1]//2))))
            hy = max(5, min(tray.shape[0]-5, int(manual_dividers.get('horiz_y', tray.shape[0]//2))))
            compartments = extract_manual_compartments(tray, vx, hy)
            method = 'manual'
            s1 = stage1_sanity_check(tray, compartments)
        else:
            tray, compartments, vx, hy, method = process_tray_image(image)
            s1 = stage1_sanity_check(tray, compartments)

        checklist = set_config.get('checklist', [])

        if s1 == 'EMPTY_TRAY':
            result = {
                'status': 'FAIL', 'confidence': 100, 'items': [],
                'missing': ['All items'], 'extra': [],
                'reason': 'Tray appears empty',
                'model_used': 'local', 'elapsed_sec': 0,
            }
        else:
            # Step 3: Load reference image if available
            ref_img = None
            ref_url = set_config.get('reference_image_url', '')
            if ref_url:
                try:
                    import httpx
                    async with httpx.AsyncClient() as client:
                        r = await client.get(ref_url, timeout=10)
                        if r.status_code == 200:
                            arr = np.frombuffer(r.content, np.uint8)
                            ref_img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                except Exception:
                    pass  # Continue without reference

            # Step 4: Stage 2 VLM verification
            if version == 2:
                print(f'[VLM V2] Sending full image, checklist: {checklist}')
                result = verify_with_vlm_v2(tray, ref_img, checklist)
            else:
                print(f'[VLM V1] Sending {len(compartments)} compartments, checklist: {checklist}')
                result = verify_with_vlm_v1(compartments, ref_img, checklist)
            print(f'[VLM] Result: {json.dumps(result, ensure_ascii=False)[:500]}')

        # Build compartment previews
        comp_previews = {}
        for name, comp_img in compartments.items():
            comp_previews[name] = _encode_image(comp_img)

        # Build response with debug info
        response = {
            'status': result.get('status', 'ERROR'),
            'confidence': result.get('confidence', 0),
            'items': result.get('items', []),
            'missing': result.get('missing', []),
            'extra': result.get('extra', []),
            'reason': result.get('reason', ''),
            'model_used': result.get('model_used', ''),
            'elapsed_sec': result.get('elapsed_sec', 0),
            'warnings': [w.model_dump() for w in DEFAULT_WARNINGS],
            'compartment_previews': comp_previews,
            'tray_preview': _encode_image(tray),
            'debug': {
                'stage1': s1,
                'detection_method': method,
                'sent_checklist': checklist,
                'n_compartments': len([k for k in compartments if k != 'full']),
                'thought_process': result.get('thought_process', ''),
            },
        }

        # Log to database
        try:
            await db.log_verification({
                'set_id': set_id,
                'status': response['status'],
                'confidence': response['confidence'],
                'model_used': response['model_used'],
                'elapsed_sec': response['elapsed_sec'],
                'vlm_response': json.dumps(result, ensure_ascii=False),
            })
        except Exception:
            pass  # Don't fail the request if logging fails

        return response

    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f'Internal error: {str(e)[:200]}')

@app.post('/api/v3/verify-tray')
async def verify_tray_v3_endpoint(payload: dict):
    set_id = payload.get('set_id', '')
    test_image_b64 = payload.get('test_image_base64', '')
    
    if not set_id or not test_image_b64:
        raise HTTPException(400, 'set_id and test_image_base64 required')

    set_config = await db.get_set(set_id)
    if set_config is None:
        raise HTTPException(404, f'Set not found: {set_id}')
        
    try:
        test_image = _decode_image(test_image_b64)
        
        ref_img = None
        ref_url = set_config.get('reference_image_url', '')
        if ref_url:
            try:
                import httpx
                async with httpx.AsyncClient() as client:
                    r = await client.get(ref_url, timeout=10)
                    if r.status_code == 200:
                        arr = np.frombuffer(r.content, np.uint8)
                        ref_img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            except Exception:
                pass

        checklist = set_config.get('checklist', [])
        
        result = verify_tray_v3(test_image, ref_img, checklist)
        
        response = {
            'status': result.get('status', 'ERROR'),
            'confidence': result.get('confidence', 0),
            'items': result.get('items', []),
            'missing': result.get('missing', []),
            'extra': result.get('extra', []),
            'reason': result.get('reason', ''),
            'model_used': result.get('model_used', ''),
            'elapsed_sec': result.get('elapsed_sec', 0),
            'warnings': [w.model_dump() for w in DEFAULT_WARNINGS],
            'tray_preview': _encode_image(test_image),
            'debug': {
                'sent_checklist': checklist,
            },
        }

        # Log to database
        try:
            await db.log_verification({
                'set_id': set_id,
                'status': response['status'],
                'confidence': response['confidence'],
                'model_used': response['model_used'],
                'elapsed_sec': response['elapsed_sec'],
                'vlm_response': json.dumps(result, ensure_ascii=False),
            })
        except Exception:
            pass
            
        return response
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f'Internal error: {str(e)[:200]}')


# ── Sets CRUD ──

@app.get('/api/sets')
async def list_sets():
    try:
        return await db.get_all_sets()
    except Exception as e:
        print(f'[ERROR] Failed to load sets: {e}')
        raise HTTPException(500, f'Database connection failed: {str(e)[:200]}')


@app.get('/api/sets/{set_id}')
async def get_set(set_id: str):
    s = await db.get_set(set_id)
    if s is None:
        raise HTTPException(404, 'Set not found')
    return s


@app.post('/api/sets')
async def create_set(data: dict):
    return await db.create_set(data)


@app.put('/api/sets/{set_id}')
async def update_set(set_id: str, data: dict):
    return await db.update_set(set_id, data)


@app.delete('/api/sets/{set_id}')
async def delete_set(set_id: str):
    ok = await db.delete_set(set_id)
    if not ok:
        raise HTTPException(500, 'Delete failed')
    return {'ok': True}

@app.post('/api/sets/{set_id}/reference-image')
async def api_upload_reference(set_id: str, payload: dict):
    image_b64 = payload.get('image_base64', '')
    if not image_b64:
        raise HTTPException(400, 'image_base64 required')
    try:
        import base64
        if ',' in image_b64:
            image_b64 = image_b64.split(',', 1)[1]
        img_bytes = base64.b64decode(image_b64)
        url = await db.upload_reference_image(set_id, img_bytes)
        return {'success': True, 'url': url}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f'Upload failed: {str(e)[:200]}')


# ── Auth & Dashboard ──

@app.post('/api/login')
async def do_login(payload: dict):
    if not APP_PASSWORD:
        return {'success': True}
    if payload.get('password') == APP_PASSWORD:
        return {'success': True}
    return {'success': False, 'error': 'รหัสผ่านไม่ถูกต้อง'}

@app.get('/api/dashboard')
async def dashboard():
    return await db.get_dashboard_stats()


@app.get('/api/logs')
async def get_logs(limit: int = 50):
    return await db.get_logs(limit)


# ── Serve Frontend ──

FRONTEND_DIR = Path(__file__).parent.parent / 'frontend'

app.mount('/css', StaticFiles(directory=FRONTEND_DIR / 'css'), name='css')
app.mount('/js', StaticFiles(directory=FRONTEND_DIR / 'js'), name='js')


@app.get('/')
async def index():
    return FileResponse(FRONTEND_DIR / 'index.html')


@app.get('/admin')
async def admin_page():
    return FileResponse(FRONTEND_DIR / 'admin.html')


@app.get('/dashboard')
async def dashboard_page():
    return FileResponse(FRONTEND_DIR / 'dashboard.html')


@app.get('/manifest.json')
async def manifest():
    return FileResponse(FRONTEND_DIR / 'manifest.json')


@app.get('/sw.js')
async def service_worker():
    return FileResponse(FRONTEND_DIR / 'sw.js', media_type='application/javascript')
