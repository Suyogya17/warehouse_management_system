ALTER TABLE users
  ADD COLUMN exchange_rate DECIMAL(12,6) NOT NULL DEFAULT 1.000000 AFTER currency_code;

-- exchange_rate means: how many NPR equal 1 unit of the user's currency.
-- Example: 1 INR = 1.60 NPR, so an NPR price is divided by 1.60 to display INR.
