const CACHE_NAME='koi-garden-static-v2';
const MAX_CACHE_ENTRIES=160;

self.addEventListener('install',()=>self.skipWaiting());

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names
      .filter(name=>name.startsWith('koi-garden-static-')&&name!==CACHE_NAME)
      .map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});

async function trimCache(cache){
  const requests=await cache.keys();
  const overflow=requests.length-MAX_CACHE_ENTRIES;
  if(overflow>0){
    await Promise.all(requests.slice(0,overflow).map(request=>cache.delete(request)));
  }
}

function isCacheableAsset(request){
  if(request.method!=='GET')return false;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin||!/\/assets\//.test(url.pathname))return false;
  if(/\.mp3(?:$|\?)/i.test(url.pathname))return false;
  return ['script','style','image','font'].includes(request.destination);
}

async function notifyStaleAsset(request){
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  clients.forEach(client=>client.postMessage({type:'POND_ASSET_STALE',url:request.url}));
}

async function cacheResponse(request,response){
  if(!response.ok)return;
  const cache=await caches.open(CACHE_NAME);
  await cache.put(request,response.clone());
  await trimCache(cache);
}

self.addEventListener('fetch',event=>{
  const {request}=event;
  if(!isCacheableAsset(request))return;
  event.respondWith((async()=>{
    // Code is network-first so a previous deployment cannot keep an old entry
    // module alive. Immutable hashed images and fonts remain cache-first.
    if(request.destination==='script'||request.destination==='style'){
      try{
        const response=await fetch(request);
        if(response.ok)await cacheResponse(request,response);
        else if(response.status===404)await notifyStaleAsset(request);
        return response;
      }catch(error){
        const cached=await caches.match(request);
        if(cached)return cached;
        throw error;
      }
    }

    const cached=await caches.match(request);
    if(cached)return cached;
    const response=await fetch(request);
    if(response.ok)await cacheResponse(request,response);
    else if(response.status===404)await notifyStaleAsset(request);
    return response;
  })());
});
