ALTER TABLE users
  ADD COLUMN country_code CHAR(2) NOT NULL DEFAULT 'NP' AFTER role,
  ADD COLUMN currency_code CHAR(3) NOT NULL DEFAULT 'NPR' AFTER country_code;
