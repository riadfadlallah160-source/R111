import { declareDiscoveryExtension } from '@x402/extensions/bazaar';

export function createIntelPaidRoutes({ PAY_TO, NETWORK, PUBLIC_BASE }) {
  return {
    'POST /v1/security/vulnerability-intel': {
      accepts: [{ scheme: 'exact', price: '$1', network: NETWORK, payTo: PAY_TO }],
      description: 'Query live open-source vulnerability intelligence for up to 100 package/version pairs using OSV.',
      mimeType: 'application/json',
      resource: {
        url: PUBLIC_BASE + '/v1/security/vulnerability-intel',
        description: 'Batch package vulnerability intelligence for software supply-chain agents.',
        mimeType: 'application/json',
        serviceName: '50M Vulnerability Intelligence',
        tags: ['security','vulnerability-intelligence','osv','supply-chain','packages']
      },
      extensions: declareDiscoveryExtension({
        bodyType: 'json',
        input: {
          queries: [
            { package: { name: 'jinja2', ecosystem: 'PyPI' }, version: '2.4.1' }
          ]
        },
        inputSchema: {
          type: 'object',
          properties: {
            queries: {
              type: 'array',
              minItems: 1,
              maxItems: 100,
              items: {
                type: 'object',
                properties: {
                  version: { type: 'string' },
                  commit: { type: 'string' },
                  package: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      ecosystem: { type: 'string' },
                      purl: { type: 'string' }
                    }
                  }
                }
              }
            }
          },
          required: ['queries']
        },
        output: {
          example: {
            agentId: 1,
            queryCount: 1,
            vulnerableQueries: 1,
            results: [{ index: 0, vulnerabilityCount: 2, vulnerabilities: [{ id: 'GHSA-...' }] }]
          },
          schema: { type: 'object', additionalProperties: true }
        }
      })
    }
  };
}

export function registerIntelHandlers(app, assignment) {
  app.post('/v1/security/vulnerability-intel', async (req, res) => {
    const queries = Array.isArray(req.body?.queries) ? req.body.queries : null;
    if (!queries || queries.length < 1 || queries.length > 100) {
      return res.status(400).json({ error: 'queries[] must contain 1 to 100 package/version or commit queries.' });
    }

    const sanitized = [];
    for (const query of queries) {
      const item = {};
      if (typeof query?.commit === 'string' && /^[a-f0-9]{7,64}$/i.test(query.commit)) {
        item.commit = query.commit;
      } else {
        const pkg = query?.package;
        const version = typeof query?.version === 'string' ? query.version.trim() : '';
        if (!pkg || typeof pkg !== 'object') return res.status(400).json({ error: 'Each non-commit query needs package.' });
        if (typeof pkg.purl === 'string' && pkg.purl.trim()) {
          item.package = { purl: pkg.purl.trim().slice(0, 500) };
        } else {
          const name = typeof pkg.name === 'string' ? pkg.name.trim() : '';
          const ecosystem = typeof pkg.ecosystem === 'string' ? pkg.ecosystem.trim() : '';
          if (!name || !ecosystem) return res.status(400).json({ error: 'package.name and package.ecosystem are required unless package.purl is supplied.' });
          item.package = { name: name.slice(0, 300), ecosystem: ecosystem.slice(0, 80) };
        }
        if (version) item.version = version.slice(0, 200);
      }
      sanitized.push(item);
    }

    try {
      const response = await fetch('https://api.osv.dev/v1/querybatch', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': '50M-Agent-Utility-Gateway/1.0' },
        body: JSON.stringify({ queries: sanitized })
      });
      if (!response.ok) return res.status(502).json({ error: 'Vulnerability intelligence upstream returned HTTP ' + response.status + '.' });
      const body = await response.json();
      const rawResults = Array.isArray(body?.results) ? body.results : [];
      const results = rawResults.map((entry, index) => {
        const vulns = Array.isArray(entry?.vulns) ? entry.vulns : [];
        return {
          index,
          vulnerabilityCount: vulns.length,
          vulnerabilities: vulns.slice(0, 500).map(v => ({
            id: v.id,
            modified: v.modified || null
          })),
          hasMore: Boolean(entry?.next_page_token)
        };
      });

      res.json({
        ...assignment('vulnerability-intelligence'),
        source: 'OSV.dev',
        queryCount: sanitized.length,
        vulnerableQueries: results.filter(r => r.vulnerabilityCount > 0).length,
        totalVulnerabilityMatches: results.reduce((sum, r) => sum + r.vulnerabilityCount, 0),
        results
      });
    } catch {
      res.status(502).json({ error: 'Vulnerability intelligence upstream unavailable.' });
    }
  });
}
