/* Jersey Orbit — site configuration. Everything brand-specific lives here so it is easy to edit. */
window.JO_CONFIG = {
  brand: {
    name: 'Jersey Orbit',
    tagline: 'Your World of Football.',
    logo: 'assets/img/logo.svg',
  },

  shop: {
    // Where carts are handed off for payment. Cart permalinks (/cart/<variantId>:<qty>) redirect to Shopify checkout.
    origin: 'https://jerseyorbit.com',
    // The store uses Shopify's passwordless customer accounts: one page handles both sign-in and sign-up.
    accountUrl: 'https://jerseyorbit.com/account',
    ordersUrl: 'https://jerseyorbit.com/account',
  },

  contact: {
    email: 'jerseyorbit@gmail.com',
    whatsapp: '918943478770',
    whatsappDisplay: '+91 89434 78770',
    instagram: 'https://www.instagram.com/jersey.orbit',
    instagramHandle: '@jersey.orbit',
    facebook: 'https://www.facebook.com/share/16xvWqtHVi/?mibextid=wwXIfr',
    location: 'Kerala, India',
  },

  // Scrolling strip above the header (text mirrors the live store's announcement bar).
  announcements: [
    'Kerala delivery in 2–3 days · Rest of India 5–10 days',
    'Fast delivery across India',
    'Limited stock on new season jerseys',
    'Dispatched within 24 hours',
  ],

  // The live store's marquee also says "Free shipping on orders over ₹1000", but its Shipping Policy says
  // flat ₹59 (Kerala) / ₹99 (rest of India). Set a number here ONLY once that is confirmed — it switches on the
  // free-shipping progress bar in the cart. null = off.
  freeShippingThreshold: null,

  shipping: {
    kerala: { fee: 59, minDays: 2, maxDays: 3 },
    india: { fee: 99, minDays: 5, maxDays: 10 },
  },

  nav: [
    { label: 'Home', href: 'index.html', page: 'home' },
    { label: 'Catalog', href: 'shop.html', page: 'shop', mega: true },
    { label: 'Order Tracking', href: 'track.html', page: 'track' },
    { label: 'Reviews', href: 'reviews.html', page: 'reviews' },
    { label: 'About', href: 'about.html', page: 'about' },
    { label: 'Contact Us', href: 'contact.html', page: 'contact' },
    { label: 'FAQ', href: 'faq.html', page: 'faq' },
  ],

  // Category tiles / mega menu. `key` matches a product collection key in data.js.
  categories: [
    { key: '2026-27', title: '2026/27 Kits', blurb: 'The new season, first' },
    { key: 'new-drops', title: 'New Drops', blurb: 'Fresh in this week' },
    { key: 'world-cup-collections', title: 'World Cup 2026', blurb: 'Nations. Colours. Pride.' },
    { key: 'retro', title: 'Retro', blurb: 'Classics that never fade' },
    { key: 'embroidery', title: 'Embroidery', blurb: 'Stitched crests & details' },
    { key: 'retro-jerseys', title: 'Five Sleeve', blurb: 'The long-line favourites' },
    { key: 'collar', title: 'Collar', blurb: 'Polo & collar editions' },
    { key: 'imported', title: 'Imported', blurb: 'Imported quality' },
    { key: 'socks', title: 'Socks', blurb: 'Finish the fit' },
    { key: 'all', title: 'All Collection', blurb: 'Everything in the orbit' },
  ],

  // Home hero slides — product imagery is picked automatically from the collection.
  hero: [
    { key: '2026-27', eyebrow: 'New season', title: 'The 2026/27 kits are here', text: 'Fresh home, away & third shirts from the clubs you love.', cta: 'Shop 2026/27' },
    { key: 'retro', eyebrow: 'Retro & classic', title: 'Wear the legends', text: 'Vintage shirts from the golden eras — stitched with the details fans notice.', cta: 'Explore Retro' },
    { key: 'world-cup-collections', eyebrow: 'World Cup 2026', title: 'Your nation. Your colours.', text: 'Gear up for the biggest stage in football.', cta: 'Shop World Cup' },
  ],

  searchSuggestions: ['Real Madrid', 'Barcelona', 'Argentina', 'Brazil', 'Retro', 'Embroidery', '2026/27', 'Messi'],

  // Search aliases: typed word -> words that should also match
  synonyms: {
    barca: ['barcelona'],
    madrid: ['real'],
    utd: ['united'],
    man: ['manchester'],
    mufc: ['manchester', 'united'],
    cr7: ['ronaldo'],
    leo: ['messi'],
    kerala: [],
    vintage: ['retro'],
    longsleeve: ['long', 'sleeve'],
    fivesleeve: ['five', 'sleeve'],
    fullsleeve: ['long', 'sleeve'],
  },

  // ⚠ Generic adult chest-size guide (industry-standard ranges) — replace with Jersey Orbit's own garment
  // measurements. Because the Refund Policy excludes size-related returns, accuracy matters here.
  sizeChart: {
    unit: 'in',
    note: 'Body chest measurement. Our jerseys are a regular fit — if you are between sizes, size up for a relaxed fit. Unsure? Message us on WhatsApp before ordering.',
    rows: [
      { size: 'S', chest: '36 – 38', cm: '91 – 97' },
      { size: 'M', chest: '38 – 40', cm: '97 – 102' },
      { size: 'L', chest: '40 – 42', cm: '102 – 107' },
      { size: 'XL', chest: '42 – 44', cm: '107 – 112' },
      { size: '2XL', chest: '44 – 46', cm: '112 – 117' },
      { size: '3XL', chest: '46 – 48', cm: '117 – 122' },
    ],
  },

  // Mirrors the six "From Google Reviews" quotes published on the live homepage.
  // (They mention the 24/25 collection — swap in fresh ones whenever you have them.)
  reviews: [
    { name: 'Rahul', text: 'The fabric of the 24/25 kit is amazing. Feels premium and very comfortable to play in.' },
    { name: 'Anjali', text: 'Finally found a jersey that fits true to size. The cut for the new season is excellent.' },
    { name: 'Vikram', text: 'The new away kit looks incredible in person. Great job on the 24/25 collection!' },
    { name: 'Joseph', text: "Ordered my team's jerseys and got them within 3 days. Impressive service." },
    { name: 'Arjun', text: 'Premium feel for a very reasonable price. Will definitely buy again.' },
    { name: 'Ahmed', text: "The stitching and details are top-notch. Best jersey I've bought in years." },
  ],

  // Answers are taken from the store's Shipping & Refund policies.
  faq: [
    { q: 'How long does delivery take?', a: 'Kerala orders are typically delivered within <strong>2–3 business days</strong>. The rest of India takes <strong>5–10 business days</strong>. Orders are processed and dispatched within 24 hours (excluding Sundays and public holidays).' },
    { q: 'How much is shipping?', a: 'A flat rate of <strong>₹59 within Kerala</strong> and <strong>₹99 for the rest of India</strong>. The exact amount is confirmed at checkout.' },
    { q: 'How do I track my order?', a: 'Once your jersey ships we send you a tracking ID on <strong>WhatsApp or email</strong>. Send it to us from the <a href="track.html">Order Tracking</a> page and we will get you the latest status.' },
    { q: 'Can I return or exchange a jersey?', a: 'We do not accept returns or exchanges for size issues, change of mind, or dislike of the product. Returns or exchanges are only possible if the jersey arrives <strong>damaged / defective</strong> or if we sent the <strong>wrong product</strong>. See the full <a href="policies.html?p=refund">Return &amp; Refund Policy</a>.' },
    { q: 'What do I need to claim a damaged or wrong item?', a: 'A continuous, <strong>unedited unboxing video</strong> showing the package being opened for the first time, with the label and the defect or error clearly visible. Claims must be reported within <strong>48 hours of delivery</strong> on WhatsApp or email, with your order details and the video.' },
    { q: 'How do I pick the right size?', a: 'Open the <strong>Find your size</strong> guide on any product page. Because size-related returns are not accepted, message us on WhatsApp if you are unsure and we will help you choose.' },
    { q: 'A size I want is sold out — what can I do?', a: 'Tap the sold-out size on the product page and choose <strong>Ask about restock</strong> — it opens WhatsApp with the jersey details filled in.' },
    { q: 'How can I contact Jersey Orbit?', a: 'WhatsApp <strong>+91 89434 78770</strong> or email <strong>jerseyorbit@gmail.com</strong>. You can also message us on Instagram <strong>@jersey.orbit</strong>.' },
  ],

  newsletter: {
    // Posts to the Shopify store's built-in customer form so the address lands in Shopify > Customers.
    action: 'https://jerseyorbit.com/contact#contact_form',
    tag: 'newsletter',
  },

  contactForm: {
    action: 'https://jerseyorbit.com/contact#contact_form',
  },
};
