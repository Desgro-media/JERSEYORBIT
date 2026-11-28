/* Jersey Orbit — site configuration. Everything brand-specific lives here so it is easy to edit. */
window.JO_CONFIG = {
  brand: {
    name: 'Jersey Orbit',
    tagline: 'Your World of Football.',
    logo: 'assets/img/logo.webp', // small copy of logo.svg (the original artwork)
  },

  contact: {
    email: 'jerseyorbit@gmail.com',
    whatsapp: '918943478770',
    whatsappDisplay: '+91 89434 78770',
    instagram: 'https://www.instagram.com/jersey.orbit__',
    instagramHandle: '@jersey.orbit__',
    facebook: 'https://www.facebook.com/share/16xvWqtHVi/?mibextid=wwXIfr',
    location: 'Kerala, India',
  },

  // Scrolling strip above the header (text mirrors the live store's announcement bar).
  announcements: [
    'Kerala delivery in 2–5 days · Rest of India 5–9 days',
    'Buy 3 jerseys and get free shipping',
    'Fast delivery across India',
    'Limited stock on new season jerseys',
    'Dispatched within 24 hours',
  ],

  // One flat shipping fee for all of India. An order with at least `freeShippingJerseys` jerseys ships free
  // (socks don't count). Set it to 0 to switch the offer off.
  // The order server reads these two numbers from this file too, so the fee on screen and on the order match.
  // If you change these or the delivery days, also update the text that spells them out: `announcements` and
  // `faq` below, home.js, pages.js (order tracking), index.html and the shipping policy.
  shippingFee: 49,
  freeShippingJerseys: 3,

  // Delivery time in business days.
  shipping: {
    kerala: { minDays: 2, maxDays: 5 },
    india: { minDays: 5, maxDays: 9 },
  },

  // Surprise-jersey section on the home page. Design only for now: the button just says ordering opens soon,
  // and nothing counts or enforces the daily limit yet. Set to null to hide the section.
  wildcard: {
    name: 'Orbit Wildcard',
    title: 'Unbox a surprise jersey',
    dailyLimit: 5,
    button: 'Buy now',
    image: 'assets/img/wildcard-box.svg',
  },

  nav: [
    { label: 'Home', href: 'index.html', page: 'home' },
    { label: 'Category', href: 'shop.html', page: 'shop', mega: true },
    { label: 'Order Tracking', href: 'track.html', page: 'track' },
    { label: 'Reviews', href: 'reviews.html', page: 'reviews' },
    { label: 'About', href: 'about.html', page: 'about' },
    { label: 'Contact Us', href: 'contact.html', page: 'contact' },
    { label: 'FAQ', href: 'faq.html', page: 'faq' },
  ],

  // Category tiles / mega menu. `key` matches a product collection key in data.js, except full-sleeve and
  // half-sleeve, which core.js works out from each product's title and "Fit:" line.
  categories: [
    { key: '2026-27', title: '2026/27 Kits', blurb: 'The new season, first' },
    { key: 'new-drops', title: 'New Drops', blurb: 'Fresh in this week' },
    { key: 'world-cup-collections', title: 'World Cup 2026', blurb: 'Nations. Colours. Pride.' },
    { key: 'retro', title: 'Retro', blurb: 'Classics that never fade' },
    { key: 'embroidery', title: 'Embroidery', blurb: 'Stitched crests & details' },
    { key: 'retro-jerseys', title: 'Five Sleeve', blurb: 'The long-line favourites' },
    { key: 'full-sleeve', title: 'Full Sleeve', blurb: 'Long-sleeve jerseys' },
    { key: 'half-sleeve', title: 'Half Sleeve', blurb: 'The classic short-sleeve jersey' },
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

  // Customer messages. The images are cropped copies with phone numbers, names, profile photos,
  // a face and packet handwriting removed or blurred. Never add an un-redacted screenshot here.
  chatReviews: [
    { quote: 'Really i love this jersey... And The quality of this jersey is excellent and very comfortable to wear 🥹💗', thumb: 'assets/img/reviews/pedri-jersey-t.webp', img: 'assets/img/reviews/pedri-jersey.webp', w: 643, h: 1135, via: 'Instagram', alt: 'Customer photo of a jersey printed “Pedri 20”: “Really i love this jersey... And The quality of this jersey is excellent and very comfortable to wear”' },
    { quote: 'Thankyou so much ❤️ The quality is soo good', thumb: 'assets/img/reviews/dragon-jersey-t.webp', img: 'assets/img/reviews/dragon-jersey.webp', w: 643, h: 1185, via: 'Instagram', alt: 'Customer video of a white Real Madrid jersey: “Thankyou so much. The quality is soo good. Next i will order Barcelona Jersey”' },
    { quote: 'I don’t even know how to say the feeling 😭💐', thumb: 'assets/img/reviews/next-jersey-t.webp', img: 'assets/img/reviews/next-jersey.webp', w: 552, h: 734, via: 'Instagram', alt: 'Customer message: “I don’t even know how to say the feeling. Bro if there a any new Jersey say me bro”' },
    { quote: 'I liked it very much, good quality, thank you very much for your valuable effort 🤍💌', thumb: '', img: 'assets/img/reviews/liked-quality.webp', w: 643, h: 762, via: 'Instagram', alt: 'Customer message: “I liked it very much, good quality, thank you very much for your valuable effort”' },
    { quote: 'Chetta sathanm kitti....njn predhishichathu pole sathanm adipoli ahnnne', thumb: '', img: 'assets/img/reviews/adipoli.webp', w: 643, h: 520, via: 'Instagram', alt: 'Customer message: “Chetta sathanm kitti....njn predhishichathu pole sathanm adipoli ahnnne. Thnk u for ur efforts and i respect ur action”' },
    { quote: 'I received my jersey and I’m really happy with it. The quality is excellent and the fabric feels very comfortable and premium.', thumb: '', img: 'assets/img/reviews/fit-and-finish.webp', w: 702, h: 571, via: 'Instagram', alt: 'Customer message: “I received my jersey and I’m really happy with it. The quality is excellent and the fabric feels very comfortable and premium. The fitting is perfect, just as expected, and the printing and finishing are very neat. Everything about the product is impressive, and it was definitely worth the money. Totally satisfied with my purchase!”' },
    { quote: 'Nalla quality annu bro ❤️‍🔥 Thankyou for you give jersy to me in 2days', thumb: 'assets/img/reviews/delivery-packs-t.webp', img: 'assets/img/reviews/delivery-packs.webp', w: 634, h: 1085, via: 'Instagram', alt: 'Customer photos of Jersey Orbit packets and jerseys: “Nalla quality annu bro. Thankyou for you give jersy to me in 2days”' },
    { quote: 'Product kititoo.. 👍 Good quality 💗', thumb: 'assets/img/reviews/barca-delivery-t.webp', img: 'assets/img/reviews/barca-delivery.webp', w: 634, h: 945, via: 'Instagram', alt: 'Customer photos of the packet and a Barcelona jersey: “Product kititoo.. Good quality”' },
    { quote: 'Bro sanam sett 🫶 Ellam pakka 💯', thumb: 'assets/img/reviews/tryon-stripes-t.webp', img: 'assets/img/reviews/tryon-stripes.webp', w: 634, h: 895, via: 'Instagram', light: true, alt: 'Customer wearing a striped jersey: “Bro sanam sett. Ellam pakka”' },
    { quote: 'Sadhano kitty ttoh ❤️‍🔥🫶', thumb: 'assets/img/reviews/mirror-selfie-t.webp', img: 'assets/img/reviews/mirror-selfie.webp', w: 634, h: 685, via: 'Instagram', alt: 'Customer wearing the jersey, face blurred: “Sadhano kitty ttoh”' },
    { quote: 'Machu sanam kitty 🫶 Set set ❤️‍🩹', thumb: 'assets/img/reviews/unboxed-set-t.webp', img: 'assets/img/reviews/unboxed-set.webp', w: 634, h: 582, via: 'Instagram', alt: 'Customer photo of packed jerseys: “Machu sanam kitty. Set set”' },
    { quote: 'Jersey kitty. Nice aan decent quality ❤️', thumb: '', img: 'assets/img/reviews/whatsapp-quality.webp', w: 702, h: 292, via: 'WhatsApp', alt: 'WhatsApp message: “Jersey kitty. Nice aan decent quality”' },
  ],

  // Shown as "From Google Reviews" with first names only. `photo` (optional) is a picture posted with the review.
  // All of these appear on the reviews page. `slider: true` also puts one in the home page slider.
  // The first four were copied from screenshots of the reviews. The six after them were mirrored from the old
  // live homepage (some mention the 24/25 collection).
  reviews: [
    { name: 'Rajeevan', slider: true, text: 'Excellent jersey shop! The quality of the jersey is amazing, and the fitting is absolutely perfect. The material feels premium, the print is clean, and the stitching is well done. Delivery was quick, and the product was exactly as shown. Highly recommended for anyone looking for good-quality jerseys at a reasonable price. Will definitely order again!', photo: 'assets/img/reviews/google-jersey-photo.webp' },
    { name: 'Jils', slider: true, text: 'Really happy with the jersey! 🔥 The quality is really good, the fabric feels comfortable, and the fitting is perfect. The colour and printing also look great. Delivery was smooth and the jersey arrived in good condition. Overall, excellent quality for the price. Definitely recommend this store! ❤️⚽' },
    { name: 'Tanmoy', slider: true, text: 'Looking for jerseys that feel premium without being heavy on the pocket? @JerseyOrbit has you covered. ⚽✨ Affordable, good quality, and genuinely worth it — a choice you won’t regret. That\'s insane' },
    { name: 'Riyan', slider: true, text: 'Good Service and Quality Jerseys' },
    { name: 'Rahul', text: 'The fabric of the 24/25 kit is amazing. Feels premium and very comfortable to play in.' },
    { name: 'Anjali', text: 'Finally found a jersey that fits true to size. The cut for the new season is excellent.' },
    { name: 'Vikram', text: 'The new away kit looks incredible in person. Great job on the 24/25 collection!' },
    { name: 'Joseph', text: "Ordered my team's jerseys and got them within 3 days. Impressive service." },
    { name: 'Arjun', text: 'Premium feel for a very reasonable price. Will definitely buy again.' },
    { name: 'Ahmed', text: "The stitching and details are top-notch. Best jersey I've bought in years." },
  ],

  // Answers are taken from the store's Shipping & Refund policies.
  faq: [
    { q: 'How do I order and pay?', a: 'Add jerseys to your cart, enter your delivery details at checkout and send the order to us on <strong>WhatsApp</strong>. No payment is taken on this website.' },
    { q: 'How long does delivery take?', a: 'Kerala orders are typically delivered within <strong>2–5 business days</strong>. The rest of India takes <strong>5–9 business days</strong>. Orders are processed and dispatched within 24 hours (excluding Sundays and public holidays).' },
    { q: 'How much is shipping?', a: 'A flat rate of <strong>₹49 all over India</strong>, added at checkout. Shipping is <strong>free when you buy 3 or more jerseys</strong> (socks do not count towards the three).' },
    { q: 'How do I track my order?', a: 'Check your status on the <a href="track.html">Order Tracking</a> page with your order number and phone number. Once your jersey ships we also send you a tracking ID on <strong>WhatsApp or email</strong>.' },
    { q: 'Can I return or exchange a jersey?', a: 'We do not accept returns or exchanges for size issues, change of mind, or dislike of the product. Returns or exchanges are only possible if the jersey arrives <strong>damaged / defective</strong> or if we sent the <strong>wrong product</strong>. See the full <a href="policies.html?p=refund">Return &amp; Refund Policy</a>.' },
    { q: 'What do I need to claim a damaged or wrong item?', a: 'A continuous, <strong>unedited unboxing video</strong> showing the package being opened for the first time, with the label and the defect or error clearly visible. Claims must be reported within <strong>48 hours of delivery</strong> on WhatsApp or email, with your order details and the video.' },
    { q: 'How do I pick the right size?', a: 'Open the <strong>Find your size</strong> guide on any product page. Because size-related returns are not accepted, message us on WhatsApp if you are unsure and we will help you choose.' },
    { q: 'A size I want is sold out — what can I do?', a: 'Tap the sold-out size on the product page and choose <strong>Ask about restock</strong> — it opens WhatsApp with the jersey details filled in.' },
    { q: 'How can I contact Jersey Orbit?', a: 'WhatsApp <strong>+91 89434 78770</strong> or email <strong>jerseyorbit@gmail.com</strong>. You can also message us on Instagram <strong>@jersey.orbit__</strong>.' },
  ],


};
