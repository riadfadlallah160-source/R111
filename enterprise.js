export function registerEnterpriseRoutes(app) {
  const inbox = '50m-demand@agentmail.to';

  app.get('/enterprise', (_req, res) => {
    res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>50M Swarm — Enterprise Workloads</title>
  <style>
    body{margin:0;background:#081018;color:#edf5ff;font:16px/1.55 system-ui,-apple-system,Segoe UI,sans-serif}
    main{max-width:1040px;margin:auto;padding:56px 24px 80px}
    h1{font-size:clamp(42px,7vw,78px);line-height:.95;letter-spacing:-.05em;margin:12px 0 20px}
    h2{margin-top:42px}
    p{color:#aebbd0;max-width:850px}
    .eyebrow{color:#7fc3ff;font-weight:800;text-transform:uppercase;letter-spacing:.12em;font-size:12px}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:26px 0}
    .card{background:#101a26;border:1px solid #233449;border-radius:18px;padding:20px}
    .card strong{display:block;font-size:22px;margin-bottom:5px}
    .cta{display:inline-block;background:#edf5ff;color:#071019;padding:13px 17px;border-radius:12px;text-decoration:none;font-weight:800;margin:10px 8px 0 0}
    .secondary{background:#152334;color:#dcecff;border:1px solid #2d4662}
    code{color:#b8dcff}
    ul{color:#b9c5d6}
    @media(max-width:760px){.grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
<main>
  <div class="eyebrow">Enterprise machine-work capacity</div>
  <h1>50M Swarm</h1>
  <p>
    One pooled execution service for high-volume data, security, market-data and automation workloads.
    Machine buyers can pay via Base-USDC/x402 today. Large enterprise workloads can be scoped as bulk
    recurring work and routed across the same 50,000,000 logical earning slots.
  </p>

  <div class="grid">
    <div class="card"><strong>$1 / work unit</strong><span>Each confirmed dollar of settlement fills one daily earning slot.</span></div>
    <div class="card"><strong>50M daily slots</strong><span>Internal capacity model for decomposable workloads.</span></div>
    <div class="card"><strong>Bulk-friendly</strong><span>One enterprise workload can fill thousands or millions of units.</span></div>
  </div>

  <a class="cta" href="mailto:${inbox}?subject=Enterprise%20workload%20for%2050M%20Swarm">Discuss a bulk workload</a>
  <a class="cta secondary" href="/openapi.json">OpenAPI</a>

  <h2>Workloads available now</h2>
  <ul>
    <li>Vulnerability intelligence and package risk lookups</li>
    <li>Static security analysis and privacy/PII scanning</li>
    <li>Structured-data profiling, validation and transformation</li>
    <li>Web-analysis workloads</li>
    <li>Live crypto and Base-network data</li>
    <li>Parallel deterministic batch-processing jobs</li>
  </ul>

  <h2>Machine purchasing</h2>
  <p>
    x402 endpoint: <code>POST /v1/swarm/batch</code>. The batch price is derived from the number of
    work units. Settlement is Base-mainnet USDC to the configured treasury.
  </p>

  <h2>Enterprise purchasing</h2>
  <p>
    For large recurring workloads, contact <strong>${inbox}</strong>. Work can be priced by work unit,
    monthly committed volume, or a custom service agreement. The production system records earning
    progress only after confirmed settlement.
  </p>

  <h2>Technical discovery</h2>
  <p>
    <code>/openapi.json</code><br>
    <code>/.well-known/x402</code><br>
    <code>/.well-known/agent.json</code><br>
    <code>/skill.md</code>
  </p>
</main>
</body>
</html>`);
  });

  app.get('/v1/enterprise/offer', (_req, res) => {
    res.json({
      service: '50M Swarm',
      contact: inbox,
      liveGateway: 'https://fifty-million-agent-gateway.onrender.com',
      pricingModel: {
        unit: 'successful work unit',
        usdPerUnit: 1,
        dailyLogicalCapacity: 50000000,
        bulkContracts: true
      },
      paymentOptions: [
        { rail: 'Base USDC / x402', status: 'live' },
        { rail: 'enterprise invoice / marketplace payout', status: 'available after buyer/provider onboarding' }
      ],
      workloads: [
        'vulnerability-intelligence',
        'static-security-analysis',
        'privacy-pii-scan',
        'data-profiling',
        'web-analysis',
        'crypto-price',
        'base-network-status',
        'parallel-batch-processing'
      ],
      discovery: {
        openapi: '/openapi.json',
        x402: '/.well-known/x402',
        agent: '/.well-known/agent.json',
        skill: '/skill.md'
      }
    });
  });
}
