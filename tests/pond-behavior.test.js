import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CREATURE_SPEED_LEVELS,
  DEFAULT_CREATURE_SPEED_LEVEL,
  FROG_PAD_HOP_DISTANCE,
  canFrogHopToPad,
  frogSwimScale
} from '../pond-behavior.js';

test('slower creature movement is the default',()=>{
  assert.equal(CREATURE_SPEED_LEVELS[DEFAULT_CREATURE_SPEED_LEVEL].label,'SLOWER');
  assert.equal(CREATURE_SPEED_LEVELS[DEFAULT_CREATURE_SPEED_LEVEL].value,.4);
});

test('nearby lily pads use a direct hop',()=>{
  assert.equal(canFrogHopToPad(FROG_PAD_HOP_DISTANCE-1,1,true),true);
  assert.equal(canFrogHopToPad(FROG_PAD_HOP_DISTANCE+1,1,true),false);
  assert.equal(canFrogHopToPad(40,1,false),false);
});

test('frog swim frames retain a 96px visual height',()=>{
  assert.equal(frogSwimScale(192),.5);
  assert.equal(frogSwimScale(0),1);
});
