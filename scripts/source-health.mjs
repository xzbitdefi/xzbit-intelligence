import fs from 'node:fs';
// XZBIT 1.14.8 · Recuperação não destrutiva de fonte stablecoins.
// Coletor original usava api.llama.fi/stablecoins (404). Host gratuito oficial:
// https://stablecoins.llama.fi/stablecoins?includePrices=true
const FILE='data/state.json',time=new Date().toISOString();
if(!fs.existsSync(FILE))throw Error('Execute collect.mjs antes de source-health.mjs');
const s=JSON.parse(fs.readFileSync(FILE,'utf8'));s.sources??={};s.metrics??={};
const url='https://stablecoins.llama.fi/stablecoins?includePrices=true';
const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
try{
 let r;try{r=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json','User-Agent':'XZBIT Intelligence Research Monitor/1.14.8'}})}finally{clearTimeout(timer)}
 if(!r.ok)throw Error('Stablecoins HTTP '+r.status);
 const d=await r.json();if(!Array.isArray(d?.peggedAssets))throw Error('Payload stablecoins inválido');
 const top=d.peggedAssets.map(x=>({name:x.name,symbol:x.symbol,usd:Number(x.circulating?.peggedUSD||0)}))
  .filter(x=>Number.isFinite(x.usd)&&x.usd>0).sort((a,b)=>b.usd-a.usd);
 if(top.length<1)throw Error('Stablecoins sem observações válidas');
 s.metrics.stablecoins={total_usd:top.reduce((n,x)=>n+x.usd,0),top:top.slice(0,8),observation_time:time,url,note:'Circulação observada; não equivale a fluxos de exchange ou stablecoins líquidos.'};
 s.sources.stablecoins={...s.sources.stablecoins,ok:true,last_success:time,last_attempt:time,count:top.length,error:null,url};
 console.log('Stablecoins recuperadas',top.length);
}catch(e){
 s.sources.stablecoins={...s.sources.stablecoins,ok:false,last_attempt:time,error:String(e.message||e).slice(0,160),url};
 console.warn('Stablecoins sem leitura atual:',e.message||e);
}
fs.writeFileSync(FILE,JSON.stringify(s,null,2)+'\n');
