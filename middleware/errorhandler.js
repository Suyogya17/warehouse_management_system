const errorHandler = (err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  // Postgres unique violation
  if (err.code === '23505') {
    return res.status(409).json({
      success: false,
      message: 'Duplicate entry — this record already exists.',
      detail: err.detail,
    });
  }

  // Postgres foreign key violation
  if (err.code === '23503') {
    return res.status(400).json({
      success: false,
      message: 'Referenced record does not exist.',
      detail: err.detail,
    });
  }

  return res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
};

module.exports = errorHandler;