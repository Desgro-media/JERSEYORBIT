# Dashboard, home page editing and the Orbit Wildcard

Builds on [`security_and_admin_design.md`](security_and_admin_design.md). The shop keeps its look.

## Research notes

- Small shops do best with a few core numbers: sales, orders and average order value. Store admins such as [Shopify's home page](https://help.shopify.com/en/manual/shopify-admin/shopify-home) list work that is waiting, grouped by task with a count for each. So the dashboard puts work waiting first, and numbers second.
- Mystery-box terms such as [FUTBIN's](https://www.futbin.com/mysteryshirt/terms) say plainly what is inside: one jersey picked at random from a pool. Our checkout says the same, plus the return rule.
- For India, the search found no rule written for random-item sales; general consumer protection law applies ([overview](https://www.mondaq.com/india/gaming/1513750)). This is not legal advice. Telling buyers exactly what they get is the minimum.

## 1. Logic problems found in the audit

All 250 imported products open and save in the editor without errors. These were wrong:

| Problem | Fix |
| --- | --- |
| A list page past the end said "No products match" | The list goes to the last page |
| Removing a size that is in a waiting order meant confirming took no stock, silently | The editor asks first, and the order shows the missing size |
| Order search did not find a phone typed with spaces or +91 | Phone searches compare digits only |
| The shop's 2XL filter missed jerseys labelled XXL | XXL counts as 2XL (and XXXL as 3XL) |
| Nothing pointed out a cancelled order still marked paid | Listed under "Needs your attention" as a possible refund |

## 2. Dashboard

Days are Indian calendar days. Periods are the last 7, 30 or 90 days including today, compared with the same number of days before.

| Number | Meaning |
| --- | --- |
| Paid sales | Totals, including shipping, of orders marked paid and not cancelled, counted on the day they were placed |
| Paid orders, average order | The same orders: how many, and sales divided by that number |
| Items sold | Quantities in those orders |
| Orders placed | Every order placed that has not been cancelled, paid or not |
| Cancelled | Cancelled orders, by the day they were placed |

**Needs your attention** (right now, whatever the period): orders waiting to be confirmed (with the oldest's age), confirmed over 24 hours ago and not shipped (the shop promises dispatch within 24 hours), past confirmation but not marked paid, cancelled but marked paid, waiting orders with a size that no longer exists, and wildcard problems. Each links to a list showing exactly those orders.

Also: order pipeline, latest orders, today's wildcard places, catalog health, low stock, daily sales and daily orders (two charts, never one chart with two scales), top jerseys, sizes sold, Kerala against the rest of India, and latest activity (owners).

## 3. Home page slideshow and catalog thumbnails

- A new **Storefront** screen. Each slide has two photo places, its texts, the collection its button opens, and a visible switch. Slides can be added (up to 6), removed and reordered. "Use the website's defaults" returns to `config.js`.
- Each photo place and each catalog thumbnail is **automatic** (as now), an **uploaded photo**, or a **product photo** picked from the catalog.
- Product photos are stored as references. If the photo is deleted, or its product hidden, the shop falls back to automatic, and the screen says why.
- Uploads go through the same checks as product photos. Uploads that nothing uses any more are deleted.
- The settings reach the shop in the catalog file. Without the backend, the shop keeps using `config.js`.
- Automatic photos are picked by the website's own code (`assets/js/core.js`), run on the server, so the admin preview cannot drift from the shop.

## 4. Orbit Wildcard

**Owner settings:** taking orders / "coming soon" (as today, the default) / hidden; price; places per day (1 to 500, default 5); which jerseys can be picked (all, or one collection). It cannot take orders without a price.

**Rules, all enforced by the server:**

1. At most the set number of wildcard orders per Indian day. One lock serialises claims, so simultaneous requests cannot exceed it.
2. One per phone number per day ("5 people", not 5 orders). A unique index backs this up.
3. A cancelled order frees its place. Orders from earlier days never count.
4. The jersey is picked with `crypto.randomInt` from published, non-sock jerseys in the pool that can be sold in the chosen size. A counted size must have stock beyond what waiting wildcard orders already hold. Jerseys already picked today are skipped while others remain.
5. **The buyer never learns the jersey from the website:** not in the order reply, the tracking page, the catalog file or the WhatsApp message. The admin sees it, to pack it.
6. Sending the same order twice returns the first one; it never picks again.
7. A waiting wildcard order can be given **another random jersey** (for example if the first is damaged). It is logged.
8. If the server cannot be reached, no wildcard order is sent, because the limit could not be checked.

**Known limit:** the site takes no payment, so someone could claim places with made-up phone numbers. Claims are rate limited, and cancelling a fake order frees its place at once.

## 5. Data (`003_storefront_and_wildcard.sql`)

`settings` (one JSON row per setting, with a version number), `site_images` (uploads for slides and thumbnails), `orders.wildcard_date`, and a unique index on the date and phone of live wildcard orders. Row-level security and least-privilege grants as for every table.

## 6. API and permissions

| Method and path | Who |
| --- | --- |
| `GET /api/wildcard`, `POST /api/wildcard/orders` | Public, rate limited |
| `GET /api/admin/summary?days=` | Admin |
| `GET /api/admin/storefront`, `PUT .../hero`, `DELETE .../hero`, `PUT .../thumbnails/:key` | Admin |
| `POST /api/admin/site-images`, `GET /api/admin/photos` | Admin |
| `GET /api/admin/wildcard` | Admin |
| `PUT /api/admin/wildcard` | **Owner** |
| `POST /api/admin/orders/:id/reroll` | Admin |

## 7. Security checkpoint

- **Authorisation:** the existing hooks cover the new admin routes, and the route-list tests check every one. Wildcard settings are owner only.
- **Input:** every body and query has a schema; photo references are `{kind, id}` pairs that must exist.
- **Output:** slide texts are escaped by the shop's existing code. Wildcard replies are built without the jersey's name.
- **Abuse:** both public wildcard routes are rate limited.
- **Logging:** every settings change and re-pick goes to the activity log, without customer details.
