/* Sing in my voice — Lyrics page. Draft vocal in-browser (Isle Voice sing.js/Kokoro, shared, not copied),
   then true voice conversion in the free Isle Voice RVC Colab notebook. An RVC .pth cannot run in-page:
   this module is honest about that — it stores a Voice Clone profile on-device, builds the Colab package,
   and imports the converted WAV back onto a Studio vocal track + as a Beat vocal take (labelled generated).
   Recordings stay raw: this generated vocal is never passed off as a recording. */
(function(){
"use strict";
if(window.IPBSingVoice) return;
var VERSION="20261018k";
var COLAB_URL="https://colab.research.google.com/github/madinc47-prog/madinc47-prog.github.io/blob/main/isle-voice/colab/IsleVoice_RVC.ipynb";
var LS_KEY="ipb_voice_clone_v1", DB_NAME="ipb-voice-clone-v1";
var $=function(id){return document.getElementById(id)};
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function safeName(s){return String(s||"song").replace(/[^\w\- ]+/g,"").trim().replace(/\s+/g,"_").slice(0,60)||"song"}
function log(m){ if(window.__ipbTD&&window.__ipbTD.log) window.__ipbTD.log("SingVoice "+m); if(/[?&]tapdebug=1(&|$)/.test(location.search)) console.log("[SingVoice]",m); }
/* ---- tiny IndexedDB blob store (profile audio/files stay on-device) ---- */
function db(){ return new Promise(function(res,rej){ var r=indexedDB.open(DB_NAME,1); r.onupgradeneeded=function(){r.result.createObjectStore("blobs")}; r.onsuccess=function(){res(r.result)}; r.onerror=function(){rej(r.error)}; }); }
function putB(k,b){ return db().then(function(d){return new Promise(function(res,rej){var tx=d.transaction("blobs","readwrite"); tx.objectStore("blobs").put(b,k); tx.oncomplete=res; tx.onerror=function(){rej(tx.error)};});}); }
function getB(k){ return db().then(function(d){return new Promise(function(res,rej){var q=d.transaction("blobs","readonly").objectStore("blobs").get(k); q.onsuccess=function(){res(q.result||null)}; q.onerror=function(){rej(q.error)};});}).catch(function(){return null}); }
/* ---- profile ---- */
function loadProfile(){ try{ var p=JSON.parse(localStorage.getItem(LS_KEY)||"null"); if(p&&typeof p==="object") return p; }catch(e){} return {name:"Emmanuel Griffith",modelName:"emmanuel",refName:"",refSecs:0,modelFiles:[],created:Date.now()}; }
var P=loadProfile();
function saveProfile(){ try{ localStorage.setItem(LS_KEY,JSON.stringify(P)); }catch(e){} renderProfile(); }
function renderProfile(){ var el=$("sv-profile-info"); if(!el) return;
  var bits=[];
  bits.push("Voice Clone profile: <b>"+esc(P.name||"My voice")+"</b> · model name <b>"+esc(P.modelName||"emmanuel")+"</b>");
  bits.push(P.refName?("Reference clip on this device: "+esc(P.refName)+(P.refSecs?" ("+Math.round(P.refSecs)+"s)":"")):"No reference clip yet — add one below (your Isle Voice voice-bank clip works).");
  bits.push(P.modelFiles&&P.modelFiles.length?("Model file(s) recorded for the Colab step: "+P.modelFiles.map(function(f){return esc(f.name)}).join(", ")+" — upload the same .pth/.index in Colab / put them in Google Drive › IsleVoice › models › "+esc(P.modelName||"emmanuel")):"No trained .pth found on this device — Colab will train one from your reference clip(s) the first time (that is the normal path).");
  el.innerHTML=bits.join("<br>");
}
/* ---- WAV + ZIP (STORE) helpers ---- */
function wavBlob(ch,sr){ var n=ch.length, ab=new ArrayBuffer(44+n*2), v=new DataView(ab); function ws(o,s){for(var i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i))} ws(0,"RIFF"); v.setUint32(4,36+n*2,true); ws(8,"WAVEfmt "); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true); v.setUint32(24,sr,true); v.setUint32(28,sr*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true); ws(36,"data"); v.setUint32(40,n*2,true); for(var i=0;i<n;i++){var a=Math.max(-1,Math.min(1,ch[i])); v.setInt16(44+i*2,a*32767,true);} return new Blob([ab],{type:"audio/wav"}); }
var CRC_T=(function(){var t=[]; for(var n=0;n<256;n++){var c=n; for(var k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1; t[n]=c>>>0;} return t;})();
function crc32(u8){var c=0xffffffff; for(var i=0;i<u8.length;i++)c=CRC_T[(c^u8[i])&255]^(c>>>8); return (c^0xffffffff)>>>0;}
function makeZip(files){ var enc=new TextEncoder(),parts=[],central=[],off=0,cd=0,d=new Date(),dt=(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1),dd=((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate();
 files.forEach(function(f){ var name=enc.encode(f.name),data=f.data,crc=crc32(data),lh=new DataView(new ArrayBuffer(30)); lh.setUint32(0,0x04034b50,true); lh.setUint16(4,20,true); lh.setUint16(6,0x800,true); lh.setUint16(10,dt,true); lh.setUint16(12,dd,true); lh.setUint32(14,crc,true); lh.setUint32(18,data.length,true); lh.setUint32(22,data.length,true); lh.setUint16(26,name.length,true); parts.push(lh.buffer,name,data);
  var ch=new DataView(new ArrayBuffer(46)); ch.setUint32(0,0x02014b50,true); ch.setUint16(4,20,true); ch.setUint16(6,20,true); ch.setUint16(8,0x800,true); ch.setUint16(12,dt,true); ch.setUint16(14,dd,true); ch.setUint32(16,crc,true); ch.setUint32(20,data.length,true); ch.setUint32(24,data.length,true); ch.setUint16(28,name.length,true); ch.setUint32(42,off,true); central.push(ch.buffer,name); cd+=46+name.length; off+=30+name.length+data.length; });
 var e=new DataView(new ArrayBuffer(22)); e.setUint32(0,0x06054b50,true); e.setUint16(8,files.length,true); e.setUint16(10,files.length,true); e.setUint32(12,cd,true); e.setUint32(16,off,true); return new Blob(parts.concat(central,[e.buffer]),{type:"application/zip"}); }
function download(blob,name){ var a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(function(){a.remove()},600); }
/* ---- song helpers ---- */
function songTitle(){ var s=$("ly-song"); return (s&&s.options[s.selectedIndex]&&s.options[s.selectedIndex].textContent.replace(/\s*\(edited\)\s*$/,""))||"Untitled"; }
function bpm(){ try{ if(window.IPBBeats&&IPBBeats.info) return IPBBeats.info().bpm; }catch(e){} var b=$("bpm"); return (b&&+b.value)||90; }
function lyricLines(){ var t=($("ly-text")||{}).value||""; return t.split(/\n/).map(function(l){return l.replace(/\[.*?\]/g,"").trim()}).filter(function(l){return l&&!/^\[.*\]$/.test(l)}); }
function status(m){ var el=$("sv-status"); if(el) el.textContent=m; log(m); }
/* ---- IsleSing (shared from Isle Voice, loaded on demand; Isle Voice itself is untouched) ---- */
function loadSing(){ if(window.IsleSing) return Promise.resolve(window.IsleSing);
 return new Promise(function(res,rej){ var s=document.createElement("script"); s.src="../isle-voice/sing.js?v=20261011"; s.onload=function(){ window.IsleSing?res(window.IsleSing):rej(new Error("sing.js loaded but IsleSing missing")); }; s.onerror=function(){rej(new Error("Could not load ../isle-voice/sing.js"))}; document.head.appendChild(s); }); }
/* ---- draft vocal ---- */
var draftUrl=null;
function generateDraft(){
 var lines=lyricLines().slice(0,16), mode=($("sv-mode")||{}).value||"rap", voice=($("sv-voice")||{}).value||"am_fenrir";
 if(!lines.length){ status("Pick a song with lyrics first (Lyrics list above)."); return Promise.reject(new Error("no lyrics")); }
 status("Loading the on-device draft voice (first time downloads the Kokoro model)…"); setBusy(true);
 return loadSing().then(function(IS){
   return IS.draftVocal({lines:lines,bpm:bpm(),bars:lines.length+3,firstBar:1,mode:mode,voice:voice,onProgress:function(kind,f){ if(kind==="load") status("Downloading draft voice model… "+Math.round((f||0)*100)+"%"); else if(kind==="line") status("Making draft vocal… line "+Math.round((f||0)*lines.length)+" of "+lines.length); }});
 }).then(function(r){
   var blob=wavBlob(r.audio,r.sr); var pk=0; for(var i=0;i<r.audio.length;i++){var a=Math.abs(r.audio[i]); if(a>pk)pk=a;}
   if(draftUrl) URL.revokeObjectURL(draftUrl); draftUrl=URL.createObjectURL(blob);
   var au=$("sv-draft-audio"); au.src=draftUrl; au.hidden=false; $("sv-draft-dl").hidden=false;
   return putB("draft",blob).then(function(){ status("Draft vocal ready ("+lines.length+" lines, "+mode+", peak "+pk.toFixed(2)+"). This is a stock draft voice — not your clone yet. Next: Convert in my voice (free Colab)."); log("draft ok lines="+lines.length+" peak="+pk.toFixed(3)+" sr="+r.sr); return {blob:blob,peak:pk,lines:lines.length,sr:r.sr}; });
 }).catch(function(e){ status("Draft failed: "+(e.message||e)+". Check connection and tap again — the model downloads once, then works on-device."); throw e; })
 .then(function(x){setBusy(false); return x;},function(e){setBusy(false); throw e;});
}
/* ---- Colab package ---- */
function buildPackage(){
 return getB("draft").then(function(draft){
  if(!draft){ status("Make the draft vocal first, then tap Convert."); throw new Error("no draft"); }
  return Promise.all([draft.arrayBuffer(), getB("reference")]).then(function(r){
   var title=songTitle(), files=[{name:"draft_vocal.wav",data:new Uint8Array(r[0])}], bank=0;
   if(r[1]){ return r[1].arrayBuffer().then(function(ab){ var ext=/\.wav$/i.test(P.refName||"")?"wav":((P.refName||"clip").split(".").pop()||"wav").toLowerCase(); files.push({name:"voice_bank/001_"+safeName(P.name||"voice")+"."+ext,data:new Uint8Array(ab)}); bank=1; return finish(files,bank,title); }); }
   return finish(files,bank,title);
  });
 });
 function finish(files,bank,title){
   var job={app:"Isle Voice",from:"Beat — Sing in my voice",version:1,song:title,model_name:P.modelName||"emmanuel",pitch:0,bpm:bpm(),created:new Date().toISOString(),train_if_needed:!bank?false:true,voice_bank_files:bank,output_name:safeName(title)+"_my_voice.wav",generated_in_beat:true,note:"Draft vocal is a stock TTS voice; RVC in Colab re-voices it. If you already have a trained .pth/.index, put them in Google Drive > IsleVoice > models > "+(P.modelName||"emmanuel")+" (file name must start with the model name) and Colab skips training."};
   var readme=["BEAT — SING IN MY VOICE ("+title+")","","1. This zip was downloaded by Beat. Keep it in Downloads.","2. Colab (free, your Google account) should now be open: "+COLAB_URL,"   In Colab: Runtime > Run all. Allow Google Drive. Pick this zip when asked.","3. First time only: Colab trains your voice from voice_bank/ (about 45-120 min on the free T4 GPU) and saves it in Google Drive > IsleVoice > models > "+job.model_name+". Next times it converts in about 5-10 min.","   Already have a trained model? Put your .pth + .index in that Drive folder (name starting '"+job.model_name+"') BEFORE Run all, and training is skipped. A .pth cannot run inside Beat/in a browser page — Colab is where it runs.","4. When Colab finishes it downloads "+job.output_name+".","5. Come back to Beat > Lyrics > Sing in my voice > Import converted vocal, pick that WAV. It lands on a Studio vocal track at beat start (bar 1) and as your Beat vocal take, labelled 'My voice (converted)'.","", "Lyrics:","",""+(($("ly-text")||{}).value||"")].join("\n");
   files.push({name:"job.json",data:new TextEncoder().encode(JSON.stringify(job,null,2))});
   files.push({name:"lyrics.txt",data:new TextEncoder().encode((($("ly-text")||{}).value||""))});
   files.push({name:"README.txt",data:new TextEncoder().encode(readme)});
   var zip=makeZip(files); download(zip,safeName(title)+"_isle_voice.zip");
   var w=null; try{ w=window.open(COLAB_URL,"_blank"); if(w) w.opener=null; }catch(e){}
   status(w?"Package downloaded ("+Math.round(zip.size/1024)+" KB) and Colab opened. In Colab: Runtime > Run all, pick this zip. When it downloads your *_my_voice.wav, import it below.":"Package downloaded ("+Math.round(zip.size/1024)+" KB). If Colab did not open, use the Colab link in this panel.");
   log("package kb="+Math.round(zip.size/1024)+" bankFiles="+bank); return {zip:zip,job:job};
 }
}
/* ---- import converted vocal: Studio vocal track (bar 1) + Beat vocal take ---- */
function decodeFile(file){ var AC=window.AudioContext||window.webkitAudioContext; var ctx=new AC(); return file.arrayBuffer().then(function(ab){ return ctx.decodeAudioData(ab); }).then(function(buf){ return {buf:buf,ctx:ctx}; }); }
function importConverted(file){
 if(!file) return Promise.reject(new Error("no file"));
 status("Importing your converted voice…"); setBusy(true);
 return decodeFile(file).then(function(r){
  var buf=r.buf, ch0=buf.getChannelData(0), ch1=buf.numberOfChannels>1?buf.getChannelData(1):ch0, mono=new Float32Array(buf.length);
  for(var i=0;i<mono.length;i++) mono[i]=0.5*(ch0[i]+ch1[i]);
  var pk=0; for(var j=0;j<mono.length;j++){var a=Math.abs(mono[j]); if(a>pk)pk=a;}
  var title=songTitle(), label="My voice (converted) — "+title, named=new File([file],label.replace(/[^\w\- ]+/g,"").trim()+".wav",{type:file.type||"audio/wav"});
  var jobs=[];
  /* Beat vocal take (generated, labelled — raw-recording rules untouched) */
  try{ if(window.IPBBeats&&IPBBeats.vx&&IPBBeats.vx.setTake){ var zeros=new Float32Array(mono.length); IPBBeats.vx.setTake({L:zeros,R:zeros,V:mono,frames:mono.length,sr:buf.sampleRate,title:title+" (my voice, converted)",mode:"hp",clean:null,lat:0,mic:null,beatStart:0,cueBar:0,generated:true,voiceClone:true}); log("setTake frames="+mono.length); } }catch(e){ log("setTake failed "+e.message); }
  /* Vault copy (so Studio/you keep it even if the project changes) */
  var vaultId=null;
  if(window.IPBBeats&&IPBBeats.master&&IPBBeats.master.saveToVault){ jobs.push(IPBBeats.master.saveToVault(file,buf.duration,label).then(function(id){ vaultId=id; log("vault "+id); }).catch(function(e){ log("vault failed "+e.message); })); }
  /* Studio: open it, find a vocal (non-beat) track, put the clip at 0 (beat start) */
  var studioP=Promise.resolve(null);
  try{ if(window.IPBBeats&&IPBBeats.showTab){ IPBBeats.showTab("studio");
    studioP=new Promise(function(res){ (function wait(n){ try{ var f=document.getElementById("studio-frame"), w=f&&f.contentWindow; if(w&&w.IPBStudio&&w.IPBStudio.ready){ var P2=w.IPBStudio.project(), tr=P2.tracks.filter(function(t){return !/beat/i.test(t.name)})[0]||P2.tracks[1]||P2.tracks[0]; w.IPBStudio.setPlayhead(0); w.IPBStudio.importFiles([named],tr.id).then(function(){ res(tr.name); },function(){res(null)}); return; } }catch(e){} if(n>200) res(null); else setTimeout(function(){wait(n+1)},100); })(0); });
  } }catch(e){ log("studio failed "+e.message); }
  jobs.push(studioP.then(function(trackName){ return trackName; }));
  return Promise.all(jobs).then(function(res){ var tn=res[res.length-1];
    status("Imported ✓ '"+label+"' (peak "+pk.toFixed(2)+"). "+(tn?("Placed on Studio track '"+tn+"' at bar 1 (beat start). Open Studio to hear / mix it."):"Saved to the Vault and set as your Beat vocal take — open Studio and import it from the Vault if it did not land automatically.")+" Use Mixer > Vocal FX / Studio FX manually if you want polish — nothing was cleaned automatically.");
    log("import ok peak="+pk.toFixed(3)+" studioTrack="+(tn||"none")); return {peak:pk,track:tn,vaultId:vaultId,frames:mono.length}; });
 }).catch(function(e){ status("Import failed: "+(e.message||e)+". Pick the WAV Colab downloaded."); throw e; })
 .then(function(x){setBusy(false); return x;},function(e){setBusy(false); throw e;});
}
function setBusy(b){ ["sv-gen","sv-convert","sv-import-btn"].forEach(function(id){ var el=$(id); if(el) el.disabled=!!b; }); }
/* ---- UI ---- */
function build(){
 var panel=$("tab-lyrics"); if(!panel||$("sv-panel")) return;
 var host=document.createElement("section"); host.id="sv-panel"; host.className="sv-panel"; host.setAttribute("aria-label","Sing in my voice");
 host.innerHTML=
 '<h3>🎤 Sing in my voice</h3>'+
 '<p class="sub">Pick a saved song above (including <b>The Streets Is Calling</b>), make a draft vocal here, then turn it into your voice free in Colab, and import it back. The draft is a stock voice that raps/sings on the beat — your clone happens in Colab. A trained RVC .pth cannot run inside a browser page, so Beat never pretends it does.</p>'+
 '<div id="sv-profile-info" class="sub"></div>'+
 '<div class="sv-row"><label>Profile name <input id="sv-name" type="text" maxlength="60"></label><label>Model name <input id="sv-model" type="text" maxlength="40"></label></div>'+
 '<div class="sv-row"><label class="btn small file-btn">Add reference clip (your voice)…<input id="sv-ref" type="file" accept="audio/*,.wav,.mp3,.m4a,.webm" hidden></label>'+
 '<label class="btn small file-btn">Record model file (.pth/.index)…<input id="sv-pth" type="file" accept=".pth,.index" multiple hidden></label></div>'+
 '<p class="hint">Reference clip: use your Isle Voice voice-bank WAV if you have it (on the box it is isle_voice_bank.zip / 001_speech.wav — only about 25 seconds, so first training will be rough; 10–30 minutes is best). Everything stays on this device until you pick the zip in Colab.</p>'+
 '<div class="sv-row"><label>Draft style <select id="sv-mode"><option value="rap">Rap on the beat</option><option value="sing">Sing (pitched)</option></select></label>'+
 '<label>Draft voice <select id="sv-voice"><option value="am_fenrir">Deep male</option><option value="am_michael">Warm male</option><option value="am_puck">Bright male</option><option value="af_heart">Female</option></select></label>'+
 '<button type="button" id="sv-gen" class="btn primary">1 · Make draft vocal</button></div>'+
 '<audio id="sv-draft-audio" controls hidden></audio> <a id="sv-draft-dl" href="#" download="draft_vocal.wav" hidden>Download draft WAV</a>'+
 '<div class="sv-row"><button type="button" id="sv-convert" class="btn primary">2 · Convert in my voice (free Colab)</button>'+
 '<a class="btn small ghost" href="'+COLAB_URL+'" target="_blank" rel="noopener">Open Colab notebook ↗</a></div>'+
 '<div class="sv-row"><label class="btn primary file-btn" id="sv-import-btn">3 · Import converted vocal…<input id="sv-import" type="file" accept="audio/*,.wav,.mp3,.m4a" hidden></label>'+
 '<span class="sub">Lands on a Studio vocal track at bar 1 + as your Beat vocal take, labelled “My voice (converted)”.</span></div>'+
 '<p id="sv-status" role="status" class="sub"></p>'+
 '<p class="hint">Steps in plain words: 1 Make draft → 2 Convert (zip downloads, Colab opens, Runtime → Run all, pick the zip, wait) → Colab downloads *_my_voice.wav → 3 Import it here. In Studio you can then add FX by hand. Your normal mic recordings are still recorded raw — this generated vocal is kept separate and labelled.</p>';
 var info=$("ly-info"); if(info&&info.parentNode) info.parentNode.insertBefore(host,info.nextSibling); else panel.appendChild(host);
 /* Studio page pointer (no DAW) */
 var sb=document.querySelector("#tab-studio .studio-bar"); if(sb&&!$("sv-studio-note")){ var n=document.createElement("p"); n.id="sv-studio-note"; n.className="sub"; n.innerHTML='🎤 <b>Sing in my voice:</b> make it on the <button type="button" class="btn small" id="sv-go-lyrics">Lyrics page</button> — imported converted vocals land here on a vocal track at bar 1.'; sb.appendChild(n); var g=$("sv-go-lyrics"); if(g) g.addEventListener("click",function(){ if(window.IPBBeats&&IPBBeats.showTab) IPBBeats.showTab("lyrics"); }); }
 $("sv-name").value=P.name||""; $("sv-model").value=P.modelName||"emmanuel"; renderProfile();
 $("sv-name").addEventListener("change",function(){ P.name=this.value.trim(); saveProfile(); });
 $("sv-model").addEventListener("change",function(){ P.modelName=(this.value.trim()||"emmanuel").replace(/[^\w\-]+/g,"_"); this.value=P.modelName; saveProfile(); });
 $("sv-ref").addEventListener("change",function(){ var f=this.files[0]; this.value=""; if(!f) return; putB("reference",f).then(function(){ P.refName=f.name; P.refSecs=0; saveProfile(); return decodeFile(f).then(function(r){ P.refSecs=r.buf.duration; saveProfile(); }).catch(function(){}); }).then(function(){ status("Reference clip saved on this device: "+f.name); }); });
 $("sv-pth").addEventListener("change",function(){ var fs=Array.prototype.slice.call(this.files||[]); this.value=""; if(!fs.length) return; P.modelFiles=fs.map(function(f){return {name:f.name,size:f.size}}); saveProfile(); var chain=Promise.resolve(); fs.forEach(function(f){ chain=chain.then(function(){ return putB("model:"+f.name,f); }); }); chain.then(function(){ status("Model file(s) recorded on this device: "+P.modelFiles.map(function(f){return f.name}).join(", ")+". In Colab, upload the same file(s) / put them in Google Drive › IsleVoice › models › "+(P.modelName||"emmanuel")+" before Run all."); }); });
 $("sv-gen").addEventListener("click",function(){ generateDraft().catch(function(){}); });
 $("sv-convert").addEventListener("click",function(){ setBusy(true); buildPackage().catch(function(e){ if(e&&e.message!=="no draft") status("Package failed: "+(e.message||e)); }).then(function(){setBusy(false)}); });
 $("sv-import").addEventListener("change",function(){ var f=this.files[0]; this.value=""; if(f) importConverted(f).catch(function(){}); });
 var dl=$("sv-draft-dl"); if(dl) dl.addEventListener("click",function(){ if(draftUrl) this.href=draftUrl; });
 getB("draft").then(function(b){ if(b){ draftUrl=URL.createObjectURL(b); var au=$("sv-draft-audio"); au.src=draftUrl; au.hidden=false; $("sv-draft-dl").hidden=false; status("Draft vocal from last time is loaded. You can Convert or make a new one."); } });
 log("panel built v"+VERSION);
}
window.IPBSingVoice={version:VERSION,profile:function(){return P},generateDraft:generateDraft,buildPackage:buildPackage,importConverted:importConverted,lyricLines:lyricLines,songTitle:songTitle,colabUrl:COLAB_URL};
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",build); else build();
})();
