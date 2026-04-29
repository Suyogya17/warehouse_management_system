ALTER TABLE raw_materials
DROP CONSTRAINT IF EXISTS raw_materials_category_check;

ALTER TABLE raw_materials
ADD CONSTRAINT raw_materials_category_check
CHECK (
  category IN (
    'Upper',
    'Sole',
    'Sole Powder',
    'Sole Foam',
    'TPR',
    'Lace',
    'Inner Box',
    'Outer Box',
    'Chemical',
    'Insole',
    'Adhesive',
    'Thread',
    'Toe Box',
    'Packing',
    'Other'
  )
);

ALTER TABLE finished_goods
ADD COLUMN IF NOT EXISTS inner_box_per_pair NUMERIC(10,2) NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS inner_boxes_per_outer_box NUMERIC(10,2);

ALTER TABLE formula_inputs
ADD COLUMN IF NOT EXISTS consumption_basis VARCHAR(30) NOT NULL DEFAULT 'PER_PAIR';

ALTER TABLE formula_inputs
DROP CONSTRAINT IF EXISTS formula_inputs_consumption_basis_check;

ALTER TABLE formula_inputs
ADD CONSTRAINT formula_inputs_consumption_basis_check
CHECK (consumption_basis IN ('PER_PAIR', 'PER_OUTER_BOX'));
