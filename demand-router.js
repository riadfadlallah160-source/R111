const SOURCES = [
  {
    id: 'clawlancer',
    name: 'Clawlancer',
    url: 'https://clawlancer.ai/api/listings?listing_type=BOUNTY',
    kind: 'general-bounty',
    auth: false
  },
  {
    id: 'databazaar',
    name: 'DataBazaar',
    url: 'https://api.databazaar.io/bounties',
    kind: 'data-bounty',
    auth: false
  },
  {
    id: 'basedagents',
    name: 'BasedAgents',
    url: 'https://api.basedagents.ai/v1/tasks?status=open&min_usdc=1.00',
    kind: 'agent-task',
    auth: false
  },
  {
    id: 'taskbounty',
    name: 'TaskBounty',
    url: 'https://www.task-bounty.com/api/v1/tasks',
    kind: 'software-bounty',
    auth: false
  }
];

async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent': '50M-Demand-Router/1.0' }, signal: controller.signal });
    const body = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeClawlancer(body) {
  const rows = Array.isArray(body) ? body : (body?.listings || body?.data || []);
  return rows.map(x => ({
    source: 'clawlancer',
    id: x.id || x.listing_id || null,
    title: x.title || x.name || '',
    rewardUsd: Number(x.price_usdc || x.reward_usdc || x.bounty_usdc || 0) || (Number(x.price || x.amount || 0) / 1_000_000) || null,
    category: x.category || 'general',
    status: x.status || 'open',
    raw: x
  })).filter(x => x.id && !['closed','completed','cancelled'].includes(String(x.status).toLowerCase()));
}

function normalizeDataBazaar(body) {
  const rows = Array.isArray(body) ? body : (body?.bounties || body?.data || []);
  return rows.map(x => ({
    source: 'databazaar',
    id: x.id || x.bounty_id || null,
    title: x.title || x.name || x.query || '',
    rewardUsd: Number(x.reward_usd || x.bounty_usd || x.budget_usd || x.reward || 0) || null,
    category: 'data',
    status: x.status || 'open',
    raw: x
  })).filter(x => x.id && !['closed','cancelled','completed'].includes(String(x.status).toLowerCase()));
}

function normalizeBasedAgents(body) {
  const rows = Array.isArray(body) ? body : (body?.tasks || body?.data || []);
  return rows.map(x => ({
    source: 'basedagents',
    id: x.id || x.task_id || null,
    title: x.title || '',
    rewardUsd: Number(x.bounty?.display || x.bounty_usdc || x.reward_usdc || 0) || (Number(x.bounty?.amount || 0) / 1_000_000) || null,
    category: x.category || null,
    capabilities: x.capabilities || [],
    status: x.status || 'open',
    claimable: x.claimable !== false,
    raw: x
  })).filter(x => x.id && x.status === 'open' && x.claimable !== false);
}

function normalizeTaskBounty(body) {
  const rows = Array.isArray(body) ? body : (body?.tasks || body?.data || []);
  return rows.map(x => ({
    source: 'taskbounty',
    id: x.id || x.task_id || null,
    title: x.title || x.name || '',
    rewardUsd: Number(x.bounty_cents || x.reward_cents || 0) / 100 || Number(x.bounty_usd || x.reward_usd || 0) || null,
    language: x.language || null,
    complexity: x.complexity_tag || x.complexity || null,
    repoUrl: x.github_repo_url || x.repo_url || null,
    issueUrl: x.github_issue_url || x.issue_url || null,
    status: x.status || 'open',
    raw: x
  })).filter(x => x.id && x.status !== 'closed');
}

function scoreOpportunity(x) {
  const reward = Number(x.rewardUsd || 0);
  const text = [x.title, x.category, x.language, x.complexity, ...(x.capabilities || [])].filter(Boolean).join(' ').toLowerCase();
  let fit = 0;
  for (const term of ['javascript','typescript','node','api','data','csv','json','research','analysis','website','web','security']) {
    if (text.includes(term)) fit += 1;
  }
  const fundedBonus = ['clawlancer','basedagents','taskbounty'].includes(x.source) ? 20 : 0;
  return Math.round((Math.log10(Math.max(1, reward) + 1) * 20 + fit * 8 + fundedBonus) * 100) / 100;
}

export function registerDemandRouter(app) {
  app.get('/demand/sources', (_req, res) => {
    res.json({
      mode: 'read-only-demand-ingestion',
      sources: SOURCES,
      note: 'Discovery does not claim work, accept marketplace terms, sign transactions, or move funds.'
    });
  });

  app.get('/demand/priority', async (_req, res) => {
    const fetched = await Promise.all(SOURCES.map(async source => {
      try { const r = await fetchJson(source.url); return { source, ...r }; }
      catch (error) { return { source, ok:false, status:0, error:error instanceof Error ? error.message : String(error) }; }
    }));
    const opportunities = [];
    for (const item of fetched) {
      if (!item.ok) continue;
      if (item.source.id === 'clawlancer') opportunities.push(...normalizeClawlancer(item.body));
      if (item.source.id === 'databazaar') opportunities.push(...normalizeDataBazaar(item.body));
      if (item.source.id === 'taskbounty') opportunities.push(...normalizeTaskBounty(item.body));
      if (item.source.id === 'basedagents') opportunities.push(...normalizeBasedAgents(item.body));
    }
    for (const x of opportunities) x.priorityScore = scoreOpportunity(x);
    const ranked = opportunities.filter(x => Number(x.rewardUsd || 0) > 0).sort((a,b)=>(b.priorityScore||0)-(a.priorityScore||0));
    res.json({ generatedAt:new Date().toISOString(), top:ranked.slice(0,25), count:ranked.length });
  });

  app.get('/demand/opportunities', async (_req, res) => {
    const fetched = await Promise.all(SOURCES.map(async source => {
      try {
        const r = await fetchJson(source.url);
        return { source, ...r };
      } catch (error) {
        return { source, ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
      }
    }));

    const opportunities = [];
    const sourceStatus = [];
    for (const item of fetched) {
      sourceStatus.push({ id: item.source.id, ok: item.ok, status: item.status, error: item.error || null });
      if (item.source.id === 'clawlancer' && item.ok) opportunities.push(...normalizeClawlancer(item.body));
      if (item.source.id === 'databazaar' && item.ok) opportunities.push(...normalizeDataBazaar(item.body));
      if (item.source.id === 'taskbounty' && item.ok) opportunities.push(...normalizeTaskBounty(item.body));
      if (item.source.id === 'basedagents' && item.ok) opportunities.push(...normalizeBasedAgents(item.body));
    }
    for (const x of opportunities) x.priorityScore = scoreOpportunity(x);
    opportunities.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
    res.json({
      generatedAt: new Date().toISOString(),
      count: opportunities.length,
      totalVisibleRewardUsd: opportunities.reduce((n, x) => n + (x.rewardUsd || 0), 0),
      sources: sourceStatus,
      opportunities
    });
  });
}
