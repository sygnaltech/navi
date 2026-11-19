/*
 * email-decode
 *
 * Decodes Cloudflare Scrape-Shield-style obfuscated email addresses in the
 * page. The HTML ships the address XOR-encoded — a `data-cfemail` hex string
 * on the element, and/or a `/cdn-cgi/l/email-protection#<hex>` href on a
 * link — so the plain address never appears in the served markup for
 * harvesters to scrape. This script reverses it in the visitor's browser.
 *
 * On the original Cloudflare-proxied site the proxy injected its own
 * `/cdn-cgi/scripts/.../email-decode.min.js` to do this. That path only
 * exists behind Cloudflare's proxy with Email Obfuscation enabled, so the
 * exported markup needs this replacement; without it the visitor sees the
 * literal "[email protected]" fallback text.
 *
 * Encoding: hex string, first byte is the XOR key, each later byte XORed
 * with the key is one byte of the UTF-8 address. A link fragment may carry
 * a query suffix (e.g. ?subject=...) which is preserved into the mailto:.
 */
(function () {
  'use strict';

  function decode(hex) {
    const key = parseInt(hex.slice(0, 2), 16);
    let pct = '';
    for (let i = 2; i < hex.length; i += 2) {
      const b = parseInt(hex.slice(i, i + 2), 16) ^ key;
      pct += '%' + ('0' + b.toString(16)).slice(-2);
    }
    return decodeURIComponent(pct);
  }

  function run() {
    document.querySelectorAll('a[href*="/cdn-cgi/l/email-protection#"]').forEach((a) => {
      a.setAttribute('href', 'mailto:' + decode(a.getAttribute('href').split('#')[1]));
    });

    document.querySelectorAll('[data-cfemail]').forEach((el) => {
      const email = decode(el.getAttribute('data-cfemail'));
      if (el.tagName === 'A') {
        el.setAttribute('href', 'mailto:' + email);
        el.textContent = email;
      } else {
        el.replaceWith(document.createTextNode(email));
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
