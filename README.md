# JERSEYORBIT

The Jersey Orbit shop: a plain HTML, CSS and JavaScript storefront with no build step, and a backend in [`server/`](server/) that adds saved orders, order tracking, stock and an admin panel.

| Part | Built with |
| --- | --- |
| Storefront | HTML, CSS, JavaScript |
| Backend | Node.js and Fastify |
| Database | PostgreSQL |

The design decisions are in [`specs/backend_design.md`](specs/backend_design.md). The 20-point security checklist, roles and activity log are in [`specs/security_and_admin_design.md`](specs/security_and_admin_design.md).

## Run it with the backend

You need Node.js 22.12 or newer, and Docker Desktop (or any PostgreSQL 14+ database).

```sh
cd server
npm install
cp .env.example .env     # then edit it if you use your own database
npm run db:up            # starts PostgreSQL in Docker (skip with your own database)
npm run db:setup         # creates the tables and imports the catalog
npm run admin:create     # choose your admin username and password
npm start
```

- Shop: <http://localhost:4000>
- Admin panel: <http://localhost:4000/admin/>

Keep `NODE_ENV=development` in `.env` on your own computer. Without it the server runs in live mode, which refuses the local database password.

There is no default admin account. Run `npm run admin:create` again to reset a password. New database changes are applied automatically when the server starts. Admins that already existed become owners, and their password hashes are strengthened at their next sign-in.

## The admin panel

| Screen | What you can do |
| --- | --- |
| **Dashboard** | See what needs doing (refunds due, late dispatch, unpaid or waiting orders), latest orders, wildcard places, stock, and sales over 7, 30 or 90 days with charts, top jerseys, sizes and delivery areas. |
| **Storefront** | Change the home page slideshow (photos, texts, order, visibility) and the thumbnail of every catalog category. Upload a photo, pick one from a product, or leave it automatic. |
| **Wildcard** | Take orders, show “coming soon” or hide it. Set the price, places per day, and which jerseys can be picked (owner only). |
| **Products** | Search, filter (on website, hidden, sold out, low stock), sort. Add a jersey with its photos and publish it in one step. Change its name, details, sizes, prices, stock, photos, collections and web address. Duplicate it, move it in the "Featured" order, or delete it. |
| **Bulk changes** | Select several products to show or hide them, set a price, take a percentage off, end a sale, mark sold out or back on sale, add to or remove from a collection, move to the top, or delete. |
| **Collections** | Add your own categories. Each one appears in the shop menu once it has a product on the website. The built-in ones are named in `config.js`. |
| **Orders** | Confirm, pack, ship and cancel, record payment, and message the customer on WhatsApp. |
| **Activity** | Who changed what, and when. |
| **Account** | Change your password, or sign out your other devices. |

### The Orbit Wildcard

It stays “coming soon” until an owner sets a price and opens it. The server picks a random jersey in the buyer's size, at most the set number a day and one per phone number. The buyer never sees which jersey it is. The website takes no payment, so a fake order can hold a place until you cancel it. Details: [`specs/storefront_wildcard_dashboard_design.md`](specs/storefront_wildcard_dashboard_design.md).

## Admins and roles

| Role | Can |
| --- | --- |
| **Owner** | Everything. |
| **Staff** | Manage orders, products and the storefront. Staff cannot delete products or collections, change wildcard settings, erase customer details or read the activity log. |

Accounts can only be added or removed from the command line on the server:

```sh
npm run admin:create                   # add an admin, or reset a password
npm run admin:remove -- their-name     # remove one and sign them out
```

The first account is the owner. Later ones are staff unless you choose otherwise. An admin is signed out after an hour without use, and always after 12 hours.

## Run the storefront alone

```sh
python -m http.server 8123 --bind 127.0.0.1
```

Then open <http://localhost:8123/index.html>. Without the backend the catalog comes from `assets/js/data.js`, and orders go out on WhatsApp without being saved. Keep `--bind 127.0.0.1`: without it, other devices on your network could read files in this folder, including `server/.env`.

## How ordering works

1. The customer adds jerseys to the cart and enters delivery details on `checkout.html`.
2. The backend works out the total, saves the order and gives it a number such as `JO-1001`.
3. WhatsApp opens with the order and its number. The website takes no payment.
4. In the admin panel, check the payment, mark the order **Paid** and press **Confirm order**.
5. Move it on to **Packed**, **Shipped** (add the courier and tracking ID) and **Delivered**. Each order has a **WhatsApp customer** button with an update already written.

The customer can check progress on the Order Tracking page with the order number and phone number.

**Trust the admin panel, not the WhatsApp text.** A customer can edit the message before sending it. The saved order holds the real items and total. A message with no order number means the backend could not be reached, so check its prices by hand.

If the backend refuses an order (a size sold out, or the price changed), the customer is told why and no message is sent.

## Stock

- A size with an **empty** stock box is not counted. Switch **On sale** off when it sells out. All imported products start this way.
- A size with a **number** is counted. It shows as sold out at 0.
- Placing an order does **not** reduce stock, so unpaid or fake orders cannot empty the shop. **Confirming** does. **Cancelling** puts it back.
- If there is not enough stock left, the order cannot be confirmed.
- For returned jerseys that are damaged, cancelling still adds them back. Correct the number afterwards.

## Editing

| To change | Where |
| --- | --- |
| Products, prices, stock, photos, your own collections | Admin panel (changes show within seconds) |
| Text, menu, FAQ, shipping fees, size chart, built-in collection names | `assets/js/config.js` (the backend reads the shipping fees from here too) |
| Customer reviews | `chatReviews` in `config.js`, with images in `assets/img/reviews/` |
| Design | `assets/css/main.css` |

Once the backend is running, the database is the catalog. `assets/js/data.js` is only used for the first import and when the storefront runs alone, so admin changes do not appear in it. `npm run db:seed` adds products that are missing from the database. It never overwrites existing ones, and never brings back one you deleted.

`tools/sync-products.mjs` and `tools/localize-images.mjs` imported the catalog from the previous store. Running the first one again replaces `data.js`. If you do, run the second one straight after.

**Review screenshots:** crop or blur phone numbers, names, profile photos, faces and addresses before adding them. This repo is public, so never commit an original screenshot.

## Tests

```sh
cd server
npm run db:up
npm test
npm run security:audit   # known problems in the packages, and their registry signatures
```

The tests use a separate database ending in `_test`, which they create and wipe. They cover pricing, stock when two orders compete, product management, and the security checklist (including a run of the whole shop with the least-privilege database login). They need a database login that may create roles, which the Docker one can.

On GitHub, [`.github/workflows/checks.yml`](.github/workflows/checks.yml) runs the tests and the package check on every push and every Monday, and Dependabot proposes package updates.

**Adding a package:** check on npmjs.com that it is the real one (publisher, source repository, age and downloads) before adding it to the approved list in `server/test/security.test.js`. Package install scripts are switched off in `server/.npmrc`.

## Going live

The backend serves the shop and the API together, so it needs a host that runs Node.js. A static host such as GitHub Pages can only run the storefront alone.

1. Create a managed PostgreSQL database and turn on its automatic backups.
2. Deploy the **whole repository**. Install with `npm ci --prefix server` and start with `npm start --prefix server`.
3. Set `DATABASE_URL`, `NODE_ENV=production`, `HOST=0.0.0.0`, and `PORT` if the host does not set it.
4. Set `TRUST_PROXY` to your host's proxy addresses (see `server/.env.example`). If the log says `untrusted proxy`, it is still wrong, and all visitors are sharing one rate limit.
5. Give the app a **persistent disk** and point `UPLOAD_DIR` at it. Otherwise uploaded photos disappear on the next deploy. Back up that folder too.
6. Use HTTPS. In production the admin cannot stay signed in without it.
7. With `DATABASE_URL` set to the live database, run `npm run db:setup` and `npm run admin:create` once. New database changes are applied automatically when the server starts.
8. Recommended: run `npm run db:app-role`. Put the connection it prints in `DATABASE_URL`, and the one you used before in `DATABASE_OWNER_URL`. The website then cannot create admins, change roles, delete orders or edit the activity log. After this, apply new database changes with `npm run db:migrate`. For the strongest separation, keep `DATABASE_OWNER_URL` only where you run those commands, not in the running website's settings.

Run one copy of the app. Rate limits are counted in its memory, and uploads are on its disk.

Never upload the `server/` folder to a static file host, and never commit `.env`.

## Before launch

- Replace the placeholder size chart in `config.js` with real garment measurements.
- Write a privacy policy and terms of service. The site only has shipping and refund policies. This matters more now that the backend **stores customers' names, phone numbers and addresses**, and the activity log stores admins' IP addresses. Decide how long you keep them. An owner can erase the customer's details from a delivered or cancelled order. Nothing is erased automatically.
- Use a long, unique admin password.
- A plain static host such as GitHub Pages cannot send security headers. The pages carry a backup policy in a `<meta>` tag, but protection against other sites framing the shop needs the backend, or a host that can set headers.
