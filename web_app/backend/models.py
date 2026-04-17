# -*- coding: utf-8 -*-
"""Pydantic schemas for request/response models."""

from __future__ import annotations
from pydantic import BaseModel
from typing import Optional


# --- Checklist Item ---
class ChecklistItem(BaseModel):
    item_name: str
    item_name_th: Optional[str] = None
    quantity: int = 1
    mode: str = 'exact'  # exact | present


# --- Instrument Set ---
class InstrumentSet(BaseModel):
    id: Optional[str] = None
    display_name: str
    display_name_th: Optional[str] = None
    reference_image_url: Optional[str] = None
    checklist: list[ChecklistItem] = []


class InstrumentSetList(BaseModel):
    sets: list[InstrumentSet]


# --- Verification Request ---
class VerifyRequest(BaseModel):
    set_id: str
    image_base64: str  # base64-encoded JPEG


# --- Verification Result ---
class VerifyItemResult(BaseModel):
    item: str
    expected: int | str
    found: int | str
    mode: str
    ok: bool


class Warning(BaseModel):
    type: str           # chemical_strip | similar_instruments
    level: str          # caution | warning
    message: str
    message_th: str


class VerifyResponse(BaseModel):
    status: str         # PASS | FAIL | UNCERTAIN | ERROR
    confidence: int
    items: list[VerifyItemResult] = []
    missing: list[str] = []
    extra: list[str] = []
    reason: str = ''
    model_used: str = ''
    elapsed_sec: float = 0.0
    warnings: list[Warning] = []
    compartment_previews: dict[str, str] = {}  # name -> base64
    tray_preview: str = ''


# Default warnings appended to EVERY result
DEFAULT_WARNINGS = [
    Warning(
        type='chemical_strip',
        level='caution',
        message='Do not forget the Chemical Indicator strip before wrapping!',
        message_th='⚠️ ระวัง! อย่าลืมกระดาษทดสอบสาร (Chemical Indicator) ตรวจสอบว่าใส่แล้วก่อนห่อ (AI ไม่ได้ตรวจสอบชิ้นนี้)',
    ),
    Warning(
        type='similar_instruments',
        level='warning',
        message='Please double-check similar instruments manually!',
        message_th='🔍 กรุณาเช็คอุปกรณ์ที่คล้ายกันอีกครั้งด้วยตนเอง เช่น Tooth vs Non-tooth forceps, Mayo vs Metzenbaum scissors — ผลจาก AI เป็นเพียงตัวช่วย ไม่ใช่การตรวจสอบขั้นสุดท้าย',
    ),
]
