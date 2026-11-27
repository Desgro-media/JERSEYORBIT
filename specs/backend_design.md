# Backend and database design

## Goal

Give the existing static storefront a real backend without redesigning it or changing how customers pay.

## Acceptance criteria

1. The catalog is stored in a database. The storefront shows it without any change to its catalog code.
2. When a customer checks out, the system shall save the order before WhatsApp opens, and the message shall carry the order number.
3. The server shall work out every price and shipping fee itself. It never trusts amounts from the browser.
4. If the backend cannot be reached, checkout shall still send the order on WhatsApp, as it does today.
5. A customer can see an order's status with the order number **and** the phone number used on it.
6. The shop owner can sign in to manage orders, prices, stock, products and photos.
7. Counted stock shall never go below zero, even when two orders are confirmed at the same moment.
8. An unconfirmed order shall not reduce stock, so fake orders cannot empty the shop.
9. Customer details are readable only by a signed-in admin.

Out of scope: online payment, customer accounts, the "Orbit Wildcard" offer (it has no price yet), moving reviews or FAQ into the database.

## Technology choice

| Choice | Why | Alternatives set aside |
| --- | --- | --- |
| PostgreSQL | Transactions, row locks and constraints protect stock and money. Orders, items, sizes and products are relational. Managed hosting is easy to find. | SQLite: simpler, but needs a persistent disk next to a single server. MongoDB: weaker fit for relational order data. |
| Node.js + Fastify | Same language as the storefront. Request validation is built in. | Django: free admin screens, but adds a second language. Express: needs more add-ons for validation. |
| Plain SQL (`pg`) | Locking and constraints stay visible. No code generation. | An ORM would add a build step to a project that has none. |
| One server for site and API | Same origin, so no CORS setup and a stricter session cookie. | Separate frontend and API hosts. |

## How it fits the storefront

The server answers `/assets/js/data.js` with a file generated from the database, in the same shape as the static one. `core.js`, `shop.js` and `product.js` keep working as they are. On a plain static host the committed `data.js` is served instead, and checkout falls back to WhatsApp only.

## Data model

- `products` → `product_variants` (one row per size), `product_images`, `product_collections` → `collections`
- `orders` → `order_items` (copies title, size and price, so later edits do not rewrite history), `order_events` (status log)
- `admins` → `admin_sessions`

Money is stored as whole paise (integers). A size can be sold when it is switched on and its stock is either not counted (`NULL`) or above zero. The imported catalog has no quantities, so all sizes start as not counted.

## Order life cycle

`pending → confirmed → packed → shipped → delivered`. Any status before `delivered` can also move to `cancelled`.

- **Placing** an order checks that each size can be sold. It does not take stock.
- **Confirming** locks the size rows and takes counted stock. It fails if there is not enough.
- **Cancelling** puts back exactly what confirming took.

Payment status (`unpaid`, `paid`, `refunded`) is set by the admin and is separate from order status.

## API

| Method and path | Who | Purpose |
| --- | --- | --- |
| `GET /assets/js/data.js` | Public | Catalog for the storefront |
| `GET /api/health` | Public | Server and database check |
| `POST /api/orders` | Public | Place an order |
| `POST /api/orders/track` | Public | Status by order number and phone |
| `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/me` | Admin | Session |
| `GET /api/admin/summary` | Admin | Dashboard numbers |
| `GET /api/admin/orders`, `GET`/`PATCH /api/admin/orders/:id` | Admin | List, view, update |
| `GET`/`POST /api/admin/products`, `GET`/`PUT /api/admin/products/:id` | Admin | Catalog and stock |
| `POST /api/admin/products/:id/images`, `PUT .../images/order`, `DELETE .../images/:imageId` | Admin | Photos |

## Security checklist

| Area | Measure |
| --- | --- |
| Authentication | scrypt password hashes. Random session token; only its hash is stored. `HttpOnly`, `SameSite=Strict` cookie, `Secure` in production, 12-hour life. No default account. |
| Authorization | One admin role. A single hook protects every `/api/admin` route except login. |
| CSRF | Strict cookie, plus a custom request header and an `Origin` check on every admin write. No CORS. |
| Input | JSON schema on every body and query. Database constraints as a second line. |
| SQL injection | Parameterized queries only. |
| XSS | The admin screens escape all customer text. Content Security Policy blocks inline and outside scripts. |
| Data exposure | Tracking returns no name, address or admin note, and gives the same answer for a wrong phone as for a missing order. |
| Files | Only listed pages and `assets/` are served, never the repository folder. |
| Uploads | Real image decode, size and pixel limits, re-encoded to WebP (drops location data), random file names. |
| Abuse | Rate limits on login, ordering and tracking. A repeated submit returns the same order. Behind a proxy, `TRUST_PROXY` must list its addresses (Fastify ignores hop counts). |
| Logging | Failed sign-ins and admin changes are logged. Request bodies and query strings are not. |
| Secrets | Only in `.env`, which Git ignores. This repository is public. |
