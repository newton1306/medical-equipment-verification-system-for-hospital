-- ============================================================
-- Supabase Migration: Surgical Instrument Verification
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Instrument Sets
CREATE TABLE IF NOT EXISTS instrument_sets (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    display_name_th TEXT DEFAULT '',
    reference_image_url TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Checklist Items
CREATE TABLE IF NOT EXISTS checklist_items (
    id BIGSERIAL PRIMARY KEY,
    set_id TEXT NOT NULL REFERENCES instrument_sets(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    item_name_th TEXT DEFAULT '',
    quantity INT DEFAULT 1,
    mode TEXT DEFAULT 'exact',
    sort_order INT DEFAULT 0
);

-- 3. Verification Logs
CREATE TABLE IF NOT EXISTS verification_logs (
    id BIGSERIAL PRIMARY KEY,
    set_id TEXT NOT NULL,
    status TEXT,
    confidence INT,
    model_used TEXT,
    elapsed_sec REAL,
    vlm_response TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_checklist_set ON checklist_items(set_id);
CREATE INDEX IF NOT EXISTS idx_logs_created ON verification_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_set ON verification_logs(set_id);

-- ============================================================
-- RLS: Allow all (no auth required as per user request)
-- ============================================================
ALTER TABLE instrument_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on instrument_sets" ON instrument_sets
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all on checklist_items" ON checklist_items
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all on verification_logs" ON verification_logs
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Seed Data: Dressing Set
-- ============================================================
INSERT INTO instrument_sets (id, display_name, display_name_th)
VALUES ('dressing_set', 'Dressing Set', 'ชุดทำแผล')
ON CONFLICT (id) DO NOTHING;

INSERT INTO checklist_items (set_id, item_name, item_name_th, quantity, mode, sort_order) VALUES
    ('dressing_set', 'Tooth forceps', 'ปากคีบมีฟัน', 1, 'exact', 1),
    ('dressing_set', 'Non-tooth forceps', 'ปากคีบเรียบ', 1, 'exact', 2),
    ('dressing_set', 'Folded gauze', 'ก๊อซพับ', 5, 'present', 3),
    ('dressing_set', 'Small cotton balls', 'สำลีเล็ก', 10, 'present', 4);
