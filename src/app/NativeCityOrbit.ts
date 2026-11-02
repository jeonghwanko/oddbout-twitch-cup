import orbit from '../world/native-city-orbit.json';
import midground from '../world/native-city-midground.json';
import {cityGroundAxes,cityProject,cityScreenToPlan,type CityPoint,type NativeCityDefinition} from '../world/NativeCityDefinition';
import {CITY_ENVIRONMENT} from '../world/environment/CityEnvironment';
import {NATIVE_CITY_TALK_RETARGET_DEGREES} from '../world/NativeCityTalkSpot';
import {NATIVE_CITY_CAMERA_AT_REST,NATIVE_CITY_CAMERA_FOLLOW,NativeCityCameraEase,stepNativeCityCameraFollow,type NativeCityCameraFollowProfile} from './NativeCityCameraFollow';

export const NATIVE_CITY_ORBIT_STEP=orbit.stepDegrees;
export const NATIVE_CITY_ORBIT_STRIDE=orbit.frames.length/8;
export const NATIVE_CITY_ORBIT_STYLE=CITY_ENVIRONMENT.camera.orbit as typeof CITY_ENVIRONMENT.camera.orbit & {readonly anchor: readonly [number,number]};
export const NATIVE_CITY_ORBIT_PLATE={width:orbit.plateWidth,height:orbit.plateHeight,border:orbit.border as [number,number]};
export const NATIVE_CITY_ZOOM_STYLE=CITY_ENVIRONMENT.camera.zoom;
type Projection=NativeCityDefinition['projection'];
const frames=orbit.frames as unknown as readonly {index:number;projection:Projection}[];
const count=frames.length,wrap=(n:number)=>(n%count+count)%count;
const delta=(from:number,to:number)=>{const n=wrap(to-from);return n>count/2?n-count:n;};
const projected=(point:CityPoint,projection:Projection)=>cityProject(point,{projection} as NativeCityDefinition);
/** Every registered orbit frame's projection, in index order (a camera shot that must face something picks its frame from these). */
export const NATIVE_CITY_ORBIT_PROJECTIONS:readonly Projection[]=frames.map(frame=>frame.projection);

/** Retain the chosen world direction while an input chord is held, avoiding camera feedback. */
export class NativeCityOrbitInput {
  private screen:CityPoint|null=null;
  private direction:CityPoint=[0,0];
  reset(){this.screen=null;}
  resolve(screen:CityPoint,city:NativeCityDefinition,follow:boolean):CityPoint {
    if(!screen[0]&&!screen[1]){this.reset();return [0,0];}
    const size=Math.hypot(...screen),unit:CityPoint=[screen[0]/size,screen[1]/size];
    // Magnitude changes and tiny stick noise must not feed an automatic camera turn back into travel.
    const changed=this.screen===null||unit[0]*this.screen[0]+unit[1]*this.screen[1]<Math.cos(2*Math.PI/180);
    if(!follow||changed){
      // Camera-relative ground input, as in a 3D game (2026-10-16, user): ↘ walks the ground 45° between camera-right and toward
      // the camera, not the screen 45° (mostly depth at 16°). Straight keys keep their old directions; a stick works at any angle.
      const {right,down}=cityGroundAxes(city);
      const dx=right[0]*screen[0]+down[0]*screen[1],dy=right[1]*screen[0]+down[1]*screen[1],length=Math.hypot(dx,dy);
      this.direction=[dx/length,dy/length];this.screen=unit;
    }
    return this.direction;
  }
}

/** Manual orbit. Movement coasts a manual turn to a stop and never schedules a later rotation (only a clear-view turn keeps going). */
export class NativeCityOrbit {
  index=0;
  /** The zoom on screen, and the zoom a step is heading for (`track` eases there, `transitions.zoomSec`). Setting `zoom` cuts. */
  private shownZoom:number=NATIVE_CITY_ZOOM_STYLE.default;
  private goalZoom:number=NATIVE_CITY_ZOOM_STYLE.default;
  private readonly zoomEase=new NativeCityCameraEase(NATIVE_CITY_CAMERA_FOLLOW.transitions.zoomSec,Math.log(NATIVE_CITY_ZOOM_STYLE.default));
  /** A run's widening (`NATIVE_CITY_CAMERA_FOLLOW.run`): an eased fraction off the zoom, 0 at a walk. */
  private readonly runEase=new NativeCityCameraEase(NATIVE_CITY_CAMERA_FOLLOW.run.zoomSec);
  get zoom():number{return this.shownZoom*(1+this.runEase.value);}
  set zoom(value:number){this.shownZoom=this.goalZoom=value;this.zoomEase.snap(Math.log(value));this.runEase.snap();}
  get zoomGoal():number{return this.goalZoom;}
  /**
   * The factor taking a frame from the zoom on screen (the player's, a run's widening) back to the default zoom: a framing that must not
   * stack on the player's zoom (the vending landing shot, the fight stage and its line) multiplies by it.
   */
  get toDefaultZoom():number{return NATIVE_CITY_ZOOM_STYLE.default/Math.max(1e-6,this.zoom);}
  continuous=false;
  private reviewElevation:number|null=null;
  /** Live-surface inspection only; baked camera plates retain their authored projection. */
  setReviewElevation(degrees:number|null){
    if(degrees!==null&&(!Number.isFinite(degrees)||degrees<5||degrees>75))throw Error('Review elevation must be 5–75 degrees');
    this.reviewElevation=degrees;
  }
  private phase=0;
  setContinuous(enabled:boolean){
    if(this.continuous===enabled)return;
    this.phase=this.index;this.continuous=enabled;this.stop();
  }
  private point:CityPoint=[midground.spawn[0]!,midground.spawn[1]!];
  /** `coast`: a cancelled turn slowing to a stop (`yieldToMovement`) — eased out from its speed, never smoothstepped from rest. */
  private turn:{from:number;delta:number;elapsed:number;duration:number;sticky:boolean;coast?:true}|null=null;
  ready:(index:number)=>boolean=()=>true;
  /** Small sliding window; the renderer loads ahead without retaining a full circle on the GPU. */
  get requestedFrames(){
    if(!this.turn)return [this.index];
    const sign=Math.sign(this.turn.delta),target=wrap(this.turn.from+this.turn.delta);
    if(this.turn.duration===0)return [this.index,target];
    const remaining=Math.abs(delta(this.index,target));
    return Array.from({length:Math.min(12,remaining)+1},(_,i)=>wrap(this.index+sign*i));
  }
  get rawProjection():Projection{
    if(!this.continuous)return frames[this.index]!.projection;
    return this.projectionAt(this.phase);
  }
  /** The live-surface projection at any phase (frame index units), before the follow shift. */
  projectionAt(phase:number):Projection{
    const a=phase*orbit.stepDegrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a),base=frames[0]!.projection;
    const pitchScale=this.reviewElevation===null?1:Math.sin(this.reviewElevation*Math.PI/180)
      *Math.hypot(base.x[0],base.y[0])/Math.hypot(base.x[1],base.y[1]);
    const x:CityPoint=[base.x[0]*c+base.y[0]*s,(base.x[1]*c+base.y[1]*s)*pitchScale];
    const y:CityPoint=[base.y[0]*c-base.x[0]*s,(base.y[1]*c-base.x[1]*s)*pitchScale];
    return {x,y,origin:[orbit.width/2-x[0]*340-y[0]*444,orbit.height/2-x[1]*340-y[1]*444]};
  }
  get projection():Projection {
    const raw=this.rawProjection,clamped=this.plateShift;
    return {...raw,origin:[raw.origin[0]+clamped[0],raw.origin[1]+clamped[1]]};
  }
  /**
   * The camera's own aim (plan point at the anchor) once `track` runs it (`NativeCityCameraFollow`); null = locked on him, the
   * absolute registration below (only his position and the angle determine the camera).
   */
  private aim:CityPoint|null=null;
  /** His point at the last `track`, and the follow's spring. */
  private tracked:CityPoint|null=null;
  private followState=NATIVE_CITY_CAMERA_AT_REST;
  /** The plan point the camera looks at: the lens target of the 3D view (`cityPerspective`). */
  get focusPoint():CityPoint{return this.aim??this.point;}
  get plateShift():CityPoint {
    const pixel=projected(this.focusPoint,this.rawProjection);
    const shift=(size:number,axis:0|1)=>{
      const center=size/2,half=size/(2*this.zoom),border=orbit.border[axis]!;
      const plate=axis===0?orbit.plateWidth:orbit.plateHeight;
      const desired=center+(NATIVE_CITY_ORBIT_STYLE.anchor[axis]-.5)*size/this.zoom-pixel[axis];
      // Live surfaces cover the expanded city; only legacy baked plates have finite borders.
      if(this.continuous)return desired;
      // Clamp the full visible rectangle, including the extra area exposed by zoom-out.
      return Math.max(center+half+border-plate,Math.min(center-half+border,desired));
    };
    return [shift(orbit.width,0),shift(orbit.height,1)];
  }
  follow(point:CityPoint){this.point=[point[0],point[1]];}
  /**
   * One frame of the follow (`NativeCityCameraFollow`), after the frame's last `follow`: the aim springs after him with a dead zone
   * and a look-ahead, or `firm` (a fight, a camera shot). A jump past `teleportUnits` cuts to him; `dtMs` 0 holds the aim.
   */
  track(dtMs:number,profile:NativeCityCameraFollowProfile,reduced=false,running=false){
    this.easeZoom(dtMs,reduced,running&&profile==='travel');
    const point=this.point,last=this.tracked;
    if(!last||Math.hypot(point[0]-last[0],point[1]-last[1])>NATIVE_CITY_CAMERA_FOLLOW.teleportUnits){
      this.lockFollow();this.tracked=[point[0],point[1]];return;
    }
    const raw=this.rawProjection,here=projected(point,raw),before=projected(last,raw),at=projected(this.aim??last,raw);
    this.followState=stepNativeCityCameraFollow({...this.followState,lag:[here[0]-at[0],here[1]-at[1]]},
      [here[0]-before[0],here[1]-before[1]],dtMs,{width:orbit.width,height:orbit.height,zoom:this.zoom},profile,reduced);
    // Back to the plan: the aim is the ground point at the anchor, his screen offset (`lag`) away from him.
    const back=cityScreenToPlan(raw,this.followState.lag,1e-9);
    this.aim=back===null?null:[point[0]-back[0],point[1]-back[1]];
    this.tracked=[point[0],point[1]];
  }
  /** Lock the camera back on him (through a door, on the far view); a zoom step under way lands too. */
  snapFollow(){this.lockFollow();if(this.shownZoom!==this.goalZoom)this.zoom=this.goalZoom;}
  /** A cut of the follow only (a teleport): a zoom step under way keeps easing. */
  private lockFollow(){this.aim=null;this.tracked=null;this.followState=NATIVE_CITY_CAMERA_AT_REST;}
  /** Coverage audit includes space above the feet for the whole actor. */
  containsPlayer(){
    const pixel=projected(this.point,this.projection),margin=100;
    return pixel.every((value,axis)=>{
      const size=axis===0?orbit.width:orbit.height;
      const screen=(value-size/2)*this.zoom+size/2;
      return screen>=margin&&screen<=size-margin;
    });
  }
  get turning(){return this.turn!==null;}
  /** `eased`: the step eases in over the next frames' `track` (the player's +/−, wheel, 0); else it cuts. */
  zoomBy(direction:-1|1,eased=false){this.zoomTo(this.goalZoom*Math.pow(NATIVE_CITY_ZOOM_STYLE.step,direction),eased);}
  resetZoom(eased=false){this.zoomTo(NATIVE_CITY_ZOOM_STYLE.default,eased);}
  /** The player's saved zoom (`PlayerSettings.villageZoom`; null = the default), cut in as the scene starts — clamped to this range. */
  restoreZoom(saved:number|null){this.zoomTo(saved??NATIVE_CITY_ZOOM_STYLE.default,false);}
  /** The zoom to save for the player: null at the default (a later change of the default then reaches him too). */
  get savedZoom():number|null{return Math.abs(this.goalZoom-NATIVE_CITY_ZOOM_STYLE.default)<1e-6?null:this.goalZoom;}
  private zoomTo(value:number,eased:boolean){
    this.goalZoom=Math.max(NATIVE_CITY_ZOOM_STYLE.min,Math.min(NATIVE_CITY_ZOOM_STYLE.max,value));
    if(!eased)this.zoom=this.goalZoom;
  }
  private easeZoom(dtMs:number,reduced:boolean,widen:boolean){
    const goal=Math.log(this.goalZoom),log=this.zoomEase.step(goal,dtMs,reduced);
    this.shownZoom=log===goal?this.goalZoom:Math.exp(log);
    const run=NATIVE_CITY_CAMERA_FOLLOW.run,wide=widen&&!reduced?-run.zoomOut:0;
    this.runEase.step(wide,dtMs,reduced,wide<this.runEase.value?run.zoomSec:run.settleSec);
  }
  stop(){this.turn=null;}

  lookAt(index:number,reduced=false,duration?:number,sticky=false){
    const target=wrap(index);
    const from=this.continuous?this.phase:this.index;
    if(this.turn||Math.abs(delta(from,target))<1e-8)return false;
    if(reduced&&this.ready(target)){this.index=wrap(Math.round(target));this.phase=target;return true;}
    const distance=delta(from,target);
    this.turn={from,delta:distance,elapsed:0,duration:reduced?0:duration??Math.max(850,Math.abs(distance)*orbit.stepDegrees/90*1500),sticky};return true;
  }
  get phaseNow(){return this.continuous?this.phase:this.index;}
  /** Where the current turn ends (the current phase when not turning). */
  get targetPhase(){return this.turn?wrap(this.turn.from+this.turn.delta):this.phaseNow;}
  get autoTurning(){return this.turn?.sticky===true;}
  /**
   * Movement cancels a manual or shot turn — it coasts to a stop from its speed then (`turnCoastMs`; reduced motion stops dead); a
   * clear-view or landmark turn (`sticky`) finishes.
   */
  yieldToMovement(reduced=false){
    const turn=this.turn;
    if(!turn||turn.sticky||turn.coast)return;
    const t=turn.duration>0?Math.min(1,turn.elapsed/turn.duration):1,speed=turn.duration>0?turn.delta*6*t*(1-t)/turn.duration:0;
    const coastMs=NATIVE_CITY_CAMERA_FOLLOW.turnCoastMs;
    this.turn=reduced||Math.abs(speed)<1e-9?null:{from:this.phaseNow,delta:speed*coastMs/3,elapsed:0,duration:coastMs,sticky:false,coast:true};
  }
  rotate(direction:-1|1,moving=false,reduced=false){
    // A coast is the last of a turn he walked out of: a new Q/R takes over from where it is.
    if(this.turn?.coast&&!moving)this.turn=null;
    if(moving||this.turn)return false;
    const stride=NATIVE_CITY_ORBIT_STRIDE;
    const from=this.continuous?this.phase:this.index;
    const target=wrap((direction===1?Math.floor(from/stride)+1:Math.ceil(from/stride)-1)*stride);
    return this.lookAt(target,reduced,Math.max(NATIVE_CITY_ORBIT_STYLE.minTurnMs,Math.abs(delta(from,target))*orbit.stepDegrees/90*1500));
  }
  update(direction:CityPoint,point:CityPoint,dtMs:number,reduced=false){
    this.follow(point);
    if(Math.hypot(...direction)>1e-5)this.yieldToMovement(reduced);
    const dt=Math.min(50,Math.max(0,dtMs));
    if(dt===0)return;
    if(this.turn){
      const turn=this.turn;
      const elapsed=turn.elapsed+dt;
      const t=reduced||turn.duration===0?1:Math.min(1,elapsed/turn.duration),eased=turn.coast?1-(1-t)**3:t*t*(3-2*t);
      const phase=wrap(turn.from+turn.delta*eased),next=wrap(Math.round(phase));
      // Hold the current registered plate while loading. Never advance time into a missing frame.
      if(!this.ready(next))return;
      turn.elapsed=elapsed;this.index=next;this.phase=phase;
      if(t===1)this.turn=null;
      return;
    }
  }
  snapshot(){return {mode:'manual',index:this.index,angle:(this.continuous?this.phase:this.index)*orbit.stepDegrees,turning:this.turning,shift:this.plateShift,zoom:this.zoom,
    coasting:this.turn?.coast===true,runZoom:1+this.runEase.value,
    follow:{locked:this.aim===null,lag:this.followState.lag,lead:this.followState.lead}};}
}

/**
 * The orbit phase (frame index units, fractional) at which the plan `direction` runs purely horizontally on screen - a fighting
 * game's side view of that line (the side-scroll fight stage). Of the two such phases (one the mirror of the other) the one nearest
 * `from`, so the camera turns the short way.
 */
export function nativeCityOrbitSidePhase(direction:CityPoint,from:number):number{
  const base=frames[0]!.projection,[d0,d1]=direction;
  // Vertical screen part of `direction` at angle a: cos(a)·A + sin(a)·B (the pitch scale only multiplies it).
  const A=base.x[1]*d0+base.y[1]*d1,B=base.y[1]*d0-base.x[1]*d1;
  const a=Math.atan2(-A,B)*180/Math.PI/orbit.stepDegrees;
  const candidates=[wrap(a),wrap(a+count/2)];
  return candidates.reduce((best,phase)=>Math.abs(delta(from,phase))<Math.abs(delta(from,best))?phase:best);
}

/** The short-way angle (degrees) between two orbit phases. */
export function nativeCityOrbitDegreesBetween(a:number,b:number):number{return Math.abs(delta(a,b))*NATIVE_CITY_ORBIT_STEP;}

/** Choose a captured view placing a landmark behind the player, towards screen top. */
export function nativeCityLandmarkAngle(from:CityPoint,to:CityPoint){
  let best=0,score=-Infinity;
  for(let index=0;index<count;index+=NATIVE_CITY_ORBIT_STRIDE){
    const a=projected(from,frames[index]!.projection),b=projected(to,frames[index]!.projection);
    const dx=b[0]-a[0],dy=b[1]-a[1],value=-dy/Math.max(1e-6,Math.hypot(dx,dy));
    if(value>score){score=value;best=index;}
  }
  return best;
}

export const NATIVE_CITY_AUTO_CAMERA_STYLE=Object.freeze({enterRadius:72,exitRadius:96,focusRadius:120,
  switchMargin:14,settleMs:300,manualRestMs:4000,sampleMs:200,turnMs:1300,deadbandDegrees:10,
  candidateDegrees:[0,22.5,-22.5,45,-45,67.5,-67.5]});

export const NATIVE_CITY_AUTO_CAMERA_LANDMARKS=new Map([['blackthorne',225],['rosaline',33.75],['plaza',0],
  ['gentleman',0],['clockmaker',0],['vending',0],['B141',157.5],['B004',202.5],['B143',337.5],['B144',337.5],['pier-cargo',270]]);
/** 문 앞 상호작용은 멈췄던 자동 회전도 다시 잡는다. 안뜰로 걷는 동안 뒤쪽 구도까지 마친다. */
export function frameNativeCityManorDoor(orbit:NativeCityOrbit,reduced=false):boolean {
  orbit.stop();
  return orbit.lookAt(NATIVE_CITY_AUTO_CAMERA_LANDMARKS.get('blackthorne')!/NATIVE_CITY_ORBIT_STEP,reduced,undefined,true);
}
type CameraProbe=(phase:number)=>number|null;
type CameraZone={readonly id:string;readonly point:CityPoint};
/** A stop's authored sector as an orbit phase, or null. Both the travel framing and the arrival prediction read it here. */
const sectorPhase=(id:string)=>{const authored=NATIVE_CITY_AUTO_CAMERA_LANDMARKS.get(id);return authored===undefined?null:authored/NATIVE_CITY_ORBIT_STEP;};

/** Choose within the building-facing sector; sample the turn too, so a clear endpoint does not send the camera through a wall. */
export function nativeCityTravelCameraPhase(orbit:NativeCityOrbit,preferred:number,probe?:CameraProbe):number|null {
  if(!probe||!orbit.continuous)return preferred;
  const from=orbit.phaseNow,current=probe(from);
  if(current===null)return null;
  let best:{phase:number;score:number}|null=null;
  for(const degrees of NATIVE_CITY_AUTO_CAMERA_STYLE.candidateDegrees){
    const phase=wrap(preferred+degrees/NATIVE_CITY_ORBIT_STEP),end=probe(phase);
    if(end===null)continue;
    const travel=delta(from,phase);
    const samples=[.25,.5,.75].map(t=>probe(wrap(from+travel*t)));
    if(samples.some(value=>value===null))continue;
    const peak=Math.max(end,...samples as number[]);
    // Do not hide a visible player to improve the composition. If already hidden, allow a route out.
    const threshold=NATIVE_CITY_OCCLUSION_CAMERA_STYLE.occluded;
    if(end>threshold||peak>Math.max(current,threshold)+.05)continue;
    const score=end*8+Math.max(0,peak-current)+Math.abs(degrees)/67.5*.5+Math.abs(travel)/count*.3;
    if(!best||score<best.score)best={phase,score};
  }
  return best?.phase??null;
}

/** One owner for travel composition and occlusion recovery. Walking never cancels its turns. */
export class NativeCityAutoCamera {
  enabled=true;
  private zone:CameraZone|null=null;
  private candidate:string|null=null;
  private elapsed=0;
  private restMs=0;
  private sampleMs=0;
  private needsFrame=false;
  private ownsTurn=false;
  private preferred:number|null=null;

  private playerHold=false;
  private readonly occlusion=new NativeCityOcclusionCamera();
  /**
   * Manual input or a shot owns the camera for a while, even if the player crosses a zone boundary. A shot's zone framing
   * comes back after the rest; a player's turn (`byPlayer`) holds until the next zone, so looking around is not undone.
   */
  suppress(orbit:NativeCityOrbit,byPlayer=false){
    if(this.ownsTurn&&orbit.autoTurning)orbit.stop();
    this.restMs=NATIVE_CITY_AUTO_CAMERA_STYLE.manualRestMs;this.needsFrame=true;this.ownsTurn=false;
    if(byPlayer)this.playerHold=true;
  }
  toggle(){this.enabled=!this.enabled;this.zone=null;this.candidate=null;this.elapsed=0;this.restMs=0;this.preferred=null;this.needsFrame=false;this.playerHold=false;}
  clearNow(orbit:NativeCityOrbit,probe:CameraProbe,reduced=false){
    return this.occlusion.clearNow(orbit,probe,reduced,this.preferred??undefined);
  }

  arrivalPhase(orbit:NativeCityOrbit,stopId:string):number {
    const now=orbit.targetPhase;
    if(!this.enabled||this.restMs>0||this.zone?.id===stopId&&(!this.needsFrame||this.playerHold))return now;
    const phase=sectorPhase(stopId);
    return phase===null||nativeCityOrbitDegreesBetween(now,phase)<=NATIVE_CITY_AUTO_CAMERA_STYLE.deadbandDegrees?now:phase;
  }
  update(orbit:NativeCityOrbit,point:CityPoint,zones:readonly CameraZone[],_moving:boolean,dtMs:number,reduced=false,
    options:{readonly focusId?:string|null;readonly probe?:CameraProbe}={}){
    if(!this.enabled)return;
    if(dtMs<=0){
      if(this.ownsTurn&&orbit.autoTurning){orbit.stop();this.needsFrame=true;}
      this.ownsTurn=false;return;
    }
    if(!orbit.turning)this.ownsTurn=false;
    const style=NATIVE_CITY_AUTO_CAMERA_STYLE,dt=Math.min(50,Math.max(0,dtMs));
    this.restMs=Math.max(0,this.restMs-dt);this.sampleMs=Math.max(0,this.sampleMs-dt);
    const distance=(zone:CameraZone)=>Math.hypot(zone.point[0]-point[0],zone.point[1]-point[1]);
    const exit=this.zone?.id===options.focusId?style.focusRadius+style.switchMargin:style.exitRadius;
    if(this.zone&&(!zones.some(zone=>zone.id===this.zone!.id)||distance(this.zone)>exit)){
      this.zone=null;this.preferred=null;this.needsFrame=false;
    }
    const focus=zones.find(zone=>zone.id===options.focusId
      &&distance(zone)<=style.focusRadius+(this.zone?.id===zone.id?style.switchMargin:0));
    const nearest=zones.filter(zone=>distance(zone)<=style.enterRadius).sort((a,b)=>distance(a)-distance(b))[0];
    const next=focus??(!this.zone||nearest&&distance(nearest)+style.switchMargin<distance(this.zone)?nearest:this.zone);
    if(next&&next.id!==this.zone?.id){
      if(this.candidate!==next.id){this.candidate=next.id;this.elapsed=0;}
      this.elapsed+=dt;
      if(this.elapsed>=style.settleMs){
        this.zone=next;this.candidate=null;this.elapsed=0;this.needsFrame=true;this.playerHold=false;
        this.preferred=sectorPhase(next.id)??nativeCityLandmarkAngle(point,next.point);
      }
    }else{this.candidate=null;this.elapsed=0;}
    if(this.restMs>0||orbit.turning)return;
    if(this.needsFrame&&this.preferred!==null&&!this.playerHold){
      if(this.sampleMs>0)return;
      this.sampleMs=style.sampleMs;
      const phase=nativeCityTravelCameraPhase(orbit,this.preferred,options.probe);
      if(phase===null)return;
      const degrees=nativeCityOrbitDegreesBetween(orbit.phaseNow,phase);
      if(degrees<=style.deadbandDegrees){this.needsFrame=false;return;}
      if(orbit.lookAt(phase,reduced,Math.max(style.turnMs,degrees/90*style.turnMs),true)){
        this.needsFrame=false;this.ownsTurn=true;this.occlusion.rest(NATIVE_CITY_OCCLUSION_CAMERA_STYLE.cooldownMs);
      }
      return;
    }
    if(options.probe&&this.occlusion.update(orbit,true,dt,options.probe,reduced,this.preferred??undefined))this.ownsTurn=true;
  }

  frameArrival(orbit:NativeCityOrbit,phase:number,reduced=false,probe?:CameraProbe):boolean {
    if(!this.enabled||!orbit.continuous)return false;
    if(orbit.turning){this.ownsTurn=false;return true;}
    const style=NATIVE_CITY_AUTO_CAMERA_STYLE,degrees=nativeCityOrbitDegreesBetween(orbit.phaseNow,phase),hidden=probe?.(phase)??null;
    if(degrees<=NATIVE_CITY_TALK_RETARGET_DEGREES||hidden!==null&&hidden>NATIVE_CITY_OCCLUSION_CAMERA_STYLE.occluded)return false;
    if(!orbit.lookAt(phase,reduced,Math.max(style.turnMs,degrees/90*style.turnMs),true))return false;
    this.needsFrame=false;return orbit.turning;
  }
  snapshot(){return {enabled:this.enabled,zone:this.zone?.id??null,waitingMs:this.elapsed,restMs:this.restMs,playerHold:this.playerHold,
    preferredAngle:this.preferred===null?null:this.preferred*NATIVE_CITY_ORBIT_STEP,occlusion:this.occlusion.snapshot()};}
}

/**
 * 건물에 가린 주인공을 되찾는 자동 회전(2026-10-12 요청). 걷는 중·대사 중에도 돈다 — 대신 가림이 `holdMs` 이어질 때만,
 * 가까운 각도부터 트이는 쪽을 골라 천천히 돌고, 돈 뒤 `cooldownMs` 는 다시 돌지 않는다. 수동 Q/R 직후에도 쉰다.
 */
export const NATIVE_CITY_OCCLUSION_CAMERA_STYLE=Object.freeze({sampleMs:150,holdMs:350,cooldownMs:2500,manualRestMs:4000,
  occluded:.45,clear:.15,turnMs:1100,candidateDegrees:[22.5,-22.5,45,-45,67.5,-67.5,90,-90,135,-135]});
export class NativeCityOcclusionCamera {
  private sinceSample=Infinity;
  private heldMs=0;
  private restMs=0;
  private last:number|null=null;
  /** 수동 회전·연출 카메라가 방금 각도를 정했다. */
  rest(ms:number=NATIVE_CITY_OCCLUSION_CAMERA_STYLE.manualRestMs){this.restMs=Math.max(this.restMs,ms);this.heldMs=0;}
  /**
   * `probe(phase)` 는 그 각도에서 가린 몫(0~1, 판정 못 하면 null). 돌기 시작했으면 참.
   * `enabled` 가 거짓이면 아무것도 세지 않는다(대결·연출 카메라·멀리 보기 등).
   */
  update(orbit:NativeCityOrbit,enabled:boolean,dtMs:number,probe:CameraProbe,reduced=false,preferred?:number):boolean {
    const style=NATIVE_CITY_OCCLUSION_CAMERA_STYLE,dt=Math.min(50,Math.max(0,dtMs));
    this.restMs=Math.max(0,this.restMs-dt);
    if(!enabled||!orbit.continuous){this.heldMs=0;this.last=null;this.sinceSample=Infinity;return false;}
    if(orbit.turning){this.heldMs=0;return false;}
    this.sinceSample+=dt;
    if(this.sinceSample<style.sampleMs)return false;
    const elapsed=this.sinceSample===Infinity?0:this.sinceSample;
    this.sinceSample=0;
    const from=orbit.phaseNow,now=probe(from);
    this.last=now;
    if(now===null||now<style.occluded){this.heldMs=0;return false;}
    this.heldMs+=elapsed;
    if(this.heldMs<style.holdMs||this.restMs>0)return false;
    const started=this.turnToClear(orbit,from,now,probe,reduced,preferred);
    this.heldMs=0;this.restMs=style.cooldownMs;
    return started;
  }
  /**
   * 지금 가려져 있으면 곧바로 트이는 각도로 돌기 시작한다(기다림·쉼 없이). 연출이 열리기 직전(귀빈 준비 장면 등)에 쓴다 —
   * 연출 카메라는 열릴 때의 화면 자리로 구도를 잡으므로 도중에 돌면 안 된다. 돌기 시작했으면 참.
   */
  clearNow(orbit:NativeCityOrbit,probe:CameraProbe,reduced=false,preferred?:number):boolean {
    if(!orbit.continuous||orbit.turning)return false;
    const from=orbit.phaseNow,now=probe(from);
    if(now===null||now<NATIVE_CITY_OCCLUSION_CAMERA_STYLE.occluded)return false;
    const started=this.turnToClear(orbit,from,now,probe,reduced,preferred);
    if(started)this.restMs=NATIVE_CITY_OCCLUSION_CAMERA_STYLE.cooldownMs;
    return started;
  }
  private turnToClear(orbit:NativeCityOrbit,from:number,now:number,probe:CameraProbe,reduced:boolean,preferred?:number):boolean {
    const style=NATIVE_CITY_OCCLUSION_CAMERA_STYLE;
    if(preferred!==undefined){
      const phase=nativeCityTravelCameraPhase(orbit,preferred,probe),value=phase===null?null:probe(phase);
      return phase!==null&&value!==null&&value<=now-.3
        &&orbit.lookAt(phase,reduced,Math.max(style.turnMs,Math.abs(delta(from,phase))*NATIVE_CITY_ORBIT_STEP/90*style.turnMs),true);
    }
    let best:{phase:number;value:number}|null=null;
    for(const degrees of style.candidateDegrees){
      const phase=from+degrees/NATIVE_CITY_ORBIT_STEP,value=probe(phase);
      if(value===null)continue;
      if(value<=style.clear){best={phase,value};break;}
      if(!best||value<best.value)best={phase,value};
    }
    // 어디로 돌아도 크게 나아지지 않으면 그대로 둔다(골목 깊숙이 등).
    if(!best||best.value>now-.3)return false;
    return orbit.lookAt(best.phase,reduced,Math.max(style.turnMs,Math.abs(best.phase-from)*NATIVE_CITY_ORBIT_STEP/90*style.turnMs),true);
  }
  snapshot(){return {occluded:this.last,heldMs:this.heldMs,restMs:this.restMs};}
}
