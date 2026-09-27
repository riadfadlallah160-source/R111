const MARKET_CANDIDATES = [
  { id:'dealwork', name:'Dealwork', url:'https://api.dealwork.ai/', kind:'hybrid-agent-work', mode:'authorization-gated', demand:'234 open tasks', fit:'code,research,data,writing,automation' },
  { id:'agentsouk', name:'Agent Souk', url:'https://github.com/agent-souk/agentsouk', kind:'agent-marketplace', mode:'api-first', demand:'services,bounties,jobs', fit:'code,research,data,automation' },
  { id:'the402', name:'the402 Requests', url:'https://the402.ai/requests/', kind:'agent-requests', mode:'public-discovery', demand:'escrowed requests when open', fit:'api,research,data,automation' },
  { id:'algora', name:'Algora', url:'https://algora.io/api/bounties', kind:'software-bounty', mode:'public-discovery', demand:'GitHub funded issues', fit:'software' },
  { id:'opire', name:'Opire', url:'https://app.opire.dev/home', kind:'software-bounty', mode:'public-discovery', demand:'432 rewards shown', fit:'software' },
  { id:'superteam', name:'Superteam Earn', url:'https://earn.superteam.fun/', kind:'crypto-bounty', mode:'public-discovery', demand:'bounties/projects', fit:'code,research,data,content' },
  { id:'dework', name:'Dework', url:'https://dework.xyz/', kind:'web3-work', mode:'account-gated', demand:'DAO tasks/bounties', fit:'code,research,data,content' },
  { id:'immunefi', name:'Immunefi', url:'https://immunefi.com/bug-bounty/', kind:'authorized-security', mode:'scope-gated', demand:'173 bounty programs', fit:'authorized-security' },
  { id:'yeswehack', name:'YesWeHack', url:'https://yeswehack.com/programs', kind:'authorized-security', mode:'scope-gated', demand:'public paid programs', fit:'authorized-security' },
  { id:'bugcrowd', name:'Bugcrowd', url:'https://bugcrowd.com/programs', kind:'authorized-security', mode:'account-gated', demand:'public funded programs', fit:'authorized-security' },
  { id:'hackerone', name:'HackerOne', url:'https://hackerone.com/directory/programs', kind:'authorized-security', mode:'account-gated', demand:'public bounty programs', fit:'authorized-security' },
  { id:'code4rena', name:'Code4rena', url:'https://code4rena.com/audits', kind:'security-contests', mode:'account-tax-gated', demand:'USDC audit competitions', fit:'authorized-security,code-review' },
  { id:'sherlock', name:'Sherlock', url:'https://sherlock.xyz/', kind:'security-contests', mode:'account-gated', demand:'audit contests and bounties', fit:'authorized-security,code-review' },
  { id:'cantina', name:'Cantina', url:'https://cantina.xyz/competitions', kind:'security-contests', mode:'account-gated', demand:'security competitions', fit:'authorized-security,code-review' }
];

const SOURCES = [
  {
    id: 'agentbounties',
    name: 'Agent Bounties',
    url: 'https://api.agentbounties.app/api/v1/bounties?status=open',
    kind: 'onchain-bounty',
    auth: false
  },
  {
    id: 'thejobcafe',
    name: 'TheJobCafe',
    url: 'https://thejobcafe.com/api/public/bounties',
    kind: 'general-bounty',
    auth: false
  },
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

function normalizeAgentBounties(body) {
  const rows = Array.isArray(body) ? body : (body?.bounties || body?.data || body?.items || []);
  return rows.map(x => ({
    source: 'agentbounties',
    id: x.id || x.bounty_id || x.address || null,
    title: x.title || x.name || x.description || '',
    rewardUsd: Number(x.solver_reward_usdc || x.reward_usdc || x.reward || 0) || null,
    category: x.category || 'general',
    status: x.status || 'open',
    claimable: x.claimable !== false,
    funded: x.funded === true,
    fundingVerified: x.funded === true || x.escrowed === true,
    raw: x
  })).filter(x => x.id && x.claimable !== false && !['closed','cancelled','completed'].includes(String(x.status).toLowerCase()));
}

function normalizeJobCafe(body) {
  const rows = Array.isArray(body) ? body : (body?.bounties || body?.jobs || body?.data || []);
  return rows.map(x => ({
    source: 'thejobcafe',
    id: x.id || x.bounty_id || null,
    title: x.title || '',
    rewardUsd: Number(x.reward_usd || x.payout_usd || x.reward || 0) || null,
    category: x.category || 'general',
    status: x.status || 'open',
    escrowed: Boolean(x.funding?.escrowed || x.escrowed),
    fundingVerified: Boolean(x.funding?.escrowed || x.escrowed),
    raw: x
  })).filter(x => x.id && String(x.status).toLowerCase() === 'open');
}

function normalizeClawlancer(body) {
  const rows = Array.isArray(body) ? body : (body?.listings || body?.data || []);
  return rows.map(x => ({
    source: 'clawlancer',
    id: x.id || x.listing_id || null,
    title: x.title || x.name || '',
    rewardUsd: Number(x.price_usdc || x.reward_usdc || x.bounty_usdc || 0) || (Number(x.price_wei || x.price || x.amount || 0) / 1_000_000) || null,
    fundingVerified: Boolean(x.funded === true || x.escrowed === true || x.transaction?.status === 'funded'),
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
    rewardUsd: Number(x.reward_usd || x.bounty_usd || x.budget_usd || x.bounty_amount || x.reward || 0) || null,
    fundingVerified: Boolean(x.funded === true || x.escrowed === true || x.funding?.escrowed === true),
    aiSubmissionsAllowed: x.ai_submissions_ok === true,
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
  const fundedBonus = x.fundingVerified === true ? 20 : 0;
  return Math.round((Math.log10(Math.max(1, reward) + 1) * 20 + fit * 8 + fundedBonus) * 100) / 100;
}

export function registerDemandRouter(app) {
  app.get('/demand/markets', (_req, res) => res.json({ count: SOURCES.length + MARKET_CANDIDATES.length, liveFeedCount: SOURCES.length, expansionCount: MARKET_CANDIDATES.length, markets: [...SOURCES, ...MARKET_CANDIDATES] }));

  app.get('/demand/sources', (_req, res) => {
    res.json({
      mode: 'read-only-demand-ingestion',
      sources: SOURCES,
      expansionMarkets: MARKET_CANDIDATES,
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
      if (item.source.id === 'agentbounties') opportunities.push(...normalizeAgentBounties(item.body));
      if (item.source.id === 'thejobcafe') opportunities.push(...normalizeJobCafe(item.body));
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
      if (item.source.id === 'agentbounties' && item.ok) opportunities.push(...normalizeAgentBounties(item.body));
      if (item.source.id === 'thejobcafe' && item.ok) opportunities.push(...normalizeJobCafe(item.body));
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
      verifiedFundedCount: opportunities.filter(x => x.fundingVerified === true).length,
      executableByCurrentGatewayCount: opportunities.filter(x => x.executableByCurrentGateway === true).length,
      warning: 'Reward values are advertised amounts. Only fundingVerified=true may be counted as funded workload; discovery never claims work.',
      sources: sourceStatus,
      opportunities
    });
  });
}
