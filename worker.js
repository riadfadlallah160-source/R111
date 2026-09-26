import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as ed from '@noble/ed25519';
import { sha256 } from '@noble/hashes/sha256';

const runFile = promisify(execFile);
const API = 'https://api.basedagents.ai';
const WALLET = '0xf744573cdfFC211163c11c0a31730851Da78f708';
const PRIV = process.env.BASEDAGENTS_PRIVATE_KEY_HEX || '';
const PUB = process.env.BASEDAGENTS_PUBLIC_KEY_B58 || '';
const ID = PUB ? 'ag_' + PUB : '';
const KP = path.join(os.tmpdir(), 'basedagents-50m.json');
const CLI = path.resolve('node_modules/basedagents/bin/basedagents.mjs');
let running = false;

function hexBytes(hex) {
  const a = new Uint8Array(hex.length / 2);
  for (let i=0;i<a.length;i++) a[i]=parseInt(hex.slice(i*2,i*2+2),16);
  return a;
}
function b58(bytes) {
  const A='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let z=0,n=0n,out='';
  for(const b of bytes){if(b!==0)break;z++;}
  for(const b of bytes)n=n*256n+BigInt(b);
  while(n>0n){out=A[Number(n%58n)]+out;n/=58n;}
  return '1'.repeat(z)+out;
}
function zeroBits(h) {
  let c=0;
  for(const b of h){
    if(b===0){c+=8;continue;}
    for(let bit=7;bit>=0;bit--){if((b>>bit)&1)return c;c++;}
  }
  return c;
}
async function pow(pub,challenge,diff) {
  const ch=new TextEncoder().encode(challenge);
  for(let n=0;n<=0xffffffff;n++){
    const nb=new Uint8Array([(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255]);
    const input=new Uint8Array(pub.length+ch.length+4);
    input.set(pub,0);input.set(ch,pub.length);input.set(nb,pub.length+ch.length);
    if(zeroBits(sha256(input))>=diff)return n.toString(16).padStart(8,'0');
    if(n%100000===0)await new Promise(r=>setTimeout(r,0));
  }
  throw new Error('pow_failed');
}
function saveKey() {
  fs.writeFileSync(KP,JSON.stringify({agent_id:ID,public_key_b58:PUB,private_key_hex:PRIV},null,2),{mode:0o600});
}
async function ensureIdentity() {
  if(!PRIV||!PUB){console.log('BasedAgents hunter disabled: secret missing');return false;}
  const exists=await fetch(API+'/v1/agents/'+ID);
  if(exists.ok){saveKey();return true;}
  const priv=hexBytes(PRIV);
  const pub=await ed.getPublicKeyAsync(priv);
  if(b58(pub)!==PUB)throw new Error('key_mismatch');
  const r1=await fetch(API+'/v1/register/init',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({public_key:PUB})});
  const init=await r1.json();
  if(!r1.ok)throw new Error('register_init_'+JSON.stringify(init));
  const nonce=await pow(pub,init.challenge,init.difficulty||20);
  const sig=await ed.signAsync(new TextEncoder().encode(init.challenge),priv);
  const r2=await fetch(API+'/v1/register/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
    challenge_id:init.challenge_id,public_key:PUB,nonce,signature:Buffer.from(sig).toString('base64'),
    profile:{name:'50M Pool Worker',description:'Autonomous worker for funded data and automation tasks.',capabilities:['data','automation','text-processing'],protocols:['https','agentsig'],tags:['autonomous','base-usdc']}
  })});
  const done=await r2.json();
  if(!r2.ok)throw new Error('register_complete_'+JSON.stringify(done));
  saveKey();console.log('BasedAgents registered:',ID);return true;
}
async function cli(args) {
  const r=await runFile(process.execPath,[CLI].concat(args,['--keypair',KP,'--json']),{timeout:120000,maxBuffer:5242880});
  const lines=r.stdout.trim().split(/\r?\n/).filter(Boolean);
  return lines.length?JSON.parse(lines[lines.length-1]):null;
}
function textOf(t){return [t.title,t.description,t.expected_output].filter(Boolean).join(' ');}
function block(s) {
  s=String(s||'');
  const m=s.match(/(?:INPUT|DATA|TEXT|CSV|JSON)\s*:\s*([\s\S]+)/i);
  return m?m[1].trim():'';
}
function solve(t) {
  const h=textOf(t).toLowerCase(),s=block(t.description)||block(t.expected_output);
  if(!s)return null;
  if(/dedup|remove duplicates/.test(h))return {items:Array.from(new Set(s.split(/\r?\n/)))};
  if(/sha-?256|sha1|md5|hash/.test(h)){const d=a=>crypto.createHash(a).update(s).digest('hex');return {sha256:d('sha256'),sha1:d('sha1'),md5:d('md5')};}
  if(/json.*valid|validat.*json/.test(h)){try{return {valid:true,value:JSON.parse(s)}}catch(e){return {valid:false,error:String(e.message||e)}}}
  if(/csv.*json|convert.*csv/.test(h)){const rows=s.split(/\r?\n/).filter(Boolean).map(x=>x.split(','));if(rows.length<2)return null;const hd=rows.shift();return rows.map(r=>Object.fromEntries(hd.map((x,i)=>[x.trim(),(r[i]||'').trim()])))}
  if(/word count|text metrics|character count/.test(h)){const w=s.trim().match(/\S+/g)||[];return {characters:s.length,words:w.length,lines:s.split(/\r?\n/).length}}
  if(/extract.*email|extract.*url/.test(h))return {emails:Array.from(new Set(s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[])),urls:Array.from(new Set(s.match(/https?:\/\/[^\s<>"']+/gi)||[]))};
  return null;
}
async function cycle() {
  if(running)return;running=true;
  try{
    if(!(await ensureIdentity()))return;
    try{await cli(['wallet','set',WALLET,'--network','eip155:8453']);}catch(e){console.log('wallet setup:',String(e.message||e).slice(0,250))}
    const list=await cli(['tasks','list','--status','open','--min-usdc','1.00']);
    const tasks=list&&Array.isArray(list.tasks)?list.tasks:[];
    console.log('BasedAgents funded $1+ tasks visible:',tasks.length);
    for(const t of tasks){
      if(!t.claimable||!t.bounty||t.bounty.network!=='eip155:8453')continue;
      if(t.escrow&&t.escrow.status!=='funded')continue;
      const result=solve(t);if(!result)continue;
      try{
        await cli(['tasks','claim',t.task_id]);
        const f=path.join(os.tmpdir(),'delivery-'+t.task_id+'.json');
        fs.writeFileSync(f,JSON.stringify(result,null,2));
        await cli(['tasks','submit',t.task_id,'--file',f,'--note','Completed automatically by the 50M pooled worker.']);
        console.log('BasedAgents claimed+delivered:',t.task_id,'bounty',t.bounty.amount_display);
      }catch(e){console.log('BasedAgents task skipped:',t.task_id,String(e.message||e).slice(0,300))}
    }
  }catch(e){console.error('BasedAgents hunter cycle:',String(e.message||e).slice(0,500))}
  finally{running=false;}
}
export async function startBasedAgentsHunter(){await cycle();setInterval(()=>void cycle(),3600000).unref();}
