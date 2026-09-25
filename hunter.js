import {
  RegistryClient,
  deserializeKeypair,
  publicKeyToAgentId,
  ApiError,
} from 'basedagents';
import crypto from 'node:crypto';

const PAYOUT_WALLET = process.env.PAYOUT_WALLET || '0xf744573cdfFC211163c11c0a31730851Da78f708';
const KEYPAIR_JSON = process.env.BASEDAGENTS_KEYPAIR_JSON;
const NETWORK = 'eip155:8453';
const MIN_USDC = '1.00';

if (!KEYPAIR_JSON) {
  throw new Error('BASEDAGENTS_KEYPAIR_JSON is required');
}

const kp = deserializeKeypair(KEYPAIR_JSON);
const agentId = publicKeyToAgentId(kp.publicKey);
const client = new RegistryClient();

function log(event, data = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, agentId, ...data }));
}

function extractFence(text) {
  const mark = String.fromCharCode(96).repeat(3);
  const start = text.indexOf(mark);
  if (start < 0) return null;
  const firstNewline = text.indexOf('\n', start + 3);
  if (firstNewline < 0) return null;
  const end = text.indexOf(mark, firstNewline + 1);
  if (end < 0) return null;
  return text.slice(firstNewline + 1, end).trim();
}

function extractInput(text) {
  const fenced = extractFence(text);
  if (fenced) return fenced;

  const marker = text.match(/(?:input|text|data|content|payload|value)\s*:\s*([\s\S]+)/i);
  if (marker && marker[1].trim()) return marker[1].trim();

  const quoted = text.match(/["“]([^"”]{5,5000})["”]/s);
  if (quoted) return quoted[1].trim();

  return null;
}

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
  if (row.some(Boolean) || rows.length === 0) rows.push(row);
  return rows;
}

function words(text) {
  return text.toLowerCase().match(/[a-z0-9]+(?:['’-][a-z0-9]+)*/g) || [];
}

const stopWords = new Set(
  'a an and are as at be been but by for from had has have he her hers him his i if in into is it its me my of on or our ours she so that the their them they this to was we were what when where which who will with you your yours'.split(' ')
);

function solveTask(task) {
  const spec = [task.title, task.description, task.expected_output].filter(Boolean).join('\n');
  const lower = spec.toLowerCase();
  const input = extractInput(spec);

  if ((lower.includes('sha-256') || lower.includes('sha256') || lower.includes('hash')) && input) {
    return {
      kind: 'hash',
      result: {
        sha256: crypto.createHash('sha256').update(input).digest('hex'),
        sha1: crypto.createHash('sha1').update(input).digest('hex'),
        md5: crypto.createHash('md5').update(input).digest('hex'),
      },
    };
  }

  if ((lower.includes('csv') && lower.includes('json')) && input) {
    const rows = parseCsv(input);
    const headers = rows.shift() || [];
    const data = rows.filter(r => r.some(Boolean)).map(row =>
      Object.fromEntries(headers.map((h, i) => [h || 'column_' + (i + 1), row[i] ?? '']))
    );
    return { kind: 'csv-to-json', result: data };
  }

  if ((lower.includes('validate json') || lower.includes('json valid') || lower.includes('pretty json')) && input) {
    try {
      const parsed = JSON.parse(input);
      return { kind: 'json-validation', result: { valid: true, parsed, pretty: JSON.stringify(parsed, null, 2) } };
    } catch (err) {
      return { kind: 'json-validation', result: { valid: false, error: err instanceof Error ? err.message : String(err) } };
    }
  }

  if ((lower.includes('dedup') || lower.includes('remove duplicate')) && input) {
    const items = input.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    if (items.length >= 2) {
      return { kind: 'dedupe', result: [...new Set(items)] };
    }
  }

  if ((lower.includes('extract email') || lower.includes('extract url') || lower.includes('extract data')) && input) {
    const unique = arr => [...new Set(arr)];
    return {
      kind: 'extract',
      result: {
        emails: unique(input.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []),
        urls: unique(input.match(/https?:\/\/[^\s<>"']+/gi) || []),
        hashtags: unique(input.match(/#[\p{L}\p{N}_]+/gu) || []),
        mentions: unique(input.match(/@[A-Za-z0-9_]{2,}/g) || []),
        numbers: unique(input.match(/[-+]?\b\d+(?:\.\d+)?\b/g) || []),
      },
    };
  }

  if ((lower.includes('keyword') || lower.includes('word frequency')) && input) {
    const counts = new Map();
    for (const word of words(input)) {
      if (word.length < 2 || stopWords.has(word)) continue;
      counts.set(word, (counts.get(word) || 0) + 1);
    }
    const keywords = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 50)
      .map(([keyword, count]) => ({ keyword, count }));
    return { kind: 'keywords', result: keywords };
  }

  if ((lower.includes('normalize url') || lower.includes('clean url')) && input) {
    const raw = input.split(/\s+/).filter(x => x.includes('.') || /^https?:/i.test(x)).slice(0, 100);
    if (raw.length) {
      const results = raw.map(value => {
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
      return { kind: 'url-normalize', result: results };
    }
  }

  if ((lower.includes('text metric') || lower.includes('word count') || lower.includes('character count')) && input) {
    const ws = words(input);
    return {
      kind: 'text-metrics',
      result: {
        characters: input.length,
        charactersNoWhitespace: input.replace(/\s/g, '').length,
        words: ws.length,
        uniqueWords: new Set(ws).size,
        lines: input.split(/\r?\n/).length,
      },
    };
  }

  return null;
}

async function ensureIdentity() {
  let agent;
  try {
    agent = await client.getAgent(agentId);
    log('identity_exists', { status: agent.status, name: agent.name });
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) throw err;
    const suffix = agentId.replace('ag_', '').slice(0, 8);
    agent = await client.register(kp, {
      name: 'FiftyMillionPool-' + suffix,
      description: 'Autonomous deterministic data worker specializing in structured transforms, validation, extraction, hashing, normalization and data cleanup.',
      capabilities: ['data', 'automation', 'data-cleaning', 'json', 'csv', 'text-processing'],
      protocols: ['https', 'x402'],
      homepage: 'https://fifty-million-agent-gateway.onrender.com',
    });
    log('identity_registered', { status: agent.status, name: agent.name });
  }

  await client.updateWallet(kp, {
    wallet_address: PAYOUT_WALLET,
    wallet_network: NETWORK,
  });
  log('wallet_ready', { wallet: PAYOUT_WALLET, network: NETWORK });
  return agent;
}

async function findWork() {
  const { tasks } = await client.getTasks({
    status: 'open',
    min_usdc: MIN_USDC,
    limit: 50,
  });

  const candidates = tasks.filter(task => {
    const bounty = task.bounty;
    const funded = task.escrow?.status === 'funded';
    return Boolean(
      task.claimable &&
      bounty &&
      bounty.network === NETWORK &&
      funded &&
      Number(bounty.amount_display) >= 1
    );
  });

  log('scan', { openPaid: tasks.length, fundedClaimable: candidates.length });

  for (const task of candidates) {
    if (task.output_format === 'link') continue;
    const solution = solveTask(task);
    if (!solution) continue;

    log('candidate', {
      taskId: task.task_id,
      title: task.title,
      bounty: task.bounty?.amount_display,
      solver: solution.kind,
    });

    try {
      await client.claimTask(kp, task.task_id);
    } catch (err) {
      log('claim_missed', { taskId: task.task_id, error: err instanceof Error ? err.message : String(err) });
      continue;
    }

    log('claimed', { taskId: task.task_id, bounty: task.bounty?.amount_display });

    try {
      const content = JSON.stringify({
        solver: solution.kind,
        result: solution.result,
      });
      const receipt = await client.deliverTask(kp, task.task_id, {
        summary: 'Completed automatically by deterministic ' + solution.kind + ' worker.',
        submission_type: 'json',
        submission_content: content,
      });
      log('delivered', {
        taskId: task.task_id,
        bounty: task.bounty?.amount_display,
        receiptId: receipt.receipt_id,
        chainSequence: receipt.chain_sequence,
      });
      return { taskId: task.task_id, delivered: true };
    } catch (err) {
      log('delivery_error', { taskId: task.task_id, error: err instanceof Error ? err.message : String(err) });
      return { taskId: task.task_id, delivered: false };
    }
  }

  return null;
}

async function main() {
  log('hunter_start');
  const agent = await ensureIdentity();

  if (agent?.status && agent.status !== 'active') {
    log('not_active_yet', { status: agent.status });
  }

  const result = await findWork();
  if (!result) log('no_compatible_funded_task');
  log('hunter_done', { result });
}

main().catch(err => {
  console.error(JSON.stringify({
    ts: new Date().toISOString(),
    event: 'hunter_fatal',
    error: err instanceof Error ? err.stack || err.message : String(err),
  }));
  process.exitCode = 1;
});
