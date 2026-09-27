import crypto from 'node:crypto';

async function baseRpc(method) {
  const response = await fetch('https://mainnet.base.org', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] })
  });
  if (!response.ok) throw new Error('Base RPC HTTP ' + response.status);
  const body = await response.json();
  if (body.error) throw new Error(body.error.message || 'Base RPC error');
  return body.result;
}

function words(text) {
  return String(text).toLowerCase().match(/[a-z0-9]+(?:['’-][a-z0-9]+)*/g) || [];
}

function textMetrics(text) {
  const ws = words(text);
  return {
    characters: text.length,
    charactersNoWhitespace: text.replace(/\s/g, '').length,
    words: ws.length,
    uniqueWords: new Set(ws).size,
    lines: text.split(/\r?\n/).length
  };
}

function jsonResult(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
    structuredContent: data,
    isError: false
  };
}

function errorResult(message) {
  return {
    content: [{ type: 'text', text: String(message) }],
    isError: true
  };
}

const tools = [
  {
    name: 'crypto_price',
    description: 'Get the live USD spot price of a cryptocurrency by CoinGecko asset id.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'CoinGecko id, e.g. bitcoin or ethereum' } },
      required: ['id'],
      additionalProperties: false
    }
  },
  {
    name: 'base_network_status',
    description: 'Get live Base mainnet block height, gas price, and chain id.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'vulnerability_intel',
    description: 'Check up to 100 package/version or commit queries against OSV vulnerability intelligence.',
    inputSchema: {
      type: 'object',
      properties: {
        queries: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: { type: 'object', additionalProperties: true }
        }
      },
      required: ['queries'],
      additionalProperties: false
    }
  },
  {
    name: 'hash_text',
    description: 'Return SHA-256, SHA-1 and MD5 hashes for text.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
      additionalProperties: false
    }
  },
  {
    name: 'text_metrics',
    description: 'Return word, character, unique-word and line counts for text.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
      additionalProperties: false
    }
  },
  {
    name: 'json_validate',
    description: 'Validate JSON text and return the parsed value type plus compact representation.',
    inputSchema: {
      type: 'object',
      properties: { json: { description: 'JSON string or already-parsed JSON value' } },
      required: ['json'],
      additionalProperties: false
    }
  }
];

async function callTool(name, args) {
  if (name === 'crypto_price') {
    const id = String(args?.id || '').trim().toLowerCase();
    if (!/^[a-z0-9-]{2,80}$/.test(id)) return errorResult('A valid CoinGecko asset id is required.');
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + encodeURIComponent(id) + '&vs_currencies=usd&include_last_updated_at=true');
    if (!response.ok) return errorResult('Market data upstream unavailable.');
    const body = await response.json();
    const item = body?.[id];
    if (!item || typeof item.usd !== 'number') return errorResult('Asset not found.');
    return jsonResult({ id, usd: item.usd, lastUpdatedAt: item.last_updated_at || null, source: 'CoinGecko' });
  }

  if (name === 'base_network_status') {
    const [blockNumber, gasPrice, chainId] = await Promise.all([
      baseRpc('eth_blockNumber'),
      baseRpc('eth_gasPrice'),
      baseRpc('eth_chainId')
    ]);
    return jsonResult({
      chain: 'base',
      chainId,
      blockNumber,
      blockNumberDecimal: Number.parseInt(blockNumber, 16),
      gasPriceWei: gasPrice,
      gasPriceWeiDecimal: Number.parseInt(gasPrice, 16),
      source: 'Base public RPC'
    });
  }

  if (name === 'vulnerability_intel') {
    const queries = Array.isArray(args?.queries) ? args.queries : null;
    if (!queries || queries.length < 1 || queries.length > 100) {
      return errorResult('queries must contain 1 to 100 items.');
    }
    const response = await fetch('https://api.osv.dev/v1/querybatch', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': '50M-Swarm-MCP/1.0' },
      body: JSON.stringify({ queries })
    });
    if (!response.ok) return errorResult('OSV upstream HTTP ' + response.status);
    const body = await response.json();
    const results = (body.results || []).map((entry, index) => ({
      index,
      vulnerabilityCount: Array.isArray(entry?.vulns) ? entry.vulns.length : 0,
      vulnerabilities: Array.isArray(entry?.vulns) ? entry.vulns.slice(0, 200).map(v => ({ id: v.id, modified: v.modified || null })) : []
    }));
    return jsonResult({
      source: 'OSV.dev',
      queryCount: queries.length,
      vulnerableQueries: results.filter(r => r.vulnerabilityCount > 0).length,
      results
    });
  }

  if (name === 'hash_text') {
    const text = String(args?.text || '');
    if (!text) return errorResult('text is required.');
    const digest = algorithm => crypto.createHash(algorithm).update(text, 'utf8').digest('hex');
    return jsonResult({ sha256: digest('sha256'), sha1: digest('sha1'), md5: digest('md5') });
  }

  if (name === 'text_metrics') {
    const text = String(args?.text || '');
    if (!text) return errorResult('text is required.');
    return jsonResult(textMetrics(text));
  }

  if (name === 'json_validate') {
    try {
      const parsed = typeof args?.json === 'string' ? JSON.parse(args.json) : args?.json;
      if (parsed === undefined) throw new Error('json is required.');
      return jsonResult({
        valid: true,
        type: Array.isArray(parsed) ? 'array' : parsed === null ? 'null' : typeof parsed,
        compact: JSON.stringify(parsed)
      });
    } catch (error) {
      return jsonResult({ valid: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return errorResult('Unknown tool: ' + name);
}

export function registerMcpRoutes(app) {
  app.get('/mcp', (_req, res) => {
    res.json({
      name: '50M Swarm MCP',
      transport: 'streamable-http-jsonrpc',
      endpoint: '/mcp',
      tools: tools.map(t => t.name)
    });
  });

  app.post('/mcp', async (req, res) => {
    const request = req.body || {};
    const id = request.id ?? null;
    const method = request.method;

    if (method === 'initialize') {
      const protocolVersion = request?.params?.protocolVersion || '2025-06-18';
      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: '50M Swarm MCP', version: '1.0.0' }
        }
      });
    }

    if (method === 'notifications/initialized') {
      return res.status(202).end();
    }

    if (method === 'ping') {
      return res.json({ jsonrpc: '2.0', id, result: {} });
    }

    if (method === 'tools/list') {
      return res.json({ jsonrpc: '2.0', id, result: { tools } });
    }

    if (method === 'tools/call') {
      try {
        const name = String(request?.params?.name || '');
        const args = request?.params?.arguments || {};
        const result = await callTool(name, args);
        return res.json({ jsonrpc: '2.0', id, result });
      } catch (error) {
        return res.json({
          jsonrpc: '2.0',
          id,
          result: errorResult(error instanceof Error ? error.message : String(error))
        });
      }
    }

    return res.status(400).json({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: 'Method not found' }
    });
  });
}
