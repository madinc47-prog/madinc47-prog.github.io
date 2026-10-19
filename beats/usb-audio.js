/* Beat USB Audio Input — Hayner-Seek Audio Interface-V1 / any USB class audio input.
   Self-contained. Exposes window.BeatAudioInput for Beats, Studio and drum-pad mic samples.
   RAW only: echoCancellation/noiseSuppression/autoGainControl all false. No cleanup ever. */
(function(){
"use strict";
if (window.BeatAudioInput && window.BeatAudioInput.__v) return;
var LS_ID="ipb_audio_input_id", LS_MODE="ipb_audio_input_mode", LS_MON="ipb_audio_input_monitor";
function lsGet(k,d){try{var v=localStorage.getItem(k);return v==null?d:v}catch(e){return d}}
function lsSet(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function log(m){ try{ if(window.__ipbTD&&window.__ipbTD.log) window.__ipbTD.log("USB-Audio "+m); }catch(e){} if(/[?&]tapdebug=1/.test(location.search)) console.log("[USB-Audio]",m); }
var state={ devices:[], selectedId:lsGet(LS_ID,""), mode:lsGet(LS_MODE,"mix"), monitor:lsGet(LS_MON,"0")==="1",
  channels:null, sampleRate:null, baseLatency:null, outputLatency:null, stream:null, label:"", lastError:"", level:0, levels:{peak:0,mic1:0,mic2:0} };
if(["mix","mic1","mic2","split"].indexOf(state.mode)<0) state.mode="mix";

function rawConstraints(deviceId, voiceOnly){
  // voiceOnly is an existing manual toggle in Beats/Studio; when on, respect it. Otherwise RAW.
  if(voiceOnly) return {echoCancellation:true,noiseSuppression:true,autoGainControl:false, channelCount:{ideal:2}};
  var c={echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:{ideal:2}};
  if(deviceId) c.deviceId={exact:deviceId};
  return c;
}
function constraints(deviceId, voiceOnly){
  var c=rawConstraints(deviceId||state.selectedId||undefined, voiceOnly);
  // spec form: deviceId exact when a device is chosen; keep plain fields testable
  return c;
}
async function listInputs(){
  if(!navigator.mediaDevices||!navigator.mediaDevices.enumerateDevices) { state.devices=[]; log("enumerateDevices unsupported"); return []; }
  try{
    var devs=await navigator.mediaDevices.enumerateDevices();
    state.devices=devs.filter(function(d){return d.kind==="audioinput";})
      .map(function(d,i){return {deviceId:d.deviceId||"", label:d.label||("Microphone "+(i+1)), kind:d.kind, groupId:d.groupId||""};});
    // If remembered device vanished, fall back to default (empty id)
    if(state.selectedId && !state.devices.some(function(d){return d.deviceId===state.selectedId;})){
      log("saved input gone, falling back to built-in/default");
      // keep selectedId? Clear so status is honest
      // do not clear if list is permission-masked (labels empty & ids empty in some browsers)
      var anyId=state.devices.some(function(d){return d.deviceId;});
      if(anyId) { state.selectedId=""; lsSet(LS_ID,""); }
    }
    log("devices count="+state.devices.length+" list="+state.devices.map(function(d){return d.label+"["+(d.deviceId||"default").slice(0,8)+"]";}).join(" | ")+" mode="+state.mode+" selected="+(state.selectedId||"default"));
    renderAll();
    return state.devices.slice();
  }catch(e){ state.lastError=String(e&&e.message||e); log("enumerate failed "+state.lastError); return []; }
}
async function ensurePermission(){
  // A short open/close to unlock labels. Only on a user tap (callers invoke from click handlers).
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia) throw new Error("This browser can't use a microphone.");
  var s=await navigator.mediaDevices.getUserMedia({audio:rawConstraints(state.selectedId||undefined,false)}).catch(async function(e){
    if(e&&(e.name==="OverconstrainedError"||e.name==="TypeError")) return navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
    throw e;
  });
  s.getTracks().forEach(function(t){t.stop();});
  return listInputs();
}
function selectedLabel(){
  if(!state.selectedId) return "Built-in mic";
  var d=state.devices.find(function(x){return x.deviceId===state.selectedId;});
  return d?d.label:"USB audio device";
}
function isUSBLabel(label){ return /usb|hayner|v1|audio interface|headset/i.test(label||""); }
function statusText(){
  var lbl=selectedLabel();
  var name = (!state.selectedId) ? "Built-in mic" : lbl;
  // Generic USB labels are normal on Android Chrome
  return "Audio in: "+name;
}
function info(){
  return {selectedId:state.selectedId, label:selectedLabel(), devices:state.devices.slice(), mode:state.mode,
    channels:state.channels, sampleRate:state.sampleRate, baseLatency:state.baseLatency, outputLatency:state.outputLatency,
    monitor:state.monitor, level:state.level, levels:Object.assign({},state.levels), lastError:state.lastError};
}
function setSelected(id){ state.selectedId=id||""; lsSet(LS_ID,state.selectedId); log("selected "+(state.selectedId||"default")+" "+selectedLabel()); renderAll(); }
function setMode(m){ if(["mix","mic1","mic2","split"].indexOf(m)>=0){state.mode=m; lsSet(LS_MODE,m); log("mode="+m); renderAll();} }
function setMonitor(on){ state.monitor=!!on; lsSet(LS_MON,on?"1":"0"); log("monitor="+(on?"on (headphones only)":"off")); renderAll(); }

function processChannels(L,R,mode){
  // Pure helper (tested headless). Returns {mono:Float32Array, mic1, mic2, channels:[...]}
  mode=mode||state.mode;
  var n=L?L.length:0, mono=new Float32Array(n), mic1=new Float32Array(n), mic2=new Float32Array(n);
  for(var i=0;i<n;i++){ var l=L[i]||0, r=R?R[i]||0:l; mic1[i]=l; mic2[i]=r;
    mono[i]= mode==="mic1"?l : mode==="mic2"?r : (l+r)/2; }
  // stereo->mono both ears happens downstream (mono duplicated); centred mono for split tracks
  return {mono:mono, mic1:mic1, mic2:mic2, channels: mode==="split"?[mic1,mic2]:[mono], mode:mode};
}
function applyMode(L,R,mode){ return processChannels(L,R,mode); }

async function openInput(deviceId, opts){
  opts=opts||{};
  var id = deviceId!==undefined?deviceId:state.selectedId;
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia) throw new Error("This browser can't use a microphone.");
  var want=constraints(id||undefined, !!opts.voiceOnly);
  var stream;
  try{ stream=await navigator.mediaDevices.getUserMedia({audio:want}); }
  catch(e){
    if(e&&(e.name==="OverconstrainedError"||e.name==="TypeError")){
      log("exact/2ch constraint failed, retrying RAW without deviceId/channelCount");
      stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
    } else throw e;
  }
  var track=stream.getAudioTracks()[0];
  var settings={}; try{ settings=track&&track.getSettings?track.getSettings():{}; }catch(e){}
  // Actual channel count: from settings, else probe via AudioContext source channelCount
  var ch = settings.channelCount||null;
  var sourceNode=null, levels=null, actx=opts.audioContext||null;
  try{
    if(!actx && window.AudioContext) { /* do not create a stray context if caller didn't give one for plain stream use */ }
    if(actx){
      sourceNode=actx.createMediaStreamSource(stream);
      if(!ch) ch=sourceNode.channelCount||null;
      levels=createLevels(sourceNode, actx);
      state.sampleRate=actx.sampleRate||null; state.baseLatency=(typeof actx.baseLatency==="number"?actx.baseLatency:null);
      state.outputLatency=(typeof actx.outputLatency==="number"?actx.outputLatency:null);
    }
  }catch(e){ log("source probe failed "+e); }
  if(!ch){
    // Mocked / some browsers: infer from track constraints if present
    ch = (settings.channelCount)||1;
  }
  state.channels=ch; state.stream=stream; state.label=track?track.label||selectedLabel():"";
  if(track&&track.deviceId) {}
  log("openInput label="+(state.label||selectedLabel())+" channels="+ch+" sampleRate="+(state.sampleRate||settings.sampleRate||"?")+" baseLatency="+state.baseLatency+" outputLatency="+state.outputLatency+" mode="+state.mode+" settings="+JSON.stringify({echoCancellation:settings.echoCancellation,noiseSuppression:settings.noiseSuppression,autoGainControl:settings.autoGainControl,channelCount:settings.channelCount,sampleRate:settings.sampleRate}));
  renderAll();
  return {stream:stream, sourceNode:sourceNode, levels:levels, track:track, settings:settings, channels:ch,
    sampleRate: state.sampleRate||settings.sampleRate||null,
    close:function(){ try{stream.getTracks().forEach(function(t){t.stop();});}catch(e){} if(state.stream===stream) state.stream=null; }};
}
function createLevels(sourceNode, actx){
  // Returns {getLevels()->{peak,mic1,mic2}, analyser(s)} handling 1 or 2 channels
  var an=actx.createAnalyser(); an.fftSize=1024;
  var splitter=null, anL=null, anR=null;
  var chCount=2;
  try{ chCount=sourceNode.channelCount||2; }catch(e){}
  if(chCount>=2 && actx.createChannelSplitter){
    splitter=actx.createChannelSplitter(2); sourceNode.connect(splitter);
    anL=actx.createAnalyser(); anL.fftSize=1024; anR=actx.createAnalyser(); anR.fftSize=1024;
    splitter.connect(anL,0); splitter.connect(anR,1);
    // also overall
    try{ sourceNode.connect(an); }catch(e){}
  } else { sourceNode.connect(an); }
  function peak(a){ if(!a) return 0; var buf=new Float32Array(a.fftSize); a.getFloatTimeDomainData(buf); var p=0; for(var i=0;i<buf.length;i++){var v=Math.abs(buf[i]); if(v>p)p=v;} return p; }
  var obj={ analyser:an, analysers:[anL,anR],
    getLevels:function(){ var m1=anL?peak(anL):peak(an), m2=anR?peak(anR):0, pk=Math.max(m1,m2); state.level=pk; state.levels={peak:pk,mic1:m1,mic2:m2}; return {peak:pk,mic1:m1,mic2:m2}; },
    getLevel:function(){ return this.getLevels().peak; } };
  return obj;
}

/* ---------- UI picker ---------- */
var pickers=[];
function buildPicker(root, opts){
  opts=opts||{};
  root.classList.add("bai-panel"); root.setAttribute("data-bai","1");
  root.innerHTML='<div class="bai-row"><strong>🎙 Audio input</strong> <span class="bai-status"></span></div>'+
    '<div class="bai-row"><label>Input <select class="bai-select" aria-label="Audio input"></select></label>'+
    '<button type="button" class="bai-refresh">↻ Refresh</button>'+
    '<label>Mode <select class="bai-mode" aria-label="Two mic mode"><option value="mix">Mic 1+2 mixed (stereo→mono, both ears)</option><option value="mic1">Mic 1 only</option><option value="mic2">Mic 2 only</option>'+(opts.studio?'<option value="split">2 mics on separate tracks (Studio)</option>':'')+'</select></label></div>'+
    '<div class="bai-row"><span class="bai-meter" aria-label="Input level"><i></i></span><span class="bai-leveltxt">no signal</span></div>'+
    '<div class="bai-row bai-hint bai-meta"></div>'+
    '<div class="bai-row"><label class="bai-monwrap"><input type="checkbox" class="bai-monitor"> Hear yourself (monitor) — headphones only ⚠ feedback risk</label></div>'+
    '<div class="bai-hint">Plug the Hayner-Seek V1 into the tablet/phone with USB (USB-C / OTG cable), give it power if needed, then tap Refresh and pick it here. Takes stay RAW — no auto cleanup. Channel note: <span class="bai-chnote"></span></div>'+
    '<div class="bai-hint bai-err" hidden></div>';
  var sel=root.querySelector(".bai-select"), modeSel=root.querySelector(".bai-mode");
  modeSel.value=state.mode;
  root.querySelector(".bai-refresh").addEventListener("click", async function(){
    try{ await ensurePermission(); }catch(e){ showErr(root,e); }
    await listInputs(); renderPicker(root);
  });
  sel.addEventListener("change", function(){ setSelected(sel.value); });
  modeSel.addEventListener("change", function(){ setMode(modeSel.value); if(opts.onMode) opts.onMode(state.mode); });
  var mon=root.querySelector(".bai-monitor"); mon.checked=state.monitor;
  mon.addEventListener("change", function(){ setMonitor(mon.checked); if(mon.checked) alert("Monitor on: use headphones only — on speakers the mic will feed back / howl."); if(opts.onMonitor) opts.onMonitor(state.monitor); });
  var p={root:root,opts:opts}; pickers.push(p); renderPicker(root); return p;
}
function showErr(root,e){
  var el=root.querySelector(".bai-err"); if(!el) return;
  var n=e&&e.name;
  el.hidden=false;
  el.textContent = (n==="NotAllowedError"||n==="SecurityError") ? "Microphone permission denied. Tap the lock icon by the address bar > Permissions > Microphone > Allow, then tap Refresh."
    : (n==="NotFoundError") ? "No microphone found. Plug in the USB mixer, check its power, then tap Refresh."
    : "Could not open that input: "+((e&&e.message)||e);
  log("error "+el.textContent);
}
function renderPicker(root){
  var sel=root.querySelector(".bai-select"); if(!sel) return;
  var cur=state.selectedId;
  sel.innerHTML="";
  var o0=document.createElement("option"); o0.value=""; o0.textContent="Built-in mic (default)"; sel.appendChild(o0);
  state.devices.forEach(function(d){ var o=document.createElement("option"); o.value=d.deviceId; o.textContent=d.label; sel.appendChild(o); });
  sel.value=cur||"";
  if(sel.value!==cur && cur) { /* device gone */ }
  root.querySelector(".bai-status").textContent=statusText();
  var modeSel=root.querySelector(".bai-mode"); if(modeSel) modeSel.value=state.mode;
  var mon=root.querySelector(".bai-monitor"); if(mon) mon.checked=state.monitor;
  var meta=root.querySelector(".bai-meta");
  if(meta){
    var parts=[];
    parts.push(state.channels?("Channels: "+state.channels):"Channels: plug in / Refresh — will show after the mic opens");
    if(state.sampleRate) parts.push(state.sampleRate+" Hz");
    if(state.baseLatency!=null||state.outputLatency!=null) parts.push("latency ≈ "+Math.round(((state.baseLatency||0)+(state.outputLatency||0))*1000)+" ms (base+output)");
    meta.textContent=parts.join(" · ");
  }
  var chn=root.querySelector(".bai-chnote");
  if(chn) chn.textContent = state.channels===1 ? "This browser/device is only offering 1 channel — Mic 1+2 mixed / separate tracks need 2 channels. That is an Android Chrome limit for this device, not a bug."
    : state.channels>=2 ? "2 channels seen — Mic 1 / Mic 2 / separate tracks can work if the V1 sends Mic 1 left + Mic 2 right."
    : "not checked yet (tap Refresh / start a take).";
}
function renderAll(){ pickers.forEach(function(p){renderPicker(p.root);}); updateMeters(); }
function updateMeters(){
  pickers.forEach(function(p){
    var m=p.root.querySelector(".bai-meter"), bar=p.root.querySelector(".bai-meter i"), txt=p.root.querySelector(".bai-leveltxt");
    if(!m) return;
    var lvl=state.level||0;
    // level is updated by levels loop when a stream is open; also try live stream analysers stored
    if(liveLevels){ var lv=liveLevels.getLevels(); lvl=lv.peak; }
    if(bar) bar.style.width=Math.min(100,Math.round(lvl*100))+"%";
    m.classList.toggle("hot",lvl>0.9); m.classList.toggle("warn",lvl>0.6&&lvl<=0.9);
    if(txt) txt.textContent = lvl>0.9?"too loud": lvl<0.003?"no signal — speak into the mic / check the V1 gain": "hearing you";
  });
}
var liveLevels=null, meterTimer=null;
async function startLevelMonitor(actx){
  // Opens selected input just for metering (called from picker Refresh/test or when UI visible & user tapped Refresh)
  // Caller owns closing via stopLevelMonitor / openInput result
  return null;
}
function attachLevels(levels){ liveLevels=levels; if(!meterTimer) meterTimer=setInterval(updateMeters,100); }
function detachLevels(){ liveLevels=null; }

// Auto-mount: main Beats vocal box + Studio transport area, if present.
function autoMount(){
  var mounts=[];
  document.querySelectorAll("[data-bai-mount]").forEach(function(el){ mounts.push({el:el, studio:el.getAttribute("data-bai-mount")==="studio"}); });
  if(!mounts.length){
    var vox=document.querySelector(".vox-box");
    if(vox && !vox.querySelector("[data-bai]")){ var d=document.createElement("div"); d.setAttribute("data-bai-auto","beats"); vox.appendChild(d); mounts.push({el:d,studio:false}); }
    var st=document.querySelector(".st-transport");
    if(st && !document.querySelector("[data-bai]")){ var d2=document.createElement("div"); d2.setAttribute("data-bai-auto","studio"); st.insertAdjacentElement("afterend",d2); mounts.push({el:d2,studio:true}); }
    // Embedded Studio is an iframe with its own picker (../usb-audio.js there) — no extra picker on the Beats Studio tab.
  }
  mounts.forEach(function(m){ if(!m.el.querySelector||!m.el.classList.contains("bai-panel")) buildPicker(m.el,{studio:m.studio}); });
  if(mounts.length) listInputs();
}
if(navigator.mediaDevices&&navigator.mediaDevices.addEventListener){
  navigator.mediaDevices.addEventListener("devicechange", function(){ log("devicechange — refreshing inputs"); listInputs(); });
}
document.addEventListener("DOMContentLoaded", autoMount);
if(document.readyState!=="loading") setTimeout(autoMount,0);

window.BeatAudioInput={
  __v:1, listInputs:listInputs, enumerate:listInputs, ensurePermission:ensurePermission,
  openInput:openInput, selectedId:state.selectedId,
  get selectedIdValue(){return state.selectedId;},
  getSelectedId:function(){return state.selectedId;}, setSelected:setSelected,
  getMode:function(){return state.mode;}, setMode:setMode,
  getMonitor:function(){return state.monitor;}, setMonitor:setMonitor,
  constraints:constraints, rawConstraints:rawConstraints,
  processChannels:processChannels, applyMode:applyMode,
  createLevels:createLevels, attachLevels:attachLevels, detachLevels:detachLevels,
  info:info, statusText:statusText, mount:buildPicker, state:state, log:log
};
// keep selectedId property in sync-ish (other code reading .selectedId gets initial; prefer getSelectedId())
setInterval(function(){ try{window.BeatAudioInput.selectedId=state.selectedId;}catch(e){} },500);
log("module loaded mode="+state.mode+" selected="+(state.selectedId||"default"));
})();
