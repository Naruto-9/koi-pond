import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root=path.resolve(import.meta.dirname,'..');
const assetsDir=path.join(root,'assets');
const atlasDir=path.join(assetsDir,'atlases');
const maxSize=4096;
const padding=2;

const groups=[
  {name:'backgrounds',match:/^(?:pond-water.*|koi-garden-splash.*)\.webp$/},
  {name:'character-sheets',match:/^(?:rabbit-sheet-clean|pond-(?:boy|girl)-(?:sip-sheet-aligned|rain-sheet|tent-sheet-aligned))\.webp$/},
  {name:'daily-characters',match:/^pond-(?:boy|girl)-(?:exercise|reading)-sheet\.webp$/},
  {name:'ui-art',match:/^(?:koi-tancho-cropped|pellet-1|food-.+|.+-artwork)\.webp$/}
];

function pack(files){
  const pages=[];
  for(const file of [...files].sort((a,b)=>b.height-a.height||b.width-a.width)){
    let target=null;
    for(const page of pages){
      let x=page.x,y=page.y,rowHeight=page.rowHeight;
      if(x+file.width>maxSize){x=0;y+=rowHeight+padding;rowHeight=0;}
      if(y+file.height<=maxSize){target={page,x,y,rowHeight};break;}
    }
    if(!target){
      if(file.width>maxSize||file.height>maxSize)throw new Error(`${file.name} exceeds ${maxSize}px`);
      const page={x:0,y:0,rowHeight:0,width:0,height:0,files:[]};
      pages.push(page);target={page,x:0,y:0,rowHeight:0};
    }
    const {page,x,y}=target;
    page.x=x+file.width+padding;page.y=y;
    page.rowHeight=Math.max(target.rowHeight,file.height);
    page.width=Math.max(page.width,x+file.width);
    page.height=Math.max(page.height,y+file.height);
    page.files.push({...file,x,y});
  }
  return pages;
}

await fs.mkdir(atlasDir,{recursive:true});
const loose=(await fs.readdir(assetsDir)).filter(name=>name.endsWith('.webp'));
for(const group of groups){
  const names=loose.filter(name=>group.match.test(name));
  const files=await Promise.all(names.map(async name=>{
    const input=path.join(assetsDir,name);
    const {width,height}=await sharp(input).metadata();
    return {name,input,width,height};
  }));
  if(!files.length)continue;
  const pages=pack(files);
  const manifest={version:1,pages:[],frames:{}};
  for(const [index,page] of pages.entries()){
    const pageName=`${group.name}${pages.length>1?`-${index+1}`:''}.webp`;
    await sharp({create:{width:page.width,height:page.height,channels:4,background:'#00000000'}})
      .composite(page.files.map(file=>({input:file.input,left:file.x,top:file.y})))
      .webp({quality:90,alphaQuality:100,effort:6})
      .toFile(path.join(atlasDir,pageName));
    manifest.pages.push(pageName);
    for(const file of page.files)manifest.frames[file.name]={page:pageName,x:file.x,y:file.y,width:file.width,height:file.height};
  }
  await fs.writeFile(path.join(atlasDir,`${group.name}.json`),`${JSON.stringify(manifest,null,2)}\n`);
  console.log(`${group.name}: ${files.length} images -> ${pages.length} page(s)`);
}
