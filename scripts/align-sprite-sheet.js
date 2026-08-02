import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';

const argumentsList=process.argv.slice(2);
const groundOptionIndex=argumentsList.indexOf('--ground-y');
const configuredGroundY=groundOptionIndex>=0?Number(argumentsList.splice(groundOptionIndex,2)[1]):490;
const files=argumentsList;
if(!files.length)throw new Error('Pass one or more 3x2 sprite sheet paths');

const cellSize=512;
const anchorX=256;
const groundY=configuredGroundY;
if(!Number.isFinite(groundY)||groundY<1||groundY>cellSize)throw new Error('Invalid --ground-y value');

function alphaBounds(data,width,height,channels){
  let left=width,top=height,right=-1,bottom=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    if(data[(y*width+x)*channels+channels-1]===0)continue;
    left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
  }
  if(right<0)throw new Error('Sprite cell is empty');
  return {left,top,right:right+1,bottom:bottom+1};
}

for(const filename of files){
  const input=path.resolve(filename);
  const inputBuffer=await fs.readFile(input);
  let source=sharp(inputBuffer).ensureAlpha();
  const metadata=await source.metadata();
  if(metadata.width!==cellSize*3||metadata.height!==cellSize*2){
    const closeToTarget=Math.abs(metadata.width-cellSize*3)<=16&&Math.abs(metadata.height-cellSize*2)<=16;
    if(!closeToTarget)throw new Error(`${filename} must be 1536x1024`);
    source=source.resize(cellSize*3,cellSize*2,{fit:'fill'});
  }
  const width=cellSize*3,height=cellSize*2;
  const sourceBuffer=await source.png().toBuffer();
  const frames=[];
  for(let row=0;row<2;row++)for(let column=0;column<3;column++){
    const frame=sharp(sourceBuffer).extract({left:column*cellSize,top:row*cellSize,width:cellSize,height:cellSize});
    const {data,info}=await frame.clone().raw().toBuffer({resolveWithObject:true});
    const bounds=alphaBounds(data,info.width,info.height,info.channels);
    const dx=Math.round(anchorX-(bounds.left+bounds.right)/2);
    const dy=groundY-bounds.bottom;
    const trimmed=await frame.clone().extract({
      left:bounds.left,top:bounds.top,width:bounds.right-bounds.left,height:bounds.bottom-bounds.top
    }).png().toBuffer();
    frames.push({input:trimmed,left:column*cellSize+bounds.left+dx,top:row*cellSize+bounds.top+dy});
  }
  const output=await sharp({create:{width,height,channels:4,background:'#00000000'}})
    .composite(frames)
    .webp({quality:92,alphaQuality:100,effort:6})
    .toBuffer();
  await fs.writeFile(input,output);
  console.log(`Aligned ${filename}`);
}
