export const CREATURE_SPEED_LEVELS=Object.freeze([
  Object.freeze({label:'SLOWER',value:.4}),
  Object.freeze({label:'SLOW',value:.6}),
  Object.freeze({label:'NORMAL',value:1}),
  Object.freeze({label:'FAST',value:1.5})
]);

export const DEFAULT_CREATURE_SPEED_LEVEL=0;
export const FROG_PAD_HOP_DISTANCE=190;

export function canFrogHopToPad(distance,mobileContentScale=1,targetIsPad=true){
  return targetIsPad&&Number.isFinite(distance)&&distance<=FROG_PAD_HOP_DISTANCE*mobileContentScale;
}

export function frogSwimScale(textureHeight){
  return textureHeight>0?96/textureHeight:1;
}
