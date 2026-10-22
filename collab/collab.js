/* Island Pin Collab Map — Supabase (Auth magic link + PostgREST + Storage + Realtime) via plain fetch/WebSocket.
   Privacy: only a village name + that village's public centre is ever sent. GPS (if used) is snapped on-device and discarded. */
(function(){
"use strict";
var CFG=window.COLLAB_CONFIG||{}, URL0=(CFG.supabaseUrl||"").replace(/\/$/,""), KEY=CFG.supabaseAnonKey||"";
var VILL=(window.COLLAB_VILLAGES||[]).slice().sort(function(a,b){return a[0].localeCompare(b[0])});
var SESS="collab_session_v1", ONLINE_MS=5*60*1000, FAR_ZOOM=12;
var session=null, me=null, myProfile=null, people=[], msgs=[], openPeer=null, map, layer, activeId=null, ws=null;
var $=function(id){return document.getElementById(id)};
function configured(){return /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(URL0)&&KEY.length>20}
function status(t){$("status").textContent=t||""}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function initials(n){n=String(n||"?").trim(); var p=n.split(/\s+/); return ((p[0]||"?")[0]+(p[1]?p[1][0]:"")).toUpperCase()}
function avatarOk(u){return typeof u==="string"&&u.indexOf(URL0+"/storage/v1/object/public/avatars/")===0}
function online(p){return p.last_seen&&Date.now()-Date.parse(p.last_seen)<ONLINE_MS}
var BAD=["fuck","shit","bitch","cunt","nigger","nigga","faggot","whore","slut","pussy","dick","cock","bomboclaat","bumbaclot","rassclaat","rasshole","kiss me ass"];
function profane(s){s=String(s||"").toLowerCase().replace(/[^a-z ]/g,""); return BAD.some(function(w){return s.indexOf(w)>=0})}
function clean(s,max){return String(s||"").replace(/[\u0000-\u001f\u007f<>]/g,"").replace(/\s+/g," ").trim().slice(0,max)}

/* ---------- auth ---------- */
function saveS(){try{session?localStorage.setItem(SESS,JSON.stringify(session)):localStorage.removeItem(SESS)}catch(e){}}
function hdr(x){var h={apikey:KEY,"Content-Type":"application/json"}; h.Authorization="Bearer "+(session?session.access_token:KEY); for(var k in x||{})h[k]=x[k]; return h}
async function api(path,o){o=o||{};
  if(session&&session.expires_at&&session.expires_at*1000<Date.now()+60000) await refresh();
  var r=await fetch(URL0+path,{method:o.method||"GET",headers:hdr(o.headers),body:o.raw||(o.body?JSON.stringify(o.body):undefined)});
  var t=await r.text(); if(!r.ok){var m=t; try{m=JSON.parse(t).message||JSON.parse(t).msg||t}catch(e){} throw new Error(m.slice(0,200))}
  return t?JSON.parse(t):null}
async function refresh(){ if(!session||!session.refresh_token) return;
  var r=await fetch(URL0+"/auth/v1/token?grant_type=refresh_token",{method:"POST",headers:{apikey:KEY,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:session.refresh_token})});
  if(!r.ok){session=null;saveS();return} var j=await r.json(); session={access_token:j.access_token,refresh_token:j.refresh_token,expires_at:j.expires_at||Math.floor(Date.now()/1000)+(j.expires_in||3600)}; saveS()}
function readHash(){var h=location.hash.replace(/^#/,""); if(!/access_token=/.test(h)){ if(/error_description=/.test(h)) status("Sign-in link problem: "+decodeURIComponent((h.match(/error_description=([^&]*)/)||[])[1]||"").replace(/\+/g," ")); return}
  var q=new URLSearchParams(h); session={access_token:q.get("access_token"),refresh_token:q.get("refresh_token"),expires_at:+q.get("expires_at")||Math.floor(Date.now()/1000)+(+q.get("expires_in")||3600)};
  saveS(); history.replaceState(null,"",location.pathname+location.search)}
async function sendLink(email){
  var redirect=location.origin+location.pathname;
  await api("/auth/v1/otp?redirect_to="+encodeURIComponent(redirect),{method:"POST",body:{email:email,create_user:true}});
}

/* ---------- data ---------- */
var COLS="id,display_name,tagline,role,village,vlat,vlng,avatar_url,last_seen,whatsapp,show_whatsapp,visible";
async function loadPeople(){ people=await api("/rest/v1/profiles?visible=eq.true&select="+COLS+"&order=last_seen.desc&limit=1000")||[]; render()}
async function loadMe(){ var u=await api("/auth/v1/user"); me=u;
  var r=await api("/rest/v1/profiles?id=eq."+u.id+"&select="+COLS); myProfile=r&&r[0]||null }
async function saveProfile(p){ p.id=me.id;
  var r=await api("/rest/v1/profiles?on_conflict=id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:p}); myProfile=r&&r[0]||p }
async function heartbeat(){ if(!me||!myProfile||document.hidden) return; try{ await api("/rest/v1/profiles?id=eq."+me.id,{method:"PATCH",body:{last_seen:new Date().toISOString()}}) }catch(e){} }
async function loadMsgs(){ if(!me) return; msgs=await api("/rest/v1/messages?or=(sender.eq."+me.id+",recipient.eq."+me.id+")&select=id,sender,recipient,body,created_at,read_at&order=created_at.asc&limit=500")||[]; renderInbox() }
async function sendMsg(to,body){ var r=await api("/rest/v1/messages",{method:"POST",headers:{Prefer:"return=representation"},body:{recipient:to,body:body}}); if(r&&r[0]) addMsg(r[0]) }
function addMsg(m){ if(msgs.some(function(x){return x.id===m.id})) return; msgs.push(m); renderInbox() }

/* realtime (Phoenix protocol); polling remains as a fallback */
function connectRT(){ if(!me||!session||ws) return; var ref=0;
  try{ ws=new WebSocket(URL0.replace(/^https/,"wss")+"/realtime/v1/websocket?apikey="+encodeURIComponent(KEY)+"&vsn=1.0.0") }catch(e){ws=null;return}
  var hb; ws.onopen=function(){
    ws.send(JSON.stringify({topic:"realtime:collab-dm",event:"phx_join",ref:String(++ref),payload:{config:{postgres_changes:[{event:"INSERT",schema:"public",table:"messages"}]},access_token:session.access_token}}));
    hb=setInterval(function(){ try{ws.send(JSON.stringify({topic:"phoenix",event:"heartbeat",payload:{},ref:String(++ref)}))}catch(e){} },25000)};
  ws.onmessage=function(e){ try{ var j=JSON.parse(e.data); var rec=j.payload&&j.payload.data&&j.payload.data.record; if(j.event==="postgres_changes"&&rec&&(rec.recipient===me.id||rec.sender===me.id)) addMsg(rec) }catch(x){} };
  ws.onclose=function(){ clearInterval(hb); ws=null; setTimeout(connectRT,10000) };
}

/* ---------- photo: square crop, 256px, re-encode (strips EXIF/GPS) ---------- */
async function processPhoto(file){
  if(!/^image\//.test(file.type)) throw new Error("That isn't an image.");
  if(file.size>15*1024*1024) throw new Error("Photo too big (max 15 MB).");
  var img; try{ img=await createImageBitmap(file,{imageOrientation:"from-image"}) }catch(e){ img=await createImageBitmap(file) }
  var s=Math.min(img.width,img.height), c=document.createElement("canvas"); c.width=c.height=256;
  c.getContext("2d").drawImage(img,(img.width-s)/2,(img.height-s)/2,s,s,0,0,256,256);
  for(var q=0.85;q>=0.4;q-=0.15){ var b=await new Promise(function(r){c.toBlob(r,"image/jpeg",q)}); if(b&&b.size<=280*1024) return b }
  throw new Error("Couldn't shrink photo enough.");
}
async function uploadPhoto(blob){
  var path=me.id+".jpg";
  await api("/storage/v1/object/avatars/"+path,{method:"POST",headers:{"Content-Type":"image/jpeg","x-upsert":"true","cache-control":"3600"},raw:blob});
  return URL0+"/storage/v1/object/public/avatars/"+path+"?v="+Date.now();
}

/* ---------- map ---------- */
function initMap(){
  map=L.map("map",{zoomControl:true,tap:true,minZoom:9,maxZoom:17,maxBounds:[[14.9,-61.9],[15.9,-60.9]]}).setView([15.42,-61.35],10);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
  layer=L.layerGroup().addTo(map);
  function far(){ map.getContainer().classList.toggle("far",map.getZoom()<FAR_ZOOM) } map.on("zoomend",far); far();
  map.on("click",function(){ activeId=null; document.querySelectorAll(".pin.act").forEach(function(e){e.classList.remove("act")}) });
}
function pinHtml(p){
  var ph=avatarOk(p.avatar_url)?'<img alt="" src="'+esc(p.avatar_url)+'">':esc(initials(p.display_name));
  return '<div class="pin'+(online(p)?" on":"")+(p.id===activeId?" act":"")+'" data-id="'+esc(p.id)+'"><div class="bn"><b>'+esc(p.display_name)+'</b>'+(p.tagline?'<i>'+esc(p.tagline)+'</i>':"")+'</div><div class="ph">'+ph+'</div></div>';
}
function render(){ if(!layer) return; layer.clearLayers();
  var groups={}; people.forEach(function(p){ if(p.vlat==null||p.vlng==null) return; var k=p.vlat+","+p.vlng; (groups[k]=groups[k]||[]).push(p) });
  Object.keys(groups).forEach(function(k){ var g=groups[k], n=g.length, ll=k.split(",").map(Number);
    g.forEach(function(p,i){ // fan out members of one village around its centre (pixel offsets, stays tidy at any zoom)
      var r=n===1?0:Math.min(30+n*4,90), a=2*Math.PI*i/n-Math.PI/2, dx=Math.round(r*Math.cos(a)), dy=Math.round(r*Math.sin(a));
      var icon=L.divIcon({className:"",html:pinHtml(p),iconSize:[52,52],iconAnchor:[26-dx,26-dy]});
      var m=L.marker(ll,{icon:icon,title:p.display_name,keyboard:true,riseOnHover:true}).addTo(layer);
      m.on("click",function(){ activeId=p.id; render(); openCard(p) });
    });
  });
  status(people.length?people.length+" on the map":(configured()?"Nobody is sharing yet — be the first.":""));
}

/* ---------- UI ---------- */
function show(id){ $(id).hidden=false } function hide(id){ $(id).hidden=true }
document.addEventListener("click",function(e){ if(e.target.matches("[data-close]")||e.target.classList.contains("sheet")) e.target.closest(".sheet").hidden=true });
function setAv(el,p){ el.textContent=""; if(p&&avatarOk(p.avatar_url)){ var i=new Image(); i.alt=""; i.src=p.avatar_url; el.appendChild(i) } else el.textContent=initials(p&&p.display_name) }
function openCard(p){
  setAv($("card-av"),p); $("card-name").textContent=p.display_name||"(no name)"; $("card-tag").textContent=p.tagline||"";
  $("card-meta").textContent=[$("f-role").querySelector('option[value="'+(p.role||"other").replace(/[^a-z]/g,"")+'"]')?.textContent||"",p.village,online(p)?"🟢 online now":""].filter(Boolean).join(" · ");
  var wa=$("card-wa"); if(p.show_whatsapp&&/^[0-9]{7,15}$/.test(p.whatsapp||"")){ wa.href="https://wa.me/"+p.whatsapp+"?text="+encodeURIComponent("Hi "+p.display_name+", saw you on Island Pin Collab Map — let's collab!"); wa.hidden=false } else wa.hidden=true;
  $("card-msg").hidden=!!(me&&me.id===p.id);
  $("card-room").hidden=!!(me&&me.id===p.id);
  $("card-room").onclick=async function(){ if(!me){ hide("card"); openMe(); return }
    if(!window.CollabCore.turnConfigured()){ status("Collab Room isn't launched yet (needs a TURN relay) — opening the connection test."); location.href="room.html"; return }
    try{ await window.CollabCore.me(); var r=await window.CollabCore.invite(p.id,"collab-room"); await sendMsg(p.id,"🎧 I invited you to a 1-to-1 Collab Room — open the Collab Map to accept."); location.href="room.html?id="+r.id }catch(x){ status("Invite failed: "+x.message) } };
  $("card-msg").onclick=function(){ if(!me){ hide("card"); openMe(); status("Sign in to message."); return } hide("card"); openThread(p.id) };
  show("card");
}
function openMe(){
  if(!configured()){ status("Setup pending — sign-in isn't switched on yet."); return }
  $("signin").hidden=!!me; $("profile").hidden=!me; if(me) fillForm(); show("me");
}
function fillForm(){ var p=myProfile||{};
  $("f-name").value=p.display_name||""; $("f-tag").value=p.tagline||""; $("f-role").value=p.role||"artist"; $("f-village").value=p.village||"";
  $("f-visible").checked=!!p.visible; $("f-wa-on").checked=!!p.show_whatsapp; $("f-wa").value=p.whatsapp||localStorage.getItem("collab_wa")||""; $("wa-wrap").hidden=!p.show_whatsapp; setAv($("me-av"),p); $("f-err").textContent="" }
function nameOf(id){ var p=people.find(function(x){return x.id===id}); return p?p.display_name:"Collaborator" }
function renderInbox(){
  if(!me) return; var by={}, unread=0;
  msgs.forEach(function(m){ var peer=m.sender===me.id?m.recipient:m.sender; by[peer]=m; if(m.recipient===me.id&&!m.read_at) unread++ });
  $("unread").textContent=unread; $("unread").hidden=!unread;
  var t=$("threads"); t.textContent="";
  var keys=Object.keys(by).sort(function(a,b){return by[b].created_at.localeCompare(by[a].created_at)});
  if(!keys.length){ var e=document.createElement("p"); e.className="meta"; e.textContent="No messages yet. Tap someone on the map and hit Message."; t.appendChild(e) }
  keys.forEach(function(id){ var b=document.createElement("button"); b.className="th"; var av=document.createElement("div"); av.className="av"; setAv(av,people.find(function(x){return x.id===id})||{display_name:nameOf(id)});
    var d=document.createElement("div"), n=document.createElement("b"), s=document.createElement("small"); n.textContent=nameOf(id); s.textContent=by[id].body.slice(0,60); d.append(n,s); b.append(av,d); b.onclick=function(){openThread(id)}; t.appendChild(b) });
  if(openPeer) renderThread();
}
function renderThread(){ var l=$("thread-list"); l.textContent="";
  msgs.filter(function(m){return (m.sender===openPeer&&m.recipient===me.id)||(m.recipient===openPeer&&m.sender===me.id)}).forEach(function(m){
    var d=document.createElement("div"); d.className="msg"+(m.sender===me.id?" mine":""); d.textContent=m.body; var tm=document.createElement("time"); tm.textContent=new Date(m.created_at).toLocaleString(); d.appendChild(tm); l.appendChild(d) });
  l.scrollTop=l.scrollHeight;
  var unread=msgs.filter(function(m){return m.sender===openPeer&&m.recipient===me.id&&!m.read_at});
  if(unread.length){ unread.forEach(function(m){m.read_at=new Date().toISOString()}); api("/rest/v1/messages?recipient=eq."+me.id+"&sender=eq."+openPeer+"&read_at=is.null",{method:"PATCH",body:{read_at:new Date().toISOString()}}).catch(function(){}); setTimeout(renderInbox,0) }
}
function openThread(id){ openPeer=id; $("threads").hidden=true; $("thread").hidden=false; $("thread-name").textContent=nameOf(id); show("inbox"); renderThread(); $("send-body").focus() }

function nearestVillage(lat,lng){ var best=null,bd=1e9; VILL.forEach(function(v){ var d=Math.pow(v[1]-lat,2)+Math.pow((v[2]-lng)*Math.cos(lat*Math.PI/180),2); if(d<bd){bd=d;best=v} }); return best }

function wire(){
  var sel=$("f-village"); VILL.forEach(function(v){ var o=document.createElement("option"); o.value=v[0]; o.textContent=v[0]; sel.appendChild(o) });
  $("btn-me").onclick=openMe;
  $("btn-inbox").onclick=function(){ openPeer=null; $("threads").hidden=false; $("thread").hidden=true; show("inbox"); renderInbox() };
  $("thread-back").onclick=function(){ openPeer=null; $("threads").hidden=false; $("thread").hidden=true };
  $("f-wa-on").onchange=function(){ $("wa-wrap").hidden=!this.checked };
  $("signin").onsubmit=async function(e){ e.preventDefault(); var em=$("email").value.trim(); try{ await sendLink(em); status("Check "+em+" for your sign-in link, then open it on this device."); hide("me") }catch(x){ status("Couldn't send link: "+x.message) } };
  $("gps").onclick=function(){ if(!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(function(pos){ var v=nearestVillage(pos.coords.latitude,pos.coords.longitude); // coords dropped here; only the village name is kept
      $("f-village").value=v[0]; $("f-err").textContent="Nearest village: "+v[0]+" (your exact location was not saved)" },
      function(){ $("f-err").textContent="Couldn't get location — pick your village from the list." },{enableHighAccuracy:false,timeout:10000,maximumAge:600000}) };
  $("photo").onchange=async function(){ var f=this.files[0]; this.value=""; if(!f) return; $("f-err").textContent="Uploading photo…";
    try{ var b=await processPhoto(f); var url=await uploadPhoto(b); await saveProfile({avatar_url:url}); setAv($("me-av"),myProfile); $("f-err").textContent="Photo updated ✓"; loadPeople() }catch(x){ $("f-err").textContent=x.message } };
  $("photo-rm").onclick=async function(){ try{ await api("/storage/v1/object/avatars/"+me.id+".jpg",{method:"DELETE"}).catch(function(){}); await saveProfile({avatar_url:null}); setAv($("me-av"),myProfile); loadPeople() }catch(x){ $("f-err").textContent=x.message } };
  $("profile").onsubmit=async function(e){ e.preventDefault(); var err=$("f-err");
    var name=clean($("f-name").value,24), tag=clean($("f-tag").value,40), vil=$("f-village").value, v=VILL.find(function(x){return x[0]===vil});
    var waOn=$("f-wa-on").checked, wa=$("f-wa").value.replace(/\D/g,"");
    if(name.length<2) return err.textContent="Display name needs at least 2 characters.";
    if(profane(name)||profane(tag)) return err.textContent="Please keep your name and tagline clean.";
    if($("f-visible").checked&&!v) return err.textContent="Pick your village to show on the map.";
    if(waOn&&!/^[0-9]{7,15}$/.test(wa)) return err.textContent="WhatsApp number: digits with country code, e.g. 17672251234.";
    try{ localStorage.setItem("collab_wa",wa) }catch(x){}
    try{ await saveProfile({display_name:name,tagline:tag,role:$("f-role").value,village:v?v[0]:null,vlat:v?v[1]:null,vlng:v?v[2]:null,visible:$("f-visible").checked,show_whatsapp:waOn,whatsapp:waOn?wa:null,last_seen:new Date().toISOString()});
      err.textContent="Saved ✓"; $("me-label").textContent=name; loadPeople() }catch(x){ err.textContent="Save failed: "+x.message } };
  $("signout").onclick=function(){ api("/auth/v1/logout",{method:"POST"}).catch(function(){}); session=null; me=null; myProfile=null; saveS(); if(ws)ws.close(); location.reload() };
  $("send").onsubmit=async function(e){ e.preventDefault(); var b=$("send-body").value.trim().slice(0,1000); if(!b||!openPeer) return; $("send-body").value="";
    try{ await sendMsg(openPeer,b) }catch(x){ status("Message not sent: "+x.message); $("send-body").value=b } };
}

async function start(){
  wire(); initMap();
  if(!configured()){ $("pending").hidden=false; $("btn-me").querySelector("span").textContent="Setup pending"; status(""); return }
  readHash(); try{ session=session||JSON.parse(localStorage.getItem(SESS)||"null") }catch(e){}
  if(session){ try{ await loadMe(); $("me-label").textContent=(myProfile&&myProfile.display_name)||"My profile"; $("btn-inbox").hidden=false; if(!myProfile) openMe() }catch(e){ session=null; me=null; saveS(); status("Please sign in again.") } }
  try{ await loadPeople() }catch(e){ status("Couldn't load the map people: "+e.message) }
  if(me){ heartbeat(); setInterval(heartbeat,60000); loadMsgs().catch(function(){}); connectRT(); setInterval(function(){loadMsgs().catch(function(){})},20000) }
  if(me){ var checkInv=async function(){ try{ await window.CollabCore.me(); var inv=await window.CollabCore.myInvites(), box=$("invites"); box.textContent=""; box.hidden=!inv.length;
      inv.forEach(function(r){ var a=document.createElement("a"); a.className="btn primary"; a.href="room.html?id="+encodeURIComponent(r.id); a.textContent="🎧 "+nameOf(r.host)+" invited you to a Collab Room — open"; box.appendChild(a) }) }catch(e){} };
    checkInv(); setInterval(checkInv,20000) }
  setInterval(function(){ if(!document.hidden) loadPeople().catch(function(){}) },60000);
  document.addEventListener("visibilitychange",function(){ if(!document.hidden){ heartbeat(); loadPeople().catch(function(){}) } });
}
start();
})();
