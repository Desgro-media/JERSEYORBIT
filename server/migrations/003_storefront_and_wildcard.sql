-- Home page slideshow, catalog thumbnails and the Orbit Wildcard.

/* ---------- settings the admin panel changes ---------- */

CREATE TABLE settings (
  key        text PRIMARY KEY,        -- 'hero', 'thumbnails' or 'wildcard'
  value      jsonb NOT NULL,
  version    integer NOT NULL DEFAULT 1,   -- stops one edit silently overwriting another
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER settings_updated_at BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- photos uploaded for the slideshow and thumbnails; product photos stay with their product
CREATE TABLE site_images (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  width      integer NOT NULL CHECK (width > 0),
  height     integer NOT NULL CHECK (height > 0),
  url_small  text NOT NULL,
  url_large  text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

/* ---------- Orbit Wildcard ---------- */

-- set on wildcard orders only: the day in India the surprise jersey was claimed
ALTER TABLE orders ADD COLUMN wildcard_date date;
CREATE INDEX orders_wildcard_idx ON orders (wildcard_date) WHERE wildcard_date IS NOT NULL;
-- one live wildcard per phone number per day, even if two requests arrive together
CREATE UNIQUE INDEX orders_wildcard_phone_key ON orders (wildcard_date, phone)
  WHERE wildcard_date IS NOT NULL AND status <> 'cancelled' AND erased_at IS NULL;

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_images ENABLE ROW LEVEL SECURITY;
