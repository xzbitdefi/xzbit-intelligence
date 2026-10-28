import fs from 'node:fs';

// XZBIT · CoinGecko Demo · complemento isolado ao coletor principal.
// Nunca gravar a API key nos arquivos versionados nem em data/state.json.
const DATA = 'data/state.json';
const key = process.env.COINGECKO_DEMO_KEY;
const time = new Date().toISOString();
const origin = 'https://api.coingecko.com/api/v3/coins/markets';
const ids = ['bitcoin','ethereum','solana','hyperliquid','jupiter-exchange-solana'];
const symbols = {bitcoin:'BTC',ethereum:'ETH',solana:'SOL',hyperliquid:'HYPE','jupiter-exchange-solana':'JUP'};

if (!fs.existsSync(DATA)) throw new Error('Execute collect.mjs antes do coingecko.mjs: state.json ausente');
const state = JSON.parse(fs.readFileSync(DATA,'utf8'));
state.sources ??= {};
state.metrics ??= {};
if (!key) {
  state.sources.coingecko = {...(state.sources.coingecko||{}),ok:false,last_attempt:time,error:'COINGECKO_DEMO_KEY não configurado',url:'https://www.coingecko.com/en/api'};
  fs.writeFileSync(DATA,JSON.stringify(state,null,2)+'\n');
  console.warn('CoinGecko: Secret ausente; fontes anteriores preservadas');
  process.exit(0);
}

const controller = new AbortController();
const timer = setTimeout(()=>controller.abort(),18000);
try {
 const url = new URL(origin);
 url.searchParams.set('vs_currency','usd');
 url.searchParams.set('ids',ids.join(','));
 url.searchParams.set('price_change_percentage','1h,24h,7d');
 url.searchParams.set('per_page','20');
 const response = await fetch(url,{signal:controller.signal,headers:{'Accept':'application/json','x-cg-demo-api-key':key,'User-Agent':'XZBIT Intelligence Monitor/1.0'}});
 if(!response.ok) throw new Error('CoinGecko HTTP '+response.status);
 const payload = await response.json();
 if(!Array.isArray(payload)) throw new Error('Payload CoinGecko inesperado');
 const coins={};
 for(const item of payload){
   const symbol=symbols[item?.id];
   if(!symbol)continue;
   const valid=v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))?Number(v):null;
   const price=valid(item.current_price);
   if(price===null||price<=0)continue;
   coins[symbol]={id:item.id,name:item.name,symbol,price_usd:price,change_1h_pct:valid(item.price_change_percentage_1h_in_currency),change_24h_pct:valid(item.price_change_percentage_24h_in_currency)??valid(item.price_change_percentage_24h),change_7d_pct:valid(item.price_change_percentage_7d_in_currency),market_cap_usd:valid(item.market_cap),volume_24h_usd:valid(item.total_volume),image_url:typeof item.image==='string'&&item.image.startsWith('https://')?item.image:null,last_updated:item.last_updated||time,source:'CoinGecko · dados de mercado agregados'};
 }
 if(Object.keys(coins).length===0) throw new Error('Nenhum ativo válido recebido');
 // Mantém os dados originais do Binance. O HYPE recebe fallback explícito
 // identificado como preço agregado CoinGecko (não rotulado como spot Binance).
 state.metrics.coingecko={observation_time:time,url:'https://www.coingecko.com/',coins,attribution:'Dados fornecidos por CoinGecko',note:'Valores agregados por ativo; podem divergir de pares spot de exchanges.'};
 state.metrics.market ??= {tickers:{}};
 state.metrics.market.tickers ??= {};
 if(coins.HYPE && !Number.isFinite(Number(state.metrics.market.tickers.HYPEUSDT?.price))){
   state.metrics.market.tickers.HYPEUSDT={price:coins.HYPE.price_usd,change24h:coins.HYPE.change_24h_pct,source:'CoinGecko · preço agregado',observation_time:time};
 }
 state.sources.coingecko={ok:true,last_success:time,last_attempt:time,count:Object.keys(coins).length,url:'https://www.coingecko.com/'};
 console.log('CoinGecko: OK, ativos válidos:',Object.keys(coins).join(', '));
}catch(err){
 state.sources.coingecko={...(state.sources.coingecko||{}),ok:false,last_attempt:time,error:String(err.message).slice(0,120),url:'https://www.coingecko.com/'};
 console.error('CoinGecko indisponível:',err.message);
}finally{clearTimeout(timer);fs.writeFileSync(DATA,JSON.stringify(state,null,2)+'\n')}
