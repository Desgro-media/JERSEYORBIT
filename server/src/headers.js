/* The security headers. The storefront pages also carry a matching <meta> policy for plain static
   hosting, where no header can be sent (see tools/make-pages.mjs). */

/** Content-Security-Policy for the shop, in the form @fastify/helmet takes */
export const storefrontPolicy = (production) => ({
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  scriptSrcAttr: ["'none'"], // no onclick="…" attributes
  // The shop uses style="" attributes, but never needs a <style> block, so injected ones are blocked.
  // style-src is the fallback for older browsers that do not know the two finer rules.
  styleSrc: ["'self'", "'unsafe-inline'"],
  styleSrcElem: ["'self'"],
  styleSrcAttr: ["'unsafe-inline'"],
  imgSrc: ["'self'", 'data:'],
  fontSrc: ["'self'"],
  connectSrc: ["'self'"],
  objectSrc: ["'none'"],
  frameSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
  ...(production ? { upgradeInsecureRequests: [] } : {}),
});

/* The admin panel needs less than the shop, so it is allowed less. blob: is for previewing photos
   chosen on the computer before they are uploaded. */
export const adminPolicy = (production) =>
  [
    "default-src 'none'",
    "script-src 'self'",
    "script-src-attr 'none'",
    "style-src 'self'",
    "img-src 'self' blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(production ? ['upgrade-insecure-requests'] : []),
  ].join('; ');

// browser features the shop and the admin panel never use
export const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()';
