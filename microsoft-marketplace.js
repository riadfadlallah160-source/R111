import crypto from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const API='https://marketplaceapi.microsoft.com';
const SCOPE='20e940b3-4c77-4b0b-9a53-9e16a1b010a7/.default';

function config(){ return {
  tenantId:process.env.MS_MARKETPLACE_TENANT_ID||'',
  clientId:process.env.MS_MARKETPLACE_CLIENT_ID||'',
  clientSecret:process.env.MS_MARKETPLACE_CLIENT_SECRET||'',
  offerId:process.env.MS_MARKETPLACE_OFFER_ID||'50m-swarm',
  planId:process.env.MS_MARKETPLACE_PLAN_ID||'metered'
}; }

function ready(){ const c=config(); return Boolean(c.tenantId&&c.clientId&&c.clientSecret); }

async function token(){
  const c=config();
  if(!ready()) throw new Error('Microsoft Marketplace publisher credentials are not configured');
  const body=new URLSearchParams({grant_type:'client_credentials',client_id:c.clientId,client_secret:c.clientSecret,scope:SCOPE});
  const r=await fetch('https://login.microsoftonline.com/'+encodeURIComponent(c.tenantId)+'/oauth2/v2.0/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||!j.access_token) throw new Error('Microsoft token request failed');
  return j.access_token;
}

async function resolvePurchase(purchaseToken){
  const access=await token();
  const r=await fetch(API+'/api/saas/subscriptions/resolve?api-version=2018-08-31',{method:'POST',headers:{authorization:'Bearer '+access,'content-type':'application/json','x-ms-marketplace-token':purchaseToken,'x-ms-requestid':crypto.randomUUID(),'x-ms-correlationid':crypto.randomUUID()}});
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error('Resolve failed: '+r.status);
  return j;
}

async function verifyWebhook(auth){
  const c=config();
  if(!c.tenantId||!c.clientId) throw new Error('Marketplace identity is not configured');
  const value=String(auth||'');
  if(!value.toLowerCase().startsWith('bearer ')) throw new Error('Missing bearer token');
  const jwks=createRemoteJWKSet(new URL('https://login.microsoftonline.com/'+encodeURIComponent(c.tenantId)+'/discovery/v2.0/keys'));
  const verified=await jwtVerify(value.slice(7).trim(),jwks,{issuer:'https://login.microsoftonline.com/'+c.tenantId+'/v2.0',audience:c.clientId});
  return verified.payload;
}

async function emitUsage(body){
  const access=await token();
  const c=config();
  const payload={resourceId:body.resourceId,quantity:body.quantity,dimension:body.dimension||'work-unit',effectiveStartTime:body.effectiveStartTime||new Date().toISOString(),planId:body.planId||c.planId};
  const r=await fetch(API+'/api/usageEvent?api-version=2018-08-31',{method:'POST',headers:{authorization:'Bearer '+access,'content-type':'application/json','x-ms-requestid':crypto.randomUUID(),'x-ms-correlationid':crypto.randomUUID()},body:JSON.stringify(payload)});
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error('Metering failed: '+r.status);
  return j;
}

export function registerMicrosoftMarketplaceRoutes(app){
  app.get('/marketplace/microsoft',async(req,res)=>{
    const purchaseToken=String(req.query?.token||req.query?.['x-ms-marketplace-token']||'').trim();
    if(!purchaseToken) return res.type('html').send('<!doctype html><meta charset="utf-8"><title>50M Swarm — Microsoft Marketplace</title><body style="font:16px system-ui;background:#081018;color:#edf5ff;padding:50px"><h1>50M Swarm — Microsoft Marketplace</h1><p>24/7 Marketplace landing endpoint.</p><p>Publisher integration: '+(ready()?'credentials configured':'awaiting Partner Center / Entra credentials')+'</p><p>Metering dimension: work-unit. Target unit price: $1.</p><p>Contact: 50m-demand@agentmail.to</p></body>');
    try{ const p=await resolvePurchase(purchaseToken); return res.json({resolved:true,subscriptionId:p.id,offerId:p.offerId,planId:p.planId,quantity:p.quantity,status:p.saasSubscriptionStatus}); }
    catch(e){ return res.status(502).json({error:e instanceof Error?e.message:String(e)}); }
  });

  app.post('/marketplace/microsoft/webhook',async(req,res)=>{
    try{ const claims=await verifyWebhook(req.headers.authorization); const event=req.body&&typeof req.body==='object'?req.body:{}; console.log('Microsoft Marketplace webhook:',JSON.stringify({action:event.action,subscriptionId:event.subscriptionId,operationId:event.id,planId:event.planId,quantity:event.quantity,tid:claims.tid||null,appid:claims.appid||claims.azp||null})); return res.status(200).json({accepted:true}); }
    catch(e){ return res.status(401).json({error:e instanceof Error?e.message:String(e)}); }
  });

  app.post('/marketplace/microsoft/meter',async(req,res)=>{
    const expected=String(process.env.MS_MARKETPLACE_INTERNAL_METER_KEY||'');
    if(!expected||String(req.headers['x-internal-meter-key']||'')!==expected) return res.status(401).json({error:'unauthorized'});
    const resourceId=String(req.body?.resourceId||'').trim(); const quantity=Number(req.body?.quantity);
    if(!resourceId||!Number.isFinite(quantity)||quantity<=0) return res.status(400).json({error:'resourceId and positive quantity are required'});
    try{ return res.json({accepted:true,result:await emitUsage({resourceId,quantity,dimension:String(req.body?.dimension||'work-unit'),effectiveStartTime:req.body?.effectiveStartTime,planId:req.body?.planId})}); }
    catch(e){ return res.status(502).json({error:e instanceof Error?e.message:String(e)}); }
  });

  app.get('/marketplace/microsoft/status',(_req,res)=>{ const c=config(); res.json({technicalIntegration:'live',publisherCredentialsConfigured:ready(),landingPage:'/marketplace/microsoft',webhook:'/marketplace/microsoft/webhook',meteringEndpoint:'/marketplace/microsoft/meter',dimension:'work-unit',targetUsdPerUnit:1,offerId:c.offerId,planId:c.planId,country:'Nigeria',payout:'Partner Center validated bank payout profile'}); });
}