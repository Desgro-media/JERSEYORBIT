# Security hardening and full product management

Builds on [`backend_design.md`](backend_design.md). The storefront keeps its look.

## 1. The 20-point security checklist

"Already covered" means the code before this change handled it. It now also has a test.

| # | Item | State before | What this change does |
| --- | --- | --- | --- |
| 1 | SQL injection | Already covered: every value is a query parameter | New sort and filter options pick from fixed lists. Tests. |
| 2 | Prompt injection | Does not apply: there is no AI or language-model feature | Nothing to fix. If one is added, treat order notes and product text as untrusted input. |
| 3 | Row-level security | Missing | Switched on for every table, so any database login without a policy sees no rows. Optional least-privilege login for the website. |
| 4 | Mass assignment | Already covered: each request lists its allowed fields, and others are dropped | New requests follow the same rule. Tests. |
| 5 | Privilege escalation | One all-powerful role. No way to sign up. | `owner` and `staff` roles, set only from the command line. The least-privilege login cannot create admins or change roles. |
| 6 | Open redirects | Already covered: one fixed redirect | Test. |
| 7 | Command injection | Already covered: the server never runs shell commands | Test that fails if that changes. |
| 8 | Audit logging | Server console only | Activity log in the database that can only be added to, with an admin screen. |
| 9 | Hardcoded secrets | None found in files or Git history | Live mode refuses the local development password. Test that scans the files. |
| 10 | Weak hashing | scrypt N=2^15, r=8, p=1, below OWASP's minimum | p=3 (an OWASP-listed setting). Old hashes are upgraded at the next sign-in. |
| 11 | Slopsquatting | Not checked | Checked: all packages come from the npm registry with integrity hashes. Install scripts are off. A test fails when a new package appears. |
| 12 | Dependency CVEs | No routine check | `npm run security:audit`, a weekly GitHub check and Dependabot. |
| 13 | SRI hashes | Does not apply: no scripts or styles come from other sites | A test fails if one is added without a hash. Hashes on the site's own files would break the site whenever `config.js` is edited, and add no protection. |
| 14 | CSP headers | Set by the server only | Blocks injected `<style>` tags and inline event handlers. Stricter policy for the admin. A `<meta>` policy covers plain static hosting. |
| 15 | Clickjacking | `frame-ancestors 'none'`, but `X-Frame-Options: SAMEORIGIN` | `DENY`. A static host must send these headers itself. |
| 16 | Public bucket | No cloud bucket. The upload folder served any file in it. | Only generated photo names are served. An upload folder that contains the app is refused. |
| 17 | Debug mode | Safe settings only when `NODE_ENV=production` | Safe by default. Development mode must be asked for. |
| 18 | Token expiry | 12-hour limit | Also signed out after 60 idle minutes. Changing the password replaces every session. "Sign out other devices". |
| 19 | Insecure deserialization | Already covered: JSON only, prototype keys refused | Test. |
| 20 | Stack traces | Hidden, except that a malformed URL named an internal error code | Same plain answer for every error. Tests. |

## 2. Acceptance criteria

Products
1. An admin can create, view, search, filter, sort, edit, duplicate, reorder, show and hide any product, including its sizes, prices, stock, photos, collections and web address.
2. A new product can be created with its photos, and shown on the website, in one step.
3. An owner can delete a product for good. Past orders keep their own copy, and importing the catalog again does not bring it back.
4. When several products are selected, the admin can change them together. The change happens completely or not at all.
5. Collections created in the admin appear in the shop once they are marked for the menu and hold a visible product.

Accounts and security
6. Every admin address except sign-in refuses visitors who are not signed in. Owner-only addresses refuse staff. Both rules are tested against the server's own route list, so a new route cannot be missed.
7. Every change an admin makes is written to the activity log in the same transaction as the change. The log holds no passwords, session tokens or customer details.
8. An owner can erase a customer's details from a delivered or cancelled order.

## 3. Data changes (`002_security_and_admin.sql`)

- `admins.role` (`owner` or `staff`). Existing admins become owners.
- `admin_sessions.last_seen_at` for the idle limit.
- `collections.blurb`, `collections.in_menu`.
- `orders.erased_at`. An erased order may have an empty phone and PIN code, and cannot be tracked.
- `retired_products`: ids of deleted products, so the catalog import skips them.
- `audit_log`, with triggers that refuse updates and deletes.
- Row-level security on every table.

## 4. Who may do what

| Action | Staff | Owner |
| --- | --- | --- |
| Orders: view, update status and payment | Yes | Yes |
| Products, photos, stock, prices, bulk edits | Yes | Yes |
| Collections: add and edit | Yes | Yes |
| Change own password, sign out other devices | Yes | Yes |
| Delete products or collections | No | Yes |
| Erase customer details | No | Yes |
| Read the activity log | No | Yes |
| Create or remove admins | Command line on the server only | |

## 5. API additions (all under `/api/admin`)

| Method and path | Purpose |
| --- | --- |
| `POST /password`, `POST /sessions/revoke-others` | Own account |
| `GET /audit` (owner) | Activity log |
| `POST /products/:id/duplicate`, `POST /products/:id/move` | Copy, reorder |
| `DELETE /products/:id` (owner) | Delete for good |
| `POST /products/bulk` | Change several (deleting is owner only) |
| `POST /collections`, `PATCH /collections/:key`, `DELETE /collections/:key` (owner) | Collections |
| `POST /orders/:id/erase` (owner) | Erase customer details |

`GET /products` also takes `collection`, `sort`, `pageSize` and the `lowstock` filter.

## 6. The least-privilege database login

`npm run db:app-role` creates `jerseyorbit_app`. The website can then read and write the shop's data, but cannot change the database's structure, create admins, change anyone's role, delete orders, or edit the activity log. Migrations use the owner connection (`DATABASE_OWNER_URL`). This step is optional. Without it the website connects as the owner, and row-level security still blocks every other login.

## 7. Limits of this design

- A plain static host cannot send security headers. The `<meta>` policy covers script and style rules, not framing.
- Row-level security does not restrict the table owner or a database superuser.
- The table owner can remove the activity log's triggers. The least-privilege login cannot.
- Rate limits are held in memory, so they assume one copy of the app.
