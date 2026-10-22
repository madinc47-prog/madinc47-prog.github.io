/* Collab Room — strictly 1-to-1 WebRTC (audio + optional video) with signaling through CollabCore (Supabase, RLS-gated).
   Takes are recorded RAW (MediaRecorder on the untouched stream). Gated until TURN is configured (launch blocker). */
(function(){
"use strict";
var C=window.CollabCore, $=function(id){return document.getElementById(id)};
var room=null, pc=null, dc=null, local=null, remote=new MediaStream(), beatSender=null, beatDest=null, actx=null, unsubs=[], ended=false, polite=false;
var recs={}, scrollT=null;
function status(t){$("status").textContent=t||""}
function conn(t,c){var e=$("conn"); e.textContent=t; e.className="conn "+(c||"")}
function esc(s){var d=document.createElement("div"); d.textContent=s; return d.innerHTML}
function initials(n){return String(n||"?").trim().split(/\s+/).slice(0,2).map(function(w){return w[0]||""}).join("").toUpperCase()||"?"}

/* ---------- connection test (works before launch) ---------- */
async function connTest(){
  var out=$("test-out"); out.textContent="Testing…"; var found={host:0,srflx:0,relay:0};
  var p=new RTCPeerConnection({iceServers:C.iceServers()}); p.createDataChannel("t");
  p.onicecandidate=function(e){ if(e.candidate){ var m=/ typ (\w+)/.exec(e.candidate.candidate); if(m&&found[m[1]]!=null) found[m[1]]++ } };
  await p.setLocalDescription(await p.createOffer());
  await new Promise(function(r){ var t=setTimeout(r,6000); p.onicegatheringstatechange=function(){ if(p.iceGatheringState==="complete"){clearTimeout(t);r()} } });
  p.close();
  var msg=found.relay?"✅ Relay (TURN) reachable — calls should connect on any network.":
    found.srflx?"⚠️ Direct connection possible on this network, but no relay (TURN) — calls may fail on some mobile/carrier/hotel networks.":
    "❌ Couldn't reach the connection servers. Try another network (switch Wi-Fi ↔ mobile data).";
  out.textContent=msg+" ["+found.host+" local / "+found.srflx+" public / "+found.relay+" relay]";
  return found;
}

/* ---------- media ---------- */
function constraints(video){ var raw=$("b-raw").checked; return {audio:{echoCancellation:!raw,noiseSuppression:!raw,autoGainControl:!raw,channelCount:raw?2:1},video:video?{width:{ideal:640},height:{ideal:480},facingMode:"user"}:false} }
async function getLocal(video){
  try{ local=await navigator.mediaDevices.getUserMedia(constraints(video)) }
  catch(e){ try{ local=await navigator.mediaDevices.getUserMedia({audio:constraints(false).audio}) }catch(x){ local=new MediaStream(); status("No mic available — you can still hear your partner and use “Use partner's mic” to record them.") } }
  $("v-local").srcObject=local; $("v-local").classList.toggle("live",local.getVideoTracks().length>0);
}
async function reMic(){ // swap mic processing (Record quality) without renegotiation
  if(!local) return; var old=local.getAudioTracks()[0]; var s;
  try{ s=await navigator.mediaDevices.getUserMedia({audio:constraints(false).audio}) }catch(e){ return status("Couldn't reopen mic: "+e.message) }
  var t=s.getAudioTracks()[0]; if(old){ local.removeTrack(old); old.stop() } local.addTrack(t);
  if(mainTx.audio) await mainTx.audio.sender.replaceTrack(t);
  status($("b-raw").checked?"Record quality ON — mic sent unprocessed (no echo cancel / noise suppression / auto gain). Use headphones.":"Record quality off — call-style mic processing.");
}

/* ---------- peer connection (exactly one) ---------- */
var beatMid=null, mainTx={};
function newPC(){
  if(pc) return pc; // never a second peer
  pc=new RTCPeerConnection({iceServers:C.iceServers()});
  if(!polite){ // offerer (host) lays out fixed lanes: mic, camera, beat
    var at=local.getAudioTracks()[0], vt=local.getVideoTracks()[0];
    mainTx.audio=pc.addTransceiver(at||"audio",{direction:"sendrecv",streams:[local]});
    mainTx.video=pc.addTransceiver(vt||"video",{direction:"sendrecv",streams:[local]});
    mainTx.beat=pc.addTransceiver("audio",{direction:"sendrecv"});
  }
  pc.ontrack=function(e){
    if(beatMid!=null&&e.transceiver.mid===beatMid){ var s=new MediaStream([e.track]); var a=$("beat-remote")||document.body.appendChild(Object.assign(document.createElement("audio"),{id:"beat-remote",autoplay:true,hidden:true})); a.srcObject=s; a.play().catch(function(){}); return }
    remote.addTrack(e.track); $("remote-audio").srcObject=remote; $("v-remote").srcObject=remote;
    if(e.track.kind==="video"){ e.track.onunmute=function(){$("v-remote").classList.add("live")}; e.track.onmute=function(){$("v-remote").classList.remove("live")} }
  };
  pc.onicecandidate=function(e){ if(e.candidate) C.signal(room,"ice",e.candidate.toJSON()).catch(function(){}) };
  pc.onconnectionstatechange=function(){ var s=pc.connectionState;
    if(s==="connected") conn("connected","ok"), status("");
    else if(s==="failed") conn("failed","bad"), status("Couldn't connect — your network may block direct calls. Try another network (Wi-Fi ↔ mobile data), or ask the owner to add a TURN relay.");
    else conn(s) };
  var setupDC=function(ch){ dc=ch; dc.onmessage=onData; dc.onopen=function(){ send({t:"hi"}) } };
  var setupFiles=function(ch){ if(window.RoomMV) window.RoomMV.attach(ch) };
  if(!polite){ setupDC(pc.createDataChannel("room",{ordered:true})); setupFiles(pc.createDataChannel("files",{ordered:true})) }
  else pc.ondatachannel=function(e){ if(e.channel.label==="room"&&!dc) setupDC(e.channel); else if(e.channel.label==="files") setupFiles(e.channel); else e.channel.close() };
  return pc;
}
var iceQ=[]; function flushIce(){ var q=iceQ; iceQ=[]; q.forEach(function(c){ pc.addIceCandidate(c).catch(function(){}) }) }
async function onSignal(s){
  var p=s.payload||{};
  if(s.kind==="hello"&&!polite){ newPC(); var o=await pc.createOffer(); await pc.setLocalDescription(o); C.signal(room,"offer",{sdp:o.sdp,beatMid:mainTx.beat.mid}) }
  else if(s.kind==="offer"&&polite){ var first=!pc; newPC(); beatMid=p.beatMid; await pc.setRemoteDescription({type:"offer",sdp:p.sdp});
    if(first){ var txs=pc.getTransceivers(); mainTx.audio=txs.find(function(t){return t.receiver.track.kind==="audio"&&t.mid!==beatMid}); mainTx.video=txs.find(function(t){return t.receiver.track.kind==="video"});
      var at=local.getAudioTracks()[0], vt=local.getVideoTracks()[0]; if(mainTx.audio){ mainTx.audio.direction="sendrecv"; if(at) await mainTx.audio.sender.replaceTrack(at) } if(mainTx.video){ mainTx.video.direction="sendrecv"; if(vt) await mainTx.video.sender.replaceTrack(vt) } }
    flushIce(); var a=await pc.createAnswer(); await pc.setLocalDescription(a); C.signal(room,"answer",{sdp:a.sdp}) }
  else if(s.kind==="answer"&&!polite&&pc&&pc.signalingState==="have-local-offer"){ await pc.setRemoteDescription({type:"answer",sdp:p.sdp}); flushIce() }
  else if(s.kind==="ice"){ if(!pc||!pc.remoteDescription){ iceQ.push(p); return } try{ await pc.addIceCandidate(p) }catch(e){} }
  else if(s.kind==="bye"){ hangup(false) }
}

/* ---------- data channel: chat, lyrics, beat sync, mic-mode request ---------- */
function send(o){ if(dc&&dc.readyState==="open") dc.send(JSON.stringify(o)) }
function chatLine(txt,mine){ var d=document.createElement("div"); d.className="msg"+(mine?" mine":""); d.textContent=txt; $("chat").appendChild(d); $("chat").scrollTop=1e9 }
function onData(e){ var m; try{m=JSON.parse(e.data)}catch(x){return}
  if(m.t==="chat") chatLine(String(m.x||"").slice(0,500),false);
  else if(m.t==="lyrics"){ $("ly").value=String(m.x||"").slice(0,8000); status("Partner shared lyrics.") }
  else if(m.t==="start") countdown(+m.in||3000,true);
  else if(m.t==="stop") stopBeat();
  else if(m.t&&m.t.indexOf("mv")===0&&window.RoomMV) window.RoomMV.onMsg(m);
  else if(m.t==="rawreq"){ if(confirm("Your partner wants to record your mic. Turn on Record quality (unprocessed mic — use headphones)?")){ $("b-raw").checked=true; reMic() } }
}

/* ---------- beat ---------- */
var beatURL=null;
function ensureCtx(){ if(!actx){ actx=new (window.AudioContext||window.webkitAudioContext)(); beatDest=actx.createMediaStreamDestination(); var src=actx.createMediaElementSource($("beat-el")); src.connect(actx.destination); src.connect(beatDest) } actx.resume() }
$("beat-file").onchange=function(){ var f=this.files[0]; if(!f) return; if(beatURL) URL.revokeObjectURL(beatURL); beatURL=URL.createObjectURL(f); $("beat-el").src=beatURL; $("beat-name").textContent=f.name };
function countdown(ms,remoteStart){ var end=Date.now()+ms; var t=setInterval(function(){ var r=Math.ceil((end-Date.now())/1000); $("count").textContent=r>0?r:"";
  if(r<=0){ clearInterval(t); if($("beat-el").src) { $("beat-el").currentTime=0; $("beat-el").play() } else if(remoteStart) status("Load the same beat file to play along in sync."); } },100) }
$("beat-go").onclick=async function(){
  var mode=$("beat-mode").value;
  if(mode==="stream"){ if(!$("beat-el").src) return status("Load a beat first."); ensureCtx(); var tr=beatDest.stream.getAudioTracks()[0];
    if(polite) return status("Only the room host can stream a beat — use “We both load the same file”."); if(mainTx.beat) await mainTx.beat.sender.replaceTrack(tr); countdown(3000) }
  else { send({t:"start",in:3000}); countdown(3000) } };
window.RoomAPI={send:send,local:function(){return local},remote:function(){return remote},countdown:function(ms,cb){ countdown(ms,true); setTimeout(cb,ms) },status:status,toMultitrack:toMultitrack,polite:function(){return polite}};
function stopBeat(){ $("beat-el").pause(); $("count").textContent="" }
$("beat-stop").onclick=function(){ stopBeat(); send({t:"stop"}) };

/* ---------- recording (raw) ---------- */
function mimeT(){ return ["audio/webm;codecs=opus","audio/mp4","audio/webm"].find(function(m){return window.MediaRecorder&&MediaRecorder.isTypeSupported(m)})||"" }
function toggleRec(key,label,getStream,btn){
  if(recs[key]){ recs[key].stop(); return }
  var s=getStream(); var at=s&&s.getAudioTracks(); if(!at||!at.length) return status(key==="me"?"No mic to record.":"Partner's mic isn't coming through yet.");
  var r=new MediaRecorder(new MediaStream(at),{mimeType:mimeT(),audioBitsPerSecond:256000}), parts=[];
  r.ondataavailable=function(e){ if(e.data.size) parts.push(e.data) };
  r.onstop=function(){ delete recs[key]; btn.classList.remove("rec"); addTake(new Blob(parts,{type:r.mimeType}),label); $("r-state").textContent="" };
  r.start(1000); recs[key]=r; btn.classList.add("rec"); $("r-state").textContent="Recording "+label+"… tap again to stop";
}
$("r-me").onclick=function(){ toggleRec("me","My vocal",function(){return local},this) };
$("r-peer").onclick=function(){ toggleRec("peer","Partner's mic",function(){return remote},this) };
$("r-usepeer").onclick=function(){ send({t:"rawreq"}); status("Asked your partner to switch on Record quality. Their mic will be recorded on your side as YOUR track."); toggleRec("peer","My track (partner's mic)",function(){return remote},$("r-peer")) };
function addTake(blob,label){
  var name=label+" "+new Date().toLocaleTimeString(), li=document.createElement("li"), a=document.createElement("audio"), b=document.createElement("b");
  a.controls=true; a.src=URL.createObjectURL(blob); b.textContent=name;
  var dl=document.createElement("a"); dl.className="btn ghost"; dl.textContent="⬇"; dl.href=a.src; dl.download=name.replace(/[^\w\- ]+/g,"_")+(blob.type.indexOf("mp4")>=0?".m4a":".webm");
  var mt=document.createElement("button"); mt.className="btn"; mt.textContent="→ Multitrack"; mt.onclick=function(){ toMultitrack(name,blob).then(function(){ mt.textContent="Sent ✓ (open Multitrack)" }) };
  li.append(b,a,dl,mt); $("takes").prepend(li);
}
function toMultitrack(name,blob){ return new Promise(function(res,rej){ var r=indexedDB.open("ipb_inbox",1); r.onupgradeneeded=function(){ r.result.createObjectStore("items",{keyPath:"id"}) };
  r.onsuccess=function(){ var d=r.result, t=d.transaction("items","readwrite"); t.objectStore("items").put({id:"in_"+Date.now().toString(36),to:"multitrack",name:name,blob:blob,at:Date.now()}); t.oncomplete=function(){d.close();res()} }; r.onerror=rej }) }

/* ---------- lyrics ---------- */
$("ly-load").onclick=function(){ var r=indexedDB.open("ipb_lyricslab"); r.onsuccess=function(){ var d=r.result; if(!d.objectStoreNames.contains("docs")) return status("No Lyrics Lab docs yet.");
  var q=d.transaction("docs").objectStore("docs").getAll(); q.onsuccess=function(){ var docs=q.result||[], s=$("ly-pick"); s.textContent=""; if(!docs.length) return status("No Lyrics Lab docs yet.");
    docs.forEach(function(doc,i){ var o=document.createElement("option"); o.value=i; o.textContent=doc.name||"Lyrics"; s.appendChild(o) }); s.hidden=false;
    s.onchange=function(){ var doc=docs[+s.value]; $("ly").value=(doc.lines||[]).map(function(l){return l.text||""}).join("\n") }; s.onchange() } } };
$("ly-share").onclick=function(){ send({t:"lyrics",x:$("ly").value.slice(0,8000)}); status("Lyrics shared with your partner.") };
$("ly-scroll").onclick=function(){ var t=$("ly"); if(scrollT){ clearInterval(scrollT); scrollT=null; this.textContent="▶ Scroll"; return } this.textContent="⏸ Scroll"; scrollT=setInterval(function(){ t.scrollTop+=1 },60) };
$("chat-f").onsubmit=function(e){ e.preventDefault(); var x=$("chat-in").value.trim().slice(0,500); if(!x) return; send({t:"chat",x:x}); chatLine(x,true); $("chat-in").value="" };

/* ---------- controls ---------- */
$("b-mic").onclick=function(){ var t=local&&local.getAudioTracks()[0]; if(!t) return; t.enabled=!t.enabled; this.textContent=t.enabled?"🎙 Mute":"🔇 Unmute"; this.classList.toggle("on",!t.enabled) };
$("b-cam").onclick=async function(){ var v=local.getVideoTracks()[0];
  if(v){ v.enabled=!v.enabled; this.textContent=v.enabled?"📷 Camera off":"📷 Camera on"; $("v-local").classList.toggle("live",v.enabled); return }
  try{ var s=await navigator.mediaDevices.getUserMedia({video:constraints(true).video}); var t=s.getVideoTracks()[0]; local.addTrack(t); $("v-local").classList.add("live");
    if(mainTx.video) await mainTx.video.sender.replaceTrack(t); // lane already sendrecv: no renegotiation
    this.textContent="📷 Camera off" }catch(e){ status("No camera: "+e.message) } };
$("b-raw").onchange=reMic;
function hangup(notify){ if(ended) return; ended=true; Object.keys(recs).forEach(function(k){recs[k].stop()});
  if(notify) C.signal(room,"bye",{}).catch(function(){}); C.end(room.id).catch(function(){});
  if(pc) pc.close(); if(local) local.getTracks().forEach(function(t){t.stop()}); unsubs.forEach(function(u){u()}); conn("ended"); status("Room ended. Your takes are still below — save or send them to Multitrack."); }
$("b-end").onclick=function(){ hangup(true) };
$("test").onclick=connTest;

/* ---------- boot ---------- */
async function enter(){
  $("invite").hidden=true; $("room").hidden=false; polite=C.uid()===room.guest;
  await getLocal(false);
  unsubs.push(C.onSignals(room,function(s){ onSignal(s).catch(function(e){status("Signal error: "+e.message)}) }));
  unsubs.push(C.onRoom(room,function(r){ room=r; if(r.status==="ended") hangup(false) }));
  if(polite) await C.signal(room,"hello",{}); conn("connecting…");
}
async function boot(){
  var g=$("gate");
  if(!C.configured()){ g.hidden=false; g.textContent="Setup pending — the Collab database isn't switched on yet."; $("nettest").hidden=false; return }
  if(!C.turnConfigured()){ g.hidden=false; g.innerHTML="<b>Collab Room isn't launched yet.</b> It needs a TURN relay so calls work on every network. You can test your connection below."; return }
  var u=await C.me(); if(!u){ g.hidden=false; g.innerHTML='Sign in on the <a href="./">Collab Map</a> first.'; return }
  var id=new URLSearchParams(location.search).get("id"); if(!id){ g.hidden=false; g.textContent="Open a room from a profile card (Invite to room) or from an invite."; return }
  try{ room=await C.getRoom(id) }catch(e){ g.hidden=false; g.textContent=e.message; return }
  var peer=C.peerOf(room); try{ var pr=await C.api("/rest/v1/profiles?id=eq."+peer+"&select=display_name"); var nm=pr&&pr[0]&&pr[0].display_name||"Partner"; $("peer-name").textContent="with "+nm; $("cap-remote").textContent=nm; $("a-remote").textContent=initials(nm) }catch(e){}
  $("a-local").textContent="You";
  if(room.status==="ended"||room.status==="declined"){ g.hidden=false; g.textContent="This room is "+room.status+"."; return }
  if(room.status==="invited"){
    if(C.uid()===room.guest){ $("invite").hidden=false; $("invite-text").textContent="You've been invited to a 1-to-1 Collab Room. Only you two can join.";
      $("accept").onclick=async function(){ room=await C.accept(room.id); enter() }; $("decline").onclick=async function(){ await C.decline(room.id); location.href="./" } }
    else { status("Waiting for your partner to accept…"); var poll=setInterval(function(){ C.getRoom(room.id).then(function(r){ if(r.status!=="invited"){ clearInterval(poll); room=r; if(r.status==="active"&&!local) enter(); else status("Invite "+r.status+".") } }).catch(function(){}) },4000); unsubs.push(C.onRoom(room,function(r){ room=r; if(r.status==="active"&&!pc&&!local) enter(); else if(r.status==="declined") status("Invite declined.") })); }
    return }
  enter();
}
boot().catch(function(e){ status(e.message) });
window.addEventListener("pagehide",function(){ if(room&&room.status==="active"&&!ended) C.signal(room,"bye",{}).catch(function(){}) });
})();
