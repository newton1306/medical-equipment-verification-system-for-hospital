# -*- coding: utf-8 -*-
"""Gemini VLM verification — multi-crop + tiered model strategy (from V3)."""

import json
import time

import cv2
import numpy as np
import google.generativeai as genai
from PIL import Image as PILImage

from backend.config import (
    GEMINI_API_KEY, GEMINI_MODEL_FAST, GEMINI_MODEL_PRO,
    GEMINI_ESCALATION_THRESHOLD,
)

# Configure Gemini
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

SYSTEM_PROMPT = (
    'You are an expert surgical instrument inspector at a hospital CSSD '
    '(Central Sterile Supply Department). You verify instrument trays '
    'before wrapping and sterilization.\n\n'
    'CRITICAL instrument distinctions you MUST check:\n'
    '- Toothed forceps: tips have interlocking teeth/serrations\n'
    '- Non-toothed (smooth) forceps: tips are flat/smooth\n'
    '- Mayo scissors vs Metzenbaum: blade thickness differs\n'
    '- Handle sizes: #3 (thin) vs #4 (thick)\n\n'
    'RULES:\n'
    '1. You receive MULTIPLE images:\n'
    '   - Close-up views of each tray compartment (for detail)\n'
    '   - Full tray overview\n'
    '   - Reference image of the correct complete set (if available)\n'
    '2. Items are placed FREELY - positions vary, focus on TYPE and COUNT.\n'
    '3. Checklist modes:\n'
    '   - [EXACT]: quantity must match precisely\n'
    '   - [PRESENT]: item just needs to exist, any quantity OK\n'
    '4. For cotton balls and gauze: just verify they EXIST. Do NOT count.\n'
    '5. For metal instruments: verify EXACT count and CORRECT TYPE.\n\n'
    'OUTPUT: ONLY raw JSON (no markdown, no code fences):\n'
    '{\n'
    '  "status": "PASS" | "FAIL" | "UNCERTAIN",\n'
    '  "confidence": 0-100,\n'
    '  "items": [\n'
    '    {"item": "name", "expected": 1, "found": 1, "mode": "exact", "ok": true}\n'
    '  ],\n'
    '  "missing": ["item name (qty)"],\n'
    '  "extra": ["item name (qty)"],\n'
    '  "reason": "short explanation"\n'
    '}'
)


def _bgr_to_pil(img: np.ndarray) -> PILImage.Image:
    return PILImage.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))


def _strip_fences(text: str) -> str:
    text = text.strip()
    if text.startswith('```'):
        nl = text.find('\n')
        if nl != -1:
            text = text[nl + 1:]
    if text.endswith('```'):
        text = text[:-3].strip()
    return text


def _build_checklist_text(checklist: list[dict]) -> str:
    lines = []
    for e in checklist:
        name = e['item_name']
        if e.get('item_name_th'):
            name += f" ({e['item_name_th']})"
        
        if e.get('mode') == 'exact':
            lines.append(f"  - {e.get('quantity', 1)}x {name} [EXACT]")
        else:
            lines.append(f"  - {name} [PRESENT]")
    return '\n'.join(lines)


def call_vlm(
    compartments: dict[str, np.ndarray],
    reference_img: np.ndarray | None,
    checklist: list[dict],
    model_name: str = 'gemini-2.5-flash',
    max_retries: int = 3,
) -> dict:
    """Send multi-crop images to Gemini for verification. Auto-retries on 429."""
    model = genai.GenerativeModel(
        model_name=model_name,
        system_instruction=SYSTEM_PROMPT,
    )
    checklist_text = _build_checklist_text(checklist)

    parts: list = ['Verify this surgical instrument tray.\n\n']
    comp_names = [k for k in compartments if k != 'full']
    for i, name in enumerate(comp_names, 1):
        parts.append(f'Close-up {i} ({name} compartment):')
        parts.append(_bgr_to_pil(compartments[name]))

    if 'full' in compartments:
        parts.append('\nFull tray overview:')
        parts.append(_bgr_to_pil(compartments['full']))

    if reference_img is not None:
        parts.append('\nReference (correct complete set):')
        parts.append(_bgr_to_pil(reference_img))

    parts.append(f'\n\nCHECKLIST:\n{checklist_text}\n\nRespond with ONLY JSON.')

    raw = ''
    for attempt in range(1, max_retries + 1):
        t0 = time.time()
        try:
            resp = model.generate_content(
                parts,
                generation_config=genai.GenerationConfig(
                    temperature=0.1, max_output_tokens=2048,
                ),
            )
            elapsed = time.time() - t0
            raw = resp.text
            cleaned = _strip_fences(raw)
            result = json.loads(cleaned)
            result.setdefault('status', 'UNCERTAIN')
            result.setdefault('confidence', 0)
            result.setdefault('items', [])
            result.setdefault('missing', [])
            result.setdefault('extra', [])
            result.setdefault('reason', '')
            result['model_used'] = model_name
            result['elapsed_sec'] = round(elapsed, 2)
            return result

        except json.JSONDecodeError:
            elapsed = time.time() - t0
            return {
                'status': 'ERROR', 'confidence': 0, 'items': [],
                'missing': [], 'extra': [],
                'reason': f'JSON parse error. Raw: {raw[:200]}',
                'model_used': model_name, 'elapsed_sec': round(elapsed, 2),
            }
        except Exception as e:
            elapsed = time.time() - t0
            if '429' in str(e) and attempt < max_retries:
                time.sleep(10 * attempt)
                continue
            return {
                'status': 'ERROR', 'confidence': 0, 'items': [],
                'missing': [], 'extra': [],
                'reason': str(e)[:300],
                'model_used': model_name, 'elapsed_sec': round(elapsed, 2),
            }

    return {'status': 'ERROR', 'confidence': 0, 'items': [], 'missing': [],
            'extra': [], 'reason': 'Max retries exceeded',
            'model_used': model_name, 'elapsed_sec': 0}


def verify_with_vlm(
    compartments: dict[str, np.ndarray],
    reference_img: np.ndarray | None,
    checklist: list[dict],
) -> dict:
    """Tiered verification: Flash first, escalate to Pro if uncertain."""
    result = call_vlm(compartments, reference_img, checklist, GEMINI_MODEL_FAST)

    if (result.get('status') == 'UNCERTAIN'
            or result.get('confidence', 0) < GEMINI_ESCALATION_THRESHOLD):
        result = call_vlm(compartments, reference_img, checklist, GEMINI_MODEL_PRO)

    return result
