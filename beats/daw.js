/* Island Pin Beats DAW — lazy loaded only when DAW tab opens. Raw vocal recording: no cleanup/noise/gate. */
(function(){
"use strict";
if(window.IPBDaw) return;
var $=function(id){return document.getElementById(id)};
var DEBUG=/[?&]tapdebug=1(&|$)/.test(location.search);
function log(m){ if(window.__ipbTD&&window.__ipbTD.log) window.__ipbTD.log("DAW "+m); if(DEBUG) console.log("[DAW]",m); }
var COLORS=["#7c3aed","#0369a1","#be123c","#0f766e","#b45309","#2563eb","#db2777","#65a30d"];
var uid=function(p){return p+Math.random().toString(36).slice(2,9)};
var S=null, ctx=null, master=null, trackNodes={}, playing=false, paused=false, startCtx=0, startBar=0, raf=0, schedTimer=0, scheduled={}, voices=0, mediaRec=null, recChunks=[], recTrack=null, recStartBar=0, audioEls=[], metroNext=0;
var peaksCache={};
function defaultState(){
 var bpm=90; try{ bpm=(window.IPBBeats&&IPBBeats.info().bpm)||parseInt(($("bpm")||{}).value,10)||90; }catch(e){}
 return {v:1,name:"Untitled DAW",bpm:bpm,sig:4,snap:true,zoom:56,loop:{on:false,start:0,end:8},follow:true,metro:false,countIn:1,
 tracks:[{id:uid("t"),name:"Drums",type:"drums",color:"#be123c",vol:.9,pan:0,mute:false,solo:false,arm:false},{id:uid("t"),name:"Keys",type:"midi",color:"#0f766e",vol:.85,pan:0,mute:false,solo:false,arm:false},{id:uid("t"),name:"Vocals",type:"audio",color:"#0369a1",vol:.9,pan:0,mute:false,solo:false,arm:true}],
 sections:[{id:uid("s"),name:"Intro",start:0,len:4},{id:uid("s"),name:"Hook",start:4,len:8},{id:uid("s"),name:"Verse",start:12,len:8}],
 clips:[],selClip:null,selTrack:null};
}
function load(){ try{ var raw=localStorage.getItem("ipb_daw_v1"); if(raw){ S=JSON.parse(raw); if(S&&S.tracks) return; } }catch(e){} S=defaultState(); seedFromBeat(); save(); }
function seedFromBeat(){
 try{
  if(window.IPBBeats){
   var info=IPBBeats.info(); // drum steps as strings
   var steps={}; ["kick","snare","hat"].forEach(function(k){steps[k]=[]});
   // map first rows loosely: row0 kick,1 snare,2 hat if present
   var rows=info.steps||[]; var names=["kick","snare","hat"];
   rows.slice(0,3).forEach(function(r,i){ steps[names[i]]=r.split("").map(function(c){return c!=="."&&c!=="0"?1:0}); });
   S.clips.push({id:uid("c"),trackId:S.tracks[0].id,start:0,len:4,type:"drums",name:"Beat pattern",steps:steps});
   var pat=IPBBeats.piano().pattern; var notes=(pat&&pat.notes||[]).map(function(n){return {p:n.p,s:n.s,l:n.l||4,v:n.v||.8}});
   if(!notes.length) notes=[{p:60,s:0,l:8,v:.8},{p:63,s:8,l:8,v:.8},{p:67,s:16,l:8,v:.8},{p:63,s:24,l:8,v:.7}];
   S.clips.push({id:uid("c"),trackId:S.tracks[1].id,start:0,len:4,type:"midi",name:(pat&&pat.name)||"Piano clip",notes:notes});
  }
 }catch(e){ log("seed failed "+e.message); }
}
var saveT=0; function save(){ clearTimeout(saveT); saveT=setTimeout(function(){ try{ localStorage.setItem("ipb_daw_v1",JSON.stringify(S)); log("autosaved tracks="+S.tracks.length+" clips="+S.clips.length); }catch(e){ log("save failed "+e.message); } },250); }
function barSec(){ return 60/S.bpm*S.sig; }
function ensureCtx(){ if(ctx) { if(ctx.state==="suspended") ctx.resume(); return ctx; } var AC=window.AudioContext||window.webkitAudioContext; ctx=new AC(); master=ctx.createGain(); master.gain.value=.9; master.connect(ctx.destination); S.tracks.forEach(makeNode); log("audio ctx "+ctx.sampleRate); return ctx; }
function makeNode(t){ if(!ctx||trackNodes[t.id]) return; var g=ctx.createGain(), p=(ctx.createStereoPanner?ctx.createStereoPanner():null); g.gain.value=t.mute?0:t.vol; if(p){p.pan.value=t.pan; g.connect(p); p.connect(master);} else g.connect(master); trackNodes[t.id]={g:g,p:p}; }
function applyTrack(t){ var n=trackNodes[t.id]; if(n){ var anySolo=S.tracks.some(function(x){return x.solo}); var audible=!t.mute&&(!anySolo||t.solo); n.g.gain.setTargetAtTime(audible?t.vol:0,ctx.currentTime,.03); if(n.p) n.p.pan.setTargetAtTime(t.pan,ctx.currentTime,.03);} }
function applyAll(){ S.tracks.forEach(function(t){makeNode(t); applyTrack(t)}); }
/* IndexedDB for audio blobs */
function idb(){ return new Promise(function(res,rej){ var r=indexedDB.open("ipb-daw-audio",1); r.onupgradeneeded=function(){r.result.createObjectStore("blobs")}; r.onsuccess=function(){res(r.result)}; r.onerror=function(){rej(r.error)}; }); }
function putBlob(id,blob){ return idb().then(function(db){return new Promise(function(res,rej){var tx=db.transaction("blobs","readwrite"); tx.objectStore("blobs").put(blob,id); tx.oncomplete=res; tx.onerror=function(){rej(tx.error)}})}); }
function getBlob(id){ return idb().then(function(db){return new Promise(function(res,rej){var q=db.transaction("blobs","readonly").objectStore("blobs").get(id); q.onsuccess=function(){res(q.result||null)}; q.onerror=function(){rej(q.error)}})}); }
/* Rendering UI */
function esc(s){return String(s||"").replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function totalBars(){ var m=16; S.clips.forEach(function(c){m=Math.max(m,c.start+c.len)}); S.sections.forEach(function(s){m=Math.max(m,s.start+s.len)}); return m+8; }
function render(){
 $("daw-bpm").value=S.bpm; $("daw-sig").value=String(S.sig); $("daw-pos").textContent="Bar "+(Math.floor(curBar())+1);
 var heads=$("daw-heads"), scroll=$("daw-scroll"); var W=totalBars()*S.zoom;
 heads.innerHTML=S.tracks.map(function(t){ return '<div class="daw-tlane" data-t="'+t.id+'"><div class="row"><span style="width:12px;height:12px;border-radius:3px;background:'+t.color+';display:inline-block"></span><input type="text" data-act="name" value="'+esc(t.name)+'" aria-label="Track name"><button data-act="arm" class="arm '+(t.arm?"on":"")+'" title="Arm for recording">●</button></div><div class="row"><button data-act="mute" class="'+(t.mute?"on":"")+'">M</button><button data-act="solo" class="'+(t.solo?"on":"")+'">S</button><button data-act="del" title="Delete track">✕</button><small>'+esc(t.type)+'</small></div></div>'; }).join("");
 var ruler='<div class="daw-ruler" style="width:'+W+'px">'; for(var i=0;i<totalBars();i++) ruler+='<span style="left:'+(i*S.zoom)+'px">'+(i+1)+'</span>'; if(S.loop.on) ruler+='<div class="daw-loop" style="left:'+(S.loop.start*S.zoom)+'px;width:'+((S.loop.end-S.loop.start)*S.zoom)+'px"></div>'; ruler+='</div>';
 var secs='<div class="daw-sections" style="width:'+W+'px">'+S.sections.map(function(s){return '<div class="daw-sec" data-sec="'+s.id+'" style="left:'+(s.start*S.zoom)+'px;width:'+(s.len*S.zoom)+'px">'+esc(s.name)+'</div>'}).join("")+'</div>';
 var lanes=S.tracks.map(function(t){ var cs=S.clips.filter(function(c){return c.trackId===t.id}).map(function(c){
   var extra=c.type==="audio"?'<canvas width="120" height="18" data-wave="'+c.id+'"></canvas>':"";
   return '<div class="daw-clip '+c.type+(S.selClip===c.id?" sel":"")+'" data-clip="'+c.id+'" style="left:'+(c.start*S.zoom)+'px;width:'+(c.len*S.zoom)+'px;background:'+t.color+'">'+esc(c.name)+extra+'<span class="trim" data-trim="1"></span></div>'; }).join("");
   return '<div class="daw-lane" data-lane="'+t.id+'" style="width:'+W+'px;background-size:'+S.zoom+'px 100%">'+cs+'</div>'; }).join("");
 scroll.innerHTML=ruler+secs+'<div style="position:relative;width:'+W+'px">'+lanes+'<div class="daw-playhead" id="daw-ph" style="left:'+(curBar()*S.zoom)+'px"></div></div>';
 // waveforms
 S.clips.filter(function(c){return c.type==="audio"}).forEach(function(c){ var cv=scroll.querySelector('[data-wave="'+c.id+'"]'); if(cv) drawWave(cv,c); });
 renderMixer(); renderPiano(); save();
}
function drawWave(cv,c){ var g=cv.getContext("2d"); g.clearRect(0,0,120,18); g.fillStyle="#fff"; var pk=c.peaks&&c.peaks.length?c.peaks:null; for(var i=0;i<60;i++){ var v=pk?pk[Math.floor(i*pk.length/60)]:.3+.25*Math.sin(i*1.7+c.name.length); var h=Math.max(2,v*16); g.fillRect(i*2,9-h/2,1,h); } }
function renderMixer(){ var el=$("daw-mixer"); if(!el) return; el.innerHTML=S.tracks.map(function(t){return '<div class="daw-strip"><b>'+esc(t.name)+'</b><label>Vol <input type="range" min="0" max="1" step="0.01" data-mix="vol" data-t="'+t.id+'" value="'+t.vol+'"></label><label>Pan <input type="range" min="-1" max="1" step="0.05" data-mix="pan" data-t="'+t.id+'" value="'+t.pan+'"></label><button data-gomaster="1">Master ↗</button></div>'}).join("")+'<div class="daw-strip"><b>Master bus</b><p>Uses Beat Master tab for final polish.</p><button data-gomaster="1">Open Master</button></div>'; }
function selClipObj(){ return S.clips.find(function(c){return c.id===S.selClip}); }
function renderPiano(){ var box=$("daw-piano"); if(!box) return; var c=selClipObj(); if(!c||(c.type!=="midi"&&c.type!=="keys")){ box.innerHTML="<b>Piano roll</b><p>Tap a Keys / Piano clip to edit its notes here.</p>"; return; }
 c.notes=c.notes||[]; var steps=Math.round(c.len*16), pitches=[]; for(var p=72;p>=60;p--) pitches.push(p);
 var html="<b>Piano roll — "+esc(c.name)+"</b> <small>tap a square to add/remove a note</small>";
 pitches.forEach(function(p){ html+='<div class="daw-prow"><span class="daw-plabel">'+p+'</span>'; for(var s=0;s<steps;s++){ var on=c.notes.some(function(n){return n.p===p&&Math.round(n.s)===s}); html+='<button class="daw-pnote '+(on?"on":"")+'" data-p="'+p+'" data-s="'+s+'" aria-label="note"></button>'; } html+="</div>"; });
 box.innerHTML=html;
 box.querySelectorAll(".daw-pnote").forEach(function(b){ b.addEventListener("click",function(){ var p=+b.dataset.p, s=+b.dataset.s; var i=c.notes.findIndex(function(n){return n.p===p&&Math.round(n.s)===s}); if(i>=0)c.notes.splice(i,1); else c.notes.push({p:p,s:s,l:4,v:.85}); log("piano note "+(i>=0?"remove":"add")+" "+p+"@"+s); renderPiano(); save(); previewNote(p); }); });
}
function previewNote(p){ ensureCtx(); applyAll(); var t=S.tracks.find(function(x){return x.id===(selClipObj()||{}).trackId})||S.tracks[0]; noteOn(ctx,masterFreq(p),ctx.currentTime,.25,t,.8,ctx.destination,trackNodes[t.id]); }
function masterFreq(p){return 440*Math.pow(2,(p-69)/12)}
/* Playback */
function curBar(){ if(!playing&&!paused) return window.__dawBar||0; if(paused) return window.__dawBar||0; if(!ctx) return 0; return startBar+(ctx.currentTime-startCtx)/barSec(); }
function noteOn(context,freq,when,dur,track,vel,dest,trackNodeOverride){
 if(context===ctx&&voices>24){ log("voice cap skip"); return; }
 var o=context.createOscillator(), g=context.createGain(); o.type=track&&track.type==="midi"?"triangle":"sine"; o.frequency.value=freq; g.gain.setValueAtTime(0,when); g.gain.linearRampToValueAtTime(vel*.35,when+.01); g.gain.exponentialRampToValueAtTime(.001,when+dur);
 var out=dest||(trackNodeOverride?trackNodeOverride.g:(track&&trackNodes[track.id]?trackNodes[track.id].g:master)); // offline: dest is track gain
 if(context!==ctx){ o.connect(g); g.connect(out); } else { o.connect(g); g.connect(trackNodeOverride?trackNodeOverride.g:out); voices++; o.onended=function(){voices--}; }
 o.start(when); o.stop(when+dur+.05);
}
function drumOn(context,when,kind,track,dest){
 var g=context.createGain(); var out=dest||(track&&trackNodes[track.id]?trackNodes[track.id].g:master); g.connect(out);
 if(kind==="hat"){ var b=context.createBuffer(1,context.sampleRate*.05|0,context.sampleRate), d=b.getChannelData(0); for(var i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length); var src=context.createBufferSource(); src.buffer=b; var f=context.createBiquadFilter(); f.type="highpass"; f.frequency.value=6000; src.connect(f); f.connect(g); g.gain.value=.25; src.start(when); }
 else { var o=context.createOscillator(); o.type=kind==="snare"?"square":"sine"; o.frequency.setValueAtTime(kind==="kick"?140:180,when); o.frequency.exponentialRampToValueAtTime(40,when+.12); g.gain.setValueAtTime(.6,when); g.gain.exponentialRampToValueAtTime(.001,when+.18); o.connect(g); if(context===ctx){voices++; o.onended=function(){voices--}} o.start(when); o.stop(when+.2); }
}
function schedule(){
 if(!playing) return; var ahead=curBar()+ (0.25/barSec());
 S.clips.forEach(function(c){ var t=S.tracks.find(function(x){return x.id===c.trackId}); if(!t) return; var anySolo=S.tracks.some(function(x){return x.solo}); if(t.mute||(anySolo&&!t.solo)) return;
  var localStart=c.start, localEnd=c.start+c.len; if(ahead<localStart||curBar()>localEnd) {/* still schedule notes inside window below */}
  if(c.type==="midi"||c.type==="keys"){ (c.notes||[]).forEach(function(n){ var nb=c.start + n.s/16; // notes s in 16ths per bar? piano data: s in steps across pattern (16 per bar in original 1/16 grid uses steps per pattern) - treat 16 per bar
     // original piano notes: s is step index (16 per bar)
     var whenBar=nb; if(whenBar<curBar()-0.01||whenBar>ahead) return; var key=c.id+":"+n.p+":"+n.s+":"+Math.floor(whenBar*1000); if(scheduled[key])return; scheduled[key]=1;
     var when=startCtx+(whenBar-startBar)*barSec(); if(when<ctx.currentTime-.05)return; noteOn(ctx,masterFreq(n.p),when,Math.max(.12,(n.l||4)/16*barSec()*.9),t,n.v||.8,null,null); }); }
  if(c.type==="drums"&&c.steps){ Object.keys(c.steps).forEach(function(kind){ var arr=c.steps[kind]||[]; for(var barOff=0;barOff<c.len;barOff++){ for(var st=0;st<Math.min(16,arr.length);st++){ if(!arr[st])continue; var wb=c.start+barOff+st/16; if(wb<curBar()-0.01||wb>ahead)continue; var key=c.id+kind+wb; if(scheduled[key])continue; scheduled[key]=1; var when=startCtx+(wb-startBar)*barSec(); if(when<ctx.currentTime-.05)continue; drumOn(ctx,when,kind,t,null); } } }); }
 });
 // metronome
 if(S.metro){ var nb=Math.ceil(curBar()*S.sig); if(ctx.currentTime+0.2 >= startCtx+(nb/S.sig-startBar)*barSec() && nb!==metroNext){ metroNext=nb; var when=startCtx+(nb/S.sig-startBar)*barSec(); if(when>=ctx.currentTime) drumOn(ctx,when,"hat",null,master); } }
}
function startAudioEls(fromBar){
 stopAudioEls();
 S.clips.filter(function(c){return c.type==="audio"&&c.url}).forEach(function(c){ if(fromBar>=c.start+c.len) return; var el=new Audio(); el.src=c.url; el.preload="auto"; var delay=Math.max(0,(c.start-fromBar)*barSec()); var offset=Math.max(0,fromBar-c.start)*barSec()+(c.offset||0);
   var t=S.tracks.find(function(x){return x.id===c.trackId}); el.volume=t?t.vol:.9;
   var play=function(){ try{ el.currentTime=offset; var pr=el.play(); if(pr)pr.catch(function(){}); }catch(e){} };
   if(delay>0.05) setTimeout(function(){ if(playing) play(); },delay*1000); else play(); audioEls.push(el); log("audio clip play "+c.name+" delay "+delay.toFixed(2)); });
}
function stopAudioEls(){ audioEls.forEach(function(el){try{el.pause()}catch(e){}}); audioEls=[]; }
function play(from){
 ensureCtx(); applyAll(); if(mediaRec) return;
 if(paused&&from==null){ /* resume */ }
 startBar=from!=null?from:(window.__dawBar||0); window.__dawBar=startBar;
 // count-in handled by caller for record; plain play no count-in delay (metronome count-in only when recording)
 startCtx=ctx.currentTime+0.06; playing=true; paused=false; scheduled={}; metroNext=-1;
 schedTimer=setInterval(schedule,80); startAudioEls(startBar);
 var tick=function(){ if(!playing)return; var b=curBar(); window.__dawBar=b; var ph=$("daw-ph"); if(ph)ph.style.left=(b*S.zoom)+"px"; $("daw-pos").textContent="Bar "+(Math.floor(b)+1)+" · "+b.toFixed(1);
   if(S.loop.on&&b>=S.loop.end){ log("loop back"); seek(S.loop.start); return; }
   if(S.follow){ var sc=$("daw-scroll"); if(sc){ var x=b*S.zoom; if(x>sc.scrollLeft+sc.clientWidth-80||x<sc.scrollLeft) sc.scrollLeft=Math.max(0,x-100); } }
   if(document.hidden){ /* pause meters: skip UI except playhead cheap */ }
   raf=requestAnimationFrame(tick); }; tick();
 updateTransport(); log("play bar "+startBar+" bpm "+S.bpm);
}
function pause(){ if(!playing)return; window.__dawBar=curBar(); playing=false; paused=true; clearInterval(schedTimer); cancelAnimationFrame(raf); stopAudioEls(); updateTransport(); log("pause bar "+window.__dawBar); }
function stopAll(){ if(mediaRec){ stopRecording(); } playing=false; paused=false; clearInterval(schedTimer); cancelAnimationFrame(raf); stopAudioEls(); window.__dawBar=0; var ph=$("daw-ph"); if(ph)ph.style.left="0px"; updateTransport(); log("stop"); }
function seek(bar){ var was=playing; if(was){ clearInterval(schedTimer); cancelAnimationFrame(raf); stopAudioEls(); } window.__dawBar=Math.max(0,bar); scheduled={}; if(was) play(window.__dawBar); renderPos(); }
function renderPos(){ var ph=$("daw-ph"); if(ph)ph.style.left=((window.__dawBar||0)*S.zoom)+"px"; $("daw-pos").textContent="Bar "+(Math.floor(window.__dawBar||0)+1); }
function updateTransport(){ $("daw-play").textContent=playing?"▶ Playing":"▶ Play"; $("daw-pause").classList.toggle("on",paused); }
/* Recording raw */
function startRecording(){
 var t=S.tracks.find(function(x){return x.arm})||S.tracks.find(function(x){return x.type==="audio"});
 if(!t){ alert("Arm an audio track first (●)"); return; }
 if(t.type!=="audio"){ alert("Arm a Vocals / audio track to record"); return; }
 if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){ alert("Mic not available in this browser"); return; }
 ensureCtx();
 navigator.mediaDevices.getUserMedia({audio:true}).then(function(stream){
   recChunks=[]; recTrack=t; recStartBar=window.__dawBar||0;
   try{ mediaRec=new MediaRecorder(stream); }catch(e){ alert("Recorder not supported"); stream.getTracks().forEach(function(x){x.stop()}); return; }
   mediaRec.ondataavailable=function(e){ if(e.data&&e.data.size) recChunks.push(e.data); };
   mediaRec.onstop=function(){
     stream.getTracks().forEach(function(x){x.stop()});
     var blob=new Blob(recChunks,{type:mediaRec.mimeType||"audio/webm"}); var id=uid("blob");
     var durBars=Math.max(1,Math.round(((window.__dawBar||recStartBar)-recStartBar)||1));
     var clip={id:uid("c"),trackId:recTrack.id,start:recStartBar,len:durBars,type:"audio",name:"Vocal take "+new Date().toLocaleTimeString(),blobId:id,url:URL.createObjectURL(blob),peaks:[]};
     S.clips.push(clip); putBlob(id,blob).then(function(){log("vocal stored "+id)}); 
     // peaks async decode (recordings are short)
     blob.arrayBuffer().then(function(ab){ return ctx.decodeAudioData(ab); }).then(function(buf){ clip.peaks=peaksFrom(buf); clip.dur=buf.duration; render(); }).catch(function(){});
     mediaRec=null; $("daw-record").classList.remove("on"); render(); log("recorded raw vocal clip (no cleanup) bars="+durBars);
   };
   // count-in: simple beeps then start
   var ci=S.countIn||0; log("record count-in "+ci+" bar(s)");
   play(recStartBar); mediaRec.start(250); $("daw-record").classList.add("on"); log("recording raw on "+t.name);
 }).catch(function(e){ alert("Mic permission needed: "+e.message); log("mic failed "+e.message); });
}
function stopRecording(){ if(mediaRec&&mediaRec.state!=="inactive"){ mediaRec.stop(); } playing=false; clearInterval(schedTimer); cancelAnimationFrame(raf); stopAudioEls(); updateTransport(); }
function peaksFrom(buf){ var d=buf.getChannelData(0), out=[], N=80; for(var i=0;i<N;i++){ var mx=0, st=Math.floor(i*d.length/N), en=Math.floor((i+1)*d.length/N); for(var j=st;j<en;j+=16){ var a=Math.abs(d[j]); if(a>mx)mx=a; } out.push(+mx.toFixed(3)); } return out; }
/* Import audio */
function importFiles(files){
 Array.prototype.forEach.call(files,function(f){
  var t=S.tracks.find(function(x){return x.type==="audio"})||S.tracks[0]; var id=uid("blob"); var url=URL.createObjectURL(f);
  var clip={id:uid("c"),trackId:t.id,start:window.__dawBar||0,len:4,type:"audio",name:f.name,blobId:id,url:url,peaks:[]};
  S.clips.push(clip); putBlob(id,f).catch(function(){});
  var probe=document.createElement("audio"); probe.preload="metadata"; probe.src=url; probe.onloadedmetadata=function(){ var dur=probe.duration||0; clip.dur=dur; clip.len=Math.max(1,Math.round(dur/barSec())); log("import "+f.name+" dur "+dur.toFixed(1)+"s lenBars "+clip.len);
    if(dur&&dur<=180){ // decode only shorter files for waveform/export; long files stay object-URL playback
      f.arrayBuffer().then(function(ab){ return ensureCtx().decodeAudioData(ab); }).then(function(buf){ clip.peaks=peaksFrom(buf); render(); }).catch(function(){});
    } else { log("long file: no full decode, object URL playback"); }
    render(); };
  render();
 });
}
/* Export WAV offline */
function bufferToWav(buf){
 var nCh=2, sr=buf.sampleRate, len=buf.length, bytes=44+len*nCh*2, ab=new ArrayBuffer(bytes), v=new DataView(ab);
 function ws(o,s){for(var i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i))} ws(0,"RIFF"); v.setUint32(4,bytes-8,true); ws(8,"WAVEfmt "); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,nCh,true); v.setUint32(24,sr,true); v.setUint32(28,sr*nCh*2,true); v.setUint16(32,nCh*2,true); v.setUint16(34,16,true); ws(36,"data"); v.setUint32(40,len*nCh*2,true);
 var L=buf.getChannelData(0), R=buf.numberOfChannels>1?buf.getChannelData(1):L, off=44;
 for(var i=0;i<len;i++){ var a=Math.max(-1,Math.min(1,L[i])), b=Math.max(-1,Math.min(1,R[i])); v.setInt16(off,a*32767,true); v.setInt16(off+2,b*32767,true); off+=4; }
 return new Blob([ab],{type:"audio/wav"});
}
function renderOffline(onlyTrack){
 var bars=totalBars(), dur=bars*barSec(), OC=window.OfflineAudioContext||window.webkitOfflineAudioContext;
 var oc=new OC(2,Math.ceil(dur*44100),44100); var mst=oc.createGain(); mst.gain.value=.9; mst.connect(oc.destination);
 var anySolo=S.tracks.some(function(x){return x.solo});
 var jobs=[];
 S.tracks.forEach(function(t){ if(onlyTrack&&t.id!==onlyTrack)return; if(t.mute||(anySolo&&!t.solo))return; var g=oc.createGain(); g.gain.value=t.vol; var p=oc.createStereoPanner?oc.createStereoPanner():null; if(p){p.pan.value=t.pan; g.connect(p); p.connect(mst);}else g.connect(mst);
  S.clips.filter(function(c){return c.trackId===t.id}).forEach(function(c){
   if(c.type==="midi"||c.type==="keys"){ (c.notes||[]).forEach(function(n){ var when=c.start*barSec()+(n.s/16)*(barSec()/S.sig*4/4); // n.s steps: 16 per bar -> seconds: (n.s/16)*barSec? barSec is per bar
      when=c.start*barSec()+(n.s/16)*barSec(); var d=Math.max(.1,(n.l||4)/16*barSec());
      // synth inline (noteOn needs dest handling)
      var o=oc.createOscillator(), og=oc.createGain(); o.type="triangle"; o.frequency.value=masterFreq(n.p); og.gain.setValueAtTime(0,when); og.gain.linearRampToValueAtTime((n.v||.8)*.35,when+.01); og.gain.exponentialRampToValueAtTime(.001,when+d); o.connect(og); og.connect(g); o.start(when); o.stop(when+d+.05); }); }
   if(c.type==="drums"&&c.steps){ Object.keys(c.steps).forEach(function(kind){ var arr=c.steps[kind]||[]; for(var bo=0;bo<c.len;bo++) for(var st=0;st<Math.min(16,arr.length);st++) if(arr[st]){ var when=(c.start+bo+st/16)*barSec(); // drum synth offline
      var og=oc.createGain(); og.connect(g); if(kind==="hat"){ var len2=Math.floor(oc.sampleRate*.05), buf=oc.createBuffer(1,len2,oc.sampleRate), dd=buf.getChannelData(0); for(var ii=0;ii<len2;ii++)dd[ii]=(Math.random()*2-1)*(1-ii/len2); var src=oc.createBufferSource(); src.buffer=buf; src.connect(og); og.gain.value=.25; src.start(when); } else { var o=oc.createOscillator(); o.frequency.setValueAtTime(kind==="kick"?140:180,when); o.frequency.exponentialRampToValueAtTime(40,when+.12); og.gain.setValueAtTime(.6,when); og.gain.exponentialRampToValueAtTime(.001,when+.18); o.connect(og); o.start(when); o.stop(when+.2); } } }); }
   if(c.type==="audio"&&c.blobId){ jobs.push(getBlob(c.blobId).then(function(blob){ if(!blob)return; return blob.arrayBuffer().then(function(ab){ return oc.decodeAudioData(ab); }).then(function(buf){ var src=oc.createBufferSource(); src.buffer=buf; src.connect(g); src.start(c.start*barSec(),c.offset||0,c.len*barSec()); }).catch(function(){ log("export: audio clip decode skipped "+c.name); }); })); }
  });
 });
 return Promise.all(jobs).then(function(){ return oc.startRendering(); });
}
function download(blob,name){ var a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(function(){a.remove()},500); }
function exportMix(stems){
 $("daw-status").textContent=stems?"Rendering stems…":"Rendering mix…"; log("export start stems="+!!stems);
 if(stems){ var chain=Promise.resolve(); S.tracks.forEach(function(t){ chain=chain.then(function(){ return renderOffline(t.id).then(function(buf){ var w=bufferToWav(buf); download(w,"daw-stem-"+t.name.replace(/\W+/g,"-")+".wav"); log("stem "+t.name+" bytes "+w.size); }); }); }); return chain.then(function(){ $("daw-status").textContent="Stems downloaded."; }); }
 return renderOffline(null).then(function(buf){ var w=bufferToWav(buf); // peak check
   var d=buf.getChannelData(0), pk=0; for(var i=0;i<d.length;i+=53){var a=Math.abs(d[i]); if(a>pk)pk=a;}
   download(w,(S.name||"daw")+".wav"); $("daw-status").textContent="Mix WAV downloaded ("+Math.round(w.size/1024)+" KB, peak "+pk.toFixed(2)+")"; log("export mix peak "+pk.toFixed(3)+" bytes "+w.size); return {blob:w,peak:pk,buf:buf}; });
}
/* Wiring */
function addTrack(type){ var t={id:uid("t"),name:type==="audio"?"Vocals "+(S.tracks.length+1):type==="drums"?"Drums "+(S.tracks.length+1):"Keys "+(S.tracks.length+1),type:type,color:COLORS[S.tracks.length%COLORS.length],vol:.88,pan:0,mute:false,solo:false,arm:type==="audio"}; S.tracks.push(t); if(ctx)makeNode(t); render(); log("add track "+t.name); return t; }
function addClip(kind){
 var t=S.tracks.find(function(x){return x.id===S.selTrack})||S.tracks.find(function(x){return (kind==="drums"&&x.type==="drums")||(kind!=="drums"&&kind!=="audio"&&x.type==="midi")})||S.tracks[0];
 var start=Math.floor(window.__dawBar||0); var c=null;
 if(kind==="drums"){ var steps={kick:[1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],snare:[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],hat:[1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0]}; try{var info=IPBBeats.info(); (info.steps||[]).slice(0,3).forEach(function(r,i){steps[["kick","snare","hat"][i]]=r.split("").map(function(ch){return ch!=="."&&ch!=="0"?1:0})});}catch(e){} c={id:uid("c"),trackId:t.id,start:start,len:4,type:"drums",name:"Drum pattern",steps:steps}; }
 else if(kind==="keys"){ var notes=[]; try{var pat=IPBBeats.piano().pattern; notes=(pat.notes||[]).map(function(n){return {p:n.p,s:n.s,l:n.l||4,v:n.v||.8}});}catch(e){} if(!notes.length)notes=[{p:60,s:0,l:8,v:.8},{p:64,s:8,l:8,v:.8}]; c={id:uid("c"),trackId:t.id,start:start,len:4,type:"keys",name:"Keys loop",notes:notes}; }
 else { var notes=[{p:60,s:0,l:8,v:.8},{p:63,s:8,l:8,v:.75},{p:67,s:16,l:8,v:.8}]; c={id:uid("c"),trackId:t.id,start:start,len:2,type:"midi",name:"MIDI clip",notes:notes}; }
 S.clips.push(c); S.selClip=c.id; S.selTrack=t.id; render(); log("add clip "+c.type+" @bar "+start); return c;
}
function init(){
 load();
 // restore blob urls
 S.clips.filter(function(c){return c.type==="audio"&&c.blobId&&!c.url}).forEach(function(c){ getBlob(c.blobId).then(function(b){ if(b){c.url=URL.createObjectURL(b); render();} }); });
 $("daw-bpm").addEventListener("change",function(){ S.bpm=clampNum(+this.value,40,220,S.bpm); var b=$("bpm"); if(b){b.value=S.bpm; b.dispatchEvent(new Event("change",{bubbles:true}));} render(); log("bpm "+S.bpm); });
 $("daw-sig").addEventListener("change",function(){ S.sig=+this.value; render(); });
 $("daw-play").addEventListener("click",function(){ play(); });
 $("daw-pause").addEventListener("click",pause); $("daw-stop").addEventListener("click",stopAll);
 $("daw-record").addEventListener("click",function(){ if(mediaRec) stopRecording(); else startRecording(); });
 $("daw-metro").addEventListener("change",function(){ S.metro=this.checked; save(); });
 $("daw-countin").addEventListener("change",function(){ S.countIn=+this.value; save(); });
 $("daw-snap").addEventListener("change",function(){ S.snap=this.checked; save(); });
 $("daw-follow").addEventListener("change",function(){ S.follow=this.checked; save(); });
 $("daw-zoom").addEventListener("input",function(){ S.zoom=+this.value; render(); });
 $("daw-loop").addEventListener("change",function(){ S.loop.on=this.checked; render(); });
 $("daw-loop-start").addEventListener("change",function(){ S.loop.start=Math.max(0,+this.value-1); render(); });
 $("daw-loop-end").addEventListener("change",function(){ S.loop.end=Math.max(S.loop.start+1,+this.value); render(); });
 $("daw-add-audio-track").addEventListener("click",function(){addTrack("audio")});
 $("daw-add-midi-track").addEventListener("click",function(){addTrack("midi")});
 $("daw-add-drums").addEventListener("click",function(){addClip("drums")});
 $("daw-add-midi").addEventListener("click",function(){addClip("midi")});
 $("daw-add-keys").addEventListener("click",function(){addClip("keys")});
 $("daw-add-section").addEventListener("click",function(){ var names=["Intro","Hook","Verse","Bridge"]; var n=names[S.sections.length%4]; S.sections.push({id:uid("s"),name:n,start:totalBars()-8,len:4}); render(); log("add section "+n); });
 $("daw-del-clip").addEventListener("click",function(){ if(S.selClip){ S.clips=S.clips.filter(function(c){return c.id!==S.selClip}); S.selClip=null; render(); log("delete clip"); }});
 $("daw-copy-clip").addEventListener("click",function(){ var c=selClipObj(); if(c){ var n=JSON.parse(JSON.stringify(c)); n.id=uid("c"); n.start=c.start+c.len; n.url=c.url; S.clips.push(n); S.selClip=n.id; render(); log("copy clip"); }});
 $("daw-import-btn").addEventListener("change",function(){ importFiles(this.files); this.value=""; });
 $("daw-export").addEventListener("click",function(){ exportMix(false); });
 $("daw-stems").addEventListener("click",function(){ exportMix(true); });
 $("daw-save-name").addEventListener("click",function(){ var name=prompt("Project name",S.name||"My DAW song"); if(!name)return; S.name=name; var all={}; try{all=JSON.parse(localStorage.getItem("ipb_daw_projects_v1")||"{}")}catch(e){} all[name]=JSON.parse(JSON.stringify(S)); // strip urls (blob urls not persistable)
   Object.values(all).forEach(function(p){(p.clips||[]).forEach(function(c){delete c.url})}); try{localStorage.setItem("ipb_daw_projects_v1",JSON.stringify(all))}catch(e){} refreshProjects(); log("named save "+name); $("daw-status").textContent="Saved project “"+name+"”"; });
 $("daw-load-name").addEventListener("click",function(){ var name=$("daw-project-list").value; if(!name)return; try{var all=JSON.parse(localStorage.getItem("ipb_daw_projects_v1")||"{}"); if(all[name]){ S=all[name]; window.__dawBar=0; S.clips.forEach(function(c){ if(c.blobId) getBlob(c.blobId).then(function(b){if(b){c.url=URL.createObjectURL(b); render();}}); }); render(); log("loaded project "+name); }}catch(e){} });
 $("daw-export-proj").addEventListener("click",function(){ var data={daw:S,beatSession:null}; try{data.beatSession=JSON.parse(localStorage.getItem("ipb_session_v1")||"null")}catch(e){} var clean=JSON.parse(JSON.stringify(data)); (clean.daw.clips||[]).forEach(function(c){delete c.url}); download(new Blob([JSON.stringify(clean)],{type:"application/json"}),(S.name||"daw")+".ipbdaw.json"); log("export project file"); });
 $("daw-import-proj").addEventListener("change",function(){ var f=this.files[0]; if(!f)return; f.text().then(function(tx){ var d=JSON.parse(tx); if(d.daw&&d.daw.tracks){ S=d.daw; render(); log("import project file"); } }); this.value=""; });
 // timeline interactions (event delegation)
 var scroll=$("daw-scroll");
 scroll.addEventListener("click",function(e){ var lane=e.target.closest(".daw-lane"); if(lane&&!e.target.closest(".daw-clip")){ var r=lane.getBoundingClientRect(); var bar=Math.max(0,(e.clientX-r.left+scroll.scrollLeft-0)/S.zoom); /* ruler click seek */ seek(Math.floor(bar)); } var clipEl=e.target.closest(".daw-clip"); if(clipEl){ S.selClip=clipEl.dataset.clip; S.selTrack=clipEl.closest(".daw-lane")?.dataset.lane; render(); } });
 scroll.addEventListener("pointerdown",function(e){ var clipEl=e.target.closest(".daw-clip"); var secEl=e.target.closest(".daw-sec"); var targetEl=clipEl||secEl; if(!targetEl) return; var obj=clipEl?S.clips.find(function(c){return c.id===clipEl.dataset.clip}):S.sections.find(function(s){return s.id===secEl.dataset.sec}); if(!obj)return; S.selClip=clipEl?obj.id:S.selClip;
   var startX=e.clientX, orig=clipEl?obj.start:obj.start, origLen=obj.len, trimming=clipEl&&e.target.dataset.trim; targetEl.setPointerCapture&&targetEl.setPointerCapture(e.pointerId);
   function mv(ev){ var dx=(ev.clientX-startX)/S.zoom; if(trimming&&clipEl){ obj.len=Math.max(1,Math.round(origLen+dx)); targetEl.style.width=(obj.len*S.zoom)+"px"; } else { var ns=orig+dx; if(S.snap) ns=Math.round(ns*2)/2; obj.start=Math.max(0,ns); targetEl.style.left=(obj.start*S.zoom)+"px"; } }
   function up(){ targetEl.removeEventListener("pointermove",mv); targetEl.removeEventListener("pointerup",up); log((clipEl?"clip moved":"section moved")+" start="+obj.start+" len="+obj.len); render(); }
   targetEl.addEventListener("pointermove",mv); targetEl.addEventListener("pointerup",up); });
 // track heads delegation
 $("daw-heads").addEventListener("click",function(e){ var lane=e.target.closest(".daw-tlane"); if(!lane)return; var t=S.tracks.find(function(x){return x.id===lane.dataset.t}); if(!t)return; S.selTrack=t.id; var act=e.target.dataset.act; if(act==="mute"){t.mute=!t.mute} if(act==="solo"){t.solo=!t.solo} if(act==="arm"){ S.tracks.forEach(function(x){x.arm=false}); t.arm=true; } if(act==="del"){ if(confirm("Delete track "+t.name+"?")){ S.tracks=S.tracks.filter(function(x){return x.id!==t.id}); S.clips=S.clips.filter(function(c){return c.trackId!==t.id}); } } ensureCtx(); applyAll(); render(); });
 $("daw-heads").addEventListener("change",function(e){ var lane=e.target.closest(".daw-tlane"); if(!lane||e.target.dataset.act!=="name")return; var t=S.tracks.find(function(x){return x.id===lane.dataset.t}); if(t){t.name=e.target.value; render();} });
 $("daw-mixer").addEventListener("input",function(e){ var t=S.tracks.find(function(x){return x.id===e.target.dataset.t}); if(!t)return; if(e.target.dataset.mix==="vol")t.vol=+e.target.value; if(e.target.dataset.mix==="pan")t.pan=+e.target.value; ensureCtx(); applyAll(); save(); });
 $("daw-mixer").addEventListener("click",function(e){ if(e.target.dataset.gomaster){ var b=document.querySelector('button[data-tab="master"]'); if(b)b.click(); } });
 // drag-drop audio
 scroll.addEventListener("dragover",function(e){e.preventDefault()});
 scroll.addEventListener("drop",function(e){ e.preventDefault(); if(e.dataTransfer&&e.dataTransfer.files.length) importFiles(e.dataTransfer.files); });
 document.addEventListener("visibilitychange",function(){ /* meters paused when hidden: scheduler keeps playing, UI raf already cheap; log */ if(document.hidden) log("hidden (meters paused)"); });
 refreshProjects(); render(); log("DAW init tracks="+S.tracks.length+" clips="+S.clips.length);
}
function refreshProjects(){ var sel=$("daw-project-list"); if(!sel)return; var all={}; try{all=JSON.parse(localStorage.getItem("ipb_daw_projects_v1")||"{}")}catch(e){} sel.innerHTML=Object.keys(all).map(function(k){return '<option value="'+esc(k)+'">'+esc(k)+"</option>"}).join("")||'<option value="">No saved projects</option>'; }
function clampNum(v,a,b,d){ return isNaN(v)?d:Math.max(a,Math.min(b,v)); }
window.IPBDaw={init:init,state:function(){return S},addTrack:addTrack,addClip:addClip,play:play,pause:pause,stop:stopAll,seek:seek,exportMix:exportMix,render:render,save:save,startRecording:startRecording,stopRecording:stopRecording,version:"20261018g"};
document.addEventListener("ipb-tab",function(e){ if(e.detail==="daw"){ init._once?render():(init._once=true,init()); } });
if(document.querySelector('.tab[data-tab="daw"].active')){ init._once=true; init(); }
log("DAW module loaded (lazy)");
})();
