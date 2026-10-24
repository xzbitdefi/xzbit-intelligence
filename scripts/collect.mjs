import fs from 'node:fs';
import crypto from 'node:crypto';
const DATA='data/state.json';
const date=new Date().toISOString();
const empty={version:1,updated_at:null,sources:{},events:[],metrics:{},history:[]};
let state=fs.existsSync(DATA)?JSON.parse(fs.readFileSync(DATA,'utf8')):structuredClone(empty);
for(const k of Object.keys(empty)) if(state[k]===undefined)state[k]=empty[k];
const initial=!state.updated_at;
const id=(s)=>crypto.createHash('sha256').update(s).digest('hex').slice(0,20);
const fetchJson=async(url)=>{const c=new AbortController();const t=setTimeout(()=>c.abort(),18000);try{let r=await fetch(url,{signal:c.signal,headers:{'User-Agent':'XZBIT Intelligence Research Monitor/7.0','Accept':'application/json'}});if(!r.ok)throw Error(`HTTP ${r.status}`);return await r.json()}finally{clearTimeout(t)}};
async function source(key,url,fn){try{let raw=await fetchJson(url);let count=fn(raw);state.sources[key]={ok:true,last_success:date,last_attempt:date,count:Number(count)||0,url};console.log('OK',key,count)}catch(e){let prev=state.sources[key]||{};state.sources[key]={...prev,ok:false,last_attempt:date,error:String(e.message).slice(0,140),url};console.error('ERROR',key,e.message)}}
const added=[];
function event(v){v.id=id(v.origin+'|'+v.key);if(state.events.find(e=>e.id===v.id))return;const doc={id:v.id,first_seen:date,confidence:v.confidence||'fonte primaria',status:v.status||'informativo',...v};state.events.unshift(doc);added.push(doc)}
await source('cisa','https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',d=>{if(!Array.isArray(d.vulnerabilities))throw Error('payload CISA inválido');for(const v of d.vulnerabilities.filter(x=>x.dateAdded && (Date.now()-Date.parse(x.dateAdded))<8*86400000).slice(-35)){if(!v.cveID)continue;event({origin:'CISA KEV',key:v.cveID,category:'cyber',title:`${v.cveID} — ${v.vendorProject||'Fornecedor'} / ${v.product||'Produto'}`,summary:v.vulnerabilityName||v.shortDescription||'Vulnerabilidade inserida no catálogo KEV',date:v.dateAdded||null,link:`https://www.cisa.gov/known-exploited-vulnerabilities-catalog`,score:v.knownRansomwareCampaignUse==='Known'?85:72,status:'exploração conhecida; impacto financeiro não confirmado',evidence:{cve:v.cveID,vendor:v.vendorProject,product:v.product,ransomware:v.knownRansomwareCampaignUse}})}return d.vulnerabilities.length});
await source('fear_greed','https://api.alternative.me/fng/?limit=2&format=json',d=>{if(!Array.isArray(d.data))throw Error('payload FNG inválido');const a=d.data[0],b=d.data[1];state.metrics.fear_greed={value:Number(a.value),label:a.value_classification,previous:b?Number(b.value):null,observation_time:new Date(Number(a.timestamp)*1000).toISOString(),url:'https://alternative.me/crypto/fear-and-greed-index/'};return d.data.length});
await source('defillama','https://api.llama.fi/v2/chains',d=>{if(!Array.isArray(d))throw Error('payload DefiLlama inválido');const rows=d.filter(v=>Number.isFinite(Number(v.tvl))).sort((a,b)=>b.tvl-a.tvl);state.metrics.defi={total_tvl_usd:rows.reduce((t,c)=>t+Number(c.tvl),0),top_chains:rows.slice(0,12).map(x=>({name:x.name,tvl_usd:Number(x.tvl)})),observation_time:date,url:'https://defillama.com/chains',note:'Soma dos TVLs reportados por cadeia; não representa fluxo líquido nem necessariamente TVL consolidado sem dupla contagem.'};return rows.length});
await source('dexscreener','https://api.dexscreener.com/token-boosts/latest/v1',d=>{if(!Array.isArray(d))throw Error('payload DEX inválido');state.metrics.dex={boosted:d.slice(0,15).map(x=>({chain:x.chainId,address:x.tokenAddress,amount:x.amount,url:x.url,description:x.description?.slice(0,170)||''})),observation_time:date,url:'https://docs.dexscreener.com/api/reference',note:'Boosts são promoções pagas; não são evidência de tendência, investimento ou oportunidade.'};return d.length});

// XZBIT 8.0 — Market and DeFi first; only audited public read-only feeds.
await source('market_spot','https://data-api.binance.vision/api/v3/ticker/24hr',d=>{
 if(!Array.isArray(d))throw Error('Ticker Binance inesperado');
 const tickers={};for(const symbol of ['BTCUSDT','ETHUSDT','SOLUSDT']){
   const t=d.find(x=>x.symbol===symbol);if(t)tickers[symbol]={price:Number(t.lastPrice),change24h:Number(t.priceChangePercent),volume_quote_24h:Number(t.quoteVolume),high24h:Number(t.highPrice),low24h:Number(t.lowPrice)};
 }
 if(!Object.keys(tickers).length)throw Error('Pares esperados ausentes');
 state.metrics.market={tickers,observation_time:date,url:'https://data-api.binance.vision/api/v3/ticker/24hr',note:'Preços spot Binance USDT; não representam o mercado global nem contratos futuros'};
 return Object.keys(tickers).length;
});
await source('defi_protocols','https://api.llama.fi/protocols',d=>{
 if(!Array.isArray(d))throw Error('DefiLlama protocols inválido');
 const rows=d.filter(x=>Number.isFinite(Number(x.tvl))&&Number(x.tvl)>0).sort((a,b)=>Number(b.tvl)-Number(a.tvl));
 state.metrics.protocols={top:rows.slice(0,15).map(x=>({name:x.name,slug:x.slug,category:x.category,tvl:Number(x.tvl),change_1d:Number.isFinite(Number(x.change_1d))?Number(x.change_1d):null,change_7d:Number.isFinite(Number(x.change_7d))?Number(x.change_7d):null,chains:x.chains?.slice(0,4)||[]})),observation_time:date,url:'https://defillama.com/protocols'};
 return rows.length;
});
await source('dex_volumes','https://api.llama.fi/overview/dexs?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true',d=>{
 if(!d||typeof d!=='object'||!Array.isArray(d.protocols))throw Error('Resposta DEX inválida');
 state.metrics.dex_volume={total24h:Number.isFinite(Number(d.total24h))?Number(d.total24h):null,total48hto24h:Number.isFinite(Number(d.total48hto24h))?Number(d.total48hto24h):null,change_1d:Number.isFinite(Number(d.change_1d))?Number(d.change_1d):null,top:d.protocols.filter(x=>Number.isFinite(Number(x.total24h))).sort((a,b)=>b.total24h-a.total24h).slice(0,8).map(x=>({name:x.name,total24h:Number(x.total24h),change_1d:Number.isFinite(Number(x.change_1d))?Number(x.change_1d):null})),observation_time:date,url:'https://defillama.com/dexs'};
 return d.protocols.length;
});
await source('stablecoins','https://api.llama.fi/stablecoins?includePrices=true',d=>{
 if(!Array.isArray(d.peggedAssets))throw Error('Resposta stablecoins inválida');
 const rows=d.peggedAssets.map(x=>({name:x.name,symbol:x.symbol,usd:Number(x.circulating?.peggedUSD||0)})).filter(x=>x.usd>0).sort((a,b)=>b.usd-a.usd);
 state.metrics.stablecoins={total_usd:rows.reduce((a,x)=>a+x.usd,0),top:rows.slice(0,8),observation_time:date,url:'https://defillama.com/stablecoins',note:'Soma de circulação reportada para ativos em peg USD; não equivale a entradas líquidas nas exchanges'};
 return rows.length;
});


// XZBIT 9.0 — USD-M Futures: dados observados, sem inferir liquidacoes.
for (const pair of ['BTCUSDT','ETHUSDT','SOLUSDT']) {
  await source(`futures_${pair}` ,`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${pair}`,d=>{
    if(d.symbol!==pair || !Number.isFinite(Number(d.markPrice)))throw Error('Marcação futuros inválida');
    state.metrics.derivatives??={};state.metrics.derivatives[pair]??={};
    Object.assign(state.metrics.derivatives[pair],{mark_price:Number(d.markPrice),index_price:Number(d.indexPrice),funding_rate:Number.isFinite(Number(d.lastFundingRate))?Number(d.lastFundingRate):null,next_funding_time:d.nextFundingTime?new Date(d.nextFundingTime).toISOString():null,observation_time:date,source:'Binance Futures USD-M',url:`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${pair}`});
    return 1;
  });
  await source(`oi_${pair}`,`https://fapi.binance.com/fapi/v1/openInterest?symbol=${pair}`,d=>{
    if(d.symbol!==pair||!Number.isFinite(Number(d.openInterest)))throw Error('OI inválido');
    state.metrics.derivatives??={};state.metrics.derivatives[pair]??={};
    Object.assign(state.metrics.derivatives[pair],{open_interest_base:Number(d.openInterest),oi_observation_time:d.time?new Date(d.time).toISOString():date,oi_unit:pair.replace('USDT',''),oi_url:`https://fapi.binance.com/fapi/v1/openInterest?symbol=${pair}`});
    return 1;
  });
}
const prior=state.history?.[0];
for(const [pair,obj] of Object.entries(state.metrics.derivatives||{})){
 const prev=prior?.derivatives?.[pair]?.oi;
 obj.oi_change_since_prior_pct=Number.isFinite(prev)&&prev>0&&Number.isFinite(obj.open_interest_base)?(obj.open_interest_base/prev-1)*100:null;
}


// Triagem educativa: fonte sem auditoria e sem garantia de disponibilidade.
// Consulta só a cada 6h para evitar downloads grandes e limites.
const poolLast=Date.parse(state.sources.yield_pools?.last_success||'');
if(!Number.isFinite(poolLast)||Date.now()-poolLast>6*3600000){
await source('yield_pools','https://yields.llama.fi/pools',d=>{
 if(!Array.isArray(d.data))throw Error('Payload pools inválido');
 const approved=/^(aave|uniswap|curve|morpho|kamino|orca|raydium|lido|ether.fi|sky|compound|spark|jupiter|balancer)/i;
 const blue=/^(USDC|USDT|DAI|USDS|ETH|WETH|WBTC|BTC|CBBTC|SOL|JITOSOL|WSTETH|STETH|RETH)([\-+\/ ]|$)/i;
 const selected=d.data.filter(p=>approved.test(String(p.project||''))&&blue.test(String(p.symbol||''))&&Number(p.tvlUsd)>=1e7&&Number.isFinite(Number(p.apy))&&Number(p.apy)>=0&&Number(p.apy)<=100).sort((a,b)=>b.tvlUsd-a.tvlUsd).slice(0,100);
 state.metrics.yield_pools={observation_time:date,pools:selected.map(p=>({pool:p.pool,chain:p.chain,project:p.project,symbol:p.symbol,tvlUsd:Number(p.tvlUsd),apy:Number(p.apy),apyBase:Number.isFinite(Number(p.apyBase))?Number(p.apyBase):null,apyReward:Number.isFinite(Number(p.apyReward))?Number(p.apyReward):null,ilRisk:p.ilRisk,stablecoin:!!p.stablecoin,url:'https://defillama.com/yields/pool/'+encodeURIComponent(p.pool)})),note:'Triagem por ativo/protocolo e TVL, não auditoria nem recomendação. API gratuita pode encerrar em 13/11/2026.'};
 return selected.length;
});}


// FONTES COMPLEMENTARES 1.11: índices agregados e candles reais, sem credenciais.
// Cada fonte é independente; falhas aparecem no estado, nunca em números inventados.
await source('global_market','https://api.coinpaprika.com/v1/global',d=>{
  const cap=Number(d.market_cap_usd),dominance=Number(d.bitcoin_dominance_percentage);
  if(!Number.isFinite(cap)||cap<=0)throw Error('Market cap global ausente');
  state.metrics.global_market={
    market_cap_usd:cap,
    volume_24h_usd:Number.isFinite(Number(d.volume_24h_usd))?Number(d.volume_24h_usd):null,
    btc_dominance_pct:Number.isFinite(dominance)?dominance:null,
    observation_time:date,
    url:'https://api.coinpaprika.com/v1/global'
  };
  return 1;
});
for(const pair of ['BTCUSDT','SOLUSDT','ETHUSDT']){
 await source('candles_'+pair.toLowerCase(),`https://data-api.binance.vision/api/v3/klines?symbol=${pair}&interval=1h&limit=72`,d=>{
   if(!Array.isArray(d)||d.length<24)throw Error('Candles insuficientes');
   state.metrics.candles??={};
   state.metrics.candles[pair]=d.map(c=>({
     time:new Date(Number(c[0])).toISOString(),open:Number(c[1]),high:Number(c[2]),
     low:Number(c[3]),close:Number(c[4]),volume:Number(c[5])
   })).filter(c=>Number.isFinite(c.close)&&Number.isFinite(c.volume));
   return state.metrics.candles[pair].length;
 });
}


// SOLANA / DEFI — consulta passiva, nenhuma chave privada e nenhuma transação.
await source('meteora_dlmm','https://dlmm.datapi.meteora.ag/pools?page=1&page_size=100&sort_by=volume_24h:desc',d=>{
 const items=Array.isArray(d)?d:Array.isArray(d?.data)?d.data:Array.isArray(d?.pools)?d.pools:Array.isArray(d?.results)?d.results:[];
 if(!items.length)throw Error('Formato de resposta Meteora desconhecido ou vazio');
 state.metrics.meteora={observation_time:date,pools:items.slice(0,100).map(p=>({
   address:p.address||p.pool_address||p.pubkey||null,
   name:p.name||p.pool_name||p.symbol||null,
   token_x:p.token_x?.symbol||p.token_x_symbol||null,
   token_y:p.token_y?.symbol||p.token_y_symbol||null,
   tvl_usd:Number.isFinite(Number(p.tvl_usd??p.tvl))?Number(p.tvl_usd??p.tvl):null,
   volume_24h_usd:Number.isFinite(Number(p.volume_24h_usd??p.volume_24h))?Number(p.volume_24h_usd??p.volume_24h):null,
   fees_24h_usd:Number.isFinite(Number(p.fees_24h_usd??p.fees_24h))?Number(p.fees_24h_usd??p.fees_24h):null,
   apy:p.apy!=null&&Number.isFinite(Number(p.apy))?Number(p.apy):null,
   apr:p.apr!=null&&Number.isFinite(Number(p.apr))?Number(p.apr):null,
   bin_step:p.bin_step??p.binStep??null,
   age_hours:p.created_at||p.createdAt?Math.max(0,(Date.now()-Date.parse(p.created_at||p.createdAt))/3600000):null,
   token_x_mint:p.token_x?.address||p.token_x_mint||null,
   token_y_mint:p.token_y?.address||p.token_y_mint||null
 })),url:'https://dlmm.datapi.meteora.ag/swagger-ui/',note:'Métricas apenas quando presentes na resposta; APY não calculado a partir de volume.'};
 return items.length;
});
const jupMints={SOL:'So11111111111111111111111111111111111111112',USDC:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',JUP:'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN'};
await source('jupiter_price','https://api.jup.ag/price/v3?ids='+Object.values(jupMints).join(','),d=>{
 if(!d||typeof d!=='object'||Array.isArray(d))throw Error('Formato Jupiter inválido');
 const prices={};for(const [symbol,mint] of Object.entries(jupMints)){
   const p=d[mint];if(p&&Number.isFinite(Number(p.usdPrice)))prices[symbol]={usd:Number(p.usdPrice),change24h:Number.isFinite(Number(p.priceChange24h))?Number(p.priceChange24h):null,liquidity:Number.isFinite(Number(p.liquidity))?Number(p.liquidity):null,blockId:p.blockId??null,mint};
 }
 if(!Object.keys(prices).length)throw Error('Jupiter não devolveu preços');
 state.metrics.jupiter={observation_time:date,prices,url:'https://developers.jup.ag/docs/price'};return Object.keys(prices).length;
});
await source('gecko_solana','https://api.geckoterminal.com/api/v2/networks/solana/trending_pools?page=1',d=>{
 if(!Array.isArray(d?.data))throw Error('GeckoTerminal: payload inválido');
 state.metrics.gecko_solana={observation_time:date,pools:d.data.slice(0,20).map(p=>({
  id:p.id,network:p.relationships?.network?.data?.id||'solana',name:p.attributes?.name||null,
  address:p.attributes?.address||null,
  reserve_usd:Number.isFinite(Number(p.attributes?.reserve_in_usd))?Number(p.attributes.reserve_in_usd):null,
  volume_24h_usd:Number.isFinite(Number(p.attributes?.volume_usd?.h24))?Number(p.attributes.volume_usd.h24):null,
  price_change_24h_pct:Number.isFinite(Number(p.attributes?.price_change_percentage?.h24))?Number(p.attributes.price_change_percentage.h24):null,
  url:p.attributes?.address?'https://www.geckoterminal.com/solana/pools/'+encodeURIComponent(p.attributes.address):'https://www.geckoterminal.com/solana/pools'
 }))};return d.data.length;
});


// Kamino: estratégias de liquidez automatizada, não confundir com staking/lending.
await source('kamino_liquidity','https://api.kamino.finance/strategies?env=mainnet-beta&status=LIVE',d=>{
 const list=Array.isArray(d)?d:Array.isArray(d?.data)?d.data:Array.isArray(d?.strategies)?d.strategies:[];
 if(!list.length)throw Error('Kamino: formato inesperado ou sem estratégias LIVE');
 state.metrics.kamino_liquidity={observation_time:date,url:'https://api.kamino.finance/strategies?env=mainnet-beta&status=LIVE',strategies:list.slice(0,150).map(v=>({address:v.address||v.strategy||null,type:v.type||null,status:v.status||null,token_a_mint:v.tokenAMint||null,token_b_mint:v.tokenBMint||null,share_mint:v.shareMint||null})),note:'Catálogo oficial de estratégias Kamino; endpoint não comprova TVL/APY. Não atribuir rendimento ou risco sem outras métricas verificáveis.'};
 return list.length;
});


// RADAR SOCIAL CRYPTO — fontes publicas sem scraping de X nem inferencia de causalidade.
// Publicacoes sao sinais de pesquisa, nao fatos validados. Limite de 48 horas.
const socialTerms=/\b(bitcoin|btc|ethereum|eth|solana|sol|defi|stablecoin|liquidity|dex|airdrop|token|crypto|etf|jupiter|meteora|kamino|hyperliquid|hype|rwa|staking|sec|fed)\b/i;
const cryptoTopics=['bitcoin','solana','defi'];
const socialItems=[];
const lookback=48*3600000;
function socialAdd(v){
 if(!v.url||!v.published_at||!v.text)return;
 const ms=Date.parse(v.published_at);if(!Number.isFinite(ms)||ms>Date.now()+600000||Date.now()-ms>lookback)return;
 const clean=String(v.text).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,650);
 if(clean.length<22||!socialTerms.test(clean))return;
 socialItems.push({...v,text:clean,kind:'publicacao nao verificada'});
}
for(const topic of cryptoTopics){
 await source('social_bluesky_'+topic,'https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q='+encodeURIComponent(topic)+'&limit=30&sort=latest',d=>{
  if(!Array.isArray(d.posts))throw Error('Bluesky: payload invalido');
  for(const post of d.posts){
   const author=post.author?.handle,uri=post.uri?.split('/').pop();
   if(!author||!uri)continue;
   socialAdd({platform:'Bluesky',topic,author:'@'+author,text:post.record?.text||'',published_at:post.record?.createdAt||post.indexedAt,
    url:'https://bsky.app/profile/'+encodeURIComponent(author)+'/post/'+encodeURIComponent(uri),
    engagement:{likes:Number(post.likeCount)||0,reposts:Number(post.repostCount)||0,replies:Number(post.replyCount)||0}});
  }return d.posts.length;
 });
}
for(const topic of ['bitcoin','defi']){
 await source('social_mastodon_'+topic,'https://mastodon.social/api/v1/timelines/tag/'+topic+'?limit=35',d=>{
  if(!Array.isArray(d))throw Error('Mastodon: payload invalido');
  for(const post of d){if(post.reblog)continue;
   socialAdd({platform:'Mastodon',topic,author:'@'+(post.account?.acct||'desconhecido'),text:post.content||'',published_at:post.created_at,
    url:post.url||post.uri,engagement:{likes:Number(post.favourites_count)||0,reposts:Number(post.reblogs_count)||0,replies:Number(post.replies_count)||0}});
  }return d.length;
 });
}
// Pontuacao de triagem: apenas engajamento e correspondencia textual; nao eh credibilidade nem previsao.
const latest=new Map();for(const p of socialItems){
 const key=p.url;if(!latest.has(key))latest.set(key,p);
}
const list=[...latest.values()].sort((a,b)=>Date.parse(b.published_at)-Date.parse(a.published_at)).slice(0,90);
state.metrics.social_radar={observation_time:date,posts:list,window_hours:48,
 status:'Fontes publicas Bluesky/Mastodon; X nao conectado sem API autorizada',
 sources:['https://docs.bsky.app/docs/api/app-bsky-feed-search-posts','https://docs.joinmastodon.org/methods/timelines/'],
 disclaimer:'Atividade social nao constitui prova de fatos, fluxo financeiro, manipulacao ou causalidade de precos.'};


// RADAR NARRATIVAS 1.11 — correlacao descritiva, não inferência causal.
// Mantém amostra agregada de menções públicas; cada postagem pode citar diversos ativos.
const narrativePatterns={BTC:/\b(?:bitcoin|btc)\b/i,ETH:/\b(?:ethereum|eth)\b/i,SOL:/\b(?:solana|sol)\b/i,JUP:/\b(?:jupiter|jup)\b/i,HYPE:/\b(?:hyperliquid|hype)\b/i,KMNO:/\b(?:kamino|kmno)\b/i};
const narrativeRows={};for(const [symbol,regex] of Object.entries(narrativePatterns)){
 const matching=list.filter(p=>regex.test(String(p.text||'')));
 narrativeRows[symbol]={mentions:matching.length,distinct_authors:new Set(matching.map(p=>p.platform+'|'+p.author)).size,
  interactions:matching.reduce((n,p)=>n+['likes','reposts','replies'].reduce((a,k)=>a+(Number(p.engagement?.[k])||0),0),0)};
}
state.metrics.narratives={observation_time:date,window_hours:48,assets:narrativeRows,
 methodology:'Correspondência textual em posts públicos coletados por Bluesky e Mastodon. Sem inferência de causalidade ou recomendação.'};

// Preserve history for trend comparisons without exploding repository size.
state.history.unshift({collected_at:date,fear_greed:state.sources.fear_greed?.ok?state.metrics.fear_greed?.value:null,tvl_usd:state.sources.defillama?.ok?state.metrics.defi?.total_tvl_usd:null,dex_volume_usd:state.sources.dex_volumes?.ok?state.metrics.dex_volume?.total24h:null,stablecoins_usd:state.sources.stablecoins?.ok?state.metrics.stablecoins?.total_usd:null,btc:state.sources.market_spot?.ok?state.metrics.market?.tickers?.BTCUSDT?.price:null,sol:state.sources.market_spot?.ok?state.metrics.market?.tickers?.SOLUSDT?.price:null,derivatives:Object.fromEntries(Object.entries(state.metrics.derivatives||{}).map(([k,v])=>[k,{oi:v.open_interest_base??null,funding:v.funding_rate??null}]))});state.history=state.history.filter(h=>h.collected_at && Date.parse(h.collected_at)>=Date.now()-48*3600000).slice(0,192);
state.events=state.events.filter(e=>e.date&&Date.parse(e.date)>=Date.now()-48*3600000).slice(0,160);state.updated_at=date;
fs.mkdirSync('data',{recursive:true});fs.writeFileSync(DATA,JSON.stringify(state,null,2)+'\n');
console.log(JSON.stringify({collected_at:date,initial,added:added.length,source_status:Object.fromEntries(Object.entries(state.sources).map(([k,v])=>[k,v.ok]))}));
const token=process.env.TELEGRAM_BOT_TOKEN,chat=process.env.TELEGRAM_CHAT_ID;
if(!initial && token && chat){for(const e of added.filter(x=>x.category==='cyber'&&x.score>=80&&x.date&&Date.now()-Date.parse(x.date)<48*3600000).slice(0,8)){let msg=`⚠️ XZBIT | Novo item CISA KEV\n${e.title}\n${e.summary}\nStatus: ${e.status}\nFonte: ${e.link}`;try{const r=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chat,text:msg.slice(0,3900),disable_web_page_preview:true})});if(!r.ok)throw Error(`HTTP ${r.status}`)}catch(err){console.error('Telegram:',err.message)}}}
