/** Shared by browser code and Node art tools. Invalid profiles must not reach CPU/GLSL math. */
export function validateCityEnvironment(profile) {
 const fail=path=>{throw new Error(`Invalid city environment: ${path}`);};
 const at=path=>path.split('.').reduce((value,key)=>value?.[key],profile);
 const number=(path,min,max=Infinity)=>{
  const value=at(path);if(!Number.isFinite(value)||value<min||value>max)fail(path);return value;
 };
 const vector=(path,length)=>{const v=at(path);if(!Array.isArray(v)||v.length!==length||!v.every(Number.isFinite))fail(path);return v;};
 const interval=path=>{const v=vector(path,2);if(v[0]<0||v[1]>1||v[0]>=v[1])fail(path);};
 number('camera.fov',0,65);
 if(number('camera.near',0)<=0||number('camera.far',0)<=at('camera.near'))fail('camera.near/far');
 if(number('camera.skyOrthographicFov',0,179)<=0)fail('camera.skyOrthographicFov');
 number('camera.orbit.minTurnMs',0);
 if(vector('camera.orbit.anchor',2).some(v=>v<0||v>1))fail('camera.orbit.anchor');
 const min=number('camera.zoom.min',0),max=number('camera.zoom.max',0);
 if(min<=0||max<min||number('camera.zoom.step',1)<=1)fail('camera.zoom');
 number('camera.zoom.default',min,max);
 number('distance.start',0);
 if(number('distance.range',0)<=0)fail('distance.range');
 for(const key of ['strength','highlightRetention'])number('distance.'+key,0,1);
 if(Math.hypot(...vector('sun.direction',2))<=0)fail('sun.direction');
 number('sun.slope',0);
 number('lighting.ambient',0);number('lighting.sunStrength',0);
 interval('lighting.lightRamp.first');interval('lighting.lightRamp.second');
 number('lighting.lightRamp.firstWeight',0,1);
 number('sky.cloudTurnsPerMs',0);
 number('npr.exposure',0);number('npr.edgeWidth',0);
 for(const key of ['ambientTint','keyTint','castTint','formTint','aoStrength','edgeOpacity'])number('npr.'+key,0,1);
 interval('npr.paintedRange');
 return profile;
}
