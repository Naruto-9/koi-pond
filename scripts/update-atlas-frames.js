import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [manifestArgument,...replacementArguments]=process.argv.slice(2);
if(!manifestArgument||!replacementArguments.length){
  throw new Error('Usage: node scripts/update-atlas-frames.js <manifest.json> <frame-name>=<replacement.webp> [...]');
}

const manifestPath=path.resolve(manifestArgument);
const atlasDir=path.dirname(manifestPath);
const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
const replacements=new Map(replacementArguments.map(argument=>{
  const separator=argument.indexOf('=');
  if(separator<1)throw new Error(`Invalid replacement: ${argument}`);
  return [argument.slice(0,separator),path.resolve(argument.slice(separator+1))];
}));
for(const name of replacements.keys())if(!manifest.frames[name])throw new Error(`Unknown atlas frame: ${name}`);

const pageBuffers=new Map(await Promise.all(manifest.pages.map(async page=>[
  page,await fs.readFile(path.join(atlasDir,page))
])));

for(const pageName of manifest.pages){
  const pageBuffer=pageBuffers.get(pageName);
  const metadata=await sharp(pageBuffer).metadata();
  const composites=[];
  for(const [name,frame] of Object.entries(manifest.frames)){
    if(frame.page!==pageName)continue;
    const input=replacements.has(name)
      ? await sharp(replacements.get(name)).resize(frame.width,frame.height,{fit:'fill'}).png().toBuffer()
      : await sharp(pageBuffers.get(frame.page)).extract({left:frame.x,top:frame.y,width:frame.width,height:frame.height}).png().toBuffer();
    composites.push({input,left:frame.x,top:frame.y});
  }
  const output=await sharp({create:{width:metadata.width,height:metadata.height,channels:4,background:'#00000000'}})
    .composite(composites)
    .webp({quality:90,alphaQuality:100,effort:6})
    .toBuffer();
  await fs.writeFile(path.join(atlasDir,pageName),output);
}

console.log(`Updated ${replacements.size} frame(s) in ${path.basename(manifestPath)}`);
