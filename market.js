import { declareDiscoveryExtension } from '@x402/extensions/bazaar';

function route(price, PAY_TO, NETWORK, PUBLIC_BASE, path, description, tags, input, required, outputExample) {
  return {
    accepts: [{ scheme: 'exact', price, network: NETWORK, payTo: PAY_TO }],
    description,
    mimeType: 'application/json',
    resource: {
      url: PUBLIC_BASE + path,
      description,
      mimeType: 'application/json',
      serviceName: '50M Swarm Market Data',
      tags
    },
    extensions: declareDiscoveryExtension({
      bodyType: 'json',
      input,
      inputSchema: {
        type: 'object',
        properties: Object.fromEntries(Object.keys(input).map(k => [k, { type: typeof input[k] === 'number' ? 'number' : 'string' }])),
        required
      },
      output: { example: outputExample, schema: { type: 'object', additionalProperties: true } }
    })
  };
}

export function createMarketPaidRoutes({ PAY_TO, NETWORK, PUBLIC_BASE }) {
  return {
    'POST /v1/market/crypto-price': route(
      '$1', PAY_TO, NETWORK, PUBLIC_BASE, '/v1/market/crypto-price',
      'Live USD spot price for a requested crypto asset from a public market-data source.',
      ['market-data','crypto-price','finance','live'],
      { id: 'bitcoin' }, ['id'],
      { id: 'bitcoin', usd: 65000, source: 'CoinGecko', agentId: 1 }
    ),
    'POST /v1/base/network-status': route(
      '$1', PAY_TO, NETWORK, PUBLIC_BASE, '/v1/base/network-status',
      'Live Base mainnet block height, gas price and chain ID from the public Base RPC.',
      ['blockchain-data','network-status','base','rpc'],
      { includeGas: 'true' }, [],
      { chain: 'base', chainId: '0x2105', blockNumber: '0x...', gasPriceWei: '0x...', agentId: 2 }
    )
  };
}

async function jsonRpc(method) {
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

export function registerMarketHandlers(app, assignment) {
  app.post('/v1/market/crypto-price', async (req, res) => {
    const id = String(req.body?.id || '').trim().toLowerCase();
    if (!/^[a-z0-9-]{2,80}$/.test(id)) return res.status(400).json({ error: 'id is required, e.g. bitcoin or ethereum.' });
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + encodeURIComponent(id) + '&vs_currencies=usd&include_last_updated_at=true');
      if (!response.ok) return res.status(502).json({ error: 'Market-data upstream unavailable.' });
      const body = await response.json();
      const item = body?.[id];
      if (!item || typeof item.usd !== 'number') return res.status(404).json({ error: 'Asset not found.' });
      res.json({
        ...assignment('crypto-price'),
        id,
        usd: item.usd,
        lastUpdatedAt: item.last_updated_at || null,
        source: 'CoinGecko'
      });
    } catch {
      res.status(502).json({ error: 'Market-data upstream unavailable.' });
    }
  });

  app.post('/v1/base/network-status', async (_req, res) => {
    try {
      const [blockNumber, gasPrice, chainId] = await Promise.all([
        jsonRpc('eth_blockNumber'),
        jsonRpc('eth_gasPrice'),
        jsonRpc('eth_chainId')
      ]);
      res.json({
        ...assignment('base-network-status'),
        chain: 'base',
        chainId,
        blockNumber,
        blockNumberDecimal: Number.parseInt(blockNumber, 16),
        gasPriceWei: gasPrice,
        gasPriceWeiDecimal: Number.parseInt(gasPrice, 16),
        source: 'Base public RPC'
      });
    } catch {
      res.status(502).json({ error: 'Base RPC unavailable.' });
    }
  });
}
