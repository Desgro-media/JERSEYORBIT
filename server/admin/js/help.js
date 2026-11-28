/* The small "i" buttons that explain a number or a chart in plain words. One shared bubble, shown
   on mouse-over, keyboard focus or a tap. Every explanation is here, so wording changes happen in
   one place. If you change how a number is worked out, change its sentence too. */
import { esc } from './lib.js';

export const HELP = {
  // dashboard: right now
  attention: 'Things waiting for you right now, whatever days you pick further down. Red ones are urgent. “View” opens a list of exactly those orders.',
  'orders-now': 'Where your orders stand right now. Tap a box that has a list to see those orders.',
  'to-confirm': 'New orders waiting for you. Confirm one after the customer’s WhatsApp message and payment arrive.',
  'to-pack': 'Confirmed orders that you haven’t marked as packed yet.',
  'to-ship': 'Packed orders waiting to go to the courier.',
  'on-the-way': 'Orders you marked as shipped, not yet marked delivered.',
  'placed-today': 'Orders customers placed today (India time), paid or not. Cancelled ones aren’t counted.',
  'paid-month': 'Money from this calendar month’s orders that are marked paid, shipping included. Cancelled orders aren’t counted.',
  'latest-orders': 'Your 8 newest orders. The first label shows progress (“Pending” means it is waiting for you). The second shows payment.',
  'wildcard-card': 'Your surprise-jersey offer: whether it takes orders, how many of today’s places are taken, and how many jerseys it can pick from.',
  'all-products': 'Every jersey saved here, including hidden ones.',
  'on-website': 'Jerseys that customers can see in the shop.',
  'hidden-products': 'Saved jerseys that customers can’t see.',
  'sold-out': 'Jerseys with no size that can be bought right now. Hidden ones are included.',
  'low-stock': 'Sizes on sale with 2 or fewer left, for jerseys in the shop. Only sizes where you typed a stock number are watched.',

  // dashboard: sales over the chosen days
  'sales-section': 'How the shop did over the days you pick just below. Every number and chart in this part uses those days.',
  'paid-sales': 'Money from orders marked paid, shipping included, counted on the day each order was placed. Cancelled orders aren’t counted.',
  'paid-orders': 'How many orders are marked paid and not cancelled.',
  'average-order': 'Paid sales divided by paid orders: what one paid order is worth on average.',
  'items-sold': 'How many pieces (jerseys, and anything else such as socks) were in the paid orders.',
  'orders-placed': 'All orders customers placed, paid or not. Cancelled ones aren’t counted.',
  cancelled: 'Orders placed in these days that were later cancelled. Here, fewer is better.',
  'chart-sales': 'Money from paid orders, day by day, so you can spot your best days.',
  'chart-orders': 'How many orders came in each day, paid or not. A busy day here with little paid money can mean payments still need checking.',
  'top-jerseys': 'The 5 jerseys with the most pieces in paid orders. “Sold” is the number of pieces. “Value” is what they came to, without shipping.',
  'sizes-sold': 'Pieces of each size in paid orders, to help you decide which sizes to stock. XXL is counted as 2XL.',
  'delivery-areas': 'Where paid orders were going: Kerala or the rest of India, with the money (shipping included) and the number of orders.',
  'latest-activity': 'The newest entries in the activity log: what happened, who did it, and when.',

  // the other screens
  'orders-list': 'Every order, newest first. Labels show progress (Pending, Confirmed, Packed, Shipped, Delivered or Cancelled) and payment (Unpaid, Paid or Refunded). “Wildcard” marks a surprise-jersey order.',
  'order-items': 'What the customer ordered, at the price on the day they ordered. “Taken from stock” means confirming the order lowered your stock count.',
  'products-list': 'Under each name: how many sizes can be bought, and your total stock where you count it. “Hidden”: not in the shop. “Sold out”: no size can be bought. “Low stock”: a counted size has 2 or fewer. Arrows, when shown, change the shop’s “Featured” order.',
  'collections-list': 'The shop’s categories. Each shows how many jerseys are in it, and how many of those customers can see.',
  'activity-log': 'What was done or tried, by whom and when. “From” is the internet (IP) address used. Yellow rows are failed attempts or refused actions.',
  'wildcard-today': 'How many of today’s surprise-jersey places are taken. The bar fills as they go. A new day starts at midnight, India time.',
  'wildcard-pool': 'For each size, how many different jerseys the wildcard could pick right now: in the shop, in stock and in the group you chose.',
  'wildcard-orders': 'Today’s surprise orders and the jersey picked for each. Customers can’t see which jersey it is.',
  'editor-sizes': 'Price: what the customer pays. Was: an older, higher price shown crossed out (leave empty for no sale). Stock: how many you have (leave empty if you don’t count). On sale: untick to show the size as sold out.',
};

/** the "i" button for HELP[key]. `label` says what it explains, for screen readers. */
export const info = (key, label) => `<button type="button" class="info" data-info="${key}" aria-label="What is “${esc(label)}”?" aria-expanded="false">i</button>`;

/** a heading with its "i" beside it (not inside, so the heading reads cleanly) */
export const titled = (tag, text, key, extra = '') => `<div class="title-row${extra ? ` ${extra}` : ''}"><${tag}>${esc(text)}</${tag}>${info(key, text)}</div>`;

let bubble = null;
let owner = null; // the button whose explanation is showing
let pinned = false; // opened by a tap or click, so it stays until closed

export function hideInfo() {
  if (!owner) return;
  owner.setAttribute('aria-expanded', 'false');
  owner.removeAttribute('aria-describedby');
  bubble.hidden = true;
  owner = null;
  pinned = false;
}

/** under the button, or above it near the bottom of the screen, and always fully on screen */
function place() {
  const at = owner.getBoundingClientRect();
  const { offsetWidth: width, offsetHeight: height } = bubble;
  const left = Math.min(Math.max(8, at.left + at.width / 2 - width / 2), document.documentElement.clientWidth - width - 8);
  const below = at.bottom + 8;
  bubble.style.left = `${left}px`;
  bubble.style.top = `${below + height > innerHeight - 8 && at.top - height - 8 > 8 ? at.top - height - 8 : below}px`;
}

function showInfo(button) {
  if (owner && owner !== button) hideInfo();
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.className = 'info-bubble';
    bubble.id = 'info-bubble';
    bubble.setAttribute('role', 'tooltip');
    document.body.appendChild(bubble);
  }
  bubble.textContent = HELP[button.dataset.info] || '';
  bubble.hidden = false;
  owner = button;
  button.setAttribute('aria-expanded', 'true');
  button.setAttribute('aria-describedby', 'info-bubble');
  place();
}

// one set of listeners for every "i", however often the screens are redrawn
const infoButton = (e) => e.target.closest?.('.info');
document.addEventListener('pointerover', (e) => {
  const button = infoButton(e);
  if (button && e.pointerType === 'mouse' && !pinned) showInfo(button);
});
document.addEventListener('pointerout', (e) => {
  if (infoButton(e) === owner && e.pointerType === 'mouse' && !pinned) hideInfo();
});
document.addEventListener('focusin', (e) => infoButton(e) && showInfo(infoButton(e)));
document.addEventListener('focusout', (e) => e.target === owner && hideInfo());
document.addEventListener('click', (e) => {
  const button = infoButton(e);
  if (!button) {
    if (owner && !bubble.contains(e.target)) hideInfo();
    return;
  }
  e.preventDefault();
  if (owner === button && pinned) return hideInfo();
  showInfo(button);
  pinned = true;
});
document.addEventListener('keydown', (e) => e.key === 'Escape' && hideInfo());
addEventListener('scroll', () => owner && place(), { passive: true });
addEventListener('resize', hideInfo);
