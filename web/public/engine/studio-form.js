/*
 * studio-form
 *
 * Posts a Webflow-exported form to a Sygnal Studio form endpoint, from the
 * visitor's browser, and shows the page's own `.w-form-done` / `.w-form-fail`
 * blocks in place of a navigation.
 *
 * Opt in per form with `data-studio-form` — the `action` carries the endpoint:
 *
 *     <form data-studio-form action="https://studio.sygnal.com/api/forms/submit/<id>" method="post">
 *
 * THE POST MUST COME FROM THE BROWSER, never from this site's Worker. Studio
 * scores a submission partly on the client's IP — country, geolocation, and a
 * per-IP burst check — so a server-side forward replaces every visitor with one
 * machine in a datacentre, which is also the shape of spam. That is why there is
 * no route, action or function between this and the endpoint; the endpoint is
 * CORS-open and unauthenticated by design, and the form id in the URL addresses
 * a form rather than authorising anything.
 *
 * TWO FIELDS ARE PLUMBING, not content:
 *
 *   `_ts`      when the form was RENDERED, in epoch milliseconds. Studio reads
 *              it to reject a submission that arrived impossibly fast. It is
 *              stamped here, in the browser, and MUST NOT be baked into the
 *              markup: a value written at render time on a cached page makes
 *              every submission look days old, and the check simply stops
 *              working with no error to notice.
 *   `_gotcha`  the honeypot. Off-screen rather than `display:none`, because
 *              bots skip fields the browser reports as hidden. It carries no
 *              label, no placeholder and no `required` — anything that invites
 *              a person to fill it in files that person as spam.
 *
 * The submit listener is registered in the CAPTURE phase and stops the event
 * dead. Webflow's own runtime (`navi-tours.*.js`) handles every `.w-form` on
 * the page from a document-level listener, and an unhandled one posts to
 * `webflow.com/api/v1/form/…`, which does nothing at all for an exported site.
 * Capturing on the form itself runs first and `stopImmediatePropagation` means
 * that listener never sees the event.
 */
(function () {
  'use strict';

  /** Webflow's wrapper holds the two status blocks as siblings of the form. */
  function statusBlocks(form) {
    const wrapper = form.closest('.w-form') ?? form.parentNode;
    return {
      done: wrapper.querySelector('.w-form-done'),
      fail: wrapper.querySelector('.w-form-fail'),
    };
  }

  function show(el) {
    if (el) el.style.display = 'block';
  }

  function hide(el) {
    if (el) el.style.display = 'none';
  }

  function stamp(form) {
    const ts = form.querySelector('input[name="_ts"]');
    if (ts) ts.value = String(Date.now());
  }

  function bind(form) {
    stamp(form);

    form.addEventListener(
      'submit',
      async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();

        const {done, fail} = statusBlocks(form);
        const button = form.querySelector('[type=submit]');
        const label = button ? button.value : null;
        hide(done);
        hide(fail);
        if (button) {
          button.disabled = true;
          // Webflow's own convention for the in-flight label.
          if (button.getAttribute('data-wait')) button.value = button.getAttribute('data-wait');
        }

        try {
          // No Content-Type header: the browser must set it so that a
          // multipart boundary is included if this form ever gains a file input.
          const res = await fetch(form.action, {
            method: 'POST',
            headers: {Accept: 'application/json'},
            body: new FormData(form),
          });

          if (res.ok) {
            form.reset();
            stamp(form);
            hide(form);
            show(done);
          } else {
            // 422 is a stale captcha token — a retry, not a failure. This form
            // has no captcha, so it is handled the same as any other refusal:
            // the page's own failure block, left for the visitor to resend.
            show(fail);
          }
        } catch {
          show(fail);
        } finally {
          if (button) {
            button.disabled = false;
            if (label !== null) button.value = label;
          }
        }
      },
      true,
    );
  }

  const start = () => document.querySelectorAll('form[data-studio-form]').forEach(bind);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
