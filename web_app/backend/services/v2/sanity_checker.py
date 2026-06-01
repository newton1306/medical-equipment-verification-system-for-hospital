# -*- coding: utf-8 -*-
"""Sanity Checker for Version 2 — performs fast pixel-level checks on full images."""

import cv2
import numpy as np


def check_full_image_sanity(image: np.ndarray) -> str:
    """Perform a fast pixel-level sanity check on the full raw image.

    Checks standard deviation of brightness/contrast to detect pitch-black, 
    washed out, or completely empty/blank images without calling the VLM API.
    
    Returns:
        'EMPTY_TRAY' if the image is blank/dark.
        'SEND_TO_VLM' if the image has enough details to proceed.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # standard deviation of grayscale pixels
    std_dev = gray.std()
    
    if std_dev < 12:
        return 'EMPTY_TRAY'
    return 'SEND_TO_VLM'
