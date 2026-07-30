import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export default defineConfig(({mode})=>{
  const pngFallback=mode==='png-fallback';
  const projectDirectory=path.dirname(fileURLToPath(import.meta.url));
  const usePngSplash=source=>source
    .replace(/koi-garden-splash(-mobile)?-with-logo\.webp/g,'koi-garden-splash$1-with-logo.png')
    .replaceAll('type="image/webp"','type="image/png"');
  return {
    plugins:pngFallback?[{
      name:'png-fallback-splash',
      enforce:'pre',
      transform(code,id){
        if(id.endsWith('/styles.css'))return usePngSplash(code);
      },
      transformIndexHtml:{
        order:'pre',
        handler(html){
          return usePngSplash(html);
        }
      }
    }]:[],
    resolve:{
      alias:{
        '@pond-asset-manifest':path.resolve(
          projectDirectory,
          pngFallback?'pond-assets-png.js':'pond-assets-modern.js'
        )
      }
    },
    build:{
      outDir:pngFallback?'dist-png':'dist',
      rollupOptions:{
        output:{
          manualChunks(id){
            const normalizedId=id.replaceAll('\\','/');
            if(
              normalizedId.includes('/node_modules/')
              && !normalizedId.includes('/WebGPURenderer')
              && !normalizedId.includes('/BitmapFont')
            ){
              return 'pixi-vendor';
            }
          }
        }
      }
    }
  };
});
