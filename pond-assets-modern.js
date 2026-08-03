import generatedAssets from './build-assets/manifest.js';

const morningCreatureAssets=import.meta.glob(
  './assets/{honeybee,olive-backed-sunbird,hummingbird-side-sheet,monarch-butterfly-sheet,mallard-duck-actions-sheet}.webp',
  {eager:true,query:'?url',import:'default'}
);

export const pondAssetFormat='webp';
export const bundledAssets={...generatedAssets,...morningCreatureAssets};
