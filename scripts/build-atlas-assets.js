import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root=path.resolve(import.meta.dirname,'..');
const atlasDir=path.join(root,'assets','atlases');
const outputDir=path.join(root,'build-assets');

await fs.mkdir(outputDir,{recursive:true});
for(const name of await fs.readdir(outputDir)){
  await fs.rm(path.join(outputDir,name),{recursive:true,force:true});
}

const manifestNames=(await fs.readdir(atlasDir)).filter(name=>name.endsWith('.json'));
let generatedCount=0;
for(const manifestName of manifestNames){
  const manifest=JSON.parse(await fs.readFile(path.join(atlasDir,manifestName),'utf8'));
  const pages=new Map(await Promise.all(manifest.pages.map(async page=>
    [page,await fs.readFile(path.join(atlasDir,page))]
  )));
  for(const [sourceName,frame] of Object.entries(manifest.frames)){
    const outputName=sourceName.replace(/\.png$/i,'.webp');
    await sharp(pages.get(frame.page))
      .extract({left:frame.x,top:frame.y,width:frame.width,height:frame.height})
      .webp({quality:90,alphaQuality:100,effort:4})
      .toFile(path.join(outputDir,outputName));
    generatedCount++;
  }
}
console.log(`Generated ${generatedCount} WebP assets from ${manifestNames.length} atlas manifests`);
