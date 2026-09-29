import { declareDiscoveryExtension } from '@x402/extensions/bazaar';
import dns from 'node:dns/promises';
import net from 'node:net';

function route(price, PAY_TO, NETWORK, PUBLIC_BASE, path, description, tags, input, required, outputExample) {
  return {
    accepts: [{ scheme: 'exact', price, network: NETWORK, payTo: PAY_TO }],
    description,
    mimeType: 'application/json',
    resource: {
      url: PUBLIC_BASE + path,
      description,
      mimeType: 'application/json',
      serviceName: '50M Live Web & Network Data',
      tags
    },
    extensions: declareDiscoveryExtension({
      bodyType: 'json',
      input,
      inputSchema: {
        type: 'object',
        properties: Object.fromEntries(Object.keys(input).map(k => [
          k,
          Array.isArray(input[k]) ? { type: 'array', items: { type: 'string' } } : { type: 'string' }
        ])),
        required
      },
      output: { example: outputExample, schema: { type: 'object', additionalProperties: true } }
    })
  };
}

export function createWebPaidRoutes({ PAY_TO, NETWORK, PUBLIC_BASE }) {
  return {
    'POST /v1/web/page-to-markdown': route(
      '$0.001', PAY_TO, NETWORK, PUBLIC_BASE, '/v1/web/page-to-markdown',
      'Fetch a live public HTTPS page and convert its readable HTML into compact Markdown.',
      ['web','page-reader','html','markdown','live-fetch'],
      { url: 'https://example.com' }, ['url'],
      { url: 'https://example.com/', title: 'Example Domain', markdown: '# Example Domain\n\nExample text.' }
    ),
    'POST /v1/web/http-inspect': route(
      '$0.001', PAY_TO, NETWORK, PUBLIC_BASE, '/v1/web/http-inspect',
      'Inspect a live public HTTPS URL: final URL, HTTP status, selected headers and latency.',
      ['web','http','status','headers','uptime','live'],
      { url: 'https://example.com' }, ['url'],
      { status: 200, finalUrl: 'https://example.com/', latencyMs: 120 }
    ),
    'POST /v1/network/dns-lookup': route(
      '$0.001', PAY_TO, NETWORK, PUBLIC_BASE, '/v1/network/dns-lookup',
      'Live DNS lookup for A, AAAA, MX, NS and TXT records.',
      ['dns','domain','network','live','infrastructure'],
      { domain: 'example.com' }, ['domain'],
      { domain: 'example.com', a: ['93.184.216.34'], mx: [] }
    ),
    'POST /v1/web/robots': route(
      '$0.001', PAY_TO, NETWORK, PUBLIC_BASE, '/v1/web/robots',
      'Fetch robots.txt for a live public HTTPS origin.',
      ['web','robots.txt','crawl','seo','live-fetch'],
      { url: 'https://example.com' }, ['url'],
      { url: 'https://example.com/robots.txt', status: 200, text: 'User-agent: *' }
    ),
    'POST /v1/web/sitemap': route(
      '$0.002', PAY_TO, NETWORK, PUBLIC_BASE, '/v1/web/sitemap',
      'Fetch a public sitemap.xml and return discovered URLs.',
      ['web','sitemap','urls','crawl','seo','live-fetch'],
      { url: 'https://example.com/sitemap.xml' }, ['url'],
      { url: 'https://example.com/sitemap.xml', count: 2, urls: ['https://example.com/a'] }
    )
  };
}

function isPrivateIp(ip) {
  if (!net.isIP(ip)) return false;
  if (ip === '::1' || ip === '0.0.0.0' || ip === '::') return true;
  if (ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) return true;
  const p = ip.split('.').map(Number);
  if (p.length === 4 && p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  const lower = ip.toLowerCase();
  if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:')) return true;
  return false;
}

async function safeUrl(raw, { allowPath = true } = {}) {
  let u;
  try { u = new URL(String(raw || '')); } catch { throw Object.assign(new Error('A valid HTTPS URL is required.'), { status: 400 }); }
  if (u.protocol !== 'https:') throw Object.assign(new Error('Only HTTPS URLs are allowed.'), { status: 400 });
  if (u.username || u.password) throw Object.assign(new Error('URL credentials are not allowed.'), { status: 400 });
  if (!allowPath && (u.pathname !== '/' || u.search || u.hash)) throw Object.assign(new Error('Origin URL required.'), { status: 400 });
  const records = await dns.lookup(u.hostname, { all: true, verbatim: true }).catch(() => []);
  if (!records.length || records.some(r => isPrivateIp(r.address))) throw Object.assign(new Error('Host is unavailable or resolves to a private address.'), { status: 400 });
  return u;
}

async function fetchLimited(url, options = {}, maxBytes = 1_500_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const r = await fetch(url, {
      ...options,
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': '50M-Live-Web-Utility/1.0', accept: '*/*', ...(options.headers || {}) }
    });
    const reader = r.body?.getReader();
    let total = 0;
    const chunks = [];
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) throw Object.assign(new Error('Upstream response too large.'), { status: 413 });
        chunks.push(value);
      }
    }
    const bytes = chunks.length ? Buffer.concat(chunks.map(x => Buffer.from(x))) : Buffer.alloc(0);
    return { response: r, text: bytes.toString('utf8') };
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function htmlToMarkdown(html, baseUrl) {
  let s = String(html || '');
  s = s.replace(/<(script|style|noscript|template|svg)[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, inner) => '\n' + '#'.repeat(Number(n)) + ' ' + inner + '\n');
  s = s.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    try { href = new URL(href, baseUrl).href; } catch {}
    return '[' + text + '](' + href + ')';
  });
  s = s.replace(/<li[^>]*>/gi, '\n- ').replace(/<\/li>/gi, '');
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|section|article|header|footer|main|ul|ol)>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  return s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 200000);
}

function titleFromHtml(html) {
  const m = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 500) : null;
}

export function registerWebHandlers(app, assignment) {
  app.post('/v1/web/page-to-markdown', async (req, res) => {
    try {
      const u = await safeUrl(req.body?.url);
      const { response, text } = await fetchLimited(u.href, { headers: { accept: 'text/html,application/xhtml+xml' } });
      const type = String(response.headers.get('content-type') || '');
      if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) return res.status(415).json({ error: 'URL did not return HTML.' });
      const finalUrl = response.url || u.href;
      res.json({ ...assignment('page-to-markdown'), url: finalUrl, status: response.status, title: titleFromHtml(text), markdown: htmlToMarkdown(text, finalUrl), source: 'live fetch' });
    } catch (e) {
      res.status(Number(e?.status || 502)).json({ error: String(e?.message || e) });
    }
  });

  app.post('/v1/web/http-inspect', async (req, res) => {
    try {
      const u = await safeUrl(req.body?.url);
      const started = Date.now();
      let r = await fetch(u.href, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(10000), headers: { 'user-agent': '50M-Live-Web-Utility/1.0' } });
      if (r.status === 405 || r.status === 501) r = await fetch(u.href, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(10000), headers: { 'user-agent': '50M-Live-Web-Utility/1.0', range: 'bytes=0-0' } });
      res.json({
        ...assignment('http-inspect'),
        inputUrl: u.href,
        finalUrl: r.url || u.href,
        status: r.status,
        ok: r.ok,
        latencyMs: Date.now() - started,
        headers: {
          contentType: r.headers.get('content-type'),
          contentLength: r.headers.get('content-length'),
          cacheControl: r.headers.get('cache-control'),
          etag: r.headers.get('etag'),
          lastModified: r.headers.get('last-modified'),
          server: r.headers.get('server')
        }
      });
    } catch (e) {
      res.status(Number(e?.status || 502)).json({ error: String(e?.message || e) });
    }
  });

  app.post('/v1/network/dns-lookup', async (req, res) => {
    const domain = String(req.body?.domain || '').trim().toLowerCase().replace(/\.$/, '');
    if (!/^(?=.{1,253}$)(?!-)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(domain)) return res.status(400).json({ error: 'Valid domain is required.' });
    try {
      const settled = await Promise.all([
        dns.resolve4(domain).catch(() => []),
        dns.resolve6(domain).catch(() => []),
        dns.resolveMx(domain).catch(() => []),
        dns.resolveNs(domain).catch(() => []),
        dns.resolveTxt(domain).catch(() => [])
      ]);
      res.json({ ...assignment('dns-lookup'), domain, a: settled[0], aaaa: settled[1], mx: settled[2], ns: settled[3], txt: settled[4].map(x => x.join('')) });
    } catch {
      res.status(502).json({ error: 'DNS lookup failed.' });
    }
  });

  app.post('/v1/web/robots', async (req, res) => {
    try {
      const u = await safeUrl(req.body?.url);
      const target = new URL('/robots.txt', u.origin);
      const { response, text } = await fetchLimited(target.href, { headers: { accept: 'text/plain,*/*' } }, 300000);
      res.json({ ...assignment('robots'), url: target.href, status: response.status, text: text.slice(0, 250000) });
    } catch (e) {
      res.status(Number(e?.status || 502)).json({ error: String(e?.message || e) });
    }
  });

  app.post('/v1/web/sitemap', async (req, res) => {
    try {
      const u = await safeUrl(req.body?.url);
      const target = /\.xml(?:$|\?)/i.test(u.pathname + u.search) ? u : new URL('/sitemap.xml', u.origin);
      const { response, text } = await fetchLimited(target.href, { headers: { accept: 'application/xml,text/xml,*/*' } }, 2_000_000);
      const urls = [];
      const re = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi;
      let m;
      while ((m = re.exec(text)) && urls.length < 1000) urls.push(decodeEntities(m[1].trim()));
      res.json({ ...assignment('sitemap'), url: target.href, status: response.status, count: urls.length, urls });
    } catch (e) {
      res.status(Number(e?.status || 502)).json({ error: String(e?.message || e) });
    }
  });
}
