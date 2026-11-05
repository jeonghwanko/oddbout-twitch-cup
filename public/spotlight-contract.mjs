const FIGHTERS=new Set(['kuma','yume','bravow','beotim','quickcat','kungjjak','sikeundung','duldul','eoridung']);
export function readSpotlightRequest(search){
  const p=new URLSearchParams(search),boutId=p.get('id'),a=p.get('a'),b=p.get('b'),raw=p.get('seed'),seed=Number(raw);
  if(!boutId||!/^[a-zA-Z0-9_-]{1,100}$/.test(boutId)||!FIGHTERS.has(a)||!FIGHTERS.has(b)||a===b||!raw||!/^\d+$/.test(raw)||!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw new Error('Invalid exhibition request');
  return{boutId,a,b,seed};
}
export function matchesSpotlightMessage(event,origin,source,request){
  if(event.origin!==origin||!source||event.source!==source)return false;
  const data=event.data;
  if(!data||typeof data!=='object'||Array.isArray(data))return false;
  return ['boutId','a','b','seed'].every(key=>data[key]===request[key]);
}
