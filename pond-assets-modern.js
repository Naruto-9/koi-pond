export const pondAssetFormat='webp';
export const bundledAssets=import.meta.glob([
  './build-assets/*.webp'
],{eager:true,query:'?url',import:'default'});
