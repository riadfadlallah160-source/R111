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
        properties: Object.fromEntries(Object.keys(input).map(k => [
          k,
          Array.isArray(input[k])
            ? { type: 'array', items: { type: 'string' } }
            : { type: typeof input[k] === 'number' ? 'number' : 'string' }
        ])),
        required
      },
      output: { example: outputExample, schema: { type: 'object', additionalProperties: true } }
    })
  };
}

export function createMarketPaidRoutes({ PAY_TO, NETWORK, PUBLIC_BASE }) {
  return {
    'POST /v1/market/crypto-price': route(
      '$0.01', PAY_TO, NETWORK, PUBLIC_BASE, '/v1/market/crypto-price',
      'Low-cost live USD crypto spot-price lookup designed as an agent discovery/acquisition endpoint.',
      ['market-data','crypto-price','finance','live'],
      { id: 'bitcoin' }, ['id'],
      { id: 'bitcoin', usd: 65000, source: 'CoinGecko', agentId: 1 }
    ),
    'POST /v1/base/network-status': route(
      '$0.005', PAY_TO, NETWORK, PUBLIC_BASE, '/v1/base/network-status',
      'Low-cost live Base mainnet block height, gas price and chain ID for autonomous agents.',
      ['blockchain-data','network-status','base','rpc'],
      { includeGas: 'true' }, [],
      { chain: 'base', chainId: '0x2105', blockNumber: '0x...', gasPriceWei: '0x...', agentId: 2 }
    ),
    'POST /v1/market/gasroute-oracle': route(
      '$0.01', PAY_TO, NETWORK, PUBLIC_BASE, '/v1/market/gasroute-oracle',
      'GasRoute Oracle: compare live transaction fees across Ethereum, BNB Smart Chain and Polygon and return the cheapest chain with congestion and priority-fee hints.',
      ['market-data','gas','fees','ethereum','bsc','polygon','x402'],
      { chain_set: ['ethereum','bsc','polygon'], calldata_size_bytes: 128, gas_units_est: 100000 },
      ['chain_set','calldata_size_bytes','gas_units_est'],
      { chain: 'polygon', fee_native: 0.003, fee_usd: 0.0012, busy_level: 'normal', tip_hint: '30 gwei', quotes: [] }
    )
  };
}

const GAS_CHAINS = {
  ethereum: {
    rpc: 'https://ethereum-rpc.publicnode.com',
    symbol: 'ETH',
    priceId: 'ethereum'
  },
  bsc: {
    rpc: 'https://bsc-rpc.publicnode.com',
    symbol: 'BNB',
    priceId: 'binancecoin'
  },
  polygon: {
    rpc: 'https://polygon-bor-rpc.publicnode.com',
    symbol: 'POL',
    priceId: 'matic-network'
  }
};

async function rpc(url, method, params = []) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  if (!response.ok) throw new Error('RPC HTTP ' + response.status);
  const body = await response.json();
  if (body.error) throw new Error(body.error.message || 'RPC error');
  return body.result;
}

async function baseJsonRpc(method) {
  return rpc('https://mainnet.base.org', method, []);
}

function median(values) {
  const nums = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!nums.length) return 0;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function busyLevel(ratio) {
  if (ratio >= 0.9) return 'very-high';
  if (ratio >= 0.7) return 'high';
  if (ratio >= 0.45) return 'normal';
  return 'low';
}

async function usdPrices(ids) {
  const unique = [...new Set(ids)];
  const response = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=' +
    encodeURIComponent(unique.join(',')) +
    '&vs_currencies=usd'
  );
  if (!response.ok) throw new Error('price upstream HTTP ' + response.status);
  return response.json();
}

async function gasQuote(chain, calldataBytes, requestedGasUnits, prices) {
  const config = GAS_CHAINS[chain];
  const [gasPriceHex, feeHistory, priorityHex] = await Promise.all([
    rpc(config.rpc, 'eth_gasPrice'),
    rpc(config.rpc, 'eth_feeHistory', ['0x5', 'latest', [25, 50, 75]]).catch(() => null),
    rpc(config.rpc, 'eth_maxPriorityFeePerGas').catch(() => '0x0')
  ]);

  const gasPriceWei = BigInt(gasPriceHex);
  const minimumIntrinsic = 21000 + (calldataBytes * 16);
  const gasUnits = Math.max(requestedGasUnits, minimumIntrinsic);
  const feeWei = gasPriceWei * BigInt(gasUnits);
  const feeNative = Number(feeWei) / 1e18;
  const usd = Number(prices?.[config.priceId]?.usd || 0);

  const ratios = Array.isArray(feeHistory?.gasUsedRatio)
    ? feeHistory.gasUsedRatio.map(Number)
    : [];
  const utilization = median(ratios);

  const rewardMedians = Array.isArray(feeHistory?.reward)
    ? feeHistory.reward.map(row => {
        const value = Array.isArray(row) ? row[1] : null;
        return value ? Number(BigInt(value)) : NaN;
      })
    : [];
  const historyTipWei = median(rewardMedians);
  const nodeTipWei = Number(BigInt(priorityHex || '0x0'));
  const tipWei = Math.max(historyTipWei, nodeTipWei, 0);

  return {
    chain,
    native_symbol: config.symbol,
    fee_native: Number(feeNative.toPrecision(10)),
    fee_usd: Number((feeNative * usd).toFixed(8)),
    gas_units_used_for_quote: gasUnits,
    requested_gas_units: requestedGasUnits,
    calldata_size_bytes: calldataBytes,
    minimum_intrinsic_gas_guard: minimumIntrinsic,
    gas_price_wei: gasPriceWei.toString(),
    gas_price_gwei: Number((Number(gasPriceWei) / 1e9).toFixed(6)),
    busy_level: busyLevel(utilization),
    recent_block_utilization: Number(utilization.toFixed(4)),
    tip_hint: Number((tipWei / 1e9).toFixed(6)) + ' gwei',
    native_usd: usd,
    source: 'live chain JSON-RPC + CoinGecko'
  };
}

async function computeGasRoute(body) {
  const rawChains = Array.isArray(body?.chain_set)
    ? body.chain_set
    : typeof body?.chain_set === 'string'
      ? body.chain_set.split(',')
      : [];
  const chains = [...new Set(rawChains.map(x => String(x).trim().toLowerCase()))]
    .filter(x => GAS_CHAINS[x]);

  const calldataBytes = Number(body?.calldata_size_bytes);
  const requestedGasUnits = Number(body?.gas_units_est);

  if (!chains.length) {
    const error = new Error('chain_set must contain ethereum, bsc, and/or polygon.');
    error.status = 400;
    throw error;
  }
  if (!Number.isInteger(calldataBytes) || calldataBytes < 0 || calldataBytes > 1000000) {
    const error = new Error('calldata_size_bytes must be an integer from 0 to 1,000,000.');
    error.status = 400;
    throw error;
  }
  if (!Number.isInteger(requestedGasUnits) || requestedGasUnits < 21000 || requestedGasUnits > 100000000) {
    const error = new Error('gas_units_est must be an integer from 21,000 to 100,000,000.');
    error.status = 400;
    throw error;
  }

  const prices = await usdPrices(chains.map(c => GAS_CHAINS[c].priceId));
  const settled = await Promise.allSettled(
    chains.map(chain => gasQuote(chain, calldataBytes, requestedGasUnits, prices))
  );
  const quotes = settled.filter(x => x.status === 'fulfilled').map(x => x.value);
  const errors = settled
    .map((x, i) => x.status === 'rejected' ? { chain: chains[i], error: String(x.reason?.message || x.reason) } : null)
    .filter(Boolean);

  if (!quotes.length) {
    const error = new Error('All requested chain RPCs are temporarily unavailable.');
    error.status = 502;
    throw error;
  }

  quotes.sort((a, b) => a.fee_usd - b.fee_usd);
  const best = quotes[0];
  return {
    chain: best.chain,
    fee_native: best.fee_native,
    fee_usd: best.fee_usd,
    busy_level: best.busy_level,
    tip_hint: best.tip_hint,
    quotes,
    unavailable_chains: errors,
    methodology: 'Uses each chain node current eth_gasPrice for the executable fee quote; eth_feeHistory and eth_maxPriorityFeePerGas provide congestion and tip context. gas_units_est is treated as the caller total gas estimate, with an intrinsic lower-bound guard derived from calldata size.',
    generated_at: new Date().toISOString()
  };
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
        baseJsonRpc('eth_blockNumber'),
        baseJsonRpc('eth_gasPrice'),
        baseJsonRpc('eth_chainId')
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

  app.post('/v1/market/gasroute-oracle', async (req, res) => {
    try {
      const result = await computeGasRoute(req.body);
      res.json({ ...assignment('gasroute-oracle'), ...result });
    } catch (error) {
      res.status(Number(error?.status || 502)).json({ error: String(error?.message || error) });
    }
  });

  app.post('/v1/market/gasroute-oracle-preview', async (req, res) => {
    try {
      const result = await computeGasRoute(req.body);
      res.json({ preview: true, x402_endpoint: '/v1/market/gasroute-oracle', ...result });
    } catch (error) {
      res.status(Number(error?.status || 502)).json({ error: String(error?.message || error) });
    }
  });
}
