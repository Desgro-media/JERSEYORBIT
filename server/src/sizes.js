/* Sizes as shoppers think of them: some jerseys are labelled "XXL" and others "2XL", which is the
   same size. The website has the same rule in assets/js/core.js (a test checks they agree). */
const SAME_SIZE = { XXL: '2XL', XXXL: '3XL' };
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];

export const sizeKey = (label) => {
  const key = String(label).trim().toUpperCase();
  return SAME_SIZE[key] || key;
};

const rank = (size) => (SIZE_ORDER.includes(size) ? SIZE_ORDER.indexOf(size) : SIZE_ORDER.length);
/** sort size keys from small to large; unusual labels go last */
export const bySize = (a, b) => rank(a) - rank(b) || a.localeCompare(b);
