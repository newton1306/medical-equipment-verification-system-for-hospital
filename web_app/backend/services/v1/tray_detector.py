# -*- coding: utf-8 -*-
"""OpenCV tray detection and compartment splitting — migrated from V3 notebook."""

import cv2
import numpy as np


def detect_tray(image: np.ndarray, min_area_ratio: float = 0.05):
    """Auto-detect tray as largest rectangular contour (color-agnostic)."""
    ih, iw = image.shape[:2]
    min_area = ih * iw * min_area_ratio
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    for lo, hi in [(30, 100), (50, 150), (20, 80)]:
        edges = cv2.Canny(blurred, lo, hi)
        edges = cv2.dilate(
            edges,
            cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)),
            iterations=2,
        )
        cnts, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        best, best_a = None, 0
        for c in cnts:
            a = cv2.contourArea(c)
            if a < min_area:
                continue
            approx = cv2.approxPolyDP(c, 0.02 * cv2.arcLength(c, True), True)
            if len(approx) == 4 and a > best_a:
                best, best_a = approx.reshape(4, 2), a
        if best is not None:
            return best

    # Fallback: Otsu threshold
    _, bw = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    cnts, _ = cv2.findContours(bw, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best, best_a = None, 0
    for c in cnts:
        a = cv2.contourArea(c)
        if a > best_a and a > min_area:
            best, best_a = cv2.boxPoints(cv2.minAreaRect(c)).astype(int), a
    return best


def order_corners(pts: np.ndarray) -> np.ndarray:
    """Order 4 corners: TL, TR, BR, BL."""
    r = np.zeros((4, 2), dtype=np.float32)
    s, d = pts.sum(1), np.diff(pts, axis=1)
    r[0], r[2] = pts[np.argmin(s)], pts[np.argmax(s)]
    r[1], r[3] = pts[np.argmin(d)], pts[np.argmax(d)]
    return r


def crop_tray(image: np.ndarray, corners: np.ndarray) -> np.ndarray:
    """Perspective-correct and crop tray region."""
    o = order_corners(corners.astype(np.float32))
    w = int(max(np.linalg.norm(o[1] - o[0]), np.linalg.norm(o[2] - o[3])))
    h = int(max(np.linalg.norm(o[3] - o[0]), np.linalg.norm(o[2] - o[1])))
    dst = np.array([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]], dtype=np.float32)
    M = cv2.getPerspectiveTransform(o, dst)
    return cv2.warpPerspective(image, M, (w, h))


def split_compartments(tray_image: np.ndarray) -> tuple[dict[str, np.ndarray], int, int]:
    """Split 3-compartment tray into close-ups.

    Layout: 2 small on left, 1 large on right.
    Uses Hough line detection with ratio-based fallback.
    """
    h, w = tray_image.shape[:2]
    gray = cv2.cvtColor(tray_image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    edges = cv2.Canny(blurred, 50, 150)

    # Find vertical divider
    lines_v = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=80,
                               minLineLength=int(h * 0.4), maxLineGap=20)
    vert_x = None
    if lines_v is not None:
        v_cands = []
        for line in lines_v:
            x1, y1, x2, y2 = line[0]
            angle = abs(np.arctan2(y2 - y1, x2 - x1) * 180 / np.pi)
            if angle > 75:
                mid_x = (x1 + x2) / 2
                if 0.2 * w < mid_x < 0.55 * w:
                    v_cands.append(mid_x)
        if v_cands:
            vert_x = int(np.median(v_cands))

    # Find horizontal divider on left side
    horiz_y = None
    lines_h = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=60,
                               minLineLength=int(w * 0.15), maxLineGap=15)
    if lines_h is not None:
        search_right = vert_x if vert_x else int(w * 0.4)
        h_cands = []
        for line in lines_h:
            x1, y1, x2, y2 = line[0]
            angle = abs(np.arctan2(y2 - y1, x2 - x1) * 180 / np.pi)
            if angle < 15:
                mid_y = (y1 + y2) / 2
                mid_x_l = (x1 + x2) / 2
                if mid_x_l < search_right and 0.3 * h < mid_y < 0.7 * h:
                    h_cands.append(mid_y)
        if h_cands:
            horiz_y = int(np.median(h_cands))

    # Fallback ratios
    if vert_x is None:
        vert_x = int(w * 0.35)
    if horiz_y is None:
        horiz_y = int(h * 0.5)

    pad = 5
    compartments: dict[str, np.ndarray] = {}

    st = tray_image[pad:horiz_y - pad, pad:vert_x - pad]
    if st.size > 0:
        compartments['small_top'] = st

    sb = tray_image[horiz_y + pad:h - pad, pad:vert_x - pad]
    if sb.size > 0:
        compartments['small_bottom'] = sb

    lg = tray_image[pad:h - pad, vert_x + pad:w - pad]
    if lg.size > 0:
        compartments['large'] = lg

    compartments['full'] = tray_image.copy()
    return compartments, vert_x, horiz_y


def stage1_sanity_check(tray_image: np.ndarray, compartments: dict[str, np.ndarray]) -> str:
    """Quick local check: is the tray empty?"""
    gray = cv2.cvtColor(tray_image, cv2.COLOR_BGR2GRAY)
    if gray.std() < 15:
        return 'EMPTY_TRAY'

    empty_count = 0
    for name, comp in compartments.items():
        if name == 'full':
            continue
        g = cv2.cvtColor(comp, cv2.COLOR_BGR2GRAY)
        edge_ratio = cv2.countNonZero(cv2.Canny(g, 30, 100)) / g.size
        if edge_ratio < 0.01:
            empty_count += 1

    if empty_count >= 2:
        return 'EMPTY_TRAY'
    return 'SEND_TO_VLM'


def extract_manual_compartments(tray_image: np.ndarray, vert_x: int, horiz_y: int) -> dict[str, np.ndarray]:
    """Extract compartments using manually provided coordinates."""
    h, w = tray_image.shape[:2]
    pad = 5
    compartments: dict[str, np.ndarray] = {}

    st = tray_image[pad:horiz_y - pad, pad:vert_x - pad]
    if st.size > 0:
        compartments['small_top'] = st

    sb = tray_image[horiz_y + pad:h - pad, pad:vert_x - pad]
    if sb.size > 0:
        compartments['small_bottom'] = sb

    lg = tray_image[pad:h - pad, vert_x + pad:w - pad]
    if lg.size > 0:
        compartments['large'] = lg

    compartments['full'] = tray_image.copy()
    return compartments


def process_tray_image(image: np.ndarray) -> tuple[np.ndarray, dict[str, np.ndarray], int, int, str]:
    """Full pipeline: detect tray → crop → split compartments.

    Returns (cropped_tray, compartments, vert_x, horiz_y, method).
    Raises ValueError if tray not detected.
    """
    corners = detect_tray(image)
    if corners is None:
        raise ValueError('Could not auto-detect tray. Please retake the photo with the tray clearly visible.')

    tray = crop_tray(image, corners)
    compartments, vx, hy = split_compartments(tray)
    return tray, compartments, vx, hy, 'auto'
