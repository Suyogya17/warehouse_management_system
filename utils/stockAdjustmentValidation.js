const validateStockAdjustmentInput = (body = {}) => {
  const finishedGoodId = Number(body.finished_good_id);
  const quantity = Number(body.qty);
  const reason = body.reason == null ? '' : String(body.reason).trim();

  if (!Number.isInteger(finishedGoodId) || finishedGoodId <= 0) {
    return { error: 'finished_good_id must be a positive integer.' };
  }

  if (!Number.isInteger(quantity) || quantity === 0) {
    return { error: 'qty must be a non-zero integer.' };
  }

  if (reason.length > 500) {
    return { error: 'reason can be up to 500 characters.' };
  }

  return {
    value: {
      finishedGoodId,
      quantity,
      reason: reason || null,
    },
  };
};

module.exports = { validateStockAdjustmentInput };
