# JERSEYORBIT

Front-end redesign of [jerseyorbit.com](https://jerseyorbit.com). Plain HTML, CSS and JavaScript, with no build step.

## Run locally

```sh
python -m http.server 8123
```

Then open <http://localhost:8123/index.html>.

## Where things are

| Path | What it does |
| --- | --- |
| `assets/js/config.js` | Brand text, navigation, categories, FAQ, size chart |
| `assets/css/main.css` | All styles |
| `assets/js/` | Page scripts. `data.js` and `content.js` are generated, so don't edit them by hand |
| `tools/sync-products.mjs` | Refreshes products from the store. Add `--cache` to rebuild from the saved data |
| `tools/build-content.mjs` | Rebuilds the policy text from the saved pages |
| `tools/make-pages.mjs` | Regenerates the HTML shells for the content pages |

## Before using it

- **Checkout, account links and the newsletter form connect to the live store.** Don't place test orders or subscribe test addresses. The newsletter success message does not confirm that the store accepted the address.
- **The size chart is a placeholder.** Replace it in `config.js` with real garment measurements before launch.
