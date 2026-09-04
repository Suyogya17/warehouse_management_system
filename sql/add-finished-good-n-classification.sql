-- Optional N-series classification shown on finished-good product cards.
ALTER TABLE finished_goods
  ADD COLUMN n_classification VARCHAR(2) NULL AFTER is_commission;
