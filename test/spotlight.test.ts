import {describe,it,expect} from 'vitest';
const modulePath='../public/spotlight-contract.mjs';
const {readSpotlightRequest,matchesSpotlightMessage}=await import(modulePath);
describe('Spotlight exhibition boundary',()=>{
  it('accepts only two distinct supported fighters and a bounded seed',()=>{
    expect(readSpotlightRequest('?id=show-1&a=kuma&b=yume&seed=42')).toEqual({boutId:'show-1',a:'kuma',b:'yume',seed:42});
    for(const input of ['?id=x&a=kuma&b=kuma&seed=1','?id=x&a=unknown&b=yume&seed=1','?id=x&a=kuma&b=yume&seed=-1','?id=x&a=kuma&b=yume&seed=4294967296','?id=x&a=kuma&b=yume'])expect(()=>readSpotlightRequest(input)).toThrow();
  });
  it('rejects another frame, origin, matchup, seed or request identity',()=>{
    const source={},origin='https://arena.example',data=readSpotlightRequest('?id=show-1&a=kuma&b=yume&seed=42');
    expect(matchesSpotlightMessage({source,origin,data},origin,source,data)).toBe(true);
    expect(matchesSpotlightMessage({source:{},origin,data},origin,source,data)).toBe(false);
    expect(matchesSpotlightMessage({source,origin:'https://other.example',data},origin,source,data)).toBe(false);
    for(const key of ['boutId','a','b','seed'])expect(matchesSpotlightMessage({source,origin,data:{...data,[key]:'changed'}},origin,source,data)).toBe(false);
  });
});
