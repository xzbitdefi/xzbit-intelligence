import fs from 'node:fs';
// XZBIT LABS 1.14.8: Hyperliquid public OI snapshots. NOT CoinGlass liquidation levels.
// Each new workflow run appends one OBSERVED sample. Never backfills made-up OI history.
const FILE='data/state.json',TIME=new Date().toISOString();
if(!fs.existsSync(FILE))throw Error('collect.mjs deve executar antes deste módulo');
const state=JSON.parse(fs.readFileSync(FILE,'utf8'));
state.metrics??={};state.sources??={};
const old=state.metrics.liquidation_lab||{},pairs=old.pairs||{};
const key='liquidation_lab',source=state.sources[key]||{};
try{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
 let response;try{response=await fetch('https://api.hyperliquid.xyz/info',{
  method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},
  body:JSON.stringify({type:'metaAndAssetCtxs'}),signal:controller.signal
 })}finally{clearTimeout(timer)}
 if(!response.ok)throw Error('Hyperliquid HTTP '+response.status);
 const data=await response.json(),universe=data?.[0]?.universe,ctxs=data?.[1];
 if(!Array.isArray(universe)||!Array.isArray(ctxs)||universe.length!==ctxs.length)throw Error('Payload de contextos de perpétuos inválido');
 let count=0;
 for(const coin of ['BTC','ETH','SOL']){
  const index=universe.findIndex(x=>x?.name===coin),asset=ctxs[index];
  if(index<0||!asset){console.warn('Hyperliquid:',coin,'sem contrato na amostra');continue}
  const p=Number(asset.markPx),oi=Number(asset.openInterest),funding=Number(asset.funding);
  if(!Number.isFinite(p)||p<=0||!Number.isFinite(oi)||oi<=0){console.warn('Hyperliquid: invalid',coin);continue}
  const symbol=coin+'USDT',prior=pairs[symbol];
  // Never blend Binance OI (often in quote units) and Hyperliquid OI (base contracts).
  let points=(prior?.oi_source?.startsWith('Hyperliquid')&&Array.isArray(prior.points)?prior.points:[])
   .filter(x=>Number.isFinite(Number(x.t))&&Number(x.t)>Date.now()-48*3600000&&Number(x.p)>0&&Number(x.oi)>0)
   .sort((a,b)=>a.t-b.t);
  const last=points.at(-1);
  if(!last||Date.now()-Number(last.t)>=5*60000)points.push({t:Date.now(),p,oi});
  points=points.slice(-192);
  pairs[symbol]={observation_time:TIME,points,funding:Number.isFinite(funding)?funding:null,
   oi_unit:coin,price_source:'Hyperliquid markPx',oi_source:'Hyperliquid perp openInterest (base)',
   model:'Hipóteses educacionais; variação de OI base não identifica liquidações nem entradas long/short'};
  count++;console.log('Hyperliquid',coin,'OI amostras:',points.length);
 }
 if(!count)throw Error('Nenhum dos três contratos possui amostra válida');
 state.metrics.liquidation_lab={pairs,observation_time:TIME,
  methodology:'Risco teórico baseado em delta de OI base da Hyperliquid, níveis hipotéticos 10/25/50/100x. Não representa mapa de liquidações reais nem dados da Binance.',
  refresh:'GitHub Actions a cada 15 minutos; histórico disponível somente após coletas reais',
  venue:'Hyperliquid',minimum_points:3,observed_stream:'Binance forceOrder opcional, não contabiliza total'};
 state.sources[key]={...source,ok:true,last_success:TIME,last_attempt:TIME,count,
  error:null,url:'https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals'};
}catch(e){
 state.sources[key]={...source,ok:false,last_attempt:TIME,error:String(e.message||e).slice(0,220),
  url:'https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals'};
 console.warn('Fonte Hyperliquid indisponível:',e.message||e);
}
fs.writeFileSync(FILE,JSON.stringify(state,null,2)+'\n');
