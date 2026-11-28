-- Security hardening and full product management.

/* ---------- admin roles and idle sign-out ---------- */

-- admins that already exist become owners; new rows get the smaller role unless told otherwise
ALTER TABLE admins ADD COLUMN role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'staff'));
ALTER TABLE admins ALTER COLUMN role SET DEFAULT 'staff';

ALTER TABLE admin_sessions ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();

/* ---------- collections managed in the admin panel ---------- */

ALTER TABLE collections ADD COLUMN blurb text NOT NULL DEFAULT '' CHECK (char_length(blurb) <= 120);
ALTER TABLE collections ADD COLUMN in_menu boolean NOT NULL DEFAULT false;
ALTER TABLE collections ADD CONSTRAINT collections_title_check CHECK (char_length(title) BETWEEN 1 AND 60);

/* ---------- deleted products ---------- */

-- the catalog import (npm run db:seed) skips these, so a deleted product does not come back
CREATE TABLE retired_products (
  id         bigint PRIMARY KEY,
  handle     text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

/* ---------- erasing customer details ---------- */

ALTER TABLE orders ADD COLUMN erased_at timestamptz;
ALTER TABLE orders DROP CONSTRAINT orders_phone_check;
ALTER TABLE orders ADD CONSTRAINT orders_phone_check CHECK (phone ~ '^[6-9][0-9]{9}$' OR (erased_at IS NOT NULL AND phone = ''));
ALTER TABLE orders DROP CONSTRAINT orders_pincode_check;
ALTER TABLE orders ADD CONSTRAINT orders_pincode_check CHECK (pincode ~ '^[1-9][0-9]{5}$' OR (erased_at IS NOT NULL AND pincode = ''));

/* ---------- activity log ---------- */

CREATE TABLE audit_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  actor      text NOT NULL DEFAULT '',   -- the username at the time; empty when nobody was signed in
  action     text NOT NULL,              -- for example product.update
  target     text NOT NULL DEFAULT '',   -- for example product:123 or order:JO-1001
  summary    text NOT NULL DEFAULT '',
  details    jsonb NOT NULL DEFAULT '{}',
  ip         text NOT NULL DEFAULT ''
);

CREATE FUNCTION refuse_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'the activity log can only be added to';
END;
$$;
CREATE TRIGGER audit_log_no_edit BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION refuse_audit_change();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION refuse_audit_change();

/* ---------- row-level security ---------- */

-- With it switched on and no policy, a database login sees no rows at all. This matters on hosts that
-- put a public data API in front of the database (Supabase does). The table owner, which runs the
-- migrations, is not restricted. A separate website login gets its own policies: npm run db:app-role.
-- Every new table needs the same line here and an entry in server/src/db-roles.js (a test checks both).
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE retired_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
