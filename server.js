import express from 'express';
import crypto from 'node:crypto';
import { startBasedAgentsHunter } from './worker.js';
import { paymentMiddleware } from '@x402/express';
import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server';
import { registerExactEvmScheme } from '@x402/evm/exact/server';
import { declareDiscoveryExtension, bazaarResourceServerExtension } from '@x402/extensions/bazaar';
import { createPremiumPaidRoutes, registerPremiumHandlers } from './premium.js';
import { createSwarmPaidRoute, registerSwarmHandler } from './swarm.js';
import { createMarketPaidRoutes, registerMarketHandlers } from './market.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '4mb' }));

const PORT = Number(process.env.PORT || 3000);
const PAY_TO = '0xf744573cdfFC211163c11c0a31730851Da78f708';
const NETWORK = 'eip155:8453';
const FACILITATOR = 'https://facilitator.openx402.ai';
const PUBLIC_BASE = 'https://fifty-million-agent-gateway.onrender.com';
const TOTAL_AGENTS = 50000000;
const AGENTS_PER_QUEUE = 5000;
const QUEUES = TOTAL_AGENTS / AGENTS_PER_QUEUE;
const PRICE_PER_EXECUTION_USD = 1;
const DAILY_TARGET_USD = TOTAL_AGENTS * PRICE_PER_EXECUTION_USD;
let domainVerificationHash = '';

let requestsSinceBoot = 0;
let nextAgent = 0;
let dailyFilled = 0;
let settledUsdToday = 0;
let currentLagosDay = lagosDayKey();
const settledTransactions = new Set();

function lagosDayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function refreshDailyLedger() {
  const today = lagosDayKey();
  if (today !== currentLagosDay) {
    currentLagosDay = today;
    dailyFilled = 0;
    settledUsdToday = 0;
    nextAgent = 0;
    settledTransactions.clear();
  }
}

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR });
const resourceServer = new x402ResourceServer(facilitatorClient);
registerExactEvmScheme(resourceServer);
resourceServer.registerExtension(bazaarResourceServerExtension);

resourceServer.onAfterSettle(async ({ result, requirements, phase }) => {
  if (!result?.success || !result.transaction) return;
  if (phase && phase !== 'after-handler' && phase !== 'upfront') return;
  if (settledTransactions.has(result.transaction)) return;

  const atomic = Number(result.amount || requirements.amount || '0');
  if (!Number.isFinite(atomic) || atomic <= 0) return;

  const usd = atomic / 1_000_000;
  settledTransactions.add(result.transaction);
  refreshDailyLedger();
  settledUsdToday += usd;
  dailyFilled = Math.min(TOTAL_AGENTS, Math.floor(settledUsdToday));

  console.log(
    'Confirmed settlement recorded:',
    JSON.stringify({
      transaction: result.transaction,
      payer: result.payer || '',
      usd,
      settledUsdToday,
      filledToday: dailyFilled,
      remainingToday: Math.max(0, TOTAL_AGENTS - dailyFilled)
    })
  );
});

const paidRoutes = {
  ...createMarketPaidRoutes({ PAY_TO, NETWORK, PUBLIC_BASE }),
  ...createSwarmPaidRoute({ PAY_TO, NETWORK, PUBLIC_BASE }),
  ...createPremiumPaidRoutes({ PAY_TO, NETWORK, PUBLIC_BASE }),
  'POST /v1/text/metrics': {
    accepts: [{ scheme: 'exact', price: '$1', network: NETWORK, payTo: PAY_TO }],
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
    accepts: [{ scheme: 'exact', price: '$1', network: NETWORK, payTo: PAY_TO }],
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
    accepts: [{ scheme: 'exact', price: '$1', network: NETWORK, payTo: PAY_TO }],
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
    accepts: [{ scheme: 'exact', price: '$1', network: NETWORK, payTo: PAY_TO }],
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
    accepts: [{ scheme: 'exact', price: '$1', network: NETWORK, payTo: PAY_TO }],
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
    accepts: [{ scheme: 'exact', price: '$1', network: NETWORK, payTo: PAY_TO }],
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
    accepts: [{ scheme: 'exact', price: '$1', network: NETWORK, payTo: PAY_TO }],
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
    accepts: [{ scheme: 'exact', price: '$1', network: NETWORK, payTo: PAY_TO }],
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
  },
  'POST /v1/slot/run': {
    accepts: [{ scheme: 'exact', price: '$1', network: NETWORK, payTo: PAY_TO }],
    description: 'Universal one-dollar agent slot. Run one deterministic operation: metrics, extract, keywords, dedupe, normalize-url, csv-to-json, json-validate, or hash.',
    mimeType: 'application/json',
    resource: {
      url: PUBLIC_BASE + '/v1/slot/run',
      description: 'Universal one-dollar deterministic agent work endpoint.',
      mimeType: 'application/json',
      serviceName: '50M Dollar Slot',
      tags: ["agent","dollar","utility","data","x402"]
    },
    extensions: declareDiscoveryExtension({
      bodyType: 'json',
      input: {"operation":"hash","input":{"text":"hello"}},
      inputSchema: {
        type: 'object',
        properties: {
          operation: { type: 'string', description: 'metrics | extract | keywords | dedupe | normalize-url | csv-to-json | json-validate | hash' },
          input: { type: 'object', description: 'Operation-specific JSON input.' }
        },
        required: ["operation","input"]
      },
      output: {
        example: {"agentId":1,"earnedByThisExecutionUsd":1,"operation":"hash","result":{"sha256":"..."}},
        schema: { type: 'object', additionalProperties: true }
      }
    })
  }
};

app.use(paymentMiddleware(paidRoutes, resourceServer));

function assignment(skill) {
  refreshDailyLedger();
  requestsSinceBoot += 1;
  nextAgent = (nextAgent % TOTAL_AGENTS) + 1;
  return {
    agentId: nextAgent,
    queueId: Math.ceil(nextAgent / AGENTS_PER_QUEUE),
    skill: skill,
    activePopulation: TOTAL_AGENTS,
    totalQueues: QUEUES,
    day: currentLagosDay,
    settlementStatus: 'pending-until-x402-settles',
    confirmedFilledToday: dailyFilled,
    confirmedRemainingToday: Math.max(0, TOTAL_AGENTS - dailyFilled),
    dailyTargetUsd: DAILY_TARGET_USD,
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
    discovery: '/.well-known/x402',
    pricePerSuccessfulExecutionUsd: PRICE_PER_EXECUTION_USD,
    dailyAgentTargetUsd: DAILY_TARGET_USD,
    accountingBasis: 'successful x402 settlement only'
  });
});

app.get('/health', function(_req, res) {
  res.json({ ok: true, activeAgentPopulation: TOTAL_AGENTS, requestsSinceBoot: requestsSinceBoot });
});

app.get('/v1/pool/status', function(_req, res) {
  refreshDailyLedger();
  res.json({
    status: 'active',
    day: currentLagosDay,
    timezone: 'Africa/Lagos',
    activeAgentPopulation: TOTAL_AGENTS,
    queues: QUEUES,
    agentsPerQueue: AGENTS_PER_QUEUE,
    pricePerSuccessfulExecutionUsd: PRICE_PER_EXECUTION_USD,
    dailyTargetUsd: DAILY_TARGET_USD,
    filledToday: dailyFilled,
    remainingToday: Math.max(0, TOTAL_AGENTS - dailyFilled),
    confirmedSettledUsdToday: settledUsdToday,
    accountingBasis: 'successful x402 settlement only',
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


app.post('/v1/slot/run', function(req, res) {
  const operation = String(req.body?.operation || '').toLowerCase();
  const input = req.body?.input && typeof req.body.input === 'object' ? req.body.input : {};
  let result;

  if (operation === 'hash') {
    const text = String(input.text || '');
    if (!text) return res.status(400).json({ error: 'input.text is required for hash.' });
    const digest = algorithm => crypto.createHash(algorithm).update(text, 'utf8').digest('hex');
    result = { sha256: digest('sha256'), sha1: digest('sha1'), md5: digest('md5') };
  } else if (operation === 'metrics') {
    const text = String(input.text || '');
    if (!text) return res.status(400).json({ error: 'input.text is required for metrics.' });
    const ws = words(text);
    result = {
      characters: text.length,
      charactersNoWhitespace: text.replace(/\s/g, '').length,
      words: ws.length,
      uniqueWords: new Set(ws).size,
      lines: text.split(/\r?\n/).length
    };
  } else if (operation === 'extract') {
    const text = String(input.text || '');
    if (!text) return res.status(400).json({ error: 'input.text is required for extract.' });
    const unique = list => Array.from(new Set(list));
    result = {
      emails: unique(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []),
      urls: unique(text.match(/https?:\/\/[^\s<>"']+/gi) || []),
      hashtags: unique(text.match(/#[\p{L}\p{N}_]+/gu) || []),
      mentions: unique(text.match(/@[A-Za-z0-9_]{2,}/g) || []),
      numbers: unique(text.match(/[-+]?\b\d+(?:\.\d+)?\b/g) || [])
    };
  } else if (operation === 'keywords') {
    const text = String(input.text || '');
    if (!text) return res.status(400).json({ error: 'input.text is required for keywords.' });
    const counts = new Map();
    for (const word of words(text)) {
      if (word.length < 2 || stopWords.has(word)) continue;
      counts.set(word, (counts.get(word) || 0) + 1);
    }
    result = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, Math.min(100, Math.max(1, Number(input.limit || 20))))
      .map(([keyword, count]) => ({ keyword, count }));
  } else if (operation === 'dedupe') {
    const items = Array.isArray(input.items)
      ? input.items.map(String)
      : String(input.text || '').split(/\r?\n/).filter(Boolean);
    if (!items.length) return res.status(400).json({ error: 'input.items or input.text is required for dedupe.' });
    result = Array.from(new Set(items));
  } else if (operation === 'normalize-url') {
    const raw = Array.isArray(input.urls) ? input.urls.map(String) : [String(input.url || '')].filter(Boolean);
    if (!raw.length) return res.status(400).json({ error: 'input.url or input.urls is required.' });
    result = raw.slice(0, 1000).map(value => {
      try {
        const candidate = /^https?:\/\//i.test(value) ? value : 'https://' + value;
        const url = new URL(candidate);
        url.hash = '';
        url.hostname = url.hostname.toLowerCase();
        return { input: value, valid: true, normalized: url.toString() };
      } catch {
        return { input: value, valid: false, normalized: null };
      }
    });
  } else if (operation === 'csv-to-json') {
    const csv = String(input.csv || '');
    if (!csv) return res.status(400).json({ error: 'input.csv is required.' });
    const rows = parseCsv(csv);
    const headers = rows.shift() || [];
    result = rows.filter(row => row.some(cell => cell !== '')).map(row => {
      const record = {};
      headers.forEach((header, i) => { record[header || 'column_' + (i + 1)] = row[i] || ''; });
      return record;
    });
  } else if (operation === 'json-validate') {
    try {
      const parsed = typeof input.json === 'string' ? JSON.parse(input.json) : input.json;
      if (parsed === undefined) throw new Error('input.json is required.');
      result = { valid: true, type: Array.isArray(parsed) ? 'array' : parsed === null ? 'null' : typeof parsed, compact: JSON.stringify(parsed), pretty: JSON.stringify(parsed, null, 2) };
    } catch (err) {
      result = { valid: false, error: err instanceof Error ? err.message : String(err) };
    }
  } else {
    return res.status(400).json({ error: 'Unknown operation.' });
  }

  res.json({
    ...assignment('universal-' + operation),
    operation,
    result
  });
});

app.get('/.well-known/402index-verify.txt', function(_req, res) {
  if (!domainVerificationHash) return res.status(503).type('text/plain').send('verification-not-ready');
  res.type('text/plain').send(domainVerificationHash);
});

app.get('/.well-known/x402-service.json', function(_req, res) {
  res.json({
    x402: '1.0',
    name: '50m-dollar-slot',
    capabilities: ['data','automation','text','json','csv','hashing','normalization'],
    pricing: { currency: 'USDC', base: '1.00', unit: 'request' },
    payment: {
      address: PAY_TO,
      chain: 'base',
      facilitator: FACILITATOR
    },
    endpoint: PUBLIC_BASE + '/v1/slot/run'
  });
});


async function verify402IndexDomain() {
  try {
    const claim = await fetch('https://402index.io/api/v1/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domain: 'fifty-million-agent-gateway.onrender.com' })
    });
    const body = await claim.json().catch(() => ({}));

    if (claim.status === 409) {
      console.log('402Index domain verification: already verified');
      return;
    }
    if (!claim.ok || !body.verification_hash) {
      console.error('402Index domain claim failed:', claim.status, JSON.stringify(body).slice(0, 300));
      return;
    }

    domainVerificationHash = String(body.verification_hash);
    await new Promise(resolve => setTimeout(resolve, 1200));

    const verify = await fetch('https://402index.io/api/v1/claim/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domain: 'fifty-million-agent-gateway.onrender.com' })
    });
    const verified = await verify.text();
    console.log('402Index domain verification:', verify.status, verified.slice(0, 500));
  } catch (error) {
    console.error('402Index domain verification failed:', error instanceof Error ? error.message : String(error));
  }
}

async function log402Opportunities() {
  try {
    const response = await fetch('https://402index.io/api/v1/opportunities?protocol=x402');
    const body = await response.text();
    console.log('402Index opportunities:', response.status, body.slice(0, 6000));
  } catch (error) {
    console.error('402Index opportunities failed:', error instanceof Error ? error.message : String(error));
  }
}

async function registerWith402Index() {
  const listings = [
    {
      path: '/v1/slot/run',
      name: '50M Dollar Slot',
      category: 'tools/data',
      description: 'Universal deterministic agent work endpoint. Every successful execution costs exactly $1 USDC on Base.',
      probe: { operation: 'hash', input: { text: 'verification' } }
    },
    {
      path: '/v1/market/crypto-price',
      name: '50M Live Crypto Price',
      category: 'market-data/crypto-price',
      description: 'Live USD crypto spot-price lookup. One successful call costs exactly $1 USDC on Base.',
      probe: { id: 'bitcoin' }
    },
    {
      path: '/v1/base/network-status',
      name: '50M Base Network Status',
      category: 'blockchain-data/network-status',
      description: 'Live Base mainnet block height, gas price and chain ID. One successful call costs exactly $1 USDC.',
      probe: {}
    },
    {
      path: '/v1/security/static-analysis',
      name: '50M Static Security Analysis',
      category: 'security/static-analysis',
      description: 'Defensive source-code static analysis. One successful call costs exactly $1 USDC on Base.',
      probe: { files: [{ path: 'app.js', content: 'const value = input;' }] }
    },
    {
      path: '/v1/web/analyze',
      name: '50M Web Analysis',
      category: 'data/web-analysis',
      description: 'HTML metadata, accessibility and security analysis. One successful call costs exactly $1 USDC.',
      probe: { html: '<html><head><title>Example</title></head><body><h1>Hello</h1></body></html>', url: 'https://example.com' }
    },
    {
      path: '/v1/security/pii-scan',
      name: '50M Privacy Scan',
      category: 'digital-products/security-tools',
      description: 'PII and accidental-secret detection for text batches. One successful call costs exactly $1 USDC.',
      probe: { texts: ['Contact sample@example.com'] }
    },
    {
      path: '/v1/data/profile',
      name: '50M Data Profiler',
      category: 'digital-products/data-tools',
      description: 'Batch JSON data profiling and quality statistics. One successful call costs exactly $1 USDC.',
      probe: { records: [{ id: 1, score: 98 }] }
    },
    {
      path: '/v1/swarm/batch',
      name: '50M Swarm Batch',
      category: 'tools/data',
      description: 'Dynamic-price parallel swarm endpoint: exactly $1 per successful work unit, up to 5,000 units per paid batch.',
      probe: { jobs: [{ operation: 'hash', input: { text: 'verification' } }] }
    }
  ];

  for (const item of listings) {
    try {
      const response = await fetch('https://402index.io/api/v1/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: PUBLIC_BASE + item.path,
          name: item.name,
          protocol: 'x402',
          http_method: 'POST',
          probe_body: JSON.stringify(item.probe),
          description: item.description,
          price_usd: 1,
          payment_asset: 'USDC',
          payment_network: 'Base',
          category: item.category,
          provider: '50M Agent Utility Gateway'
        })
      });
      const body = await response.text();
      console.log('402Index registration:', item.name, response.status, body.slice(0, 350));
    } catch (error) {
      console.error('402Index registration failed:', item.name, error instanceof Error ? error.message : String(error));
    }
  }
}

async function registerWithTrue402() {
  try {
    const response = await fetch('https://true402.dev/api/v1/services', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: PUBLIC_BASE,
        manifest: {
          x402: '1.0',
          name: '50m-dollar-slot',
          capabilities: ['data','automation','text','json','csv','hashing','normalization'],
          pricing: { currency: 'USDC', base: '1.00', unit: 'request' },
          payment: {
            address: PAY_TO,
            chain: 'base',
            facilitator: FACILITATOR
          },
          endpoint: PUBLIC_BASE + '/v1/slot/run'
        }
      })
    });
    const body = await response.text();
    console.log('true402 registration:', response.status, body.slice(0, 400));
  } catch (error) {
    console.error('true402 registration failed:', error instanceof Error ? error.message : String(error));
  }
}

registerPremiumHandlers(app, assignment);
registerSwarmHandler(app, assignment, crypto);
registerMarketHandlers(app, assignment);

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
      description: 'Eight $1-per-successful-execution utilities for autonomous agents. Each paid execution fills one of 50,000,000 daily agent earning slots and settles in Base USDC via x402.'
    },
    servers: [{ url: protocol + '://' + host }],
    paths: paths
  });
});

app.use(function(err, _req, res, _next) {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});


const PAYAN_BASE = 'https://payanagent.com';
const PAYAN_TITLES = [
  '50M Dollar Slot — Text Metrics',
  '50M Dollar Slot — Text Extraction',
  '50M Dollar Slot — Keyword Analysis',
  '50M Dollar Slot — Deduplication',
  '50M Dollar Slot — URL Normalization',
  '50M Dollar Slot — CSV to JSON',
  '50M Dollar Slot — JSON Validation',
  '50M Dollar Slot — Hashing'
];

const payanOffers = [
  { title: PAYAN_TITLES[0], path: '/v1/text/metrics', category: 'Data', tags: ['text','metrics','agents'], body: { text: 'verification sample' } },
  { title: PAYAN_TITLES[1], path: '/v1/text/extract', category: 'Data', tags: ['extract','text','agents'], body: { text: 'contact sample@example.com https://example.com' } },
  { title: PAYAN_TITLES[2], path: '/v1/text/keywords', category: 'Data', tags: ['keywords','analysis','agents'], body: { text: 'agent agent marketplace data' } },
  { title: PAYAN_TITLES[3], path: '/v1/text/dedupe', category: 'Data', tags: ['dedupe','cleanup','agents'], body: { items: ['alpha','alpha','beta'] } },
  { title: PAYAN_TITLES[4], path: '/v1/url/normalize', category: 'Data', tags: ['url','normalize','agents'], body: { urls: ['example.com'] } },
  { title: PAYAN_TITLES[5], path: '/v1/data/csv-to-json', category: 'Data', tags: ['csv','json','convert'], body: { csv: 'name,age\\nAda,36' } },
  { title: PAYAN_TITLES[6], path: '/v1/data/json-validate', category: 'Data', tags: ['json','validate','agents'], body: { json: '{"ok":true}' } },
  { title: PAYAN_TITLES[7], path: '/v1/data/hash', category: 'Data', tags: ['hash','sha256','agents'], body: { text: 'hello' } }
];

async function registerWithPayanAgent() {
  try {
    const lookup = await fetch(PAYAN_BASE + '/api/v1/offers?q=' + encodeURIComponent('50M Dollar Slot') + '&limit=50');
    if (lookup.ok) {
      const current = await lookup.json();
      const offers = Array.isArray(current.offers) ? current.offers : [];
      const existingTitles = new Set(offers.map(o => o.title));
      const missing = payanOffers.filter(o => !existingTitles.has(o.title));
      if (missing.length === 0) {
        console.log('PayanAgent listing: all 8 dollar-slot offers already present');
        return;
      }
    }

    const registration = await fetch(PAYAN_BASE + '/api/v1/agents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'FiftyMillionPool-f708',
        description: 'Eight deterministic one-dollar machine services backed by a 50,000,000-slot daily earning pool.',
        walletAddress: PAY_TO,
        chain: 'base',
        tags: ['x402','data','automation','agents'],
        providerType: 'agent'
      })
    });

    const regBody = await registration.json();
    if (!registration.ok || !regBody.apiKey) {
      console.error('PayanAgent registration failed:', registration.status, JSON.stringify(regBody).slice(0, 400));
      return;
    }

    const apiKey = regBody.apiKey;
    let created = 0;

    for (const offer of payanOffers) {
      const response = await fetch(PAYAN_BASE + '/api/v1/offers', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify({
          title: offer.title,
          description: 'Deterministic ' + offer.title.replace('50M Dollar Slot — ', '') + ' service. One successful x402 call costs exactly $1 USDC on Base and fills one real daily earning slot.',
          category: offer.category,
          tags: offer.tags,
          offerType: 'api',
          externalUrl: PUBLIC_BASE + offer.path,
          httpMethod: 'POST',
          verificationBody: offer.body
        })
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        created += 1;
        console.log('PayanAgent offer listed:', offer.title, body.offerId || body._id || 'ok');
      } else {
        console.error('PayanAgent offer failed:', offer.title, response.status, JSON.stringify(body).slice(0, 300));
      }
    }

    console.log('PayanAgent listing session complete:', created, 'offers created');
  } catch (error) {
    console.error('PayanAgent listing failed:', error instanceof Error ? error.message : String(error));
  }
}

async function registerWithTollbooth() {
  try {
    const payload = {
      name: '50M Swarm Batch',
      endpoint: PUBLIC_BASE + '/v1/swarm/batch',
      category: 'data',
      priceUsdc: 1,
      wallet: PAY_TO,
      chain: 'base',
      description: 'Dynamic x402 swarm endpoint: $1 per successful work unit, up to 5,000 units per paid batch.'
    };
    const response = await fetch('https://www.trytollbooth.com/api/services', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const body = await response.text();
    console.log('Tollbooth registration:', response.status, body.slice(0, 700));
  } catch (error) {
    console.error('Tollbooth registration failed:', error instanceof Error ? error.message : String(error));
  }
}

async function registerWithAgent402() {
  try {
    const response = await fetch('https://agent402.tools/api/index/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ origin: PUBLIC_BASE })
    });
    const text = await response.text();
    console.log('Agent402 registration:', response.status, text.slice(0, 300));
  } catch (error) {
    console.error('Agent402 registration failed:', error instanceof Error ? error.message : String(error));
  }
}

app.listen(PORT, '0.0.0.0', function() {
  console.log('50M Agent Utility Gateway listening on port ' + PORT);
  console.log('x402 facilitator: ' + FACILITATOR);
  console.log('Base USDC payTo: ' + PAY_TO);
  void registerWithAgent402();
  void registerWithTollbooth();
  void registerWithTrue402();
  void registerWith402Index();
  void verify402IndexDomain();
  void log402Opportunities();
  void registerWithPayanAgent();
});
