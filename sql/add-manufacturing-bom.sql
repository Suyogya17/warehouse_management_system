-- -- NOTE: MySQL does NOT support DROP CONSTRAINT IF EXISTS like PostgreSQL
-- -- So we skip dropping checks safely

-- -- raw_materials category constraint (MySQL-safe approach)
-- -- (MySQL may ignore CHECK depending on version, so treat as documentation-level validation)

-- ALTER TABLE raw_materials
-- ADD CONSTRAINT raw_materials_category_check
-- CHECK (
--   category IN (
--     'Upper',
--     'Sole',
--     'Sole Powder',
--     'Sole Foam',
--     'TPR',
--     'Lace',
--     'Inner Box',
--     'Outer Box',
--     'Chemical',
--     'Insole',
--     'Adhesive',
--     'Thread',
--     'Toe Box',
--     'Packing',
--     'Other'
--   )
-- );

-- -- finished_goods columns (run only once)
-- ALTER TABLE finished_goods
-- ADD COLUMN inner_box_per_pair DECIMAL(10,2) NOT NULL DEFAULT 1,
-- ADD COLUMN inner_boxes_per_outer_box DECIMAL(10,2);

-- -- formula_inputs column
-- ALTER TABLE formula_inputs
-- ADD COLUMN consumption_basis VARCHAR(30) NOT NULL DEFAULT 'PER_PAIR';

-- -- MySQL does NOT support DROP CONSTRAINT IF EXISTS safely
-- -- So we skip it or handle manually if needed

-- -- consumption_basis validation (MySQL CHECK - optional support)
-- ALTER TABLE formula_inputs
-- ADD CONSTRAINT formula_inputs_consumption_basis_check
-- CHECK (consumption_basis IN ('PER_PAIR', 'PER_OUTER_BOX'));