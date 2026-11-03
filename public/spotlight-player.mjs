import{readSpotlightRequest,matchesSpotlightMessage}from'./spotlight-contract.mjs';
const frame=document.getElementById('bout'),status=document.getElementById('status');
let dispatched=false,finished=false,timeout;
function announce(type){if(window.parent!==window)window.parent.postMessage({type},'https://broadcast.oddbout.com');}
function fail(message){if(finished)return;finished=true;clearTimeout(timeout);status.textContent=message;status.hidden=false;announce('oddbout:spotlight:error');}
try{
  const request=readSpotlightRequest(location.search),origin=location.origin;
  const onMessage=event=>{
    if(event.origin!==origin||event.source!==frame.contentWindow||finished)return;
    if(event.data?.type==='oddbout:twitch:host-ready'&&event.data.protocol===1&&!dispatched){
      dispatched=true;frame.contentWindow.postMessage({type:'oddbout:twitch:start-bout',...request},origin);return;
    }
    if(!matchesSpotlightMessage(event,origin,frame.contentWindow,request))return;
    const data=event.data;
    if(data.type==='oddbout:twitch:bout-ready'){
      status.hidden=true;clearTimeout(timeout);timeout=setTimeout(()=>fail('This exhibition did not finish. The next scheduled matchup will still be attempted.'),240000);announce('oddbout:spotlight:ready');
    }else if(data.type==='oddbout:twitch:bout-error')fail('This exhibition could not play. Please refresh the broadcast.');
    else if(data.type==='oddbout:twitch:bout-result'){
      if(![request.a,request.b].includes(data.winnerId)||![0,1].includes(data.result?.winner)||data.winnerId!==(data.result.winner===0?request.a:request.b)||!['ko','decision'].includes(data.result.how)||!/^[0-9a-f]{8}$/i.test(data.result.digest??''))return;
      finished=true;clearTimeout(timeout);status.textContent=data.winnerId.toUpperCase()+' wins · Next matchup follows the program schedule.';status.hidden=false;
    }
  };
  window.addEventListener('message',onMessage);
  const url=new URL('./fighter.html',location.href);url.search=new URLSearchParams({arena:'1',twitchBout:request.boutId,fighter:request.a,opponent:request.b,bout:String(request.seed),lang:'en'}).toString();frame.src=url.href;
  timeout=setTimeout(()=>fail('The exhibition is taking too long to load. Please refresh the broadcast.'),60000);
  window.addEventListener('pagehide',()=>{clearTimeout(timeout);window.removeEventListener('message',onMessage);},{once:true});
}catch{frame.hidden=true;status.textContent='This exhibition link is invalid.';}
