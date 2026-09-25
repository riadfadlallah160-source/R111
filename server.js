import express from 'express';
import crypto from 'node:crypto';
import { paymentMiddleware } from '@x402/express';
import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server';
import { registerExactEvmScheme } from '@x402/evm/exact/server';
import { declareDiscoveryExtension, bazaarResourceServerExtension } from '@x402/extensions/bazaar';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORT || 3000);
const PAY_TO = '0xf744573cdfFC211163c11c0a31730851Da78f708';
const NETWORK = 'eip155:8453';
const FACILITATOR = 'https://facilitator.openx402.ai';
const PUBLIC_BASE = 'https://fifty-million-agent-gateway.onrender.com';
const TOTAL_AGENTS = 50000000;
const AGENTS_PER_QUEUE = 5000;
const QUEUES = TOTAL_AGENTS / AGENTS_PER_QUEUE;

let requestsSinceBoot = 0;
let nextAgent = 0;

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR });
const resourceServer = new x402ResourceServer(facilitatorClient);
registerExactEvmScheme(resourceServer);
resourceServer.registerExtension(bazaarResourceServerExtension);

const paidRoutes = {
  'POST /v1/text/metrics': {
    accepts: [{ scheme: 'exact', price: '$0.001', network: NETWORK, payTo: PAY_TO }],
    description: 'Text metrics, reading time, vocabulary and sentence statistics.',
    mimeType: 'application/json',
    resource: {
      url: PUBLIC_BASE + '/v1/text/metrics',
      description: 'Text metrics, reading time, vocabulary and sentence statistics.',
      mimeType: 'application/json',
      serviceName: '50M Agent Utility Gateway',
      tags: ["text","metrics","analysis"]
    },
    extensions: declareDiscoveryExtension({
      bodyType: 'json',
      input: {"text":"Agent-ready text for analysis."},
        inputSchema: {
          type: 'object',
          properties: {"text":{"type":"string","description":"Input parameter for this utility."}},
          required: ["text"]
        },
        output: {
          example: {"agentId":1,"queueId":1,"skill":"text-metrics","metrics":{"words":5,"characters":29}},
          schema: { type: 'object', additionalProperties: true }
        }
    })
  },
  'POST /v1/text/extract': {
    accepts: [{ scheme: 'exact', price: '$0.001', network: NETWORK, payTo: PAY_TO }],
    description: 'Extract emails, URLs, hashtags, mentions, IPv4 addresses and numbers.',
    mimeType: 'application/json',
    resource: {
      url: PUBLIC_BASE + '/v1/text/extract',
      description: 'Extract emails, URLs, hashtags, mentions, IPv4 addresses and numbers.',
      mimeType: 'application/json',
      serviceName: '50M Agent Utility Gateway',
      tags: ["text","extract","data"]
    },
    extensions: declareDiscoveryExtension({
      bodyType: 'json',
      input: {"text":"Contact test@example.com and visit https://example.com"},
        inputSchema: {
          type: 'object',
          properties: {"text":{"type":"string","description":"Input parameter for this utility."}},
          required: ["text"]
        },
        output: {
          example: {"agentId":2,"skill":"text-extract","extracted":{"emails":["test@example.com"],"urls":["https://example.com"]}},
          schema: { type: 'object', additionalProperties: true }
        }
    })
  },
  'POST /v1/text/keywords': {
    accepts: [{ scheme: 'exact', price: '$0.001', network: NETWORK, payTo: PAY_TO }],
    description: 'Keyword frequency analysis with stop-word removal.',
    mimeType: 'application/json',
    resource: {
      url: PUBLIC_BASE + '/v1/text/keywords',
      description: 'Keyword frequency analysis with stop-word removal.',
      mimeType: 'application/json',
      serviceName: '50M Agent Utility Gateway',
      tags: ["keywords","text","analysis"]
    },
    extensions: declareDiscoveryExtension({
      bodyType: 'json',
      input: {"text":"AI agents use APIs. AI agents buy APIs.","limit":20},
        inputSchema: {
          type: 'object',
          properties: {"text":{"type":"string","description":"Input parameter for this utility."},"limit":{"type":"number","description":"Input parameter for this utility."}},
          required: ["text"]
        },
        output: {
          example: {"agentId":3,"skill":"keyword-frequency","keywords":[{"keyword":"ai","count":2}]},
          schema: { type: 'object', additionalProperties: true }
        }
    })
  },
  'POST /v1/text/dedupe': {
    accepts: [{ scheme: 'exact', price: '$0.001', network: NETWORK, payTo: PAY_TO }],
    description: 'Remove duplicate lines or list items while preserving order.',
    mimeType: 'application/json',
    resource: {
      url: PUBLIC_BASE + '/v1/text/dedupe',
      description: 'Remove duplicate lines or list items while preserving order.',
      mimeType: 'application/json',
      serviceName: '50M Agent Utility Gateway',
      tags: ["dedupe","cleanup","text"]
    },
    extensions: declareDiscoveryExtension({
      bodyType: 'json',
      input: {"items":["alpha","alpha","beta"]},
        inputSchema: {
          type: 'object',
          properties: {"items":{"type":"array","description":"Input parameter for this utility."}},
          required: ["items"]
        },
        output: {
          example: {"agentId":4,"skill":"dedupe","inputCount":3,"outputCount":2,"items":["alpha","beta"]},
          schema: { type: 'object', additionalProperties: true }
        }
    })
  },
  'POST /v1/url/normalize': {
    accepts: [{ scheme: 'exact', price: '$0.001', network: NETWORK, payTo: PAY_TO }],
    description: 'Normalize and validate URLs for agent pipelines.',
    mimeType: 'application/json',
    resource: {
      url: PUBLIC_BASE + '/v1/url/normalize',
      description: 'Normalize and validate URLs for agent pipelines.',
      mimeType: 'application/json',
      serviceName: '50M Agent Utility Gateway',
      tags: ["url","normalize","data"]
    },
    extensions: declareDiscoveryExtension({
      bodyType: 'json',
      input: {"urls":["example.com","https://openai.com"]},
        inputSchema: {
          type: 'object',
          properties: {"urls":{"type":"array","description":"Input parameter for this utility."}},
          required: ["urls"]
        },
        output: {
          example: {"agentId":5,"skill":"url-normalize","results":[{"input":"example.com","valid":true,"normalized":"https://example.com/"}]},
          schema: { type: 'object', additionalProperties: true }
        }
    })
  },
  'POST /v1/data/csv-to-json': {
    accepts: [{ scheme: 'exact', price: '$0.002', network: NETWORK, payTo: PAY_TO }],
    description: 'Convert CSV into structured JSON.',
    mimeType: 'application/json',
    resource: {
      url: PUBLIC_BASE + '/v1/data/csv-to-json',
      description: 'Convert CSV into structured JSON.',
      mimeType: 'application/json',
      serviceName: '50M Agent Utility Gateway',
      tags: ["csv","json","convert"]
    },
    extensions: declareDiscoveryExtension({
      bodyType: 'json',
      input: {"csv":"name,age\\nAda,36"},
        inputSchema: {
          type: 'object',
          properties: {"csv":{"type":"string","description":"Input parameter for this utility."}},
          required: ["csv"]
        },
        output: {
          example: {"agentId":6,"skill":"csv-to-json","rows":1,"data":[{"name":"Ada","age":"36"}]},
          schema: { type: 'object', additionalProperties: true }
        }
    })
  },
  'POST /v1/data/json-validate': {
    accepts: [{ scheme: 'exact', price: '$0.001', network: NETWORK, payTo: PAY_TO }],
    description: 'Validate JSON and return normalized compact and pretty forms.',
    mimeType: 'application/json',
    resource: {
      url: PUBLIC_BASE + '/v1/data/json-validate',
      description: 'Validate JSON and return normalized compact and pretty forms.',
      mimeType: 'application/json',
      serviceName: '50M Agent Utility Gateway',
      tags: ["json","validate","data"]
    },
    extensions: declareDiscoveryExtension({
      bodyType: 'json',
      input: {"json":"{\"ok\":true}"},
        inputSchema: {
          type: 'object',
          properties: {"json":{"type":"string","description":"Input parameter for this utility."}},
          required: ["json"]
        },
        output: {
          example: {"agentId":7,"skill":"json-validate","valid":true,"type":"object"},
          schema: { type: 'object', additionalProperties: true }
        }
    })
  },
  'POST /v1/data/hash': {
    accepts: [{ scheme: 'exact', price: '$0.001', network: NETWORK, payTo: PAY_TO }],
    description: 'Generate SHA-256, SHA-1 and MD5 hashes for supplied text.',
    mimeType: 'application/json',
    resource: {
      url: PUBLIC_BASE + '/v1/data/hash',
      description: 'Generate SHA-256, SHA-1 and MD5 hashes for supplied text.',
      mimeType: 'application/json',
      serviceName: '50M Agent Utility Gateway',
      tags: ["hash","sha256","utility"]
    },
    extensions: declareDiscoveryExtension({
      bodyType: 'json',
      input: {"text":"hello"},
        inputSchema: {
          type: 'object',
          properties: {"text":{"type":"string","description":"Input parameter for this utility."}},
          required: ["text"]
        },
        output: {
          example: {"agentId":8,"skill":"hash","hashes":{"sha256":"2cf24dba..."}},
          schema: { type: 'object', additionalProperties: true }
        }
    })
  }
};

app.use(paymentMiddleware(paidRoutes, resourceServer));

function assignment(skill) {
  nextAgent = (nextAgent % TOTAL_AGENTS) + 1;
  requestsSinceBoot += 1;
  return {
    agentId: nextAgent,
    queueId: Math.ceil(nextAgent / AGENTS_PER_QUEUE),
    skill: skill,
    activePopulation: TOTAL_AGENTS,
    totalQueues: QUEUES,
    requestNumberSinceBoot: requestsSinceBoot
  };
}

function requireText(req, res) {
  const text = typeof req.body?.text === 'string' ? req.body.text : '';
  if (!text.trim()) {
    res.status(400).json({ error: 'A non-empty text field is required.' });
    return null;
  }
  if (text.length > 500000) {
    res.status(413).json({ error: 'text is limited to 500,000 characters per call.' });
    return null;
  }
  return text;
}

function words(text) {
  return text.toLowerCase().match(/[a-z0-9]+(?:['’-][a-z0-9]+)*/g) || [];
}

function sentenceList(text) {
  const matches = text.trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  return matches ? matches.map(function(x) { return x.trim(); }).filter(Boolean) : [];
}

function syllables(word) {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!cleaned) return 0;
  if (cleaned.length <= 3) return 1;
  const stripped = cleaned.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/i, '').replace(/^y/, '');
  const groups = stripped.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

const stopWords = new Set(
  'a an and are as at be been but by for from had has have he her hers him his i if in into is it its me my of on or our ours she so that the their them they this to was we were what when where which who will with you your yours'.split(' ')
);

function parseCsv(input) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];
    if (ch === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some(function(value) { return value !== ''; }) || rows.length === 0) rows.push(row);
  return rows;
}

app.get('/', function(_req, res) {
  res.json({
    service: '50M Agent Utility Gateway',
    status: 'live',
    payment: 'x402 v2 / Base USDC',
    treasury: PAY_TO,
    activeAgentPopulation: TOTAL_AGENTS,
    queues: QUEUES,
    docs: '/openapi.json',
    discovery: '/.well-known/x402'
  });
});

app.get('/health', function(_req, res) {
  res.json({ ok: true, activeAgentPopulation: TOTAL_AGENTS, requestsSinceBoot: requestsSinceBoot });
});

app.get('/v1/pool/status', function(_req, res) {
  res.json({
    status: 'active',
    activeAgentPopulation: TOTAL_AGENTS,
    queues: QUEUES,
    agentsPerQueue: AGENTS_PER_QUEUE,
    requestsSinceBoot: requestsSinceBoot,
    settlementRail: 'Base USDC via x402',
    treasury: PAY_TO
  });
});

app.post('/v1/text/metrics', function(req, res) {
  const text = requireText(req, res);
  if (text === null) return;
  const ws = words(text);
  const ss = sentenceList(text);
  const unique = new Set(ws);
  const syllableCount = ws.reduce(function(sum, word) { return sum + syllables(word); }, 0);
  const wordCount = ws.length;
  const sentenceCount = Math.max(1, ss.length);
  const readingEase = wordCount
    ? 206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (syllableCount / wordCount)
    : 0;

  res.json({
    ...assignment('text-metrics'),
    metrics: {
      characters: text.length,
      charactersNoWhitespace: text.replace(/\s/g, '').length,
      words: wordCount,
      uniqueWords: unique.size,
      sentences: ss.length,
      lines: text.split(/\r?\n/).length,
      estimatedReadingMinutes: Number((wordCount / 220).toFixed(2)),
      lexicalDiversity: wordCount ? Number((unique.size / wordCount).toFixed(4)) : 0,
      fleschReadingEaseApprox: Number(readingEase.toFixed(2))
    }
  });
});

app.post('/v1/text/extract', function(req, res) {
  const text = requireText(req, res);
  if (text === null) return;
  const unique = function(list) { return Array.from(new Set(list)); };
  res.json({
    ...assignment('text-extract'),
    extracted: {
      emails: unique(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []),
      urls: unique(text.match(/https?:\/\/[^\s<>"']+/gi) || []),
      hashtags: unique(text.match(/#[\p{L}\p{N}_]+/gu) || []),
      mentions: unique(text.match(/@[A-Za-z0-9_]{2,}/g) || []),
      ipv4: unique(text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || []),
      numbers: unique(text.match(/[-+]?\b\d+(?:\.\d+)?\b/g) || [])
    }
  });
});

app.post('/v1/text/keywords', function(req, res) {
  const text = requireText(req, res);
  if (text === null) return;
  const limit = Math.min(100, Math.max(1, Number(req.body?.limit || 20)));
  const counts = new Map();
  for (const word of words(text)) {
    if (word.length < 2 || stopWords.has(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  const keywords = Array.from(counts.entries())
    .sort(function(a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); })
    .slice(0, limit)
    .map(function(pair) { return { keyword: pair[0], count: pair[1] }; });

  res.json({ ...assignment('keyword-frequency'), keywords: keywords });
});

app.post('/v1/text/dedupe', function(req, res) {
  const inputItems = Array.isArray(req.body?.items)
    ? req.body.items.map(function(value) { return String(value); })
    : typeof req.body?.text === 'string'
      ? req.body.text.split(/\r?\n/)
      : null;

  if (!inputItems) {
    res.status(400).json({ error: 'Provide items[] or text.' });
    return;
  }

  const caseSensitive = req.body?.caseSensitive !== false;
  const seen = new Set();
  const items = [];
  for (const item of inputItems) {
    const key = caseSensitive ? item : item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      items.push(item);
    }
  }

  res.json({
    ...assignment('dedupe'),
    inputCount: inputItems.length,
    outputCount: items.length,
    removed: inputItems.length - items.length,
    items: items
  });
});

app.post('/v1/url/normalize', function(req, res) {
  const raw = Array.isArray(req.body?.urls)
    ? req.body.urls.map(String)
    : typeof req.body?.url === 'string'
      ? [req.body.url]
      : [];

  if (!raw.length) {
    res.status(400).json({ error: 'Provide url or urls[].' });
    return;
  }

  const results = raw.slice(0, 1000).map(function(value) {
    try {
      const candidate = /^https?:\/\//i.test(value) ? value : 'https://' + value;
      const url = new URL(candidate);
      url.hash = '';
      url.hostname = url.hostname.toLowerCase();
      if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
        url.port = '';
      }
      return { input: value, valid: true, normalized: url.toString() };
    } catch {
      return { input: value, valid: false, normalized: null };
    }
  });

  res.json({ ...assignment('url-normalize'), results: results });
});

app.post('/v1/data/csv-to-json', function(req, res) {
  const csv = typeof req.body?.csv === 'string' ? req.body.csv : '';
  if (!csv.trim()) {
    res.status(400).json({ error: 'A non-empty csv field is required.' });
    return;
  }
  if (csv.length > 1000000) {
    res.status(413).json({ error: 'csv is limited to 1,000,000 characters per call.' });
    return;
  }

  const rows = parseCsv(csv);
  const headers = rows.shift() || [];
  const data = rows
    .filter(function(row) { return row.some(function(cell) { return cell !== ''; }); })
    .map(function(row) {
      const record = {};
      headers.forEach(function(header, i) {
        record[header || 'column_' + (i + 1)] = row[i] || '';
      });
      return record;
    });

  res.json({ ...assignment('csv-to-json'), headers: headers, rows: data.length, data: data });
});

app.post('/v1/data/json-validate', function(req, res) {
  const value = req.body?.json;
  let parsed;
  try {
    parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (parsed === undefined) throw new Error('undefined');
  } catch (err) {
    res.json({
      ...assignment('json-validate'),
      valid: false,
      error: err instanceof Error ? err.message : 'Invalid JSON'
    });
    return;
  }

  res.json({
    ...assignment('json-validate'),
    valid: true,
    type: Array.isArray(parsed) ? 'array' : parsed === null ? 'null' : typeof parsed,
    compact: JSON.stringify(parsed),
    pretty: JSON.stringify(parsed, null, 2)
  });
});

app.post('/v1/data/hash', function(req, res) {
  const text = requireText(req, res);
  if (text === null) return;
  const digest = function(algorithm) {
    return crypto.createHash(algorithm).update(text, 'utf8').digest('hex');
  };

  res.json({
    ...assignment('hash'),
    hashes: {
      sha256: digest('sha256'),
      sha1: digest('sha1'),
      md5: digest('md5')
    }
  });
});

const routeMeta = Object.entries(paidRoutes).map(function(entry) {
  const parts = entry[0].split(' ');
  const config = entry[1];
  return {
    method: parts[0],
    path: parts[1],
    price: config.accepts[0].price,
    network: NETWORK,
    payTo: PAY_TO,
    description: config.description
  };
});

app.get('/.well-known/x402', function(_req, res) {
  res.json({
    x402Version: 2,
    service: '50M Agent Utility Gateway',
    network: NETWORK,
    payTo: PAY_TO,
    facilitator: FACILITATOR,
    resources: routeMeta
  });
});

app.get('/openapi.json', function(req, res) {
  const paths = {};
  for (const item of routeMeta) {
    paths[item.path] = {
      post: {
        summary: item.description,
        description: 'x402-paid endpoint. Price: ' + item.price + ' USDC on Base.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', additionalProperties: true }
            }
          }
        },
        responses: {
          '200': { description: 'Paid result' },
          '402': { description: 'x402 Payment Required' }
        },
        'x-payment-info': {
          protocol: 'x402',
          price: item.price,
          network: NETWORK,
          payTo: PAY_TO
        }
      }
    };
  }

  const host = req.get('host');
  const protocol = req.get('x-forwarded-proto') || req.protocol;
  res.json({
    openapi: '3.1.0',
    info: {
      title: '50M Agent Utility Gateway',
      version: '1.0.0',
      description: 'Eight deterministic pay-per-call utilities for autonomous agents, settled in Base USDC via x402.'
    },
    servers: [{ url: protocol + '://' + host }],
    paths: paths
  });
});

app.use(function(err, _req, res, _next) {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, '0.0.0.0', function() {
  console.log('50M Agent Utility Gateway listening on port ' + PORT);
  console.log('x402 facilitator: ' + FACILITATOR);
  console.log('Base USDC payTo: ' + PAY_TO);
});
