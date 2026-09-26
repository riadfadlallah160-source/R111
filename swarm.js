import { declareDiscoveryExtension } from '@x402/extensions/bazaar';

const MAX_BATCH = 5000;

function getJobs(context) {
  try {
    const body = context?.adapter?.getBody?.();
    return Array.isArray(body?.jobs) ? body.jobs : [];
  } catch {
    return [];
  }
}

function dynamicBatchPrice(context) {
  const count = getJobs(context).length;
  const billable = Math.min(MAX_BATCH, Math.max(1, count));
  return '$' + billable;
}

export function createSwarmPaidRoute({ PAY_TO, NETWORK, PUBLIC_BASE }) {
  return {
    'POST /v1/swarm/batch': {
      accepts: [{ scheme: 'exact', price: dynamicBatchPrice, network: NETWORK, payTo: PAY_TO }],
      description: 'Execute up to 5,000 deterministic paid work units in one swarm batch. Each successful unit costs exactly $1 USDC and fills one daily earning slot.',
      mimeType: 'application/json',
      resource: {
        url: PUBLIC_BASE + '/v1/swarm/batch',
        description: 'Parallel multi-job endpoint for the 50M earning swarm. One paid work unit maps to one $1 agent quota.',
        mimeType: 'application/json',
        serviceName: '50M Swarm Batch',
        tags: ['swarm','batch','parallel','agents','data','x402']
      },
      extensions: declareDiscoveryExtension({
        bodyType: 'json',
        input: {
          jobs: [
            { operation: 'hash', input: { text: 'hello' } },
            { operation: 'metrics', input: { text: 'hello world' } }
          ]
        },
        inputSchema: {
          type: 'object',
          properties: {
            jobs: {
              type: 'array',
              minItems: 1,
              maxItems: MAX_BATCH,
              description: '1-5,000 independent work units. Price is exactly $1 per item.',
              items: {
                type: 'object',
                properties: {
                  operation: {
                    type: 'string',
                    enum: ['hash','metrics','extract','keywords','dedupe','normalize-url','csv-to-json','json-validate']
                  },
                  input: { type: 'object' }
                },
                required: ['operation','input']
              }
            }
          },
          required: ['jobs']
        },
        output: {
          example: {
            units: 2,
            settledValueUsd: 2,
            results: [
              { agentId: 1, operation: 'hash', ok: true, result: { sha256: '...' } },
              { agentId: 2, operation: 'metrics', ok: true, result: { words: 2 } }
            ]
          },
          schema: { type: 'object', additionalProperties: true }
        }
      })
    }
  };
}

function words(text) {
  return String(text).toLowerCase().match(/[a-z0-9]+(?:['’-][a-z0-9]+)*/g) || [];
}

function parseCsv(input) {
  const rows=[]; let row=[]; let cell=''; let quoted=false;
  for(let i=0;i<input.length;i+=1){
    const ch=input[i], next=input[i+1];
    if(ch==='"'&&quoted&&next==='"'){cell+='"';i+=1;}
    else if(ch==='"'){quoted=!quoted;}
    else if(ch===','&&!quoted){row.push(cell);cell='';}
    else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&next==='\n')i+=1;row.push(cell);rows.push(row);row=[];cell='';}
    else cell+=ch;
  }
  row.push(cell);
  if(row.some(v=>v!=='')||rows.length===0)rows.push(row);
  return rows;
}

function executeOne(job, crypto) {
  const operation=String(job?.operation||'').toLowerCase();
  const input=job?.input&&typeof job.input==='object'?job.input:{};

  if(operation==='hash'){
    const text=String(input.text||'');
    if(!text) throw new Error('input.text is required');
    const digest=a=>crypto.createHash(a).update(text,'utf8').digest('hex');
    return {sha256:digest('sha256'),sha1:digest('sha1'),md5:digest('md5')};
  }

  if(operation==='metrics'){
    const text=String(input.text||'');
    if(!text) throw new Error('input.text is required');
    const ws=words(text);
    return {characters:text.length,charactersNoWhitespace:text.replace(/\s/g,'').length,words:ws.length,uniqueWords:new Set(ws).size,lines:text.split(/\r?\n/).length};
  }

  if(operation==='extract'){
    const text=String(input.text||'');
    if(!text) throw new Error('input.text is required');
    const unique=x=>Array.from(new Set(x));
    return {
      emails:unique(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]),
      urls:unique(text.match(/https?:\/\/[^\s<>"']+/gi)||[]),
      hashtags:unique(text.match(/#[\p{L}\p{N}_]+/gu)||[]),
      mentions:unique(text.match(/@[A-Za-z0-9_]{2,}/g)||[])
    };
  }

  if(operation==='keywords'){
    const text=String(input.text||'');
    if(!text) throw new Error('input.text is required');
    const counts=new Map();
    for(const word of words(text)){if(word.length<2)continue;counts.set(word,(counts.get(word)||0)+1);}
    return Array.from(counts.entries()).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,Math.min(100,Math.max(1,Number(input.limit||20)))).map(([keyword,count])=>({keyword,count}));
  }

  if(operation==='dedupe'){
    const items=Array.isArray(input.items)?input.items.map(String):String(input.text||'').split(/\r?\n/).filter(Boolean);
    if(!items.length) throw new Error('input.items or input.text is required');
    return {items:Array.from(new Set(items))};
  }

  if(operation==='normalize-url'){
    const raw=Array.isArray(input.urls)?input.urls.map(String):[String(input.url||'')].filter(Boolean);
    if(!raw.length) throw new Error('input.url or input.urls is required');
    return raw.map(value=>{try{const u=new URL(/^https?:\/\//i.test(value)?value:'https://'+value);u.hash='';u.hostname=u.hostname.toLowerCase();return {input:value,valid:true,normalized:u.toString()};}catch{return {input:value,valid:false,normalized:null};}});
  }

  if(operation==='csv-to-json'){
    const csv=String(input.csv||'');
    if(!csv) throw new Error('input.csv is required');
    const rows=parseCsv(csv), headers=rows.shift()||[];
    return rows.filter(r=>r.some(c=>c!=='')).map(r=>Object.fromEntries(headers.map((h,i)=>[h||'column_'+(i+1),r[i]||''])));
  }

  if(operation==='json-validate'){
    try{const parsed=typeof input.json==='string'?JSON.parse(input.json):input.json;if(parsed===undefined)throw new Error('input.json is required');return {valid:true,type:Array.isArray(parsed)?'array':parsed===null?'null':typeof parsed,compact:JSON.stringify(parsed)};}
    catch(err){return {valid:false,error:err instanceof Error?err.message:String(err)};}
  }

  throw new Error('Unknown operation');
}

export function registerSwarmHandler(app, assignment, crypto) {
  app.post('/v1/swarm/batch', async (req,res)=>{
    const jobs=Array.isArray(req.body?.jobs)?req.body.jobs:null;
    if(!jobs||jobs.length<1||jobs.length>MAX_BATCH) return res.status(400).json({error:'jobs must contain 1 to '+MAX_BATCH+' work units.'});

    const results=new Array(jobs.length);
    const concurrency=100;
    let cursor=0;

    async function worker(){
      while(true){
        const i=cursor++;
        if(i>=jobs.length)return;
        try{
          const output=executeOne(jobs[i],crypto);
          results[i]={...assignment('swarm-'+String(jobs[i]?.operation||'work')),operation:String(jobs[i]?.operation||''),ok:true,result:output};
        }catch(err){
          results[i]={operation:String(jobs[i]?.operation||''),ok:false,error:err instanceof Error?err.message:String(err)};
        }
      }
    }

    await Promise.all(Array.from({length:Math.min(concurrency,jobs.length)},()=>worker()));
    const failures=results.filter(r=>!r.ok);
    if(failures.length) return res.status(400).json({error:'One or more work units are invalid. Payment will not settle.',failures});

    res.json({
      units:jobs.length,
      settledValueUsd:jobs.length,
      executionConcurrency:Math.min(concurrency,jobs.length),
      activePopulation:50000000,
      results
    });
  });
}
