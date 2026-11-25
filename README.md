# JERSEYORBIT

Standalone website for Jersey Orbit: plain HTML, CSS and JavaScript, with no build step and no outside services needed to browse it.

## Run locally

```sh
python -m http.server 8123
```

Then open <http://localhost:8123/index.html>.

## How ordering works

Customers add jerseys to the cart, enter their delivery details on `checkout.html`, and send the order to the shop on WhatsApp. The website takes no payment and keeps no order records.

## Editing

| To change | Edit |
| --- | --- |
| Text, menu, FAQ, shipping fees, size chart | `assets/js/config.js` |
| Customer reviews | `chatReviews` in `config.js`, with images in `assets/img/reviews/` |
| Design | `assets/css/main.css` |
| Products, prices, stock | `assets/js/data.js` (photos are in `assets/img/p/`) |

There is no admin panel yet, so stock and prices only change when the catalog file is edited.

**Review screenshots:** crop or blur phone numbers, names, profile photos, faces and addresses before adding them. This repo is public, so never commit an original screenshot.

`tools/sync-products.mjs` and `tools/localize-images.mjs` imported the catalog from the previous store. Running the first one again replaces `data.js`. If you do, run the second one straight after.

## Before launch

- Replace the placeholder size chart in `config.js` with real garment measurements.
- Write a privacy policy and terms of service. The site only has shipping and refund policies.
