import {
  Application, Assets, Container, Graphics, Sprite, Texture, BlurFilter,
  ColorMatrixFilter, DisplacementFilter, MeshPlane, RendererType,
  WebGLRenderer, CanvasRenderer
} from 'pixi.js';
import 'pixi.js/browser';

const startupStartedAt=performance.now();
let startupStep=0;
function startupLog(label,details){
  const elapsed=(performance.now()-startupStartedAt).toFixed(1);
  console.info(`[KOI STARTUP ${String(++startupStep).padStart(2,'0')} +${elapsed}ms] ${label}`,details??'');
}
startupLog('Module loaded',{
  mode:import.meta.env.MODE,
  production:import.meta.env.PROD,
  base:import.meta.env.BASE_URL,
  url:location.href,
  userAgent:navigator.userAgent
});
// Pixi normally discovers these through asynchronous imports. Keeping direct
// references forces Vite to include both renderer implementations in the main
// production module, avoiding a renderer-discovery promise that can stall.
const staticallyBundledRenderers={webgl:WebGLRenderer,canvas:CanvasRenderer};
startupLog('Renderer implementations bundled',{
  webgl:staticallyBundledRenderers.webgl.name,
  canvas:staticallyBundledRenderers.canvas.name
});

function showStartupError(reason){
  if(document.querySelector('.startup-error'))return;
  const error=reason instanceof Error?reason:new Error(String(reason||'Unknown startup error'));
  const notice=document.createElement('pre');
  notice.className='startup-error';
  notice.textContent=`Pond startup error\n${error.name}: ${error.message}`;
  Object.assign(notice.style,{
    position:'fixed',left:'50%',top:'50%',transform:'translate(-50%,-50%)',
    zIndex:'10000',maxWidth:'min(680px,90vw)',whiteSpace:'pre-wrap',
    padding:'18px 22px',border:'1px solid rgba(255,220,170,.45)',
    borderRadius:'10px',background:'rgba(4,24,27,.94)',color:'#ffe6bf',
    font:'13px/1.55 monospace',boxShadow:'0 20px 70px rgba(0,0,0,.45)'
  });
  document.body.appendChild(notice);
}
window.addEventListener('error',event=>showStartupError(event.error||event.message));
window.addEventListener('unhandledrejection',event=>showStartupError(event.reason));

let canvas = document.querySelector('#pond');
let app = new Application();
startupLog('Canvas located',{found:Boolean(canvas),size:[innerWidth,innerHeight]});
const rendererOptions={
  canvas,
  resizeTo:window,
  antialias:true,
  autoDensity:true,
  resolution:Math.min(devicePixelRatio||1,1.5),
  background:'#071f22',
  preferWebGLVersion:1,
  failIfMajorPerformanceCaveat:false,
  // The browser environment is imported statically above. Skipping Pixi's
  // asynchronous extension import avoids a Vite production-build deadlock.
  skipExtensionImports:true
};
function withStartupTimeout(promise,label,timeout=4000){
  let timer;
  const deadline=new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(new Error(`${label} did not initialize within ${timeout}ms`)),timeout);
  });
  return Promise.race([promise,deadline]).finally(()=>clearTimeout(timer));
}
try {
  startupLog('Attempting WebGL renderer');
  await withStartupTimeout(
    app.init({...rendererOptions,preference:'webgl'}),
    'WebGL renderer'
  );
  startupLog('WebGL renderer initialized',{type:app.renderer.type,resolution:app.renderer.resolution});
} catch (webglError) {
  startupLog('WebGL initialization failed; trying Canvas',webglError);
  console.warn('WebGL unavailable; using the simplified Canvas pond.',webglError);
  // A canvas that has attempted a WebGL context cannot reliably be reused for
  // a 2D context, so give the Canvas renderer a genuinely fresh element.
  const replacement=canvas.cloneNode(false);
  canvas.replaceWith(replacement);
  canvas=replacement;
  app=new Application();
  try{
    await withStartupTimeout(
      app.init({...rendererOptions,canvas,preference:'canvas',resolution:1,antialias:false}),
      'Canvas renderer',
      6000
    );
    document.body.classList.add('canvas-renderer');
    startupLog('Canvas renderer initialized',{type:app.renderer.type,resolution:app.renderer.resolution});
  }catch(error){
    console.error('Unable to initialize pond renderer',error);
    document.body.classList.add('renderer-unavailable');
    const notice=document.createElement('div');
    notice.className='renderer-notice';
    notice.innerHTML='<strong>The pond could not start</strong><span>This browser could not start either the WebGL or Canvas renderer. Please try a current version of Chrome, Edge, Firefox, or Safari.</span>';
    document.body.appendChild(notice);
    throw error;
  }
}
// Constructor names are minified in production, so use Pixi's stable renderer
// identifier rather than a class-name string.
const isCanvasRenderer=app.renderer.type===RendererType.CANVAS;
startupLog('Renderer selected',{type:app.renderer.type,isCanvasRenderer});

const waterLayer = new Container();
const refractedWaterLayer = new Container();
const waterTintLayer = new Container();
const shorelineLayer = new Container();
const decorLayer = new Container();
const shadowLayer = new Container();
const fishLayer = new Container();
const floatingLayer = new Container();
const lightingLayer = new Container();
const surfaceLayer = new Container();
const aerialLayer = new Container();
const focusLayer = new Container();
const pondMask = new Graphics();
app.stage.addChild(waterLayer, refractedWaterLayer, waterTintLayer, shorelineLayer, decorLayer, shadowLayer, fishLayer, floatingLayer, lightingLayer, surfaceLayer, aerialLayer, focusLayer, pondMask);
startupLog('Scene layers created',{stageChildren:app.stage.children.length});
refractedWaterLayer.mask=pondMask;waterTintLayer.mask=pondMask;shorelineLayer.mask=pondMask;decorLayer.mask=pondMask;shadowLayer.mask=pondMask;fishLayer.mask=pondMask;floatingLayer.mask=pondMask;lightingLayer.mask=pondMask;surfaceLayer.mask=pondMask;
const pondArea={cx:0,cy:0,rx:1,ry:1};
let pondOutline=[];
// Normalized points trace the painted waterline clockwise, including the
// irregular planted shelves and large rocks along the right and lower banks.
const pondOutlineNormalized=[
  [.25,.095],[.36,.055],[.51,.045],[.65,.065],[.76,.12],[.85,.22],
  [.91,.34],[.91,.50],[.86,.64],[.77,.76],[.66,.86],[.54,.92],
  [.45,.935],[.39,.90],[.355,.84],[.345,.76],[.32,.69],[.295,.61],
  [.27,.53],[.235,.46],[.20,.41],[.18,.35],[.18,.29],[.205,.25],
  [.22,.20],[.215,.16],[.195,.125]
];

// One shared sunset grade ties generated sprites to the peach and olive light
// already painted into the garden. Shadows receive a gentler version so they
// retain their watery softness instead of becoming grey cut-outs.
function environmentGrade(strength=1){
  const f=new ColorMatrixFilter();
  const s=strength;
  f.matrix=[
    1-.13*s,.09*s,.05*s,0,.018*s,
    .045*s,1-.16*s,.025*s,0,.008*s,
    .018*s,.055*s,1-.25*s,0,.004*s,
    0,0,0,1,0
  ];
  return f;
}
function makeWaterDisplacementTexture(){
  const c=document.createElement('canvas');c.width=256;c.height=256;const ctx=c.getContext('2d');
  const image=ctx.createImageData(c.width,c.height);
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
    const i=(y*c.width+x)*4;
    const nx=Math.sin(x*.075+y*.023)+Math.sin(x*.027-y*.051)*.55;
    const ny=Math.cos(y*.068-x*.019)+Math.sin(y*.031+x*.044)*.5;
    image.data[i]=128+nx*30;image.data[i+1]=128+ny*30;image.data[i+2]=128;image.data[i+3]=255;
  }
  ctx.putImageData(image,0,0);return Texture.from(c);
}
const displacementMap=new Sprite(makeWaterDisplacementTexture());
displacementMap.anchor.set(.5);displacementMap.alpha=0;
waterLayer.addChild(displacementMap);
const fishRefraction=isCanvasRenderer?null:new DisplacementFilter({sprite:displacementMap,scale:{x:5.8,y:4.1}});
const animalRefraction=isCanvasRenderer?null:new DisplacementFilter({sprite:displacementMap,scale:{x:3.4,y:2.5}});
if(!isCanvasRenderer){
  shorelineLayer.filters=[environmentGrade(.82)];
  floatingLayer.filters=[environmentGrade(.82)];
  decorLayer.filters=[animalRefraction,environmentGrade(.82)];
  fishLayer.filters=[fishRefraction,environmentGrade(1)];
  surfaceLayer.filters=[environmentGrade(.55)];
  shadowLayer.filters=[environmentGrade(.35)];
}

const palettes = [
  ['#f4ead0', '#d55f36', '#712b27'], ['#eee7d2', '#1d2927', '#d4773e'],
  ['#d98b47', '#f5e6c6', '#8d2f27'], ['#f1dfbd', '#ac392c', '#26322f'],
  ['#ded0aa', '#c25731', '#f4ead4']
];
const fish = [], food = [], ripples = [], fishWakes=[], refractionRipples=[];
let lastWakeAt=0,nextWindAt=performance.now()+7000+Math.random()*7000,windUntil=0,lastWindRipple=0,waterMotionEnhanced=true,greenWaterEnabled=false,waveContrastEnabled=false;
const creatureVisibility={koi:true,turtles:true,frogs:true,dragonflies:true};
let focusedCreature=null,returningCreature=null,lastCreatureClick=0;
const focusVeil=new Graphics();focusLayer.addChild(focusVeil);
let audioOn = false, audioCtx;
const koiBreeds=['kohaku','sanke','showa','ogon','shiro-utsuri','hi-utsuri','ki-utsuri','bekko','asagi','shusui','tancho','goshiki','goromo','ochiba','chagoi','soragoi','platinum-ogon','kujaku','matsuba','hariwake'];
const bundledAssets=import.meta.glob([
  './assets/koi-*-cropped.png',
  './assets/pebble-[1-6].png',
  './assets/pellet-[1-9].png',
  './assets/pellet-1[0-2].png',
  './assets/dragonfly.png',
  './assets/frog-cropped.png',
  './assets/turtle-cropped.png',
  './assets/pond-water.png',
  './assets/lotus-flower-cropped.png',
  './assets/lotus-leaf-cropped.png'
],{eager:true,query:'?url',import:'default'});
startupLog('Vite asset manifest ready',{entries:Object.keys(bundledAssets).length});
const assetPath=name=>{
  const url=bundledAssets[`./assets/${name}`];
  if(!url)throw new Error(`Asset is missing from the Vite bundle: ${name}`);
  return url;
};
async function loadPondAsset(name){
  const url=assetPath(name);
  startupLog(`Loading asset: ${name}`,url);
  const texture=await Assets.load(url);
  startupLog(`Loaded asset: ${name}`,{width:texture.width,height:texture.height});
  return texture;
}
const koiTextures = await Promise.all(koiBreeds.map(name=>loadPondAsset(`koi-${name}-cropped.png`)));
startupLog('All koi textures loaded',{count:koiTextures.length});
const frogTexture = await loadPondAsset('frog-cropped.png');
const turtleTexture = await loadPondAsset('turtle-cropped.png');
const pondWaterTexture = await loadPondAsset('pond-water.png');
const lotusFlowerTexture = await loadPondAsset('lotus-flower-cropped.png');
const lotusLeafTexture = await loadPondAsset('lotus-leaf-cropped.png');
const pebbleTextures = await Promise.all([1,2,3,4,5,6].map(i=>loadPondAsset(`pebble-${i}.png`)));
const dragonflyTexture=await loadPondAsset('dragonfly.png');

function makePelletTexture(variant=0){
  const c=document.createElement('canvas');c.width=24;c.height=24;const p=c.getContext('2d');
  p.translate(12,12);p.rotate((variant-1)*.25);
  const g=p.createRadialGradient(-2,-2,1,0,0,8);g.addColorStop(0,'#b98b4d');g.addColorStop(.5,'#795128');g.addColorStop(1,'#3f2b18');
  p.fillStyle=g;p.beginPath();p.moveTo(-7,-3);p.quadraticCurveTo(-3,-6,4,-5);p.quadraticCurveTo(8,-2,7,3);p.quadraticCurveTo(2,6,-5,5);p.quadraticCurveTo(-8,2,-7,-3);p.fill();
  p.fillStyle='rgba(244,211,143,.32)';p.beginPath();p.ellipse(-2,-2,2.2,1.1,-.25,0,7);p.fill();
  p.fillStyle='rgba(35,23,12,.4)';for(let i=0;i<4;i++){p.beginPath();p.arc(-4+Math.random()*9,-3+Math.random()*7,.45,0,7);p.fill()}
  return Texture.from(c);
}
const pelletTextures=await Promise.all(Array.from({length:12},(_,i)=>loadPondAsset(`pellet-${i+1}.png`)));
startupLog('All pond textures loaded',{koi:koiTextures.length,pebbles:pebbleTextures.length,pellets:pelletTextures.length});
const turtles=[],frogs=[],floaters=[],dragonflies=[];

function makeDragonfly(){
  const source=dragonflyTexture.source,img=source.resource,w=source.width,h=source.height;
  const root=new Container(),scale=64/w,thorax={x:w*.5,y:h*.405};
  // Copy each part onto a padded canvas. Using texture frames directly lets
  // the GPU clamp the final opaque row across a transparent crop, producing
  // the long horizontal residue seen in the pond.
  const cut=(x,y,cw,ch)=>{
    const pad=4,c=document.createElement('canvas');c.width=Math.ceil(cw)+pad*2;c.height=Math.ceil(ch)+pad*2;
    c.getContext('2d').drawImage(img,x,y,cw,ch,pad,pad,cw,ch);
    return {texture:Texture.from(c),pad,x,y};
  };
  const bodyCut=cut(w*.475,0,w*.05,h);
  const body=new Sprite(bodyCut.texture);
  body.pivot.set(thorax.x-bodyCut.x+bodyCut.pad,thorax.y+bodyCut.pad);body.scale.set(scale);root.addChild(body);
  const specs=[
    [0,h*.16,w*.495,h*.28,-1,0],
    [w*.505,h*.16,w*.495,h*.28,1,0],
    [0,h*.40,w*.495,h*.19,-1,Math.PI*.62],
    [w*.505,h*.40,w*.495,h*.19,1,Math.PI*.62]
  ];
  const wings=specs.map(s=>{
    const part=cut(s[0],s[1],s[2],s[3]),wing=new Sprite(part.texture);
    wing.pivot.set(thorax.x-part.x+part.pad,thorax.y-part.y+part.pad);
    wing.scale.set(scale);wing.alpha=.78;root.addChildAt(wing,0);
    return {view:wing,baseX:scale,baseY:scale,phase:s[5],side:s[4]};
  });
  return {root,wings};
}

function makeWaterTexture() {
  const c = document.createElement('canvas'); c.width = 960; c.height = 640;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(690, 300, 20, 690, 300, 760);
  g.addColorStop(0, '#1b504c'); g.addColorStop(.48, '#0c3738'); g.addColorStop(1, '#041a20');
  x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
  for (let i=0;i<90;i++) { x.fillStyle=`rgba(195,222,203,${.015+Math.random()*.035})`; x.beginPath(); x.arc(Math.random()*960,Math.random()*640,.3+Math.random()*1.3,0,7); x.fill(); }
  return Texture.from(c);
}

const water = new Sprite(pondWaterTexture);water.anchor.set(.5);
waterLayer.addChild(water);

// A second, pond-masked copy of the painting is displaced by a shared
// height-field. Disturbances exchange energy instead of playing canned rings.
const refractedWater=new Sprite(pondWaterTexture);refractedWater.anchor.set(.5);
refractedWaterLayer.addChild(refractedWater);
const rippleMapCanvas=document.createElement('canvas');rippleMapCanvas.width=160;rippleMapCanvas.height=100;
const rippleMapContext=rippleMapCanvas.getContext('2d');
const rippleMapTexture=Texture.from(rippleMapCanvas);
const waterShadeCanvas=document.createElement('canvas');waterShadeCanvas.width=rippleMapCanvas.width;waterShadeCanvas.height=rippleMapCanvas.height;
const waterShadeContext=waterShadeCanvas.getContext('2d'),waterShadeTexture=Texture.from(waterShadeCanvas);
const waterShadeSprite=new Sprite(waterShadeTexture);waterShadeSprite.alpha=.46;waterShadeSprite.blendMode='multiply';waterTintLayer.addChild(waterShadeSprite);
const rippleMapSprite=new Sprite(rippleMapTexture);rippleMapSprite.alpha=0;
rippleMapSprite.width=app.screen.width;rippleMapSprite.height=app.screen.height;app.stage.addChild(rippleMapSprite);
const radialRefraction=isCanvasRenderer?null:new DisplacementFilter({sprite:rippleMapSprite,scale:{x:58,y:48}});
if(!isCanvasRenderer)refractedWater.filters=[radialRefraction];
const waterCells=rippleMapCanvas.width*rippleMapCanvas.height;
let waterHeight=new Float32Array(waterCells),waterPrevious=new Float32Array(waterCells),waterNext=new Float32Array(waterCells);
const waterDamping=new Float32Array(waterCells);
const rippleImage=rippleMapContext.createImageData(rippleMapCanvas.width,rippleMapCanvas.height);
const shadeImage=waterShadeContext.createImageData(rippleMapCanvas.width,rippleMapCanvas.height);
let waterEnergy=0,physicsFrame=0;

function disturbWater(x,y,strength=1,radius=3,angle=null){
  if(!waterMotionEnhanced)return;
  if(!insidePond(x,y,5))return;
  const w=rippleMapCanvas.width,h=rippleMapCanvas.height,gx=x/app.screen.width*w,gy=y/app.screen.height*h;
  const rx=Math.max(1,radius/app.screen.width*w),ry=Math.max(1,radius/app.screen.height*h);
  const reach=Math.ceil(Math.max(rx,ry)*2.4);
  for(let oy=-reach;oy<=reach;oy++)for(let ox=-reach;ox<=reach;ox++){
    const px=Math.floor(gx+ox),py=Math.floor(gy+oy);if(px<2||py<2||px>=w-2||py>=h-2)continue;
    const d2=(ox*ox)/(rx*rx)+(oy*oy)/(ry*ry);if(d2>5.5)continue;
    let force=Math.exp(-d2*.72)*strength;
    if(angle!==null)force*=.45+.55*Math.max(0,(ox*Math.cos(angle)+oy*Math.sin(angle))/Math.max(1,Math.hypot(ox,oy)));
    waterHeight[py*w+px]+=force;
  }
  waterEnergy=Math.min(12,waterEnergy+Math.abs(strength));
}

function updateRippleRefraction(){
  const w=rippleMapCanvas.width,h=rippleMapCanvas.height;
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const i=y*w+x,c=waterHeight[i],lap=waterHeight[i-1]+waterHeight[i+1]+waterHeight[i-w]+waterHeight[i+w]-4*c;
    const damping=waterDamping[i];if(!damping){waterNext[i]=0;continue;}
    waterNext[i]=(2*c-waterPrevious[i]+lap*.12)*damping;
  }
  [waterPrevious,waterHeight,waterNext]=[waterHeight,waterNext,waterPrevious];waterNext.fill(0);
  const data=rippleImage.data,shadeData=shadeImage.data,contrast=86;
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const i=y*w+x,dx=(waterHeight[i-1]-waterHeight[i+1])*contrast,dy=(waterHeight[i-w]-waterHeight[i+w])*contrast,p=i*4;
    data[p]=Math.max(0,Math.min(255,128+dx));data[p+1]=Math.max(0,Math.min(255,128+dy));data[p+2]=128;data[p+3]=255;
    const slope=Math.min(1,(Math.abs(dx)+Math.abs(dy))/58),crest=Math.max(0,waterHeight[i]-waterPrevious[i]);
    shadeData[p]=waveContrastEnabled?8:42;
    shadeData[p+1]=waveContrastEnabled?76:112;
    shadeData[p+2]=waveContrastEnabled?62:96;
    shadeData[p+3]=Math.min(waveContrastEnabled?88:58,slope*(waveContrastEnabled?68:42)+crest*(waveContrastEnabled?20:14));
  }
  rippleMapContext.putImageData(rippleImage,0,0);rippleMapTexture.source.update();waterShadeContext.putImageData(shadeImage,0,0);waterShadeTexture.source.update();
  waterEnergy*=.82;
}
updateRippleRefraction();
function clearWaterMotion(){
  waterHeight.fill(0);waterPrevious.fill(0);waterNext.fill(0);waterEnergy=0;
  for(const wake of fishWakes)wake.view.destroy();fishWakes.length=0;
  const displacement=rippleImage.data;for(let i=0;i<displacement.length;i+=4){displacement[i]=128;displacement[i+1]=128;displacement[i+2]=128;displacement[i+3]=255;}
  shadeImage.data.fill(0);
  rippleMapContext.putImageData(rippleImage,0,0);rippleMapTexture.source.update();
  waterShadeContext.putImageData(shadeImage,0,0);waterShadeTexture.source.update();
}

function buildPondDecor(){
  if(returningCreature)finishCreatureReturn();
  if(focusedCreature&&focusedCreature.kind!=='koi')clearCreatureFocus(false);
  turtles.length=0;frogs.length=0;floaters.length=0;dragonflies.length=0;
  shorelineLayer.removeChildren().forEach(child=>child.destroy());
  floatingLayer.removeChildren().forEach(child=>child.destroy());
  decorLayer.removeChildren().forEach(child=>child.destroy());
  aerialLayer.removeChildren().forEach(child=>child.destroy());
  const w=app.screen.width,h=app.screen.height;
  // Banks are assembled from independent stones, avoiding repeated stamped clusters.
  [[.20,.58,72,34,-.08],[.61,.80,95,28,.05],[.80,.43,42,72,1.48],[.39,.19,82,25,.02]].forEach((bed,bankIndex)=>{
    const bank=new Container();bank.position.set(bed[0]*w,bed[1]*h);bank.rotation=bed[4];
    for(let i=0;i<10;i++){
      const stone=new Sprite(pebbleTextures[(i+bankIndex*2)%pebbleTextures.length]);stone.anchor.set(.5);
      const size=15+Math.random()*18;stone.width=size;stone.height=size*(stone.texture.height/stone.texture.width);
      stone.position.set((Math.random()-.5)*bed[2]*2,(Math.random()-.5)*bed[3]*2);stone.rotation=Math.random()*Math.PI;stone.alpha=.48+Math.random()*.18;bank.addChild(stone);
    }
    shorelineLayer.addChild(bank);
  });

  // Leaves and flowers are independently composed and can move without one another.
  [[.70,.27,42,3],[.76,.64,32,2],[.54,.21,27,2]].forEach((group,j)=>{
    for(let i=0;i<group[3];i++){
      const leaf=new Sprite(lotusLeafTexture);leaf.anchor.set(.5);const size=group[2]*(.82+Math.random()*.38);
      leaf.width=size*2;leaf.height=size*2*(lotusLeafTexture.height/lotusLeafTexture.width);
      const offset=(i-(group[3]-1)/2)*size*1.9;
      leaf.position.set(group[0]*w+offset,group[1]*h+(i%2-.5)*size*.72);leaf.rotation=j*.8+i*1.45;leaf.alpha=.72+Math.random()*.16;floatingLayer.addChild(leaf);
      floaters.push({view:leaf,baseY:leaf.y,baseRotation:leaf.rotation,phase:j*1.8+i*.9,amount:1.2+Math.random()*.8});
    }
    const flower=new Sprite(lotusFlowerTexture);flower.anchor.set(.5);flower.width=group[2]*1.08;flower.height=group[2]*1.08*(lotusFlowerTexture.height/lotusFlowerTexture.width);
    flower.position.set(group[0]*w+group[2]*.2,group[1]*h-group[2]*.08);flower.rotation=j*.55;flower.alpha=.94;floatingLayer.addChild(flower);
    floaters.push({view:flower,baseY:flower.y,baseRotation:flower.rotation,phase:j*2.1+.5,amount:.75});
  });

  // A single resting frog beside the pebble bank gives the pond life without crowding the koi.
  const frogLeaf=new Sprite(lotusLeafTexture);frogLeaf.anchor.set(.5);frogLeaf.width=82;frogLeaf.height=82*(lotusLeafTexture.height/lotusLeafTexture.width);frogLeaf.position.set(w*.25,h*.68);frogLeaf.rotation=-.5;frogLeaf.alpha=.8;floatingLayer.addChild(frogLeaf);
  const frog=new Sprite(frogTexture);frog.anchor.set(.5);frog.width=48;frog.height=73;frog.position.set(w*.25,h*.68);frog.rotation=-.35;frog.alpha=.92;floatingLayer.addChild(frog);
  frog.eventMode='static';frog.cursor='pointer';frog.on('pointertap',()=>focusCreature({kind:'frogs',view:frog,name:'Pond Frog',type:'AMPHIBIAN',text:'Pond frogs divide their time between floating vegetation and the water. Their stillness, sudden hops, and sensitive skin make them excellent indicators of a healthy pond habitat.'}));
  frogs.push({view:frog,homeX:frog.x,homeY:frog.y,fromX:frog.x,fromY:frog.y,toX:frog.x,toY:frog.y,phase:Math.random()*6,mode:'rest',timer:240+Math.random()*420,progress:0,duration:32,baseScaleX:frog.scale.x,baseScaleY:frog.scale.y});

  // An adult and juvenile turtle drift independently through quieter areas.
  [[.19,.2,62,.42],[.86,.48,44,-.8]].forEach((data,i)=>{
    const turtle=new Container();turtle.position.set(data[0]*w,data[1]*h);turtle.rotation=data[3];turtle.alpha=.78+i*.08;
    turtle.eventMode='static';turtle.cursor='pointer';turtle.on('pointertap',()=>focusCreature({kind:'turtles',view:turtle,name:i?'Juvenile Pond Turtle':'Pond Turtle',type:'REPTILE',text:i?'A young pond turtle uses its broad feet to paddle between sheltered areas, surfacing periodically to breathe and warm itself.':'Pond turtles are patient swimmers that alternate between slow underwater exploration and quiet periods near warm, sheltered edges.'}));
    const mesh=isCanvasRenderer?new Sprite(turtleTexture):new MeshPlane({texture:turtleTexture,verticesX:7,verticesY:9});const scale=data[2]/turtleTexture.width;
    mesh.scale.set(scale);mesh.position.set(-data[2]/2,-turtleTexture.height*scale/2);turtle.addChild(mesh);decorLayer.addChild(turtle);
    const buffer=isCanvasRenderer?null:mesh.geometry.getAttribute('aPosition').buffer;
    turtles.push({view:turtle,mesh,buffer,rest:buffer?new Float32Array(buffer.data):null,heading:turtle.rotation-Math.PI/2,speed:i ? .055 : .038,phase:i*2.8+Math.random(),turnSeed:Math.random()*9,strokeRate:i ? .0054 : .0038});
  });

  const addInspectable=(view,kind,name,type,text)=>{view.eventMode='static';view.cursor='pointer';view.on('pointertap',()=>focusCreature({kind,view,name,type,text}));};
  [[.47,.22],[.69,.61]].forEach((d,i)=>{
    const built=makeDragonfly(),view=built.root;view.position.set(w*d[0],h*d[1]);view.rotation=i?2.2:-.6;view.alpha=.88;aerialLayer.addChild(view);
    addInspectable(view,'dragonflies','Pond Dragonfly','AERIAL INSECT','An agile aerial predator, the dragonfly patrols above the water, hovering almost motionless before accelerating into a sudden dart.');
    const heading=view.rotation-Math.PI/2;
    dragonflies.push({view,wings:built.wings,phase:i*3.1,heading,targetX:view.x+Math.cos(heading)*360,targetY:view.y+Math.sin(heading)*360,timer:150+i*90,flightEnergy:0,touchTimer:520+i*310,touchProgress:-1,touchMade:false});
  });
  applyCreatureVisibility();
}

function applyCreatureVisibility(){
  fishLayer.visible=true;fish.forEach(k=>k.view.visible=creatureVisibility.koi);shadowLayer.visible=creatureVisibility.koi;
  turtles.forEach(t=>t.view.visible=creatureVisibility.turtles);
  frogs.forEach(f=>f.view.visible=creatureVisibility.frogs);
  dragonflies.forEach(v=>v.view.visible=creatureVisibility.dragonflies);
  if(focusedCreature&&!creatureVisibility[focusedCreature.kind])clearCreatureFocus(false);
}

const koiFacts={
  kohaku:'A classic white koi patterned with red. Kohaku are prized for clean skin, balanced markings, and an unbroken sense of movement.',
  sanke:'A white koi with red and black markings. Sanke combine the calm clarity of Kohaku with small accents of lacquer-black sumi.',
  showa:'A dramatic black-based koi wrapped in red and white. Showa patterns often change noticeably as the fish matures.',
  chagoi:'A tea-brown koi known for rapid growth and a famously calm, friendly temperament.',
  ochiba:'Its bronze markings resemble autumn leaves floating across a blue-grey body.',
  asagi:'One of the oldest koi varieties, recognized by blue net-like scales and warm red along the cheeks and fins.',
  shusui:'A mostly scaleless relative of Asagi with a bold line of dark dorsal scales.',
  tancho:'Named after the red-crowned crane, Tancho koi carry a single red marking on the head.'
};
function prettyBreed(name){return name.split('-').map(v=>v[0].toUpperCase()+v.slice(1)).join(' ');}
function focusCreature({kind,view,name,type,text,entity=null}){
  if(returningCreature)finishCreatureReturn();
  clearCreatureFocus(false);lastCreatureClick=performance.now();
  const parent=view.parent,index=parent?parent.getChildIndex(view):0;
  const bounds=view.getBounds(),zoom=Math.min(6,app.screen.width*.6/Math.max(1,bounds.width),app.screen.height*.6/Math.max(1,bounds.height));
  focusedCreature={kind,view,parent,index,name,type,text,entity,zoom,progress:0,snapshot:{x:view.x,y:view.y,rotation:view.rotation,scaleX:view.scale.x,scaleY:view.scale.y,alpha:view.alpha,shadowAlpha:entity?.shadow?.alpha}};
  if(entity?.shadow)entity.shadow.alpha=0;
  focusLayer.addChild(view);
  document.querySelector('#creatureInfoName').textContent=name;
  document.querySelector('#creatureInfoType').textContent=type;
  document.querySelector('#creatureInfoText').textContent=text;
  document.querySelector('#creatureInfo').hidden=false;
}
function finishCreatureReturn(){
  if(!returningCreature)return;
  const {view,parent,index,snapshot,entity}=returningCreature;
  if(view&&!view.destroyed){view.position.set(snapshot.x,snapshot.y);view.rotation=snapshot.rotation;view.scale.set(snapshot.scaleX,snapshot.scaleY);view.alpha=snapshot.alpha;}
  if(view&&!view.destroyed&&parent&&!parent.destroyed)parent.addChildAt(view,Math.min(index,parent.children.length));
  if(entity?.shadow)entity.shadow.alpha=snapshot.shadowAlpha;
  returningCreature=null;focusVeil.clear();
}
function clearCreatureFocus(animate=true){
  if(!focusedCreature){focusVeil.clear();document.querySelector('#creatureInfo').hidden=true;return;}
  const {view,parent,index,snapshot,entity}=focusedCreature;
  if(animate){
    returningCreature={view,parent,index,snapshot,entity,progress:0,from:{x:view.x,y:view.y,rotation:view.rotation,scaleX:view.scale.x,scaleY:view.scale.y,alpha:view.alpha}};
    focusedCreature=null;document.querySelector('#creatureInfo').hidden=true;return;
  }
  if(view&&!view.destroyed){view.position.set(snapshot.x,snapshot.y);view.rotation=snapshot.rotation;view.scale.set(snapshot.scaleX,snapshot.scaleY);view.alpha=snapshot.alpha;}
  if(view&&!view.destroyed&&parent&&!parent.destroyed)parent.addChildAt(view,Math.min(index,parent.children.length));
  if(entity?.shadow)entity.shadow.alpha=snapshot.shadowAlpha;
  focusedCreature=null;focusVeil.clear();document.querySelector('#creatureInfo').hidden=true;
}

function pondDistance(x,y,padding=0){
  const rx=Math.max(1,pondArea.rx-padding),ry=Math.max(1,pondArea.ry-padding);
  return Math.hypot((x-pondArea.cx)/rx,(y-pondArea.cy)/ry);
}
function insidePond(x,y,padding=0){return pondDistance(x,y,padding)<=1;}
function constrainToPond(x,y,padding=0){
  const rx=Math.max(1,pondArea.rx-padding),ry=Math.max(1,pondArea.ry-padding);
  const nx=(x-pondArea.cx)/rx,ny=(y-pondArea.cy)/ry,d=Math.hypot(nx,ny);
  if(d<=1)return{x,y};return{x:pondArea.cx+nx/d*rx,y:pondArea.cy+ny/d*ry};
}

const caustics = new Graphics();
waterLayer.addChild(caustics);
caustics.mask=pondMask;
const ambientLight = new Graphics();
lightingLayer.addChild(ambientLight);
const waterTint = new Graphics();
waterTintLayer.addChild(waterTint);
function redrawWaterTint(){
  waterTint.clear();
  if(!greenWaterEnabled)return;
  waterTint.ellipse(pondArea.cx,pondArea.cy,pondArea.rx,pondArea.ry).fill({color:0x66b8a4,alpha:.32});
  waterTint.blendMode='soft-light';
}
function redrawAmbientLight(){
  ambientLight.clear();
  // Broad transparent pools echo the warm sky reflection in the background.
  ambientLight.ellipse(pondArea.cx+pondArea.rx*.22,pondArea.cy-pondArea.ry*.22,pondArea.rx*.72,pondArea.ry*.54)
    .fill({color:0xffc88f,alpha:.055});
  ambientLight.ellipse(pondArea.cx-pondArea.rx*.28,pondArea.cy+pondArea.ry*.26,pondArea.rx*.58,pondArea.ry*.38)
    .fill({color:0xd89c86,alpha:.026});
  ambientLight.blendMode='screen';
}
function redrawCaustics() {
  caustics.clear();
  // Broad underwater light patches replace synthetic horizontal wave lines.
  for(let i=0;i<16;i++){
    const x=((i*193)%997)/997*app.screen.width,y=((i*347+91)%991)/991*app.screen.height;
    const rx=32+(i%5)*17,ry=10+(i%4)*6;
    caustics.ellipse(x,y,rx,ry).fill({color:0xb9cfaa,alpha:.008+(i%3)*.004});
  }
}

function makeKoiTextures(colors, seed) {
  const rand = mulberry32(seed); const body = new Graphics();
  body.moveTo(86,0).bezierCurveTo(67,-21,29,-32,-15,-31).bezierCurveTo(-51,-29,-72,-16,-80,0)
    .bezierCurveTo(-72,16,-51,29,-15,31).bezierCurveTo(29,32,67,21,86,0).fill(colors[0]);
  for(let i=0;i<4+Math.floor(rand()*2);i++){
    const px=-42+rand()*103, py=(rand()-.5)*23, rx=11+rand()*20, ry=8+rand()*11;
    body.ellipse(px,py,rx,ry).fill({color:rand()>.23?colors[1]:colors[2],alpha:.88});
  }
  body.moveTo(-52,-17).bezierCurveTo(-10,-28,45,-20,66,-8).stroke({width:4,color:0xfff5dc,alpha:.28});
  body.moveTo(-63,0).bezierCurveTo(-5,5,52,5,72,0).stroke({width:.7,color:0xfff3d2,alpha:.2});
  for(let px=-48;px<52;px+=13) for(let py=-13;py<=13;py+=10) body.arc(px,py,6,-1.1,1.1).stroke({width:.4,color:0xfff9df,alpha:.16});
  body.circle(63,-11,2.2).circle(63,11,2.2).fill(0x111716);
  body.circle(64,-11.5,.65).circle(64,10.5,.65).fill({color:0xffffe5,alpha:.8});
  body.arc(76,0,7,-.9,.9).stroke({width:.8,color:0x735147,alpha:.6});
  body.moveTo(73,-6).bezierCurveTo(89,-16,94,-13,99,-11).moveTo(73,6).bezierCurveTo(89,16,94,13,99,11).stroke({width:.7,color:0xf3dfbd,alpha:.68});

  const tail = new Graphics();
  tail.moveTo(5,0).bezierCurveTo(-13,-7,-27,-33,-48,-31).quadraticCurveTo(-38,-8,-25,0)
    .quadraticCurveTo(-38,8,-48,31).bezierCurveTo(-27,33,-13,7,5,0).fill({color:colors[1],alpha:.78});
  [-20,-7,7,20].forEach(y=>tail.moveTo(0,0).lineTo(-42,y).stroke({width:.55,color:0xffefd0,alpha:.3}));

  const fin = new Graphics();
  fin.moveTo(15,0).quadraticCurveTo(-3,-22,-27,-7).quadraticCurveTo(-5,-6,15,0).fill({color:colors[0],alpha:.5});
  return {
    body: app.renderer.generateTexture({target:body,resolution:1.5}),
    tail: app.renderer.generateTexture({target:tail,resolution:1.5}),
    fin: app.renderer.generateTexture({target:fin,resolution:1.5})
  };
}

const textureSets = palettes.map((p,i)=>makeKoiTextures(p, 1307+i*91));
const shadowTexture = (()=>{const g=new Graphics().ellipse(0,0,76,24).fill({color:0x001012,alpha:.48});return app.renderer.generateTexture({target:g,resolution:1})})();
startupLog('Generated runtime textures',{paletteSets:textureSets.length,shadow:[shadowTexture.width,shadowTexture.height]});
const shadowBlur = isCanvasRenderer?null:new BlurFilter({strength:5,quality:1});

class Koi {
  constructor(initial=false,breedIndex=fish.length%koiTextures.length) {
    const col=breedIndex%5,row=Math.floor(breedIndex/5);
    this.x=initial?app.screen.width*((col+.5)/5):app.screen.width*.72;
    this.y=initial?app.screen.height*((row+.5)/2):app.screen.height*.5;
    this.angle=Math.random()*Math.PI*2; this.speed=.45+Math.random()*.4; this.turn=0; this.seed=Math.random()*99;
    this.cruise=.32+Math.random()*.34;this.steering=.007+Math.random()*.008;
    this.waypoint={x:this.x,y:this.y};this.waypointTimer=0;this.pickWaypoint();
    this.mode=Math.random()>.45?'glide':'rest';this.behaviorTimer=90+Math.random()*240;
    this.swimPhase=Math.random()*Math.PI*2;this.strokeIntensity=this.mode==='rest'?.04:.18;this.wasFeeding=false;
    this.foodTarget=null;
    this.wakeTimer=70+Math.random()*120;
    this.depth=.08+Math.random()*.46;this.targetDepth=this.depth;this.depthTimer=180+Math.random()*420;this.wasNearSurface=this.depth<.12;
    const densityScale=Math.min(.52,Math.max(.3,Math.sqrt(app.screen.width*app.screen.height/960000)*.44));
    this.scale=densityScale*(.9+Math.random()*.18);
    this.breed=koiBreeds[breedIndex%koiBreeds.length];
    this.koiTexture=koiTextures[breedIndex%koiTextures.length];
    this.view=new Container(); this.view.position.set(this.x,this.y); this.view.rotation=this.angle;
    this.view.eventMode='static';this.view.cursor='pointer';
    this.view.on('pointertap',()=>focusCreature({kind:'koi',view:this.view,entity:this,name:prettyBreed(this.breed),type:'KOI VARIETY',text:koiFacts[this.breed]||`${prettyBreed(this.breed)} is a distinctive ornamental carp variety, selected over generations for its color, scale texture, and pattern.`}));
    this.body=isCanvasRenderer?new Sprite(this.koiTexture):new MeshPlane({texture:this.koiTexture,verticesX:14,verticesY:5});
    this.body.scale.set(205/this.koiTexture.width);
    this.body.position.set(-102.5,-this.koiTexture.height*(205/this.koiTexture.width)/2);
    this.bodyBuffer=isCanvasRenderer?null:this.body.geometry.getAttribute('aPosition').buffer;
    this.bodyRest=this.bodyBuffer?new Float32Array(this.bodyBuffer.data):null;
    this.baseBodyAlpha=.88+Math.random()*.1;this.body.alpha=this.baseBodyAlpha;
    this.view.addChild(this.body); this.view.scale.set(this.scale);
    this.shadow=new Sprite(shadowTexture);this.shadow.anchor.set(.5);this.shadow.alpha=.32;this.shadow.scale.set(this.scale*1.15);if(!isCanvasRenderer)this.shadow.filters=[shadowBlur];
    shadowLayer.addChild(this.shadow);fishLayer.addChild(this.view);
  }
  pickWaypoint(){
    const margin=Math.min(105,app.screen.width*.12);
    const heading=this.angle+(Math.random()-.5)*2.35;
    const distance=140+Math.random()*Math.min(430,app.screen.width*.42);
    this.waypoint.x=Math.max(margin,Math.min(app.screen.width-margin,this.x+Math.cos(heading)*distance));
    this.waypoint.y=Math.max(margin,Math.min(app.screen.height-margin,this.y+Math.sin(heading)*distance));
    this.waypointTimer=260+Math.random()*420;
  }
  update(delta,t) {
    if(this.foodTarget&&(!food.includes(this.foodTarget)||this.foodTarget.life<=0||this.foodTarget.state!=='float'))this.foodTarget=null;
    if(!this.foodTarget){
      const available=food.filter(f=>f.state==='float'&&!f.claimedBy);
      const candidates=available.length?available:food.filter(f=>f.state==='float');
      this.foodTarget=candidates.reduce((nearest,f)=>!nearest||Math.hypot(f.x-this.x,f.y-this.y)<Math.hypot(nearest.x-this.x,nearest.y-this.y)?f:nearest,null);
      if(this.foodTarget&&!this.foodTarget.claimedBy)this.foodTarget.claimedBy=this;
    }
    const target=this.foodTarget;
    if(target){this.targetDepth=.015;this.depthTimer=150;}
    else {
      this.depthTimer-=delta;
      if(this.depthTimer<=0){
        this.targetDepth=this.mode==='rest'?.3+Math.random()*.42:.08+Math.random()*.42;
        this.depthTimer=240+Math.random()*520;
      }
    }
    this.depth+=(this.targetDepth-this.depth)*.0065*delta;
    const nearSurface=this.depth<.11;
    if(nearSurface&&!this.wasNearSurface&&this.targetDepth<this.depth)addRipple(this.x,this.y,1.5,{intensity:.48,stretch:.4,speed:.5,life:62});
    this.wasNearSurface=nearSurface;
    let desiredStroke=.05;
    if(target){
      this.mode='feed';this.wasFeeding=true;desiredStroke=1;
      const distance=Math.hypot(target.x-this.x,target.y-this.y);
      const desired=Math.atan2(target.y-this.y,target.x-this.x);
      if(distance>28){
        this.angle+=angleDiff(desired,this.angle)*.022*delta;
        const approachSpeed=Math.min(.88,.2+distance/260);this.speed+=(approachSpeed-this.speed)*.03*delta;
      } else {
        // Hover over the chosen pellet and nibble instead of overshooting and circling it.
        this.angle+=angleDiff(desired,this.angle)*.008*delta;
        this.speed+=(.025-this.speed)*.075*delta;desiredStroke=.2;this.eat(target);
      }
    }
    else {
      if(this.wasFeeding){this.wasFeeding=false;this.mode='glide';this.behaviorTimer=100+Math.random()*150;}
      this.behaviorTimer-=delta;
      if(this.behaviorTimer<=0){
        if(this.mode==='cruise'){this.mode='glide';this.behaviorTimer=120+Math.random()*230;}
        else if(this.mode==='glide'&&Math.random()>.46){this.mode='rest';this.behaviorTimer=110+Math.random()*300;}
        else {this.mode='cruise';this.behaviorTimer=120+Math.random()*260;this.pickWaypoint();}
      }
      const distance=Math.hypot(this.waypoint.x-this.x,this.waypoint.y-this.y);
      if(this.mode==='cruise'){
        if(distance<48)this.pickWaypoint();
        const desired=Math.atan2(this.waypoint.y-this.y,this.waypoint.x-this.x);
        this.angle+=angleDiff(desired,this.angle)*this.steering*delta;
        this.angle+=Math.sin(t*.0007+this.seed)*.00022*delta;
        const arrival=Math.min(1,Math.max(.5,distance/180));this.speed+=(this.cruise*arrival-this.speed)*.018*delta;desiredStroke=.72;
      } else if(this.mode==='glide'){
        this.speed+=(.1+this.cruise*.14-this.speed)*.014*delta;desiredStroke=.12;
      } else {
        this.speed+=(.018-this.speed)*.022*delta;desiredStroke=.025;
      }
    }
    // Reciprocal separation keeps individual breeds readable instead of crossing through each other.
    let avoidX=0,avoidY=0,neighbors=0;
    for(const other of fish){
      if(other===this)continue;
      const dx=this.x-other.x,dy=this.y-other.y,d=Math.hypot(dx,dy);
      const personalSpace=78+(this.scale+other.scale)*34;
      if(d>0&&d<personalSpace){const force=(personalSpace-d)/personalSpace;avoidX+=dx/d*force;avoidY+=dy/d*force;neighbors++;}
    }
    if(neighbors){const avoidAngle=Math.atan2(avoidY,avoidX);this.angle+=angleDiff(avoidAngle,this.angle)*(target ? .018 : .055)*delta;this.speed+=(target ? .006 : .018)*delta;}
    const boundary=pondDistance(this.x,this.y,58);
    if(boundary>.86){const desired=Math.atan2(pondArea.cy-this.y,pondArea.cx-this.x);this.angle+=angleDiff(desired,this.angle)*(.012+Math.max(0,boundary-.86)*.08)*delta;}
    this.x+=Math.cos(this.angle)*this.speed*delta;this.y+=Math.sin(this.angle)*this.speed*delta;
    if(!insidePond(this.x,this.y,48)){const safe=constrainToPond(this.x,this.y,48);this.x=safe.x;this.y=safe.y;}
    this.strokeIntensity+=(desiredStroke-this.strokeIntensity)*.045*delta;
    this.swimPhase+=delta*(.018+this.strokeIntensity*.14);
    const phase=this.swimPhase;
    if(this.bodyBuffer){
      const verts=this.bodyBuffer.data,fishWidth=this.koiTexture.width,fishHeight=this.koiTexture.height;
      for(let i=0;i<verts.length;i+=2){
        const restX=this.bodyRest[i],restY=this.bodyRest[i+1],u=restX/fishWidth;
        // Preserve the head and shoulders; progressively flex only the rear body.
        const influence=Math.pow(Math.max(0,(.76-u)/.76),2.15);
        const amplitude=58*influence*(.72+this.speed*.3)*(.12+this.strokeIntensity*.88);
        const wave=Math.sin(phase-u*3.1),sliceAngle=Math.cos(phase-u*3.1)*influence*.13*(.12+this.strokeIntensity*.88);
        const localY=restY-fishHeight*.5;
        // Rotate each slice about the spine so both dorsal and ventral edges participate.
        verts[i]=restX-localY*Math.sin(sliceAngle);
        verts[i+1]=fishHeight*.5+localY*Math.cos(sliceAngle)+wave*amplitude;
      }
      this.bodyBuffer.update();
    }else{
      // Canvas fallback: retain a subtle whole-body sway without mesh bending.
      this.body.rotation=Math.sin(phase)*.025*(.2+this.strokeIntensity);
    }
    this.wakeTimer-=delta;
    if(this.mode!=='rest'&&this.depth<.24&&this.speed>.095&&this.strokeIntensity>.075&&this.wakeTimer<=0&&t-lastWakeAt>(greenWaterEnabled?190:260)){
      const tailOffset=48*this.scale;
      addFishWake(this.x-Math.cos(this.angle)*tailOffset,this.y-Math.sin(this.angle)*tailOffset,this.angle,.14);
      this.wakeTimer=110+Math.random()*135;lastWakeAt=t;
    }
    const visibleDepth=this.depth*(waterMotionEnhanced?1:.68);
    const depthScale=this.scale*(1-visibleDepth*.19);
    this.view.position.set(this.x,this.y);this.view.rotation=this.angle;this.view.scale.set(depthScale);
    this.body.alpha=this.baseBodyAlpha*(1-visibleDepth*.28);this.body.tint=blendColor(0xffffff,0x4d8f89,visibleDepth*.72);
    this.shadow.position.set(this.x+5+visibleDepth*5,this.y+8+visibleDepth*7);this.shadow.rotation=this.angle;
    this.shadow.alpha=.32*(1-visibleDepth*.82);this.shadow.scale.set(depthScale*1.15*(1+visibleDepth*.1));
  }
  eat(target){target.life-=.035;if(target.life<=0){target.claimedBy=null;this.foodTarget=null;}if(Math.random()<.045)addRipple(this.x,this.y,1,{intensity:.04});}
}

function addKoi(initial=false,breedIndex=fish.length){if(fish.length<20)fish.push(new Koi(initial,breedIndex));}
function removeKoi(){const koi=fish.pop();if(!koi)return;if(koi.foodTarget)koi.foodTarget.claimedBy=null;koi.view.destroy({children:true});koi.shadow.destroy();}
function setKoiCount(count){
  const target=Math.max(1,Math.min(20,Math.round(count)));
  while(fish.length<target)addKoi(false,fish.length);
  while(fish.length>target)removeKoi();
  syncKoiControls();
}
function syncKoiControls(){
  const count=fish.length;document.querySelector('#fishCount').value=count;document.querySelector('#fishRange').value=count;
  document.querySelector('#removeFish').disabled=count<=1;document.querySelector('#addFish').disabled=count>=20;
}
function angleDiff(a,b){return Math.atan2(Math.sin(a-b),Math.cos(a-b));}
function blendColor(from,to,amount){
  const a=Math.max(0,Math.min(1,amount)),fr=from>>16,fg=from>>8&255,fb=from&255,tr=to>>16,tg=to>>8&255,tb=to&255;
  return ((fr+(tr-fr)*a)<<16)|((fg+(tg-fg)*a)<<8)|(fb+(tb-fb)*a);
}
function mulberry32(a){return()=>{let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}

function addFishWake(x,y,angle,intensity){
  if(!waterMotionEnhanced)return;
  disturbWater(x,y,intensity*.12,7,angle+Math.PI);
  if(fishWakes.length>16)return;
  const view=new Graphics();view.position.set(x,y);view.rotation=angle;surfaceLayer.addChild(view);
  fishWakes.push({view,age:0,life:22+Math.random()*7,intensity,phase:Math.random()*Math.PI*2});
}
function drawFishWake(w){
  const g=w.view,p=w.age/w.life,fade=Math.pow(1-p,1.7)*w.intensity;
  const length=10+w.age*.42,width=2+w.age*.13,wobble=Math.sin(w.age*.13+w.phase)*.9;
  const dark=waveContrastEnabled?0x075448:0x173f3b,light=waveContrastEnabled?0x8dc8b5:0xb3c9bc;
  g.clear();
  // Two gently diverging shoulders follow the direction of travel; unlike an
  // impact ripple they never close into a circle.
  g.moveTo(-2,wobble).bezierCurveTo(-length*.28,-width*.18,-length*.62,-width*.72,-length,-width)
    .stroke({width:1,color:dark,alpha:fade*.42});
  g.moveTo(-2,wobble).bezierCurveTo(-length*.28,width*.18,-length*.62,width*.72,-length,width)
    .stroke({width:1,color:dark,alpha:fade*.42});
  g.moveTo(-5,wobble-.4).bezierCurveTo(-length*.3,-width*.11,-length*.62,-width*.52,-length*.9,-width*.72)
    .stroke({width:.55,color:light,alpha:fade*.34});
  g.moveTo(-5,wobble+.4).bezierCurveTo(-length*.3,width*.11,-length*.62,width*.52,-length*.9,width*.72)
    .stroke({width:.55,color:light,alpha:fade*.34});
}

function addRipple(x,y,start=2,options={}){
  const impact=options.intensity??.9;
  disturbWater(x,y,-impact*(options.refract?4.5:1.8),12+start*2.4);
}

function drawRipple(r){
  const g=r.view,t=r.age;g.clear();
  const troughColor=greenWaterEnabled?0x074f43:0x021719;
  const crestColor=greenWaterEnabled?0x79b6a3:0xd1e4d8;
  const contrast=greenWaterEnabled?1.85:1;
  // A momentary depression in the surface as the food touches down.
  if(t<15){
    const p=t/15,a=Math.sin(p*Math.PI)*.13*r.intensity*contrast,rad=2+p*7;
    g.ellipse(0,1,rad,rad*r.stretch).fill({color:troughColor,alpha:a});
    g.ellipse(0,-.4,rad*.72,rad*r.stretch*.72).stroke({width:.55,color:crestColor,alpha:a*.48});
  }
  // Each delayed wave has a shaded underside and a soft reflective leading edge.
  const delays=[0,9,21,36];
  delays.forEach((delay,i)=>{
    const local=t-delay;if(local<=0)return;
    const progress=Math.min(1,local/(r.life-delay));
    const fade=Math.pow(1-progress,1.55)*Math.min(1,local/7)*r.intensity;
    const radius=r.start+local*r.speed*(1-i*.035);
    const wobble=Math.sin(local*.13+r.phase+i)*.7;
    g.ellipse(wobble,1.25,radius,radius*r.stretch).stroke({width:greenWaterEnabled?1.55:1.15,color:troughColor,alpha:fade*.19*contrast});
    g.ellipse(-wobble,-.55,radius,radius*r.stretch).stroke({width:.6,color:crestColor,alpha:fade*.32*(greenWaterEnabled?1.2:1)});
  });
}
function feed(x,y){
  if(!insidePond(x,y,8))return;
  // Small textured pellets settle one by one within the disturbed patch of water.
  for(let i=0;i<Math.max(12,Math.min(20,fish.length));i++){
    const angle=Math.random()*Math.PI*2,distance=5+Math.random()*24;
    const px=x+Math.cos(angle)*distance,py=y+Math.sin(angle)*distance*.62;
    const pellet=new Sprite(pelletTextures[Math.floor(Math.random()*pelletTextures.length)]);
    const pelletScale=.023+Math.random()*.009;
    pellet.anchor.set(.5);pellet.position.set(px,py);pellet.scale.set(pelletScale);pellet.alpha=0;pellet.rotation=Math.random()*Math.PI;
    surfaceLayer.addChild(pellet);
    food.push({view:pellet,x:px,y:py,state:'settling',life:2.4+Math.random()*.7,age:0,delay:i*.8+Math.random()*3,bob:Math.random()*7,scale:pelletScale,claimedBy:null});
  }
  addRipple(x,y,1.2,{intensity:.12});
  document.querySelector('#hint').style.opacity='0';if(audioOn)plink();
}

canvas.addEventListener('pointerup',e=>{if(performance.now()-lastCreatureClick>140)feed(e.clientX,e.clientY)});
document.querySelector('#addFish').addEventListener('click',e=>{e.stopPropagation();setKoiCount(fish.length+1)});
document.querySelector('#removeFish').addEventListener('click',e=>{e.stopPropagation();setKoiCount(fish.length-1)});
document.querySelector('#fishRange').addEventListener('input',e=>setKoiCount(Number(e.target.value)));
document.querySelector('#waterMotionButton').addEventListener('click',e=>{
  waterMotionEnhanced=!waterMotionEnhanced;e.currentTarget.setAttribute('aria-pressed',waterMotionEnhanced);
  fishRefraction.scale.set(waterMotionEnhanced?5.8:0,waterMotionEnhanced?4.1:0);
  animalRefraction.scale.set(waterMotionEnhanced?3.4:0,waterMotionEnhanced?2.5:0);
  radialRefraction.scale.set(waterMotionEnhanced?58:0,waterMotionEnhanced?48:0);
  waterShadeSprite.visible=waterMotionEnhanced;
  if(!waterMotionEnhanced)clearWaterMotion();
});
document.querySelector('#waterColorButton').addEventListener('click',e=>{
  greenWaterEnabled=!greenWaterEnabled;e.currentTarget.setAttribute('aria-pressed',greenWaterEnabled);
  redrawWaterTint();
});
document.querySelector('#waveContrastButton').addEventListener('click',e=>{
  waveContrastEnabled=!waveContrastEnabled;e.currentTarget.setAttribute('aria-pressed',waveContrastEnabled);
  waterShadeSprite.alpha=waveContrastEnabled?.68:.46;
});
const creatureDialog=document.querySelector('#creatureDialog');
document.querySelector('#creatureButton').addEventListener('click',()=>creatureDialog.showModal());
creatureDialog.querySelectorAll('[data-creature]').forEach(input=>input.addEventListener('change',()=>{
  creatureVisibility[input.dataset.creature]=input.checked;applyCreatureVisibility();
}));
creatureDialog.addEventListener('click',e=>{if(e.target===creatureDialog)creatureDialog.close();});
document.querySelector('#creatureInfoClose').addEventListener('click',clearCreatureFocus);
document.querySelector('#soundButton').addEventListener('click',e=>{audioOn=!audioOn;e.currentTarget.setAttribute('aria-pressed',audioOn);if(audioOn){audioCtx=new(window.AudioContext||window.webkitAudioContext)();plink()}});
function plink(){if(!audioCtx)return;const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='sine';o.frequency.setValueAtTime(520+Math.random()*120,audioCtx.currentTime);o.frequency.exponentialRampToValueAtTime(250,audioCtx.currentTime+.7);g.gain.setValueAtTime(.045,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.7);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.7)}

// Complete registered drawings are crossfaded with uneven holds, giving the
// sip anticipation, contact, and recovery instead of a mechanical GIF loop.
const watcherFrames=[...document.querySelectorAll('.watcher-frame')];
const watcherRoot=document.querySelector('.pond-watcher');
const characterToggle=document.querySelector('#characterToggle');
characterToggle?.addEventListener('click',()=>{
  const next=watcherRoot.dataset.character==='boy'?'girl':'boy';
  watcherRoot.dataset.character=next;
  watcherRoot.setAttribute('aria-label',`A ${next} sitting beside the koi pond and drinking bubble tea`);
  characterToggle.querySelector('strong').textContent=next.toUpperCase();
  characterToggle.setAttribute('aria-label',`Switch to ${next==='boy'?'girl':'boy'} character`);
});
const watcherCycle=[
  {frame:0,hold:3400,fade:130,rest:true},
  {frame:1,hold:210,fade:115},
  {frame:2,hold:270,fade:105},
  {frame:3,hold:1050,fade:130},
  {frame:4,hold:290,fade:120},
  {frame:5,hold:390,fade:135},
  {frame:0,hold:2800,fade:150,rest:true}
];
let watcherStep=0;
function advanceWatcher(){
  if(!watcherFrames.length)return;
  const pose=watcherCycle[watcherStep];
  watcherRoot?.classList.toggle('is-sipping',!pose.rest);
  watcherRoot?.style.setProperty('--pose-fade',`${pose.fade}ms`);
  watcherFrames.forEach((frame,i)=>frame.classList.toggle('is-active',i===pose.frame));
  watcherStep=(watcherStep+1)%watcherCycle.length;
  const humanPause=pose.rest&&pose.frame===0?Math.random()*1100:0;
  setTimeout(advanceWatcher,document.hidden?1000:pose.hold+humanPause);
}
advanceWatcher();

startupLog('Creating initial koi');
for(let i=0;i<10;i++)addKoi(true,i);syncKoiControls();
startupLog('Initial koi created',{count:fish.length});
function layout(){
  startupLog('Layout started',{screen:[app.screen.width,app.screen.height]});
  const cover=Math.max(app.screen.width/pondWaterTexture.width,app.screen.height/pondWaterTexture.height);
  water.scale.set(cover);water.position.set(app.screen.width/2,app.screen.height/2);
  refractedWater.scale.set(cover);refractedWater.position.copyFrom(water.position);
  rippleMapSprite.width=app.screen.width;rippleMapSprite.height=app.screen.height;
  waterShadeSprite.width=app.screen.width;waterShadeSprite.height=app.screen.height;
  // Keep the simulation in the uninterrupted water, not merely inside the
  // image's broad oval. The larger inset on the left/top clears the irregular
  // planted shoreline and also leaves room for a koi's head and tail.
  pondArea.cx=water.x+pondWaterTexture.width*cover*.005;
  pondArea.cy=water.y-pondWaterTexture.height*cover*.010;
  pondArea.rx=pondWaterTexture.width*cover*.365;
  pondArea.ry=pondWaterTexture.height*cover*.355;
  const waterLeft=water.x-pondWaterTexture.width*cover/2,waterTop=water.y-pondWaterTexture.height*cover/2;
  pondOutline=pondOutlineNormalized.flatMap(([nx,ny])=>[waterLeft+nx*pondWaterTexture.width*cover,waterTop+ny*pondWaterTexture.height*cover]);
  const sw=rippleMapCanvas.width,sh=rippleMapCanvas.height;
  for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){
    const i=y*sw+x,edge=pondDistance(x/sw*app.screen.width,y/sh*app.screen.height);
    if(edge>=1){waterDamping[i]=0;continue;}
    const shoreAbsorption=Math.max(0,(edge-.72)/.28);
    waterDamping[i]=.925-shoreAbsorption*.11;
  }
  displacementMap.position.set(app.screen.width/2,app.screen.height/2);
  displacementMap.width=app.screen.width+120;displacementMap.height=app.screen.height+120;
  pondMask.clear().ellipse(pondArea.cx,pondArea.cy,pondArea.rx,pondArea.ry).fill(0xffffff);
  redrawCaustics();redrawAmbientLight();redrawWaterTint();buildPondDecor();
  startupLog('Layout completed',{pondArea:{...pondArea},fish:fish.length,turtles:turtles.length,frogs:frogs.length,dragonflies:dragonflies.length});
}
layout();window.addEventListener('resize',layout);
document.addEventListener('visibilitychange',()=>document.hidden?app.ticker.stop():app.ticker.start());

let firstRenderedFrame=false;
app.ticker.add(ticker=>{
  if(!firstRenderedFrame){
    firstRenderedFrame=true;
    startupLog('First animation frame rendered',{
      renderer:isCanvasRenderer?'canvas':'webgl',
      stageChildren:app.stage.children.length,
      fish:fish.length
    });
    console.info('[KOI STARTUP COMPLETE] Pond initialized successfully.');
  }
  const delta=Math.min(ticker.deltaTime,2),now=performance.now();
  if(focusedCreature){
    focusedCreature.progress+=(1-focusedCreature.progress)*.09*delta;
    const v=focusedCreature.view,s=focusedCreature.snapshot,appear=focusedCreature.progress;
    const targetX=app.screen.width*.5,targetY=app.screen.height*.5,zoom=focusedCreature.zoom;
    v.position.set(s.x+(targetX-s.x)*appear,s.y+(targetY-s.y)*appear);
    v.rotation=s.rotation+angleDiff(0,s.rotation)*appear;
    v.scale.set(s.scaleX*(1+(zoom-1)*appear),s.scaleY*(1+(zoom-1)*appear));v.alpha=s.alpha+(1-s.alpha)*appear;
    focusVeil.clear().rect(0,0,app.screen.width,app.screen.height).fill({color:0x071614,alpha:.22*appear});
  }
  if(returningCreature){
    const r=returningCreature,s=r.snapshot,from=r.from;r.progress=Math.min(1,r.progress+delta/34);
    const p=r.progress,ease=p*p*(3-2*p),arc=Math.sin(p*Math.PI);
    r.view.position.set(from.x+(s.x-from.x)*ease,from.y+(s.y-from.y)*ease-arc*Math.min(90,app.screen.height*.1));
    r.view.rotation=from.rotation+angleDiff(s.rotation,from.rotation)*ease+arc*.22;
    r.view.scale.set(from.scaleX+(s.scaleX-from.scaleX)*ease,from.scaleY+(s.scaleY-from.scaleY)*ease);
    r.view.alpha=from.alpha+(s.alpha-from.alpha)*ease;
    focusVeil.clear().rect(0,0,app.screen.width,app.screen.height).fill({color:0x071614,alpha:.22*(1-ease)});
    if(p>=1){const splashX=s.x,splashY=s.y;finishCreatureReturn();addRipple(splashX,splashY,1,{intensity:.16});}
  }
  physicsFrame++;
  if((waterEnergy>.002||physicsFrame<3)&&physicsFrame%2===0)updateRippleRefraction();
  const windActive=false;
  displacementMap.x=app.screen.width/2+Math.sin(now*.000075)*24;
  displacementMap.y=app.screen.height/2+Math.cos(now*.000061)*18;
  displacementMap.rotation=Math.sin(now*.000043)*.012;
  floaters.forEach(f=>{
    f.view.y=f.baseY+Math.sin(now*.00062+f.phase)*f.amount;
    f.view.rotation=f.baseRotation+Math.sin(now*.00041+f.phase)*.009;
  });
  if(creatureVisibility.koi)fish.forEach(k=>{if(focusedCreature?.view!==k.view&&returningCreature?.view!==k.view)k.update(delta,now)});
  if(creatureVisibility.turtles)turtles.forEach((t,i)=>{
    if(focusedCreature?.view===t.view||returningCreature?.view===t.view)return;
    t.heading+=Math.sin(now*.00023+t.turnSeed)*.00045*delta;
    if(pondDistance(t.view.x,t.view.y,42)>.84){const home=Math.atan2(pondArea.cy-t.view.y,pondArea.cx-t.view.x);t.heading+=angleDiff(home,t.heading)*.018*delta;}
    t.view.x+=Math.cos(t.heading)*t.speed*delta;t.view.y+=Math.sin(t.heading)*t.speed*delta;
    if(!insidePond(t.view.x,t.view.y,35)){const safe=constrainToPond(t.view.x,t.view.y,35);t.view.position.set(safe.x,safe.y);}
    t.view.rotation=t.heading+Math.PI/2+Math.sin(now*.0008+t.phase)*.025;
    const paddle=Math.sin(now*t.strokeRate+t.phase);
    if(t.buffer){
      const verts=t.buffer.data,tw=turtleTexture.width,th=turtleTexture.height;
      for(let n=0;n<verts.length;n+=2){
        const rx=t.rest[n],ry=t.rest[n+1],u=rx/tw,v=ry/th,side=u<.5?-1:1;
        const edge=Math.max(0,1-Math.abs(u-.5)/.5);
        const limbEdge=1-edge;
        const front=Math.max(0,1-Math.abs(v-.27)/.17),rear=Math.max(0,1-Math.abs(v-.78)/.16);
        const limbMask=Math.max(front,rear)*limbEdge;
        const opposing=front>rear?side:-side;
        verts[n]=rx+side*Math.abs(paddle)*15*limbMask;
        verts[n+1]=ry+paddle*opposing*34*limbMask;
      }
      t.buffer.update();
    }else{
      t.mesh.rotation=paddle*.018;
    }
  });
  if(creatureVisibility.frogs)frogs.forEach(f=>{
    if(focusedCreature?.view===f.view||returningCreature?.view===f.view)return;
    f.timer-=delta;
    if(f.mode==='rest'){
      const breath=Math.sin(now*.0018+f.phase);f.view.scale.x=f.baseScaleX*(1+breath*.012);f.view.scale.y=f.baseScaleY*(1-breath*.007);
      if(f.timer<=0){f.mode='hop';f.progress=0;f.fromX=f.view.x;f.fromY=f.view.y;const a=Math.random()*Math.PI*2,d=18+Math.random()*22,target=constrainToPond(f.homeX+Math.cos(a)*d,f.homeY+Math.sin(a)*d,28);f.toX=target.x;f.toY=target.y;f.view.rotation=Math.atan2(f.toY-f.fromY,f.toX-f.fromX)+Math.PI/2;}
    } else {
      f.progress+=delta/f.duration;const p=Math.min(1,f.progress),ease=p*p*(3-2*p),lift=Math.sin(p*Math.PI);
      f.view.x=f.fromX+(f.toX-f.fromX)*ease;f.view.y=f.fromY+(f.toY-f.fromY)*ease-lift*13;
      f.view.scale.x=f.baseScaleX*(1+lift*.1);f.view.scale.y=f.baseScaleY*(1-lift*.07);
      if(p>=1){f.mode='rest';f.timer=320+Math.random()*620;f.homeX=f.view.x;f.homeY=f.view.y;addRipple(f.view.x,f.view.y,2);}
    }
  });
  if(creatureVisibility.dragonflies)dragonflies.forEach(d=>{
    if(focusedCreature?.view===d.view||returningCreature?.view===d.view)return;
    d.timer-=delta;d.touchTimer-=delta;
    // Pick long forward waypoints rather than nearby random points. This
    // produces patrol-like flight with mild corrections instead of circling.
    if(d.timer<=0||Math.hypot(d.targetX-d.view.x,d.targetY-d.view.y)<45){
      const correction=(Math.random()-.5)*.7;
      d.heading+=correction;
      const travel=Math.max(app.screen.width,app.screen.height)*(.65+Math.random()*.35);
      d.targetX=d.view.x+Math.cos(d.heading)*travel;
      d.targetY=d.view.y+Math.sin(d.heading)*travel;
      d.timer=220+Math.random()*260;
    }
    // Flying insects may leave the pond and even the viewport. Guide them
    // gently back only after they clear the screen, never at the waterline.
    const margin=120;
    if(d.view.x<-margin||d.view.x>app.screen.width+margin||d.view.y<-margin||d.view.y>app.screen.height+margin){
      d.targetX=app.screen.width*(.25+Math.random()*.5);d.targetY=app.screen.height*(.2+Math.random()*.6);d.timer=260;
    }
    const desired=Math.atan2(d.targetY-d.view.y,d.targetX-d.view.x);d.heading+=angleDiff(desired,d.heading)*.06*delta;
    const dist=Math.hypot(d.targetX-d.view.x,d.targetY-d.view.y),speed=Math.min(1.18,.32+dist*.008);
    d.view.x+=Math.cos(d.heading)*speed*delta;d.view.y+=Math.sin(d.heading)*speed*delta;d.view.rotation=d.heading+Math.PI/2;
    if(d.touchProgress<0&&d.touchTimer<=0&&insidePond(d.view.x,d.view.y,20)){
      d.touchProgress=0;d.touchMade=false;d.touchTimer=680+Math.random()*620;
    }
    if(d.touchProgress>=0){
      d.touchProgress+=delta/48;
      const dip=Math.sin(Math.min(1,d.touchProgress)*Math.PI);
      d.view.scale.set(1-dip*.18);d.view.alpha=.88-dip*.1;
      if(!d.touchMade&&d.touchProgress>=.48){
        disturbWater(d.view.x,d.view.y,.035,7,d.heading);d.touchMade=true;
      }
      if(d.touchProgress>=1){d.touchProgress=-1;d.view.scale.set(1);d.view.alpha=.88;}
    }
    d.flightEnergy+=(Math.min(1,speed/.55)-d.flightEnergy)*.12*delta;
    const beat=now*(.025+d.flightEnergy*.035)+d.phase;
    d.wings.forEach((wing,wi)=>{
      const flap=Math.abs(Math.sin(beat+wing.phase));
      wing.view.scale.y=wing.baseY*(.16+flap*.84);
      wing.view.scale.x=wing.baseX*(1+(1-flap)*.045);
      wing.view.rotation=wing.side*(.025+Math.sin(beat+wing.phase)*.055);
      wing.view.alpha=.48+flap*.38;
    });
    d.view.y+=Math.sin(now*.004+d.phase)*.025*delta;
  });
  caustics.alpha=.62+Math.sin(now*.0005)*.18+(windActive?.12:0);
  caustics.x=Math.sin(now*.00017)*9+(windActive?Math.sin(now*.003)*4:0);caustics.y=Math.cos(now*.00013)*5;
  caustics.scale.set(1+Math.sin(now*.00011)*.006,1+Math.cos(now*.00009)*.009);
  for(let i=food.length-1;i>=0;i--){
    const f=food[i];f.age+=delta;
    if(f.state==='settling'){
      if(f.age<f.delay)continue;
      const p=Math.min(1,(f.age-f.delay)/7);f.view.alpha=p*.86;f.view.scale.set(f.scale*(.6+p*.4));
      if(p>=1){f.state='float';addRipple(f.x,f.y,.45,{intensity:.025});}
    } else {
      f.life-=.0014*delta;f.x+=Math.sin(now*.0008+f.bob)*.008*delta;f.y+=.006*delta;
      if(f.view){f.view.position.set(f.x,f.y);f.view.alpha=Math.min(.86,Math.max(0,f.life));}
      if(f.life<=0){if(f.view)f.view.destroy();food.splice(i,1)}
    }
  }
  for(let i=fishWakes.length-1;i>=0;i--){
    const wake=fishWakes[i];wake.age+=delta;drawFishWake(wake);
    if(wake.age>=wake.life){wake.view.destroy();fishWakes.splice(i,1);}
  }
  for(let i=ripples.length-1;i>=0;i--){
    const r=ripples[i];r.age+=delta;drawRipple(r);
    if(r.age>=r.life){r.view.destroy();ripples.splice(i,1)}
  }
});
