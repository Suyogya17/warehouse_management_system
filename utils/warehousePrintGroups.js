const FALLBACK_GROUPS = [
  {
    code: 'FACTORY_WAREHOUSE',
    name: 'Factory Warehouse',
    display_order: 1,
    warehouse_ids: [1, 2, 3],
  },
  {
    code: 'DHALKU',
    name: 'Dhalku',
    display_order: 2,
    warehouse_ids: [4, 6],
  },
  {
    code: 'KALANKI',
    name: 'Kalanki',
    display_order: 3,
    warehouse_ids: [5],
  },
];

const fallbackGroupForWarehouse = (warehouseId, warehouseName = '') => {
  const id = Number(warehouseId);
  const normalizedName = String(warehouseName || '').trim();
  const warehouseNumberMatch = normalizedName.match(
    /^(?:w|warehouse)[ _-]*(\d+)(?:\D|$)/i
  );
  const warehouseNumber = Number(warehouseNumberMatch?.[1] || 0);
  const configured = FALLBACK_GROUPS.find((group) =>
    group.warehouse_ids.includes(warehouseNumber || id)
  );

  if (configured) return { ...configured };

  const name = String(warehouseName || `Warehouse ${id || ''}`).trim();
  return {
    code: `WAREHOUSE_${id || 'UNASSIGNED'}`,
    name: name || 'Unassigned Warehouse',
    display_order: 999,
    warehouse_ids: id > 0 ? [id] : [],
  };
};

const loadWarehousePrintGroupMap = async (client, hasConfiguredGroups) => {
  if (!hasConfiguredGroups) return new Map();

  const result = await client.query(
    `SELECT members.warehouse_id,
            print_group.code,
            print_group.name,
            print_group.display_order
     FROM warehouse_print_group_members members
     JOIN warehouse_print_groups print_group
       ON print_group.id = members.print_group_id
     WHERE print_group.is_active = 1`
  );

  return new Map(
    result.rows.map((row) => [
      Number(row.warehouse_id),
      {
        code: row.code,
        name: row.name,
        display_order: Number(row.display_order || 0),
      },
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
  fallbackGroupForWarehouse,
  loadWarehousePrintGroupMap,
  resolveWarehousePrintGroup,
};
