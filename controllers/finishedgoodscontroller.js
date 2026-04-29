const { query } = require('../config/db');
const auditLog   = require('../utils/auditLog');
const { hasColumn } = require('../utils/schemaSupport');

const getImagePath = (req) => (req.file ? `/uploads/${req.file.filename}` : null);
const baseSelect = (supportsImage, supportsVisibility) =>
  [
    "id",
    "name",
    "article_code",
    "sole_code",
    "color",
    "size",
    "unit",
    "quantity",
    "min_quantity",
    "created_at",
    supportsImage ? "image_url" : "NULL::VARCHAR AS image_url",
    supportsVisibility ? "is_visible" : "TRUE::BOOLEAN AS is_visible",
  ].join(", ");

// ─── LIST ALL ─────────────────────────────────────────────────────────────────
// const getAll = async (req, res, next) => {
//   try {
//     const { article_code } = req.query;
//     const supportsImage = await hasColumn("finished_goods", "image_url");
//     const supportsVisibility = await hasColumn("finished_goods", "is_visible");
//     let sql = `SELECT ${baseSelect(supportsImage, supportsVisibility)} FROM finished_goods WHERE 1=1`;
//     const params = [];

//     if (article_code) {
//       params.push(article_code);
//       sql += ` AND article_code ILIKE $${params.length}`;
//     }

//     if (req.user?.role === "USER" && supportsVisibility) {
//       sql += ` AND is_visible = TRUE`;
//     }

//     sql += ' ORDER BY article_code, color';
//     const result = await query(sql, params);
//     return res.json({ success: true, count: result.rows.length, data: result.rows });
//   } catch (err) {
//     next(err);
//   }
// };

// const getAll = async (req, res, next) => {
//   try {
//     const { article_code } = req.query;
//     const userId = req.user.id;      // ← Get from JWT token
//     const userRole = req.user.role;  // ← Get from JWT token

//     let sql;
//     const params = [];

//     // ────────────────────────────────────────────────────────────────────────
//     // ADMIN & STORE_KEEPER: See ALL products
//     // ────────────────────────────────────────────────────────────────────────
//     if (userRole === 'ADMIN' || userRole === 'STORE_KEEPER') {
//       sql = 'SELECT * FROM finished_goods WHERE 1=1';
      
//       if (article_code) {
//         params.push(article_code);
//         sql += ` AND article_code ILIKE $${params.length}`;
//       }

//     // ────────────────────────────────────────────────────────────────────────
//     // USER: Only see products they have permission for
//     // ────────────────────────────────────────────────────────────────────────
//     } else if (userRole === 'USER') {
//       sql = `
//         SELECT fg.* 
//         FROM finished_goods fg
//         INNER JOIN user_product_permissions upp 
//           ON upp.finished_good_id = fg.id
//         WHERE upp.user_id = $1 
//           AND upp.can_view = TRUE
//       `;
//       params.push(userId);

//       if (article_code) {
//         params.push(article_code);
//         sql += ` AND fg.article_code ILIKE $${params.length}`;
//       }
//     } else {
//       // Fallback: unknown role sees nothing
//       return res.json({ success: true, count: 0, data: [] });
//     }

//     sql += ' ORDER BY fg.article_code, fg.color';
//     const result = await query(sql, params);
    
//     return res.json({ success: true, count: result.rows.length, data: result.rows });
//   } catch (err) {
//     next(err);
//   }
// };
const getAll = async (req, res, next) => {
  try {
    const { article_code } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    let sql;
    const params = [];

    // ────────────────────────────────────────────────────────────────────────
    // ADMIN & STORE_KEEPER: See ALL products
    // ────────────────────────────────────────────────────────────────────────
    if (userRole === 'ADMIN' || userRole === 'STORE_KEEPER') {
      sql = 'SELECT * FROM finished_goods WHERE 1=1';
      
      if (article_code) {
        params.push(article_code);
        sql += ` AND article_code ILIKE $${params.length}`;
      }

      sql += ' ORDER BY article_code, color';  // ← NO alias here

    // ────────────────────────────────────────────────────────────────────────
    // USER: Only see products they have permission for
    // ────────────────────────────────────────────────────────────────────────
    } else if (userRole === 'USER') {
      sql = `
        SELECT fg.* 
        FROM finished_goods fg
        INNER JOIN user_product_permissions upp 
          ON upp.finished_good_id = fg.id
        WHERE upp.user_id = $1 
          AND upp.can_view = TRUE
      `;
      params.push(userId);

      if (article_code) {
        params.push(article_code);
        sql += ` AND fg.article_code ILIKE $${params.length}`;
      }

      sql += ' ORDER BY fg.article_code, fg.color';  // ← WITH alias here

    } else {
      // Unknown role sees nothing
      return res.json({ success: true, count: 0, data: [] });
    }

    const result = await query(sql, params);
    
    return res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    next(err);
  }
};


// ─── GET ONE ──────────────────────────────────────────────────────────────────
// const getOne = async (req, res, next) => {
//   try {
//     const supportsImage = await hasColumn("finished_goods", "image_url");
//     const supportsVisibility = await hasColumn("finished_goods", "is_visible");
//     const result = await query(
//       `SELECT ${baseSelect(supportsImage, supportsVisibility)} FROM finished_goods WHERE id=$1`,
//       [req.params.id]
//     );
//     if (result.rows.length === 0) {
//       return res.status(404).json({ success: false, message: 'Finished good not found' });
//     }
//     return res.json({ success: true, data: result.rows[0] });
//   } catch (err) {
//     next(err);
//   }
// };

const getOne = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const productId = req.params.id;

    let result;

    if (userRole === 'ADMIN' || userRole === 'STORE_KEEPER') {
      // Admin/Store Keeper can see any product
      result = await query('SELECT * FROM finished_goods WHERE id = $1', [productId]);
    } else if (userRole === 'USER') {
      // User can only see if they have permission
      result = await query(
        `SELECT fg.* 
         FROM finished_goods fg
         INNER JOIN user_product_permissions upp 
           ON upp.finished_good_id = fg.id
         WHERE fg.id = $1 
           AND upp.user_id = $2 
           AND upp.can_view = TRUE`,
        [productId, userId]
      );
    } else {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found or access denied' });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─── CREATE ───────────────────────────────────────────────────────────────────
const create = async (req, res, next) => {
  try {
    const {
      name,
      article_code,
      sole_code,
      color,
      size,
      unit,
      min_quantity,
      inner_box_per_pair,
      inner_boxes_per_outer_box,
    } = req.body;
    const image_url = getImagePath(req);
    const supportsImage = await hasColumn("finished_goods", "image_url");
    const supportsVisibility = await hasColumn("finished_goods", "is_visible");
    const supportsInnerBoxPerPair = await hasColumn("finished_goods", "inner_box_per_pair");
    const supportsInnerBoxesPerOuterBox = await hasColumn("finished_goods", "inner_boxes_per_outer_box");

    const columns = ["name", "article_code", "sole_code", "color", "size", "unit", "quantity", "min_quantity"];
    const values = [name, article_code, sole_code || null, color || null, size || null, unit || 'pairs', 0, min_quantity || 5];

    if (supportsImage) {
      columns.push("image_url");
      values.push(image_url);
    }

    if (supportsVisibility) {
      columns.push("is_visible");
      values.push(false);
    }

    if (supportsInnerBoxPerPair) {
      columns.push("inner_box_per_pair");
      values.push(inner_box_per_pair || 1);
    }

    if (supportsInnerBoxesPerOuterBox) {
      columns.push("inner_boxes_per_outer_box");
      values.push(inner_boxes_per_outer_box || null);
    }

    const placeholders = values.map((_, index) => `$${index + 1}`).join(",");
    const result = await query(
      `INSERT INTO finished_goods (${columns.join(",")})
       VALUES (${placeholders}) RETURNING *`,
      values
    );

    await auditLog({
      userId: req.user.id, action: 'CREATED', tableName: 'finished_goods',
      recordId: result.rows[0].id, detail: `Created finished good: ${name}`,
    });

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────
const update = async (req, res, next) => {
  try {
    const {
      name,
      article_code,
      sole_code,
      color,
      size,
      unit,
      min_quantity,
      inner_box_per_pair,
      inner_boxes_per_outer_box,
    } = req.body;
    const image_url = getImagePath(req);
    const supportsImage = await hasColumn("finished_goods", "image_url");
    const supportsInnerBoxPerPair = await hasColumn("finished_goods", "inner_box_per_pair");
    const supportsInnerBoxesPerOuterBox = await hasColumn("finished_goods", "inner_boxes_per_outer_box");

    const updates = [
      "name=$1",
      "article_code=$2",
      "sole_code=$3",
      "color=$4",
      "size=$5",
      "unit=$6",
      "min_quantity=$7",
    ];
    const values = [name, article_code, sole_code || null, color || null, size || null, unit || 'pairs', min_quantity];

    if (supportsImage && image_url) {
      values.push(image_url);
      updates.push(`image_url=$${values.length}`);
    }

    if (supportsInnerBoxPerPair) {
      values.push(inner_box_per_pair || 1);
      updates.push(`inner_box_per_pair=$${values.length}`);
    }

    if (supportsInnerBoxesPerOuterBox) {
      values.push(inner_boxes_per_outer_box || null);
      updates.push(`inner_boxes_per_outer_box=$${values.length}`);
    }

    values.push(req.params.id);
    const result = await query(
      `UPDATE finished_goods
       SET ${updates.join(", ")}
       WHERE id=$${values.length}
       RETURNING *`,
      values
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Finished good not found' });
    }
    await auditLog({
      userId: req.user.id, action: 'UPDATED', tableName: 'finished_goods',
      recordId: result.rows[0].id, detail: `Updated finished good: ${result.rows[0].name}`,
    });
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─── VISIBILITY ───────────────────────────────────────────────────────────────
const setVisibility = async (req, res, next) => {
  try {
    const supportsVisibility = await hasColumn("finished_goods", "is_visible");

    if (!supportsVisibility) {
      return res.status(400).json({
        success: false,
        message: 'Visibility control is not enabled in the database yet. Run sql/add-soft-delete-and-visibility.sql first.',
      });
    }

    const { is_visible } = req.body;
    const result = await query(
      `UPDATE finished_goods
       SET is_visible = $1
       WHERE id = $2
       RETURNING id, name, is_visible`,
      [Boolean(is_visible), req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Finished good not found' });
    }

    await auditLog({
      userId: req.user.id,
      action: 'UPDATED',
      tableName: 'finished_goods',
      recordId: result.rows[0].id,
      detail: `${result.rows[0].is_visible ? 'Displayed' : 'Hidden'} finished good: ${result.rows[0].name}`,
    });

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE ───────────────────────────────────────────────────────────────────
const remove = async (req, res, next) => {
  try {
    const usageChecks = await Promise.all([
      query('SELECT COUNT(*) FROM formulas WHERE finished_good_id = $1', [req.params.id]),
      query('SELECT COUNT(*) FROM production WHERE finished_good_id = $1', [req.params.id]),
    ]);

    const usage = {
      formulas: Number(usageChecks[0].rows[0].count),
      production_runs: Number(usageChecks[1].rows[0].count),
    };

    const blockingReferences = usage.formulas + usage.production_runs;

    if (blockingReferences > 0) {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete this finished good because it is already used in formulas or production history.',
        usage,
      });
    }

    const result = await query('DELETE FROM finished_goods WHERE id=$1 RETURNING id, name', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Finished good not found' });
    }
    return res.json({ success: true, message: 'Deleted successfully' });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete this finished good because it is already referenced by other records.',
      });
    }
    next(err);
  }
};

module.exports = { getAll, getOne, create, update, remove, setVisibility };
