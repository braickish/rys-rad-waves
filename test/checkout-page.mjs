// Paying on a Stripe Checkout page as a player would (accounts plan task 8): headless Chrome from browser-lib, Stripe's
// 4242 test card and a California address, then wait to land back on `home` (a page the test's own server serves:
// a missing one shows Chrome's error page, which hides the address). Answers the address it landed on.
import { sleep } from './browser-lib.mjs';

export async function payOnCheckout(b, url, home) {
  await b.go(url);
  if (!await b.waitFor(`!!document.querySelector('[aria-label="Pay with card"]') || !!document.getElementById('cardNumber')`, 30000)) throw new Error('the Checkout page did not load');
  await b.evaluate(`document.querySelector('[aria-label="Pay with card"]')?.click()`);
  if (!await b.waitFor(`(() => { const e = document.getElementById('cardNumber'); return !!e && e.offsetParent !== null; })()`, 15000)) throw new Error('no card form');
  const fill = async (fieldId, text) => {
    await b.evaluate(`(() => { const e = document.getElementById('${fieldId}'); e.focus(); e.select?.(); })()`);
    await b.type(text);
  };
  // (React's selects need the native setter and a change event)
  const choose = (fieldId, value) => b.evaluate(`(() => {
    const e = document.getElementById('${fieldId}'); if (!e) return false;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(e, '${value}');
    e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await fill('cardNumber', '4242424242424242');
  await fill('cardExpiry', '1234');
  await fill('cardCvc', '123');
  await fill('billingName', 'Test Surfer');
  await choose('billingCountry', 'US');
  await sleep(300);
  await b.evaluate(`[...document.querySelectorAll('button')].find((x) => /enter address manually/i.test(x.textContent))?.click()`);
  await sleep(300);
  await fill('billingAddressLine1', '1 Trestles Way');
  await fill('billingLocality', 'San Clemente');
  await fill('billingPostalCode', '92672');
  await choose('billingAdministrativeArea', 'CA');
  // (don't save to Link: that asks for a phone number)
  await b.evaluate(`(() => { const c = document.getElementById('enableStripePass'); if (c?.checked) c.click(); })()`);
  await sleep(500);
  await b.shot('checkout-filled');
  // The visible Pay / Subscribe button (the page has hidden submit buttons too), pressed with a real mouse click (a
  // script's click() isn't always taken), measured once the page has stopped scrolling; again if nothing happens.
  const button = `[...document.querySelectorAll('button[type=submit]')].find((e) => e.offsetParent !== null && /pay|subscribe/i.test(e.textContent))`;
  if (!await b.evaluate(`(() => { const x = ${button}; x?.scrollIntoView({ block: 'center', behavior: 'instant' }); return !!x; })()`)) throw new Error('no Pay or Subscribe button');
  let back = null;
  for (let attempt = 0; attempt < 3 && !back; attempt++) {
    await sleep(800);
    const at = await b.evaluate(`(() => { const x = ${button}; if (!x) return null; const r = x.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (at) for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await b.send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 });
    }
    back = await b.waitFor(`location.href.startsWith(${JSON.stringify(home)}) && location.href`, attempt < 2 ? 20000 : 40000);
  }
  if (!back) {
    await b.shot('checkout-stuck');
    const why = await b.evaluate(`[...document.querySelectorAll('[role=alert], .FieldError, [aria-invalid=true]')].map((e) => (e.id || '') + ': ' + (e.textContent || e.getAttribute('aria-label') || '').trim()).join(' | ')`);
    throw new Error(`Checkout did not finish: ${why || '(no error shown)'}`);
  }
  return back;
}
