import { declareDiscoveryExtension } from '@x402/extensions/bazaar';

export function createPremiumPaidRoutes({ PAY_TO, NETWORK, PUBLIC_BASE }) {
  return {
    'POST /v1/data/profile': {
      accepts: [{ scheme: 'exact', price: '$1', network: NETWORK, payTo: PAY_TO }],
      description: 'Profile up to 10,000 JSON records: infer columns and types, null rates, uniqueness, numeric ranges, averages and samples.',
      mimeType: 'application/json',
      resource: {
        url: PUBLIC_BASE + '/v1/data/profile',
        description: 'Batch JSON dataset profiler for autonomous data pipelines.',
        mimeType: 'application/json',
        serviceName: '50M Data Profiler',
        tags: ['data', 'profiling', 'json', 'batch', 'quality']
      },
      extensions: declareDiscoveryExtension({
        bodyType: 'json',
        input: { records: [{ id: 1, name: 'Ada', score: 98 }] },
        inputSchema: {
          type: 'object',
          properties: {
            records: { type: 'array', description: 'Array of up to 10,000 JSON objects.' }
          },
          required: ['records']
        },
        output: {
          example: { agentId: 1, earnedByThisExecutionUsd: 1, rowCount: 1, columns: {} },
          schema: { type: 'object', additionalProperties: true }
        }
      })
    },
    'POST /v1/security/static-analysis': {
      accepts: [{ scheme: 'exact', price: '$1', network: NETWORK, payTo: PAY_TO }],
      description: 'Defensive static analysis across up to 100 source files for exposed secrets, unsafe code execution, weak crypto and common injection-risk patterns.',
      mimeType: 'application/json',
      resource: {
        url: PUBLIC_BASE + '/v1/security/static-analysis',
        description: 'Defensive source-code security scan with structured findings and remediation hints.',
        mimeType: 'application/json',
        serviceName: '50M Static Security Scan',
        tags: ['security', 'static-analysis', 'code', 'secrets', 'defensive']
      },
      extensions: declareDiscoveryExtension({
        bodyType: 'json',
        input: { files: [{ path: 'app.js', content: 'const x = userInput;' }] },
        inputSchema: {
          type: 'object',
          properties: {
            files: { type: 'array', description: 'Up to 100 source files with path and content.' }
          },
          required: ['files']
        },
        output: {
          example: { agentId: 2, earnedByThisExecutionUsd: 1, summary: { filesScanned: 1, findings: 0 }, findings: [] },
          schema: { type: 'object', additionalProperties: true }
        }
      })
    },
    'POST /v1/security/pii-scan': {
      accepts: [{ scheme: 'exact', price: '$1', network: NETWORK, payTo: PAY_TO }],
      description: 'Privacy scan for PII and accidental secrets across large text batches, returning counts and masked examples without echoing sensitive values.',
      mimeType: 'application/json',
      resource: {
        url: PUBLIC_BASE + '/v1/security/pii-scan',
        description: 'Batch privacy and secret detector for autonomous redaction and compliance pipelines.',
        mimeType: 'application/json',
        serviceName: '50M Privacy Scan',
        tags: ['security', 'pii', 'privacy', 'redaction', 'batch']
      },
      extensions: declareDiscoveryExtension({
        bodyType: 'json',
        input: { texts: ['Contact user@example.com'] },
        inputSchema: {
          type: 'object',
          properties: {
            texts: { type: 'array', description: 'Array of text documents to scan.' }
          },
          required: ['texts']
        },
        output: {
          example: { agentId: 3, earnedByThisExecutionUsd: 1, totals: { email: 1 }, documents: [] },
          schema: { type: 'object', additionalProperties: true }
        }
      })
    },
    'POST /v1/web/analyze': {
      accepts: [{ scheme: 'exact', price: '$1', network: NETWORK, payTo: PAY_TO }],
      description: 'Analyze supplied HTML for metadata, headings, links, forms, accessibility basics, mixed content and client-side security signals.',
      mimeType: 'application/json',
      resource: {
        url: PUBLIC_BASE + '/v1/web/analyze',
        description: 'Offline web-document quality, SEO, accessibility and security analysis from supplied HTML.',
        mimeType: 'application/json',
        serviceName: '50M Web Analyzer',
        tags: ['web', 'analysis', 'html', 'seo', 'security', 'accessibility']
      },
      extensions: declareDiscoveryExtension({
        bodyType: 'json',
        input: { html: '<html><head><title>Example</title></head><body><h1>Hello</h1></body></html>', url: 'https://example.com' },
        inputSchema: {
          type: 'object',
          properties: {
            html: { type: 'string', description: 'HTML document, up to the server request limit.' },
            url: { type: 'string', description: 'Optional page URL used for context.' }
          },
          required: ['html']
        },
        output: {
          example: { agentId: 4, earnedByThisExecutionUsd: 1, title: 'Example', headings: { h1: 1 }, issues: [] },
          schema: { type: 'object', additionalProperties: true }
        }
      })
    }
  };
}

function typeOfValue(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

function profileRecords(records) {
  const rows = records.slice(0, 10000);
  const names = new Set();
  for (const row of rows) {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      for (const key of Object.keys(row)) names.add(key);
    }
  }

  const columns = {};
  for (const name of names) {
    const typeCounts = {};
    let nullCount = 0;
    const unique = new Set();
    const samples = [];
    let numericCount = 0;
    let numericSum = 0;
    let numericMin = null;
    let numericMax = null;

    for (const row of rows) {
      const value = row && typeof row === 'object' ? row[name] : undefined;
      const type = typeOfValue(value);
      typeCounts[type] = (typeCounts[type] || 0) + 1;
      if (type === 'null') {
        nullCount += 1;
        continue;
      }

      let key;
      try {
        key = typeof value === 'object' ? JSON.stringify(value) : String(value);
      } catch {
        key = String(value);
      }
      if (unique.size <= 10000) unique.add(key);
      if (samples.length < 3) samples.push(value);

      if (typeof value === 'number' && Number.isFinite(value)) {
        numericCount += 1;
        numericSum += value;
        numericMin = numericMin === null ? value : Math.min(numericMin, value);
        numericMax = numericMax === null ? value : Math.max(numericMax, value);
      }
    }

    columns[name] = {
      typeCounts,
      nullCount,
      nullRate: rows.length ? Number((nullCount / rows.length).toFixed(4)) : 0,
      uniqueCount: unique.size,
      uniqueRate: rows.length ? Number((unique.size / rows.length).toFixed(4)) : 0,
      samples,
      numeric: numericCount ? {
        count: numericCount,
        min: numericMin,
        max: numericMax,
        average: Number((numericSum / numericCount).toFixed(6))
      } : null
    };
  }

  return { rowCount: rows.length, columnCount: names.size, columns };
}

const SECURITY_RULES = [
  { id: 'private-key', severity: 'critical', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, message: 'Private key material appears embedded in source.', remediation: 'Remove the key, rotate it, and load credentials from a secret manager.' },
  { id: 'aws-access-key', severity: 'critical', re: /\bAKIA[0-9A-Z]{16}\b/g, message: 'Possible AWS access key embedded in source.', remediation: 'Rotate the credential and use workload identity or a secret manager.' },
  { id: 'generic-secret', severity: 'high', re: /\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"'\n]{8,}["']/gi, message: 'Possible hard-coded credential.', remediation: 'Move credentials into a secret store and rotate exposed values.' },
  { id: 'dynamic-eval', severity: 'high', re: /\b(?:eval|Function)\s*\(/g, message: 'Dynamic code execution can turn untrusted input into executable code.', remediation: 'Avoid dynamic evaluation; use explicit parsing or dispatch tables.' },
  { id: 'shell-exec', severity: 'high', re: /\b(?:exec|execSync|system|popen)\s*\(/g, message: 'Shell execution requires strict input control.', remediation: 'Use argument arrays, allowlists, and avoid concatenating untrusted input into commands.' },
  { id: 'sql-concat', severity: 'high', re: /\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^;\n]*(?:\+|\$\{)/gi, message: 'Possible SQL query construction by concatenation/interpolation.', remediation: 'Use parameterized queries.' },
  { id: 'weak-hash', severity: 'medium', re: /\b(?:md5|sha1)\b/gi, message: 'Weak cryptographic hash referenced.', remediation: 'For security-sensitive hashing, prefer SHA-256+ or a password-specific KDF.' },
  { id: 'http-url', severity: 'low', re: /\bhttp:\/\/[^\s"'<>]+/gi, message: 'Plain HTTP URL found.', remediation: 'Prefer HTTPS when transmitting sensitive or integrity-sensitive data.' }
];

function lineAt(content, index) {
  return content.slice(0, index).split('\n').length;
}

function staticAnalyze(files) {
  const findings = [];
  let totalChars = 0;
  const accepted = files.slice(0, 100);

  for (const file of accepted) {
    const path = String(file?.path || 'unknown');
    const content = String(file?.content || '');
    totalChars += content.length;
    if (totalChars > 3000000) break;

    for (const rule of SECURITY_RULES) {
      const re = new RegExp(rule.re.source, rule.re.flags);
      let match;
      while ((match = re.exec(content)) !== null) {
        findings.push({
          rule: rule.id,
          severity: rule.severity,
          path,
          line: lineAt(content, match.index),
          message: rule.message,
          remediation: rule.remediation
        });
        if (findings.length >= 1000) break;
        if (match.index === re.lastIndex) re.lastIndex += 1;
      }
      if (findings.length >= 1000) break;
    }
    if (findings.length >= 1000) break;
  }

  const severities = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const finding of findings) severities[finding.severity] += 1;

  return {
    summary: { filesScanned: accepted.length, charactersScanned: Math.min(totalChars, 3000000), findings: findings.length, severities },
    findings
  };
}

function mask(value) {
  const text = String(value);
  if (text.length <= 4) return '*'.repeat(text.length);
  return text.slice(0, 2) + '*'.repeat(Math.min(12, text.length - 4)) + text.slice(-2);
}

function luhn(candidate) {
  const digits = candidate.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function piiScan(texts) {
  const patterns = {
    email: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    ipv4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    phone: /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]\d{3,4}\b/g,
    secret_assignment: /\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*["']?([A-Za-z0-9_\-./+=]{8,})/gi,
    credit_card_candidate: /\b(?:\d[ -]*?){13,19}\b/g
  };

  const totals = {};
  const documents = texts.slice(0, 1000).map((raw, index) => {
    const text = String(raw ?? '');
    const detections = {};
    for (const [type, pattern] of Object.entries(patterns)) {
      const re = new RegExp(pattern.source, pattern.flags);
      let values = text.match(re) || [];
      if (type === 'credit_card_candidate') values = values.filter(luhn);
      const unique = [...new Set(values)];
      if (unique.length) {
        detections[type] = { count: unique.length, maskedExamples: unique.slice(0, 3).map(mask) };
        totals[type] = (totals[type] || 0) + unique.length;
      }
    }
    return { index, detections };
  });

  return { totals, documents };
}

function firstTagContent(html, tag) {
  const re = new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i');
  const match = html.match(re);
  return match ? match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null;
}

function countMatches(text, re) {
  const matches = text.match(re);
  return matches ? matches.length : 0;
}

function webAnalyze(html, url) {
  const title = firstTagContent(html, 'title');
  const metaDescriptionMatch = html.match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i)
    || html.match(/<meta\b[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i);
  const headings = {};
  for (let level = 1; level <= 6; level++) headings['h' + level] = countMatches(html, new RegExp('<h' + level + '\\b', 'gi'));

  const links = countMatches(html, /<a\b/gi);
  const images = countMatches(html, /<img\b/gi);
  const imagesWithoutAlt = countMatches(html, /<img\b(?![^>]*\balt=)[^>]*>/gi);
  const forms = countMatches(html, /<form\b/gi);
  const passwordInputs = countMatches(html, /<input\b[^>]*type=["']password["']/gi);
  const inlineHandlers = countMatches(html, /\son[a-z]+\s*=/gi);
  const mixedContent = countMatches(html, /(?:src|href)=["']http:\/\//gi);
  const externalScripts = countMatches(html, /<script\b[^>]*src=/gi);
  const issues = [];

  if (!title) issues.push({ severity: 'medium', code: 'missing-title', message: 'Document has no title element.' });
  if (!metaDescriptionMatch) issues.push({ severity: 'low', code: 'missing-meta-description', message: 'No meta description found.' });
  if (!headings.h1) issues.push({ severity: 'low', code: 'missing-h1', message: 'No H1 heading found.' });
  if (imagesWithoutAlt) issues.push({ severity: 'medium', code: 'image-alt', message: imagesWithoutAlt + ' image(s) appear to be missing alt attributes.' });
  if (inlineHandlers) issues.push({ severity: 'low', code: 'inline-event-handlers', message: inlineHandlers + ' inline event handler(s) found.' });
  if (mixedContent) issues.push({ severity: 'high', code: 'mixed-content', message: mixedContent + ' HTTP resource reference(s) found in HTML.' });
  if (passwordInputs && url && !String(url).startsWith('https://')) issues.push({ severity: 'critical', code: 'password-over-non-https', message: 'Password input supplied for a non-HTTPS page URL.' });

  return {
    url: url || null,
    title,
    metaDescription: metaDescriptionMatch ? metaDescriptionMatch[1].trim() : null,
    headings,
    counts: { links, images, imagesWithoutAlt, forms, passwordInputs, inlineHandlers, mixedContent, externalScripts },
    issues
  };
}

export function registerPremiumHandlers(app, assignment) {
  app.post('/v1/data/profile', (req, res) => {
    const records = Array.isArray(req.body?.records) ? req.body.records : null;
    if (!records || !records.length) return res.status(400).json({ error: 'records[] is required.' });
    res.json({ ...assignment('data-profile'), ...profileRecords(records) });
  });

  app.post('/v1/security/static-analysis', (req, res) => {
    const files = Array.isArray(req.body?.files) ? req.body.files : null;
    if (!files || !files.length) return res.status(400).json({ error: 'files[] is required.' });
    res.json({ ...assignment('static-analysis'), ...staticAnalyze(files) });
  });

  app.post('/v1/security/pii-scan', (req, res) => {
    const texts = Array.isArray(req.body?.texts)
      ? req.body.texts
      : typeof req.body?.text === 'string' ? [req.body.text] : null;
    if (!texts || !texts.length) return res.status(400).json({ error: 'texts[] or text is required.' });
    res.json({ ...assignment('pii-scan'), ...piiScan(texts) });
  });

  app.post('/v1/web/analyze', (req, res) => {
    const html = typeof req.body?.html === 'string' ? req.body.html : '';
    if (!html) return res.status(400).json({ error: 'html is required.' });
    res.json({ ...assignment('web-analysis'), ...webAnalyze(html, req.body?.url) });
  });
}
