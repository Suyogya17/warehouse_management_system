const WAREHOUSE_PRINT_NAMES = new Map([
  [1, 'Warehouse 1'],
  [2, 'Warehouse 2'],
  [3, 'Warehouse 3'],
  [4, 'Dhalku (4)'],
  [5, 'Kalanki (5)'],
  [6, 'Dhalku (6)'],
]);

const FALLBACK_GROUPS = [...WAREHOUSE_PRINT_NAMES.entries()].map(
  ([warehouseNumber, name]) => ({
    code: `WAREHOUSE_${warehouseNumber}`,
    name,
    display_order: warehouseNumber,
    warehouse_ids: [warehouseNumber],
  })
);

const getOperationalWarehouseNumber = (warehouseId, warehouseName = '') => {
  const normalizedName = String(warehouseName || '').trim();
  const warehouseNumberMatch = normalizedName.match(
    /^(?:w|warehouse)\s*[-_>]*\s*(\d+)(?:\D|$)/i
  );
  const parentheticalNumberMatch = normalizedName.match(/\((\d+)\)\s*$/);

  return Number(
    warehouseNumberMatch?.[1] ||
      parentheticalNumberMatch?.[1] ||
      warehouseId ||
      0
  );
};

const fallbackGroupForWarehouse = (warehouseId, warehouseName = '') => {
  const id = Number(warehouseId);
  const warehouseNumber = getOperationalWarehouseNumber(id, warehouseName);
  const configuredName = WAREHOUSE_PRINT_NAMES.get(warehouseNumber);
  const name =
    configuredName ||
    String(warehouseName || `Warehouse ${warehouseNumber || id || ''}`).trim();

  return {
    code: `WAREHOUSE_${warehouseNumber || id || 'UNASSIGNED'}`,
    name: name || 'Unassigned Warehouse',
    display_order: warehouseNumber || 999,
    warehouse_ids: id > 0 ? [id] : [],
  };
};

const loadWarehousePrintGroupMap = async (client) => {
  const result = await client.query(
    'SELECT id, name FROM warehouses'
  );

  return new Map(
    result.rows.map((row) => [
      Number(row.id),
      fallbackGroupForWarehouse(row.id, row.name),
    ])
  );
};

const resolveWarehousePrintGroup = (
  warehouseId,
  warehouseName,
  configuredGroups = new Map()
) =>
  configuredGroups.get(Number(warehouseId)) ||
  fallbackGroupForWarehouse(warehouseId, warehouseName);

module.exports = {
  FALLBACK_GROUPS,
  WAREHOUSE_PRINT_NAMES,
  getOperationalWarehouseNumber,
  fallbackGroupForWarehouse,
  loadWarehousePrintGroupMap,
  resolveWarehousePrintGroup,
};
