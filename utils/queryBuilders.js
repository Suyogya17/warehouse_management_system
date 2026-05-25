const buildStockSummarySelect = (hasImageUrl) => `
  SELECT
    rm.id,
    rm.name,
    rm.article_code,
    rm.category,
    rm.color,
    rm.unit,
    rm.quantity,
    rm.min_quantity,
    ${hasImageUrl ? "rm.image_url" : "CAST(NULL AS CHAR) AS image_url"},
    rm.created_at,
    (rm.quantity <= rm.min_quantity) AS is_low_stock
  FROM raw_materials rm
`;

const productionHistorySelect = `
  SELECT
    p.id AS production_id,
    p.formula_id,
    p.finished_good_id,
    p.color,
    p.batches,
    p.qty_produced,
    p.notes,
    p.created_at AS produced_at,
    'COMPLETED' AS status,
    f.name AS formula_name,
    fg.name AS finished_good_name,
    fg.article_code AS finished_good_article_code,
    fg.sole_code,
    COALESCE(warehouse_summary.warehouse_names, CAST('' AS CHAR CHARACTER SET utf8mb4)) AS warehouse_names,
    u.name AS produced_by_name,
    u.email AS produced_by_email
  FROM production p
  JOIN formulas f ON f.id = p.formula_id
  JOIN finished_goods fg ON fg.id = p.finished_good_id
  LEFT JOIN users u ON u.id = p.produced_by
  LEFT JOIN (
    SELECT
      m.reference_id AS production_id,
      GROUP_CONCAT(
        CONCAT(
          CONVERT(w.name USING utf8mb4),
          CAST(' (' AS CHAR CHARACTER SET utf8mb4),
          CONVERT(CAST(CAST(m.quantity AS DECIMAL(10,2)) AS CHAR) USING utf8mb4),
          CAST(')' AS CHAR CHARACTER SET utf8mb4)
        )
        ORDER BY m.id
        SEPARATOR ', '
      ) AS warehouse_names
    FROM finished_good_warehouse_movements m
    JOIN warehouses w ON w.id = m.warehouse_id
    WHERE m.movement_type = 'PRODUCTION_IN'
      AND m.reference_type = 'production'
    GROUP BY m.reference_id
  ) warehouse_summary ON warehouse_summary.production_id = p.id
`;

module.exports = {
  buildStockSummarySelect,
  productionHistorySelect,
};