import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export default defineConfig({
  resolve:{
    alias:{
      '@pond-asset-manifest':path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        'pond-assets-modern.js'
      )
    }
  },
  build:{
    outDir:'dist',
    rollupOptions:{
      output:{
        manualChunks(id){
          const normalizedId=id.replaceAll('\\','/');
          if(
            normalizedId.includes('/node_modules/')
            && !normalizedId.includes('/WebGPURenderer')
            && !normalizedId.includes('/BitmapFont')
          )return 'pixi-vendor';
        }
      }
    }
  }
});
