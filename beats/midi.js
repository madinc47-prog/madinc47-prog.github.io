/* Island Pin Beats — Web MIDI (Akai MPK Mini etc.), self-contained.
   Enable button (user gesture) -> navigator.requestMIDIAccess({sysex:false}); hot-plug via onstatechange.
   Notes: [baseNote .. baseNote+15] -> Beat pads (fires the pad's assigned sound + selects it);
          other notes -> the live piano keys instrument (drives the real on-screen piano keys / noteOn).
   CC -> MIDI-Learn table (default map below, saved on-device). Program Change -> song preset switch.
   Realtime Start/Stop (0xFA/0xFC) -> transport. No SysEx. Everything degrades to plain-words status. */
(function(){
"use strict";
if(window.IPBMidi && window.IPBMidi.version) return;
var VERSION="20261018l";
var LS_SET="ipb_midi_settings_v2", LS_LEARN="ipb_midi_learn_v2";
var $=function(id){return document.getElementById(id)};
function log(m){ if(window.__ipbTD&&window.__ipbTD.log) window.__ipbTD.log("MIDI "+m); if(/[?&]tapdebug=1(&|$)/.test(location.search)) console.log("[MIDI]",m); }
function load(k,d){ try{var v=JSON.parse(localStorage.getItem(k)||"null"); return v&&typeof v==="object"?v:d;}catch(e){return d;} }
function save(k,v){ try{localStorage.setItem(k,JSON.stringify(v));}catch(e){} }
var settings=Object.assign({channel:0,baseNote:36}, load(LS_SET,{})); // channel 0 = All
/* ---- learn targets ---- */
function setRange(el,frac,fireChange){ if(!el) return; var min=+el.min||0,max=+el.max||100,step=+el.step||1; var v=min+(max-min)*frac; if(step) v=Math.round(v/step)*step; el.value=v; el.dispatchEvent(new Event("input",{bubbles:true})); if(fireChange) el.dispatchEvent(new Event("change",{bubbles:true})); }
function setMix(id,frac){ var v=Math.max(0,Math.min(1,frac));
  try{ if(window.IPBVocalClean&&IPBVocalClean.setMix){ IPBVocalClean.setMix(id,v); renderLearnVals(); return; } }catch(e){}
  // fallback: Mixer page strip (order = GROUPS + vocal + master)
  var strips=document.querySelectorAll("#mixer .strip"); var ids=["drums","bass","hats","perc","keys","piano","inst","vocal","master"]; var i=ids.indexOf(id); if(strips[i]){ var r=strips[i].querySelector("input"); if(r){ r.value=Math.round(v*100); r.dispatchEvent(new Event("input",{bubbles:true})); } } }
function songOptions(){ var ps=$("song-preset"); if(!ps) return []; return Array.prototype.filter.call(ps.options,function(o){return !!o.value;}); }
function selectSong(idx){ var opts=songOptions(); if(!opts.length) return; idx=((idx%opts.length)+opts.length)%opts.length; var ps=$("song-preset"); if(ps.value!==opts[idx].value){ ps.value=opts[idx].value; ps.dispatchEvent(new Event("change",{bubbles:true})); noteLog("Song -> "+opts[idx].textContent); } }
var lastSongIdx=-1;
var TARGETS=[
 {id:"master",label:"Master volume",apply:function(f){setMix("master",f);}},
 {id:"drumsVol",label:"Drums volume",apply:function(f){setMix("drums",f);}},
 {id:"keysVol",label:"Keys volume",apply:function(f){setMix("keys",f);}},
 {id:"padPitch",label:"Pad pitch (selected pad tune)",apply:function(f){setRange($("pad-pitch"),f);}},
 {id:"padLevel",label:"Pad level (selected pad)",apply:function(f){setRange($("pad-level"),f);}},
 {id:"tempo",label:"Tempo / BPM",apply:function(f){setRange($("bpm"),f,true);}},
 {id:"swing",label:"Swing",apply:function(f){setRange($("swing"),f);}},
 {id:"song",label:"Song select (turn to switch)",apply:function(f){var n=songOptions().length; if(!n)return; var i=Math.min(n-1,Math.floor(f*n)); if(i!==lastSongIdx){lastSongIdx=i; selectSong(i);}}}
];
var DEFAULT_CC={70:"master",71:"padPitch",72:"tempo",73:"swing",74:"song",75:"drumsVol",76:"keysVol",77:"padLevel"};
var learnMap=Object.assign({},DEFAULT_CC,load(LS_LEARN,{}));
var learning=null; // target id waiting for a CC
/* ---- state / UI ---- */
var access=null, enabled=false, logLines=[];
function noteLog(m){ var t=new Date(); logLines.unshift(t.toLocaleTimeString()+" "+m); if(logLines.length>30)logLines.pop(); var el=$("midi-log"); if(el) el.innerHTML=logLines.slice(0,8).map(function(l){return "<li>"+l.replace(/</g,"&lt;")+"</li>";}).join(""); log(m); }
function setStatus(cls,text){ var led=$("midi-led"),st=$("midi-status"); if(led)led.className="midi-led "+cls; if(st)st.textContent=text; }
function deviceNames(){ if(!access) return []; return Array.prototype.map.call(access.inputs.values(),function(i){return (i.name||"MIDI device")+(i.manufacturer?" · "+i.manufacturer:"");}); }
function refreshDevices(){ var sel=$("midi-devices"); var names=deviceNames();
  if(sel) sel.innerHTML=names.length?names.map(function(n){return "<option>"+n.replace(/</g,"&lt;")+"</option>";}).join(""):"<option>No MIDI device connected</option>";
  if(!access) return;
  if(names.length) setStatus("ok","Connected: "+names.join(", "));
  else setStatus("warn","MIDI is on, but no device is connected. Plug the Akai in with USB — it should appear here on its own.");
}
function attach(){ if(!access) return; access.inputs.forEach(function(inp){ inp.onmidimessage=function(e){ handle(e.data,inp.name||"device"); }; }); access.onstatechange=function(e){ noteLog((e.port.state==="connected"?"Plugged in: ":"Unplugged: ")+(e.port.name||"MIDI device")); refreshDevices(); attach(); }; refreshDevices(); }
function enable(){
  if(!navigator.requestMIDIAccess){ setStatus("err","Not supported: this browser has no Web MIDI. Use Chrome on Android or desktop (Safari/iPhone cannot do this)."); noteLog("requestMIDIAccess missing"); return Promise.resolve(false); }
  setStatus("warn","Asking the browser for MIDI…");
  return navigator.requestMIDIAccess({sysex:false}).then(function(a){ access=a; enabled=true; attach(); var n=deviceNames(); noteLog(n.length?("Enabled. Connected: "+n.join(", ")):"Enabled. No device yet — plug the Akai in."); return true; })
   .catch(function(e){ enabled=false; setStatus("err","MIDI was denied or failed. Check the browser's site permission for MIDI, then tap Enable MIDI again. ("+(e.message||e)+")"); noteLog("enable failed "+(e.message||e)); return false; });
}
/* ---- pad / key firing ---- */
function firePad(i,vel){
  var B=window.IPBBeats;
  // future/parallel pad-assignment API (picked up automatically if the pads work adds one)
  var fn=(B&&(B.triggerPad||(B.pads&&B.pads.trigger)||B.padTrigger||(B.midi&&B.midi.pad)));
  if(typeof fn==="function"){ try{ fn.call(B,i,vel); noteLog("Pad "+(i+1)+" (vel "+vel+") via pad API"); return; }catch(e){ log("pad API failed "+e.message); } }
  var pads=document.querySelectorAll(".pad"); var el=pads[i]; if(!el){ noteLog("Pad "+(i+1)+" — pads not on screen"); return; }
  el.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true}));
  if(navigator.vibrate) navigator.vibrate(8);
  noteLog("Pad "+(i+1)+" (vel "+vel+")");
}
var heldKeys={}; // midi note -> {el, pid}
function octBase(){ var o=$("key-oct"); return 12*((o?+o.value:4)+1); }
function fireKey(note,on){
  if(!on){ var h=heldKeys[note]; if(h){ window.dispatchEvent(new PointerEvent("pointerup",{pointerId:h.pid})); delete heldKeys[note]; noteLog("Key off "+note); } return; }
  var base=octBase(), s=note-base;
  if(s<0||s>24){ // shift the on-screen octave so the note exists (key-oct options are 3/4/5)
    var octEl=$("key-oct"); if(octEl){ var want=Math.max(3,Math.min(5,Math.floor(note/12)-1)); if(+octEl.value!==want){ octEl.value=want; octEl.dispatchEvent(new Event("change",{bubbles:true})); base=octBase(); s=note-base; } }
  }
  var keys=document.querySelectorAll("#piano .wkey, #piano .bkey"); var el=keys[s]; // buildPiano appends in s order 0..24
  if(!el||s<0||s>24){ noteLog("Key "+note+" out of piano range"); return; }
  var pid=987000+note; heldKeys[note]={el:el,pid:pid};
  el.dispatchEvent(new PointerEvent("pointerdown",{pointerId:pid,bubbles:true,cancelable:true}));
  noteLog("Key on "+note);
}
/* ---- message handling (also the fake-injection path) ---- */
function handle(data,srcName){
  if(!data||data.length<1) return;
  var st=data[0], cmd=st>>4, ch=(st&15)+1;
  if(st===0xFA){ var b=$("btn-play"); if(b)b.click(); noteLog("MIDI Start -> Play"); return; }
  if(st===0xFC){ var s=$("btn-stop"); if(s)s.click(); noteLog("MIDI Stop -> Stop"); return; }
  if(st<0xF0 && settings.channel && ch!==settings.channel) return;
  if(cmd===9){ var note=data[1],vel=data[2]||0;
    if(vel>0){ if(note>=settings.baseNote && note<settings.baseNote+16) firePad(note-settings.baseNote,vel); else fireKey(note,true); }
    else { if(!(note>=settings.baseNote&&note<settings.baseNote+16)) fireKey(note,false); }
    return; }
  if(cmd===8){ if(!(data[1]>=settings.baseNote&&data[1]<settings.baseNote+16)) fireKey(data[1],false); return; }
  if(cmd===11){ var cc=data[1],val=data[2]||0;
    if(learning){ Object.keys(learnMap).forEach(function(k){ if(learnMap[k]===learning) delete learnMap[k]; }); learnMap[cc]=learning; save(LS_LEARN,learnMap); noteLog("MIDI Learn: CC"+cc+" -> "+learning); learning=null; renderLearn(); return; }
    var tid=learnMap[cc]; if(tid){ var T=TARGETS.filter(function(x){return x.id===tid;})[0]; if(T){ T.apply(val/127); noteLog("CC"+cc+" "+val+" -> "+T.label); } }
    else noteLog("CC"+cc+" "+val+" (not mapped — use MIDI Learn)");
    return; }
  if(cmd===12){ selectSong(data[1]||0); return; }
  if(cmd===14){ var bend=((data[2]<<7)|(data[1]&127))-8192; noteLog("Pitch bend "+bend+" (logged; bend the selected pad with Pad pitch)"); return; }
}
function inject(bytes){ handle(new Uint8Array(bytes),"test"); }
/* ---- UI build ---- */
function renderLearn(){ var box=$("midi-learn"); if(!box) return;
  box.innerHTML=TARGETS.map(function(T){ var cc=Object.keys(learnMap).filter(function(k){return learnMap[k]===T.id;})[0];
    return '<div class="midi-learn-row'+(learning===T.id?" learning":"")+'"><span>'+T.label+'</span><span class="cc">'+(cc!=null?"CC"+cc:"no CC")+'</span><span><button type="button" class="btn small" data-learn="'+T.id+'">'+(learning===T.id?"Twist a knob…":"Learn")+'</button> <button type="button" class="btn small ghost" data-clear="'+T.id+'">Clear</button></span></div>'; }).join("");
  box.querySelectorAll("[data-learn]").forEach(function(b){ b.addEventListener("click",function(){ learning=learning===b.dataset.learn?null:b.dataset.learn; renderLearn(); if(learning) noteLog("Learn armed for "+learning+" — twist a knob on the Akai (or use Test CC)."); }); });
  box.querySelectorAll("[data-clear]").forEach(function(b){ b.addEventListener("click",function(){ Object.keys(learnMap).forEach(function(k){ if(learnMap[k]===b.dataset.clear) delete learnMap[k]; }); save(LS_LEARN,learnMap); renderLearn(); }); });
}
function renderLearnVals(){ /* values live in the target controls themselves; nothing extra to repaint */ }
function build(){
  if($("midi-panel")) return;
  if(!document.querySelector('link[href*="midi.css"]')){ var l=document.createElement("link"); l.rel="stylesheet"; l.href="midi.css?v="+VERSION; document.head.appendChild(l); }
  var panel=document.createElement("section"); panel.id="midi-panel"; panel.className="midi-panel"; panel.setAttribute("aria-label","MIDI controller (Akai MPK)");
  panel.innerHTML='<div class="midi-head"><strong>🎹 MIDI · Akai MPK</strong><span id="midi-led" class="midi-led"></span><span id="midi-status" role="status">MIDI is off. Tap Enable MIDI, then plug the Akai in with USB.</span></div>'+
  '<div class="midi-row"><button type="button" id="midi-enable" class="btn primary">Enable MIDI</button><select id="midi-devices" aria-label="MIDI devices"><option>No MIDI device connected</option></select>'+
  '<label>Channel <select id="midi-channel"><option value="0">All</option>'+Array.prototype.map.call({length:16},function(_,i){return '<option value="'+(i+1)+'">'+(i+1)+"</option>";}).join("")+'</select></label>'+
  '<label>Pad base note <input id="midi-base" type="number" min="0" max="112" step="1" style="width:64px"></label></div>'+
  '<p class="hint">MPK pads (notes from the base note) play Beat pads with their assigned sounds and select them. Other notes play the live keys/piano. Knobs: use MIDI Learn — tap Learn, then twist. Program Change switches the song. Works in Chrome on Android/desktop over USB-OTG; Safari/iPhone has no Web MIDI. Bluetooth MIDI is not reliable in the browser — use the cable.</p>'+
  '<div id="midi-learn"></div>'+
  '<div class="midi-row"><span class="label">Test (no Akai needed):</span><button type="button" class="btn small" id="midi-test-pad">Test pad</button><button type="button" class="btn small" id="midi-test-key">Test key</button><button type="button" class="btn small" id="midi-test-cc">Test knob CC70</button><button type="button" class="btn small" id="midi-test-song">Test song switch</button></div>'+
  '<ol id="midi-log"></ol>';
  var grid=document.querySelector("#tab-beats .beats-grid"); var host=$("tab-beats"); if(grid&&host) host.insertBefore(panel,grid); else if(host) host.appendChild(panel); else return;
  $("midi-channel").value=String(settings.channel); $("midi-base").value=settings.baseNote;
  if(!navigator.requestMIDIAccess) setStatus("err","Not supported: this browser has no Web MIDI. Use Chrome on Android or desktop (Safari/iPhone cannot do this).");
  $("midi-enable").addEventListener("click",function(){ enable(); });
  $("midi-channel").addEventListener("change",function(){ settings.channel=+this.value; save(LS_SET,settings); noteLog("MIDI channel "+(settings.channel?settings.channel:"All")); });
  $("midi-base").addEventListener("change",function(){ settings.baseNote=Math.max(0,Math.min(112,+this.value||36)); this.value=settings.baseNote; save(LS_SET,settings); noteLog("Pad base note "+settings.baseNote); });
  $("midi-test-pad").addEventListener("click",function(){ inject([0x90,settings.baseNote,100]); });
  $("midi-test-key").addEventListener("click",function(){ inject([0x90,72,100]); setTimeout(function(){inject([0x80,72,0]);},500); });
  $("midi-test-cc").addEventListener("click",function(){ var v=0; var iv=setInterval(function(){ inject([0xB0,70,v]); v+=16; if(v>127)clearInterval(iv); },90); });
  $("midi-test-song").addEventListener("click",function(){ inject([0xC0,1]); });
  renderLearn(); log("panel built v"+VERSION);
}
window.IPBMidi={version:VERSION,enabled:function(){return enabled;},init:enable,enable:enable,inject:inject,handle:handle,
 settings:function(){return JSON.parse(JSON.stringify(settings));},learnMap:function(){return JSON.parse(JSON.stringify(learnMap));},
 setLearning:function(id){learning=id; renderLearn();},devices:deviceNames,
 test:{pad:function(i,vel){inject([0x90,settings.baseNote+(i||0),vel||100]);},key:function(n){inject([0x90,n||72,100]); setTimeout(function(){inject([0x80,n||72,0]);},400);},cc:function(c,v){inject([0xB0,c,v==null?90:v]);},program:function(n){inject([0xC0,n||1]);}}};
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",build); else build();
})();
