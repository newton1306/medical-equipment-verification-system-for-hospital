# -*- coding: utf-8 -*-
"""Application configuration — loads from environment variables."""

import os
from dotenv import load_dotenv

load_dotenv()

# --- Gemini API ---
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '')
GEMINI_MODEL_FAST = os.getenv('GEMINI_MODEL_FAST', 'gemini-2.5-flash')
GEMINI_MODEL_PRO = os.getenv('GEMINI_MODEL_PRO', 'gemini-2.5-pro')
GEMINI_ESCALATION_THRESHOLD = int(os.getenv('GEMINI_ESCALATION_THRESHOLD', '75'))

# --- Supabase ---
SUPABASE_URL = os.getenv('SUPABASE_URL', '')
SUPABASE_KEY = os.getenv('SUPABASE_KEY', '')

# --- App ---
MAX_IMAGE_SIZE = int(os.getenv('MAX_IMAGE_SIZE', '1920'))
ALLOWED_ORIGINS = os.getenv('ALLOWED_ORIGINS', '*').split(',')
