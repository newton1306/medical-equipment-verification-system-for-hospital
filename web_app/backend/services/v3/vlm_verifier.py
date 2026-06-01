# -*- coding: utf-8 -*-
"""V3 Gemini 1.5 Pro Verification with Dual-Image Grounding (AR-Guided)."""

import json
import time
import base64
import numpy as np
import cv2
import google.generativeai as genai
from backend.config import GEMINI_API_KEY, GEMINI_MODEL_PRO

genai.configure(api_key=GEMINI_API_KEY)
# For V3, we strictly use the PRO model for complex dual-image reasoning
model = genai.GenerativeModel(GEMINI_MODEL_PRO)

def verify_tray_v3(test_image: np.ndarray, reference_image: np.ndarray, checklist: list) -> dict:
    start_t = time.time()
    
    # 1. Encode Images to JPEG Base64
    def _encode(img):
        _, buf = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return base64.b64encode(buf).decode('utf-8')
        
    test_image_part = {
        "mime_type": "image/jpeg",
        "data": _encode(test_image)
    }
    
    # If reference image is missing, we fallback to single image, but ideally it is present
    contents = []
    
    prompt = f"""
    You are a highly precise medical instrument verification expert. 
    Compare the 'Test Image' against the 'Reference Ground Truth' (if provided). 
    Verify if the tools in the Test Image perfectly match the items and quantities listed in the Text Checklist. 
    Do not hallucinate. 
    
    Text Checklist:
    {json.dumps(checklist, ensure_ascii=False, indent=2)}
    
    Output ONLY a raw JSON string with the exact following schema: 
    {{"status": "PASS" | "FAIL", "reason": "brief explanation", "missing_items": ["item1"], "extra_items": ["item2"]}}
    """
    contents.append(prompt)
    
    if reference_image is not None:
        reference_image_part = {
            "mime_type": "image/jpeg",
            "data": _encode(reference_image)
        }
        contents.append("Reference Ground Truth / ภาพเซ็ตที่ถูกต้องสมบูรณ์:")
        contents.append(reference_image_part)
        
    contents.append("Test Image / ภาพที่ต้องการทดสอบ:")
    contents.append(test_image_part)
    
    try:
        response = model.generate_content(
            contents=contents,
            generation_config={"response_mime_type": "application/json"}
        )
        
        raw_text = response.text.strip()
        if raw_text.startswith('```json'):
            raw_text = raw_text[7:-3]
            
        result = json.loads(raw_text)
        
        # Standardize format
        return {
            'status': result.get('status', 'FAIL'),
            'confidence': 95 if result.get('status') == 'PASS' else 85,
            'items': [], # V3 doesn't individually bounding box tools currently
            'missing': result.get('missing_items', []),
            'extra': result.get('extra_items', []),
            'reason': result.get('reason', ''),
            'model_used': f"{GEMINI_MODEL_PRO} (V3 Dual-Image)",
            'elapsed_sec': round(time.time() - start_t, 2)
        }
    except Exception as e:
        print(f"[V3 ERROR] Gemini verification failed: {e}")
        return {
            'status': 'ERROR',
            'confidence': 0,
            'missing': [],
            'extra': [],
            'reason': f"AI Error: {str(e)[:100]}",
            'model_used': GEMINI_MODEL_PRO,
            'elapsed_sec': round(time.time() - start_t, 2)
        }
