import navigation from "../world/village-concept-navigation.json" with {type:"json"};
import type { VillagePoint } from '../world/VillageDefinition';

export const VILLAGE_STORY_IDS = ['magpie', 'market', 'apprentice', 'rumor'] as const;
export type VillageStoryId = typeof VILLAGE_STORY_IDS[number];
export type VillageStoryOutcome = 'helped' | 'pranked';
export type VillageStoryMemory = Partial<Record<VillageStoryId, VillageStoryOutcome>>;
export type VillageStoryAction = 'catch' | 'return' | 'gather' | 'deliver' | 'prank' | 'brace' | 'listen';
export interface VillageStoryAffordance { readonly story: VillageStoryId; readonly action: VillageStoryAction; readonly at: VillagePoint; readonly item?: number }
export interface VillageStoryState {
  readonly elapsedMs: number;
  readonly memory: VillageStoryMemory;
  readonly magpie: { readonly carrying: boolean; readonly caught: boolean; readonly catchTime: number };
  readonly market: { readonly startedAt: number; readonly collected: readonly number[]; readonly resolvedAt: number };
  readonly apprentice: { readonly braced: boolean; readonly startedAt: number; readonly attempts: number; readonly successAt: number };
  readonly rumor: { readonly listenedMs: number; readonly greeted: boolean };
  readonly revision: number;
}

/** Physical stage marks; every interaction sits on public ground, away from facility doors. */
const triple=(points:VillagePoint[])=>[points[0]!,points[1]!,points[2]!] as const;
export const VILLAGE_STORY_STAGE = {...navigation.stage,magpie:{...navigation.stage.magpie,owner:navigation.stage.rumor.speaker,perches:triple(navigation.stage.magpie.perches)},market:{...navigation.stage.market,fruit:triple(navigation.stage.market.fruit)}};

export const VILLAGE_STORY_SOLIDS = [{
  centerX: VILLAGE_STORY_STAGE.market.cartObject.x,
  centerY: VILLAGE_STORY_STAGE.market.cartObject.y,
  radiusX: 27, radiusY: 12,
}] as const;

/**
 * 지금 몸을 막는 사건 물체. 시장 수레는 시장이 광장에 섰을 때만 서므로(`villageStoryOnStage`) 그때만 막는다 —
 * 숨긴 수레 자리에 보이지 않는 벽을 남기지 않는다.
 */
export function villageStorySolids(onStage:VillageStoryId|null):typeof VILLAGE_STORY_SOLIDS|readonly [] {
  return onStage==='market'?VILLAGE_STORY_SOLIDS:[];
}

const distance=(a:VillagePoint,b:VillagePoint)=>Math.hypot(a.x-b.x,a.y-b.y);
export function sanitizeVillageStoryMemory(value: unknown): VillageStoryMemory {
  if (value===null || typeof value!=='object' || Array.isArray(value)) return {};
  const result: VillageStoryMemory={};
  for(const id of VILLAGE_STORY_IDS) {
    const outcome=(value as Record<string,unknown>)[id];
    if(outcome==='helped'||(id==='market'&&outcome==='pranked')) result[id]=outcome;
  }
  return result;
}
export function createVillageStories(memory: VillageStoryMemory={}): VillageStoryState {
  return {elapsedMs:0,memory:sanitizeVillageStoryMemory(memory),
    magpie:{carrying:true,caught:false,catchTime:-1},market:{startedAt:-1,collected:[],resolvedAt:-1},
    apprentice:{braced:false,startedAt:-1,attempts:0,successAt:-1},rumor:{listenedMs:0,greeted:false},revision:0};
}

/** Flight includes low, readable perches; the player can cut across the square to intercept. */
export function villageMagpiePose(state: VillageStoryState): VillagePoint & {height:number; flying:boolean; phase:number} {
  const perches=VILLAGE_STORY_STAGE.magpie.perches;
  if(state.memory.magpie && state.magpie.catchTime<0) return {...perches[2],height:8,flying:false,phase:0};
  if(state.magpie.caught) {
    const t=Math.min(1,Math.max(0,(state.elapsedMs-state.magpie.catchTime)/2200));
    return {x:perches[0].x+(perches[2].x-perches[0].x)*t,y:perches[0].y+(perches[2].y-perches[0].y)*t,
      height:t<1?8+Math.sin(t*Math.PI)*55:8,flying:t<1,phase:t<1?t:0};
  }
  const beat=state.elapsedMs/4400;
  const index=Math.floor(beat)%perches.length, phase=beat%1;
  const a=perches[index]!,b=perches[(index+1)%perches.length]!;
  if(phase<.48) return {...a,height:12,flying:false,phase};
  const t=(phase-.48)/.52;
  return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,height:12+Math.sin(t*Math.PI)*50,flying:true,phase};
}

/** Both outcomes share the takeoff; a failed attempt returns before the next idle. */
export function villageApprenticePosition(state:VillageStoryState):VillagePoint {
  const {start,landing}=VILLAGE_STORY_STAGE.apprentice;
  if(state.memory.apprentice)return landing;
  if(state.apprentice.startedAt<0)return start;
  const t=Math.min(1,Math.max(0,(state.elapsedMs-state.apprentice.startedAt)/1700));
  const progress=t<=.66||state.apprentice.braced?t:.66*(1-(t-.66)/.34);
  return {x:start.x+(landing.x-start.x)*progress,y:start.y+(landing.y-start.y)*progress};
}

/**
 * 광장에 지금 선 사건 하나. 잠겨 있으면(첫 의뢰를 끝내기 전) 없고, 열리면 순서대로 첫 미완료 사건
 * 하나만 선다 — 네 사건을 한꺼번에 분수 둘레에 세우면 첫 도착의 광장이 빼곡했다. 다 끝나면 없다.
 */
export function villageStoryOnStage(state:VillageStoryState,open:boolean):VillageStoryId|null {
  if(!open) return null;
  return VILLAGE_STORY_IDS.find(id=>!state.memory[id])??null;
}

/** `onStage` 를 주면 그 사건만 받는다(생략하면 네 사건 모두 — 규칙 단위 시험용). */
export function villageStoryAffordance(state:VillageStoryState,player:VillagePoint,onStage?:VillageStoryId|null):VillageStoryAffordance|null {
  const target=storyAffordance(state,player);
  return onStage===undefined||target?.story===onStage?target:null;
}

function storyAffordance(state:VillageStoryState,player:VillagePoint):VillageStoryAffordance|null {
  const stage=VILLAGE_STORY_STAGE;
  if(!state.memory.magpie) {
    if(state.magpie.caught && distance(player,stage.magpie.owner)<42) return {story:'magpie',action:'return',at:stage.magpie.owner};
    const bird=villageMagpiePose(state);
    if(!state.magpie.caught&&!bird.flying&&distance(player,bird)<42) return {story:'magpie',action:'catch',at:bird};
  }
  if(!state.memory.market) {
    for(let i=0;i<stage.market.fruit.length;i++) if(state.market.startedAt>=0&&state.elapsedMs-state.market.startedAt>=1200&&!state.market.collected.includes(i)&&distance(player,stage.market.fruit[i]!)<24)
      return {story:'market',action:'gather',item:i,at:stage.market.fruit[i]!};
    if(state.market.collected.length===3&&distance(player,stage.market.delivery)<36) return {story:'market',action:'deliver',at:stage.market.delivery};
    if(state.market.collected.length===0&&distance(player,stage.market.cart)<22) return {story:'market',action:'prank',at:stage.market.cart};
  }
  if(!state.memory.apprentice && distance(player,stage.apprentice.brace)<34) return {story:'apprentice',action:'brace',at:stage.apprentice.brace};
  if(distance(player,stage.rumor.listen)<48 && (!state.memory.rumor||!state.rumor.greeted)) return {story:'rumor',action:'listen',at:stage.rumor.listen};
  return null;
}

function resolve(state:VillageStoryState,id:VillageStoryId,outcome:VillageStoryOutcome='helped'):VillageStoryState {
  if(state.memory[id]) return state;
  return {...state,memory:{...state.memory,[id]:outcome},revision:state.revision+1};
}

/** Market adapters share one completion rule; autonomous cleanup is never player help. */
export function completeVillageMarketDelivery(state: VillageStoryState): VillageStoryState {
  if (state.memory.market || state.market.collected.length !== 3
    || ![0, 1, 2].every(item => state.market.collected.includes(item))) return state;
  return resolve({...state, market: {...state.market, resolvedAt: state.elapsedMs}}, 'market');
}

/** Simulation owns outcomes and timing. Presentation can never award completion. */
export function stepVillageStories(state:VillageStoryState,player:VillagePoint,dtMs:number,interact=false,paused=false,onStage?:VillageStoryId|null):VillageStoryState {
  if(paused) return state;
  const dt=Math.max(0,Math.min(100,Number.isFinite(dtMs)?dtMs:0));
  let next={...state,elapsedMs:state.elapsedMs+dt};
  // 무대에 서지 않은 시장은 배달부가 넘어지지 않는다 — 보이지 않는 사건이 혼자 시작되면 안 된다.
  if(next.market.startedAt<0&&!next.memory.market&&(onStage===undefined||onStage==='market')&&distance(player,VILLAGE_STORY_STAGE.market.courier)<210)
    next={...next,market:{...next.market,startedAt:next.elapsedMs}};
  const apprentice=next.apprentice;
  if(!next.memory.apprentice&&apprentice.startedAt>=0&&next.elapsedMs-apprentice.startedAt>=1700) {
    if(apprentice.braced) next=resolve({...next,apprentice:{...apprentice,successAt:next.elapsedMs}},'apprentice');
    else next={...next,apprentice:{...apprentice,startedAt:-1,attempts:apprentice.attempts+1}};
  }
  if(!next.memory.rumor&&next.rumor.listenedMs>0) {
    if(distance(player,VILLAGE_STORY_STAGE.rumor.listen)>115) next={...next,rumor:{...next.rumor,listenedMs:0}};
    else {
      next={...next,rumor:{...next.rumor,listenedMs:next.rumor.listenedMs+dt}};
      if(next.rumor.listenedMs>=10500) next=resolve(next,'rumor');
    }
  }
  if(!interact) return next;
  const target=villageStoryAffordance(next,player,onStage);
  if(!target) return next;
  switch(target.action) {
    case 'catch': return {...next,magpie:{carrying:false,caught:true,catchTime:next.elapsedMs}};
    case 'return': return resolve(next,'magpie');
    case 'gather': return {...next,market:{...next.market,collected:[...next.market.collected,target.item!]}};
    case 'deliver': return completeVillageMarketDelivery(next);
    case 'prank': return resolve({...next,market:{...next.market,resolvedAt:next.elapsedMs}},'market','pranked');
    case 'brace': {
      if(next.apprentice.startedAt<0) return {...next,apprentice:{...next.apprentice,startedAt:next.elapsedMs,braced:false}};
      const t=next.elapsedMs-next.apprentice.startedAt;
      return t>=600&&t<=1120?{...next,apprentice:{...next.apprentice,braced:true}}:next;
    }
    case 'listen': return {...next,rumor:{listenedMs:Math.max(1,next.rumor.listenedMs),greeted:!!next.memory.rumor}};
  }
}
