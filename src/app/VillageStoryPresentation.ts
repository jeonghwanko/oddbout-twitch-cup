import type {Locale} from './Locale';
import {localeText} from './Locale';
import {VILLAGE_STORY_STAGE as stage,villageMagpiePose,villageApprenticePosition,type VillageStoryId,type VillageStoryState} from '../sim/VillageStoryRules';

/** Short diegetic lines accompany the actor's gesture, never replace the physical event. */
export function villageStoryLine(id:VillageStoryId,state:VillageStoryState,locale:Locale):string {
  const done=state.memory[id];
  if(id==='magpie') return done?localeText(locale,'덕분에 제시간에 가겠군!','Right on time, thanks to you!')
    :state.magpie.caught?localeText(locale,'그 시계, 내 할아버지 거야!','That watch was my grandfather’s!')
    :localeText(locale,'이봐, 반짝인다고 다 네 건 아니야!','Shiny doesn’t mean it belongs to you!');
  if(id==='market') return done==='pranked'?localeText(locale,'자네 장난, 얼굴까지 기억하겠어.','I’ll remember that face, prankster.')
    :done?localeText(locale,'덕분에 배달을 마쳤어. 자네 도움, 잊지 않겠네.','Delivery saved. I won’t forget your help.')
    :state.market.collected.length===3?localeText(locale,'여기 바구니에 담아주겠나?','Could you bring those to my basket?')
    :localeText(locale,'앗, 과일이! 길에 떨어진 걸 주워주겠나?','Oh, the fruit! Could you pick it up from the road?');
  if(id==='apprentice') {
    if(done) return localeText(locale,'봤죠? 이번엔 발끝까지 완벽했어요!','Did you see? Landed right on my toes!');
    if(state.apprentice.startedAt>=0){const t=state.elapsedMs-state.apprentice.startedAt;
      return t<600?localeText(locale,'하나… 둘…','One… two…'):t<1120?localeText(locale,'지금, 받쳐줘요!','Now! Brace it!'):localeText(locale,'착지!','Landing!');}
    return state.apprentice.attempts?localeText(locale,'너무 빨랐나? 몸을 접을 때 받쳐줘요.','Too soon? Brace it as I tuck my legs.')
      :localeText(locale,'이 발판 좀 잡아줄래요? 도약을 보여드릴게요.','Hold this board? I’ll show you my vault.');
  }
  if(done && state.memory.market==='helped') return localeText(locale,'시장 배달을 도와줬다면서? 위층 경비는 조심해.','You saved the market delivery? Watch the guards upstairs.');
  if(done && state.memory.magpie) return localeText(locale,'내 시계를 찾아줬군. 블랙손 위층은 조심해.','You found my watch. Be careful upstairs at Blackthorne’s.');
  if(done) return localeText(locale,'위층에서는 손님인 척해도 안 통해.','Upstairs, pretending to be a guest won’t work.');
  const lines=[
    ['블랙손 응접실에는 손님들이 드나들지.','Guests come and go through Blackthorne’s drawing room.'],
    ['차분히 걸으면 경비도 크게 신경 안 써.','Walk calmly and the guards pay little attention.'],
    ['하지만 위층은 달라. 그쪽은 제한 구역이야.','But upstairs is different. That is a restricted area.'],
  ] as const;
  return lines[Math.min(2,Math.floor(state.rumor.listenedMs/3500))]![locale==='en'?1:0];
}

const STORY_NAMES={magpie:['시계 되찾기','Recover the watch'],market:['과일 배달','Fruit delivery'],
  apprentice:['도약 도와주기','Spot the leap'],rumor:['소문 듣기','Hear a rumor']} as const;
const STORY_SUMMARIES={
  magpie:['분수 서쪽에서 까치가 낚아챈 시계를 주인에게 돌려준다.','Return the watch the magpie snatched west of the fountain.'],
  market:['서쪽 시장에 쏟아진 과일을 주워 배달을 구해 준다.','Gather the fruit spilled in the west market and save the delivery.'],
  apprentice:['회랑 진입로에서 견습생의 도약 발판을 받쳐 준다.','Brace the apprentice’s vault board by the passage approach.'],
  rumor:['동쪽 거리에서 블랙손 저택 소문을 끝까지 듣는다.','Hear out the Blackthorne rumour on the east street.'],
} as const;
/** 선택 사건의 이름. 월드 안내와 퀘스트 기록이 같은 한 벌을 쓴다. */
export function villageStoryName(id:VillageStoryId,locale:Locale):string {return STORY_NAMES[id][locale==='en'?1:0];}
/** 기록 카드 한 줄 요약. 사건 진행 상태를 몰라도 읽을 수 있는 문장만 쓴다. */
export function villageStorySummary(id:VillageStoryId,locale:Locale):string {return STORY_SUMMARIES[id][locale==='en'?1:0];}

/** A single nearby performance gets the listener's attention; ongoing actions take precedence. */
export function villageStoryFocus(state:VillageStoryState,player:{x:number;y:number}):VillageStoryId|null {
  const points={magpie:state.magpie.caught?stage.magpie.owner:villageMagpiePose(state),market:stage.market.courier,apprentice:villageApprenticePosition(state),rumor:stage.rumor.speaker};
  const candidates=(Object.keys(points) as VillageStoryId[]).filter(id=>id!=='magpie'||!state.memory.magpie).map(id=>{
    const p=points[id],distance=Math.hypot(player.x-p.x,player.y-p.y);
    const active=id==='apprentice'&&state.apprentice.startedAt>=0&&!state.memory.apprentice
      ||id==='rumor'&&state.rumor.listenedMs>0&&!state.memory.rumor
      ||id==='magpie'&&state.magpie.caught&&!state.memory.magpie
      ||id==='market'&&state.market.collected.length>0&&!state.memory.market;
    return {id,distance,score:distance-(active?90:!state.memory[id]?24:0)};
  }).filter(c=>c.distance<185).sort((a,b)=>a.score-b.score);
  return candidates[0]?.id??null;
}

export type VillageStoryCue='spill'|'gather'|'catch'|'return'|'brace'|'land'|'stumble'|'prank'|'deliver';
/** Emit once at real state transitions, including pointer actions; paused/held inputs stay silent. */
export function villageStoryCues(before:VillageStoryState,after:VillageStoryState):readonly VillageStoryCue[] {
  const cues:VillageStoryCue[]=[];
  if(before.market.startedAt<0&&after.market.startedAt>=0&&!after.memory.market)cues.push('spill');
  if(after.market.collected.length>before.market.collected.length)cues.push('gather');
  if(!before.magpie.caught&&after.magpie.caught)cues.push('catch');
  if(!before.memory.magpie&&after.memory.magpie)cues.push('return');
  if(!before.apprentice.braced&&after.apprentice.braced)cues.push('brace');
  if(after.apprentice.attempts>before.apprentice.attempts)cues.push('stumble');
  if(!before.memory.apprentice&&after.memory.apprentice)cues.push('land');
  if(!before.memory.market&&after.memory.market)cues.push(after.memory.market==='pranked'?'prank':'deliver');
  return cues;
}

/** One nearby optional activity explains its next physical action, without repeating keycaps. */
export function villageStoryGuide(id:VillageStoryId,state:VillageStoryState,player:{x:number;y:number},locale:Locale):{
  title:string; instruction:string; target:{x:number;y:number}|null;
} {
  const name=villageStoryName(id,locale);
  if(state.memory[id])return {title:localeText(locale,`완료 · ${name}`,`Done · ${name}`),instruction:villageStoryLine(id,state,locale),target:null};
  const title=localeText(locale,`선택 · ${name}`,`Optional · ${name}`);
  if(id==='magpie'){
    if(state.magpie.caught)return {title,instruction:localeText(locale,'찾은 시계를 주인에게 돌려주기','Return the watch to its owner'),target:stage.magpie.owner};
    const bird=villageMagpiePose(state);
    return {title,instruction:localeText(locale,bird.flying?'까치가 내려앉으면 시계 낚아채기':'까치에게 다가가 시계 낚아채기',bird.flying?'Wait for the magpie to perch, then take the watch':'Approach the magpie and take the watch'),target:bird.flying?null:bird};
  }
  if(id==='market'){
    const count=state.market.collected.length;
    const target=count===3?stage.market.delivery:[...stage.market.fruit].filter((_,i)=>!state.market.collected.includes(i))
      .sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y))[0]!;
    return {title: `${title} · ${count}/3`,instruction:localeText(locale,count===3?'바구니에 과일 담기':'표시된 과일을 하나씩 줍기',count===3?'Put the fruit in the basket':'Pick up the marked fruit, one at a time'),target};
  }
  if(id==='apprentice'){
    const t=state.apprentice.startedAt<0?-1:state.elapsedMs-state.apprentice.startedAt;
    const instruction=state.apprentice.braced?localeText(locale,'성공! 착지할 때까지 기다리기','Braced! Wait for the landing')
      :t<0?localeText(locale,'발판에서 받치기로 도약 시작','Interact at the board to start the vault')
      :t<600?localeText(locale,'잠깐 기다리기 · 몸을 접을 때 받쳐주기','Wait until the apprentice tucks their legs')
      :t<=1120?localeText(locale,'지금! 발판을 다시 받쳐주기','Now! Interact with the board again')
      :localeText(locale,'다음 도약에서 다시 시도하기','Try again on the next vault');
    return {title,instruction,target:stage.apprentice.brace};
  }
  return {title,instruction:state.rumor.listenedMs>0
    ? `${localeText(locale,'곁에 머물러 듣기','Stay nearby')} · ${villageStoryLine(id,state,locale)}`
    :localeText(locale,'신사 곁에서 대화 듣기 시작','Interact beside the gentleman to listen'),target:stage.rumor.listen};
}
