import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export default defineConfig(({mode})=>{
  const pngFallback=mode==='png-fallback';
  const projectDirectory=path.dirname(fileURLToPath(import.meta.url));
  return {
    resolve:{
      alias:{
        '@pond-asset-manifest':path.resolve(
          projectDirectory,
          pngFallback?'pond-assets-png.js':'pond-assets-modern.js'
        )
      }
    },
    build:{
      outDir:pngFallback?'dist-png':'dist'
    }
  };
});
