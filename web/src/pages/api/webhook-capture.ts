/**
 * TEMPORARY webhook catcher for the Basin → Sygnal Studio forms migration.
 * See N8N-FORMS.hd.
 *
 * Captures whatever Studio's outbound webhook actually sends — method,
 * headers, raw body, and the body parsed as JSON or urlencoded — so the
 * payload shape can be diffed against the Basin shape the n8n workflow
 * expects. Reached through a tunnel pointed at the dev server.
 *
 * Captures are held in module memory, not on disk: even in `astro dev` this
 * module runs inside workerd, whose filesystem is virtual and invisible to
 * the host. Memory survives between requests while the dev server runs, but
 * an HMR reload of this module clears it — so read captures back promptly
 * after each test submission.
 *
 *   POST /api/webhook-capture            records a capture (the webhook target)
 *   GET  /api/webhook-capture            lists captures as JSON
 *   GET  /api/webhook-capture?clear=1    empties the list
 *
 * Dev-only: in a deployed Worker this route answers 404. Delete the route
 * once the payload question is settled.
 */
import type {APIRoute} from 'astro';

type Capture = {
  capturedAt: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  parsedAs: string;
  body: unknown;
  rawBody: string;
};

const captures: Capture[] = [];

export const POST: APIRoute = async ({request}) => {
  if (!import.meta.env.DEV) return new Response('Not found', {status: 404});

  const raw = await request.text();

  let parsed: unknown = null;
  let parsedAs = 'none';
  if (raw) {
    try {
      parsed = JSON.parse(raw);
      parsedAs = 'json';
    } catch {
      parsed = Object.fromEntries(new URLSearchParams(raw));
      parsedAs = 'urlencoded';
    }
  }

  captures.push({
    capturedAt: new Date().toISOString(),
    method: request.method,
    url: request.url,
    headers: Object.fromEntries(request.headers),
    parsedAs,
    body: parsed,
    rawBody: raw,
  });

  return new Response(JSON.stringify({ok: true, parsedAs, count: captures.length}), {
    status: 200,
    headers: {'Content-Type': 'application/json'},
  });
};

export const GET: APIRoute = ({url}) => {
  if (!import.meta.env.DEV) return new Response('Not found', {status: 404});

  if (url.searchParams.has('clear')) {
    captures.length = 0;
    return new Response(JSON.stringify({ok: true, cleared: true}), {
      status: 200,
      headers: {'Content-Type': 'application/json'},
    });
  }

  return new Response(JSON.stringify({count: captures.length, captures}, null, 2), {
    status: 200,
    headers: {'Content-Type': 'application/json'},
  });
};
