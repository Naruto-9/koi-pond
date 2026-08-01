export function createPondDiagnostics({state,initialEnabled,onPreferenceChange,getSnapshot}){
  Object.assign(state,{enabled:initialEnabled,lastFrameAt:performance.now(),lastPaintAt:0,slowFrames:0,fps:60,frameMs:16.7,updateMs:0,waterMs:0,creatureMs:0});

  const panel=document.createElement('aside');
  panel.className='performance-diagnostics';
  panel.id='pondDiagnostics';
  panel.setAttribute('aria-label','Pond performance diagnostics');
  panel.innerHTML='<strong>POND DIAGNOSTICS</strong><small>Press D to close</small><div class="diagnostic-sections"><pre data-diagnostic="timing"></pre><pre data-diagnostic="scene"></pre><pre data-diagnostic="renderer"></pre></div>';
  document.body.appendChild(panel);
  panel.classList.toggle('is-visible',state.enabled);

  function toggle(){
    state.enabled=!state.enabled;
    onPreferenceChange(state.enabled);
    panel.classList.toggle('is-visible',state.enabled);
    if(state.enabled){state.lastFrameAt=performance.now();state.lastPaintAt=0;state.slowFrames=0;}
  }

  window.addEventListener('keydown',event=>{
    const target=event.target;
    if(event.code!=='KeyD'||event.repeat||event.ctrlKey||event.metaKey||event.altKey||target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||target?.isContentEditable)return;
    toggle();
  });

  function record(frameStartedAt,waterMs,creatureMs){
    if(!state.enabled)return;
    const finishedAt=performance.now();
    const interval=Math.max(.1,frameStartedAt-state.lastFrameAt);
    const updateMs=finishedAt-frameStartedAt;
    state.lastFrameAt=frameStartedAt;
    if(interval>20)state.slowFrames++;
    const blend=.12;
    state.fps+=(1000/interval-state.fps)*blend;
    state.frameMs+=(interval-state.frameMs)*blend;
    state.updateMs+=(updateMs-state.updateMs)*blend;
    state.waterMs+=(waterMs-state.waterMs)*blend;
    state.creatureMs+=(creatureMs-state.creatureMs)*blend;
    if(finishedAt-state.lastPaintAt<250)return;
    state.lastPaintAt=finishedAt;
    const snapshot=getSnapshot();
    const timing=[`FPS          ${state.fps.toFixed(1)}`,`FRAME        ${state.frameMs.toFixed(2)} ms`,`JS UPDATE    ${state.updateMs.toFixed(2)} ms`,`WATER CPU    ${state.waterMs.toFixed(2)} ms`,`CREATURES    ${state.creatureMs.toFixed(2)} ms`,`SLOW FRAMES  ${state.slowFrames}`];
    const scene=[`KOI          ${snapshot.koi}`,`TREATS       ${snapshot.treats}`,`WAKES        ${snapshot.wakes}`,`RAIN FX      ${snapshot.rainFx}`,`POOLED       ${snapshot.pooled}`];
    const renderer=[`RENDERER     ${snapshot.renderer}`,`RESOLUTION   ${snapshot.resolution.toFixed(2)}x`,`VIEWPORT     ${Math.round(snapshot.width)} × ${Math.round(snapshot.height)}`];
    panel.querySelector('[data-diagnostic="timing"]').textContent=timing.join('\n');
    panel.querySelector('[data-diagnostic="scene"]').textContent=scene.join('\n');
    panel.querySelector('[data-diagnostic="renderer"]').textContent=renderer.join('\n');
  }

  return {toggle,record,panel};
}
