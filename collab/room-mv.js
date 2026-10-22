/* Collab Room — music-video mode. 1-to-1 only (rides the room's single peer connection).
   Each side records its OWN camera locally (720p ~4 Mbps), then sends the file to the partner over the WebRTC
   data channel (chunked, resumable, progress) — never via a server. Clips live in IndexedDB "ipb_collab_clips". */
(function(){
"use strict";
var MAX_TAKE_SEC=60;            // take length limit (approved by Emmanuel 2026-10-22; build longer videos from many takes)
var VIDEO_BPS=4000000, MAX_SEND_BYTES=50*1024*1024, CHUNK=16*1024, COUNT_MS=3000;
var $=function(id){return document.getElementById(id)}, A=function(){return window.RoomAPI};
var ch=null, rec=null, recStream=null, take=null, stopTimer=null, tick=null, backup=null, inbound={}, sending=null, queue=[];

/* ---------- IndexedDB ---------- */
function db(){ return new Promise(function(res,rej){ var r=indexedDB.open("ipb_collab_clips",1); r.onupgradeneeded=function(){ var d=r.result; d.createObjectStore("clips",{keyPath:"id"}); d.createObjectStore("parts",{keyPath:["id","i"]}) }; r.onsuccess=function(){res(r.result)}; r.onerror=function(){rej(r.error)} }) }
function tx(store,mode,fn){ return db().then(function(d){ return new Promise(function(res,rej){ var t=d.transaction(store,mode), out=fn(t.objectStore(store)); t.oncomplete=function(){d.close(); res(out&&out.result!==undefined?out.result:out)}; t.onerror=function(){rej(t.error)} }) }) }
var putClip=function(c){return tx("clips","readwrite",function(s){s.put(c)})}, getClip=function(id){return tx("clips","readonly",function(s){return s.get(id)})}, allClips=function(){return tx("clips","readonly",function(s){return s.getAll()})};

/* ---------- recording ---------- */
function mime(){ return ["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/mp4","video/webm"].find(function(m){return window.MediaRecorder&&MediaRecorder.isTypeSupported(m)})||"" }
async function hqStream(){
  var local=A().local(), mic=local&&local.getAudioTracks()[0];
  try{ var cam=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30},facingMode:"user"}});
    return new MediaStream(cam.getVideoTracks().concat(mic?[mic.clone()]:[])) }
  catch(e){ return new MediaStream(((local&&local.getVideoTracks())||[]).map(function(t){return t.clone()}).concat(mic?[mic.clone()]:[])) }
}
function startTake(id,zeroAt){
  take={id:id,zeroAt:zeroAt}; $("mv-state").textContent="Get ready…";
  hqStream().then(function(s){ recStream=s; if(!s.getVideoTracks().length) A().status("Camera off — recording audio only for this take.");
    var parts=[], m=mime(); rec=new MediaRecorder(s,{mimeType:m,videoBitsPerSecond:VIDEO_BPS,audioBitsPerSecond:192000});
    rec.ondataavailable=function(e){ if(e.data.size) parts.push(e.data) };
    rec.onstart=function(){ take.recStart=Date.now(); };
    rec.onstop=function(){ var blob=new Blob(parts,{type:rec.mimeType||m}); finishOwn(blob); recStream.getTracks().forEach(function(t){t.stop()}); rec=null };
    rec.start(1000);
    var wait=Math.max(0,zeroAt-Date.now()); setTimeout(function(){ // beat + countdown hit zero together
      var end=Date.now()+MAX_TAKE_SEC*1000;
      tick=setInterval(function(){ var left=Math.ceil((end-Date.now())/1000); $("mv-state").textContent="● REC "+(MAX_TAKE_SEC-left)+"s"+(left<=10?" — stopping in "+left:""); $("mv-state").classList.toggle("warn",left<=10) },250);
      stopTimer=setTimeout(function(){ stopTake(true) },MAX_TAKE_SEC*1000);
    },wait);
  });
}
function stopTake(tell){ clearTimeout(stopTimer); clearInterval(tick); if(tell) A().send({t:"mvstop"}); if(rec&&rec.state!=="inactive") rec.stop(); $("mv-state").textContent="Take stopped."; $("mv-state").classList.remove("warn") }
async function finishOwn(blob){
  // sync marker: ms between "recorder started" and the shared beat/countdown zero. Trim this much off the head to align.
  var c={id:"c_"+take.id+"_me",take:take.id,from:"me",name:"MV take "+new Date(take.zeroAt).toLocaleTimeString()+" (me)",mime:blob.type,size:blob.size,syncOffsetMs:Math.max(0,take.zeroAt-(take.recStart||take.zeroAt)),zeroAt:take.zeroAt,at:Date.now(),blob:blob,complete:true};
  await putClip(c); render();
  if(blob.size>MAX_SEND_BYTES){ A().status("Clip is "+(blob.size/1048576).toFixed(0)+" MB — over the 50 MB send limit, kept on this device only."); return }
  queue.push(c.id); pump();
}

/* ---------- chunked, resumable transfer over the data channel ---------- */
function attach(c){ ch=c; ch.binaryType="arraybuffer"; ch.bufferedAmountLowThreshold=256*1024;
  ch.onmessage=onFile; ch.onopen=function(){ // ask partner to resume anything half-received
    Object.keys(inbound).forEach(function(id){ ch.send(JSON.stringify({t:"fresume",id:id,have:inbound[id].have})) }); pump() };
  if(ch.readyState==="open") ch.onopen() }
async function pump(){ if(sending||!ch||ch.readyState!=="open"||!queue.length) return; var id=queue.shift(); var c=await getClip(id); if(c) sendClip(c,0) }
async function sendClip(c,from){
  sending=c.id; var n=Math.ceil(c.size/CHUNK);
  ch.send(JSON.stringify({t:"fhead",id:c.id.replace(/_me$/,"_partner"),take:c.take,name:c.name.replace("(me)","(partner)"),mime:c.mime,size:c.size,n:n,from:from,syncOffsetMs:c.syncOffsetMs,zeroAt:c.zeroAt}));
  for(var i=from;i<n;i++){
    if(!ch||ch.readyState!=="open"){ sending=null; return } // resumes on reconnect via fresume
    if(ch.bufferedAmount>1024*1024) await new Promise(function(r){ ch.onbufferedamountlow=function(){ch.onbufferedamountlow=null;r()} });
    var buf=await c.blob.slice(i*CHUNK,(i+1)*CHUNK).arrayBuffer(), out=new Uint8Array(buf.byteLength+4); new DataView(out.buffer).setUint32(0,i); out.set(new Uint8Array(buf),4); ch.send(out.buffer);
    if(i%32===0) prog(c.id,"Sending",i+1,n);
  }
  ch.send(JSON.stringify({t:"fend",id:c.id.replace(/_me$/,"_partner")})); prog(c.id,"Sent",n,n); sending=null; pump();
}
var cur=null;
function onFile(e){
  if(typeof e.data==="string"){ var m; try{m=JSON.parse(e.data)}catch(x){return}
    if(m.t==="fhead"){ if(!/^c_[\w-]+_partner$/.test(m.id)||m.size>MAX_SEND_BYTES+1024*1024) return; cur=inbound[m.id]=inbound[m.id]||{meta:m,have:0}; cur.meta=m; }
    else if(m.t==="fend"&&cur&&cur.meta.id===m.id) assemble(cur);
    else if(m.t==="fresume"){ getClip(m.id.replace(/_partner$/,"_me")).then(function(c){ if(c&&!sending) sendClip(c,Math.max(0,m.have|0)) }) }
    return }
  if(!cur) return; var dv=new DataView(e.data), i=dv.getUint32(0); if(i!==cur.have) return; // in-order only (ordered channel)
  var part=e.data.slice(4); cur.have++; tx("parts","readwrite",function(s){ s.put({id:cur.meta.id,i:i,b:part}) });
  if(i%32===0) prog(cur.meta.id,"Receiving",cur.have,cur.meta.n);
}
async function assemble(st){ var m=st.meta;
  var parts=await tx("parts","readonly",function(s){ return s.getAll(IDBKeyRange.bound([m.id,0],[m.id,1e9])) });
  parts.sort(function(a,b){return a.i-b.i}); var blob=new Blob(parts.map(function(p){return p.b}),{type:m.mime});
  if(blob.size!==m.size){ A().status("Clip transfer incomplete — will resume when reconnected."); return }
  await putClip({id:m.id,take:m.take,from:"partner",name:m.name,mime:m.mime,size:m.size,syncOffsetMs:m.syncOffsetMs,zeroAt:m.zeroAt,at:Date.now(),blob:blob,complete:true});
  await tx("parts","readwrite",function(s){ s.delete(IDBKeyRange.bound([m.id,0],[m.id,1e9])) }); delete inbound[m.id]; cur=null; prog(m.id,"Received",1,1); render();
}
function prog(id,label,i,n){ var el=document.querySelector('[data-p="'+id.replace(/_(me|partner)$/,"")+'"]')||$("mv-state"); var pct=Math.round(100*i/n);
  if(el.tagName==="PROGRESS"){ el.value=pct } $("mv-state").textContent=label+" clip… "+pct+"%" }

/* ---------- partner-stream backup (lower quality, from the call) ---------- */
function toggleBackup(){
  if(backup){ backup.stop(); return }
  var r=A().remote(); if(!r||!r.getTracks().length) return A().status("Partner's stream isn't coming through yet.");
  var parts=[], m=mime(); backup=new MediaRecorder(new MediaStream(r.getTracks()),{mimeType:m,videoBitsPerSecond:1500000});
  backup.ondataavailable=function(e){ if(e.data.size) parts.push(e.data) };
  backup.onstop=function(){ var b=new Blob(parts,{type:backup.mimeType||m}); backup=null; $("mv-backup").classList.remove("rec");
    putClip({id:"c_bk_"+Date.now().toString(36),take:"backup",from:"partner-live",name:"Partner live backup "+new Date().toLocaleTimeString(),mime:b.type,size:b.size,syncOffsetMs:null,at:Date.now(),blob:b,complete:true}).then(render) };
  backup.start(1000); $("mv-backup").classList.add("rec");
}

/* ---------- list ---------- */
function ext(m){ return /mp4/.test(m)?".mp4":".webm" }
async function render(){ var ul=$("clips"); if(!ul) return; var cs=(await allClips()).sort(function(a,b){return b.at-a.at}); ul.textContent="";
  if(!cs.length){ var li=document.createElement("li"); li.className="meta"; li.textContent="Collab clips: none yet."; ul.appendChild(li); return }
  cs.forEach(function(c){ var li=document.createElement("li"), b=document.createElement("b"), v=document.createElement("video"), u=URL.createObjectURL(c.blob);
    b.textContent=c.name+" · "+(c.size/1048576).toFixed(1)+" MB"+(c.syncOffsetMs!=null?" · sync: trim "+c.syncOffsetMs+" ms":"");
    v.src=u; v.controls=true; v.playsInline=true; v.style.maxWidth="220px";
    var dl=document.createElement("a"); dl.className="btn ghost"; dl.textContent="⬇ Save"; dl.href=u; dl.download=c.name.replace(/[^\w\- ()]+/g,"_")+ext(c.mime);
    var sh=document.createElement("button"); sh.className="btn ghost"; sh.textContent="Share"; sh.onclick=function(){ var f=new File([c.blob],dl.download,{type:c.mime}); if(navigator.canShare&&navigator.canShare({files:[f]})) navigator.share({files:[f]}).catch(function(){}); else dl.click() };
    var del=document.createElement("button"); del.className="btn ghost"; del.textContent="🗑"; del.onclick=function(){ if(confirm("Delete this clip from this device?")) tx("clips","readwrite",function(s){s.delete(c.id)}).then(render) };
    var pg=document.createElement("progress"); pg.max=100; pg.value=100; pg.dataset.p=c.id.replace(/_(me|partner)$/,""); pg.hidden=c.from!=="me";
    li.append(b,v,dl,sh,del,pg); ul.appendChild(li) }) }
async function sidecar(){ var cs=(await allClips()).filter(function(c){return c.take!=="backup"});
  var takes={}; cs.forEach(function(c){ (takes[c.take]=takes[c.take]||{take:c.take,beatStartEpochMs:c.zeroAt,clips:[]}).clips.push({file:c.name.replace(/[^\w\- ()]+/g,"_")+ext(c.mime),from:c.from,trimHeadMs:c.syncOffsetMs}) });
  var blob=new Blob([JSON.stringify({format:"islepin-collab-sync/1",note:"Trim trimHeadMs off the start of each clip; then all clips of a take start on the beat's first downbeat.",takes:Object.values(takes)},null,2)],{type:"application/json"});
  var a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="collab-sync.json"; a.click() }

function onMsg(m){
  if(m.t==="mvstart"&&/^[a-z0-9]{4,20}$/.test(m.id)){ A().countdown(COUNT_MS,function(){}); startTake(m.id,Date.now()+COUNT_MS) }
  else if(m.t==="mvstop") stopTake(false);
}
document.addEventListener("DOMContentLoaded",function(){
  if(!$("mv-go")) return;
  $("mv-go").onclick=function(){ if(rec) return; var id=Date.now().toString(36); A().send({t:"mvstart",id:id}); A().countdown(COUNT_MS,function(){}); startTake(id,Date.now()+COUNT_MS) };
  $("mv-stop").onclick=function(){ stopTake(true) };
  $("mv-backup").onclick=toggleBackup; $("mv-sidecar").onclick=sidecar; render();
});
window.RoomMV={attach:attach,onMsg:onMsg,MAX_TAKE_SEC:MAX_TAKE_SEC};
})();
