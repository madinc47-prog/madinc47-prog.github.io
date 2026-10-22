/* IslePin CollabCore — the ONE module every cross-user / device-sharing feature in the suite must use.
   Policy (/shared/COLLAB-POLICY.md): invite-only, strictly 1-to-1 (inviter + accepted invitee), signed-in users only,
   everything flows only between those two; enforced server-side by RLS in /collab/supabase.sql and again here.
   Needs window.COLLAB_CONFIG (from /collab/config.js). No config => configured() is false and nothing connects. */
(function(){
"use strict";
var CFG=window.COLLAB_CONFIG||{}, URL0=(CFG.supabaseUrl||"").replace(/\/$/,""), KEY=CFG.supabaseAnonKey||"", SESS="collab_session_v1";
var session=null, user=null, ws=null, wsRef=0, subs={}, hb=null, rtBackoff=2000;
function configured(){return /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(URL0)&&KEY.length>20}
function iceServers(){return Array.isArray(CFG.iceServers)&&CFG.iceServers.length?CFG.iceServers:[{urls:["stun:stun.l.google.com:19302"]}]}
function turnConfigured(){return iceServers().some(function(s){var u=[].concat(s.urls||[]); return u.some(function(x){return /^turns?:/.test(x)})&&s.username&&s.credential})}
function save(){try{session?localStorage.setItem(SESS,JSON.stringify(session)):localStorage.removeItem(SESS)}catch(e){}}
function load(){try{session=JSON.parse(localStorage.getItem(SESS)||"null")}catch(e){session=null}}
function hdr(x){var h={apikey:KEY,"Content-Type":"application/json",Authorization:"Bearer "+(session?session.access_token:KEY)}; for(var k in x||{})h[k]=x[k]; return h}
async function refresh(){ if(!session||!session.refresh_token) return;
  var r=await fetch(URL0+"/auth/v1/token?grant_type=refresh_token",{method:"POST",headers:{apikey:KEY,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:session.refresh_token})});
  if(!r.ok){session=null;save();return} var j=await r.json(); session={access_token:j.access_token,refresh_token:j.refresh_token,expires_at:j.expires_at||Math.floor(Date.now()/1000)+(j.expires_in||3600)}; save()}
async function api(path,o){o=o||{}; if(!configured()) throw new Error("Collab not set up yet");
  if(session&&session.expires_at&&session.expires_at*1000<Date.now()+60000) await refresh();
  var r=await fetch(URL0+path,{method:o.method||"GET",headers:hdr(o.headers),body:o.raw||(o.body!==undefined?JSON.stringify(o.body):undefined)});
  var t=await r.text(); if(!r.ok){var m=t; try{var j=JSON.parse(t); m=j.message||j.msg||j.error_description||t}catch(e){} throw new Error(String(m).slice(0,200))}
  return t?JSON.parse(t):null}
async function me(){ if(user) return user; load(); if(!session) return null; try{ user=await api("/auth/v1/user") }catch(e){ user=null } return user }
function uid(){return user&&user.id}

/* realtime (Supabase Phoenix protocol, RLS-filtered postgres_changes) */
function rtSend(m){ if(ws&&ws.readyState===1) ws.send(JSON.stringify(m)) }
function rtJoin(topic){ var s=subs[topic]; rtSend({topic:"realtime:"+topic,event:"phx_join",ref:String(++wsRef),payload:{config:{postgres_changes:s.changes},access_token:session.access_token}}) }
function rtConnect(){ if(ws||!session) return;
  try{ ws=new WebSocket(URL0.replace(/^https/,"wss")+"/realtime/v1/websocket?apikey="+encodeURIComponent(KEY)+"&vsn=1.0.0") }catch(e){ ws=null; return } // polling fallback still runs
  ws.onopen=function(){ rtBackoff=2000; Object.keys(subs).forEach(rtJoin); hb=setInterval(function(){rtSend({topic:"phoenix",event:"heartbeat",payload:{},ref:String(++wsRef)})},25000) };
  ws.onmessage=function(e){ var j; try{j=JSON.parse(e.data)}catch(x){return} var t=(j.topic||"").replace(/^realtime:/,""), s=subs[t];
    if(s&&j.event==="postgres_changes"&&j.payload&&j.payload.data) s.cb(j.payload.data.record||j.payload.data.old_record, j.payload.data.type) };
  ws.onclose=function(){ clearInterval(hb); ws=null; if(Object.keys(subs).length) setTimeout(rtConnect,rtBackoff=Math.min(rtBackoff*2,30000)) };
}
function subscribe(topic,changes,cb){ subs[topic]={changes:changes,cb:cb}; if(ws&&ws.readyState===1) rtJoin(topic); else rtConnect();
  return function(){ rtSend({topic:"realtime:"+topic,event:"phx_leave",ref:String(++wsRef),payload:{}}); delete subs[topic] } }

/* rooms: strictly two people */
function isMember(room,id){ return !!room&&(id===room.host||id===room.guest) }
function peerOf(room){ return room.host===uid()?room.guest:room.host }
async function invite(peerId,app){ if(!uid()) throw new Error("Sign in first"); if(peerId===uid()) throw new Error("You can't invite yourself");
  var r=await api("/rest/v1/rooms",{method:"POST",headers:{Prefer:"return=representation"},body:{guest:peerId,app:app||"collab-room"}}); return r[0] }
async function getRoom(id){ var r=await api("/rest/v1/rooms?id=eq."+encodeURIComponent(id)+"&select=*"); var room=r&&r[0]; if(!room||!isMember(room,uid())) throw new Error("Room not found or not yours"); return room }
async function setStatus(id,status){ var r=await api("/rest/v1/rooms?id=eq."+encodeURIComponent(id),{method:"PATCH",headers:{Prefer:"return=representation"},body:{status:status}}); return r&&r[0] }
var accept=function(id){return setStatus(id,"active")}, decline=function(id){return setStatus(id,"declined")}, end=function(id){return setStatus(id,"ended")};
async function myInvites(){ return await api("/rest/v1/rooms?guest=eq."+uid()+"&status=eq.invited&select=*&order=created_at.desc&limit=20")||[] }
/* signals: only accepted from the one other member of this room */
async function signal(room,kind,payload){ if(room.status!=="active") throw new Error("Room not active"); return api("/rest/v1/room_signals",{method:"POST",body:{room_id:room.id,kind:kind,payload:payload||{}}}) }
function onSignals(room,cb){ var other=peerOf(room), since=0, seen={};
  function take(s){ if(!s||seen[s.id]||s.room_id!==room.id) return; seen[s.id]=1; if(s.sender!==other) return; /* ignore self + anyone else */ cb(s) }
  var unsub=subscribe("room-"+room.id,[{event:"INSERT",schema:"public",table:"room_signals",filter:"room_id=eq."+room.id}],take);
  var poll=setInterval(function(){ api("/rest/v1/room_signals?room_id=eq."+room.id+"&id=gt."+since+"&order=id.asc&limit=200").then(function(rows){ (rows||[]).forEach(function(s){ since=Math.max(since,s.id); take(s) }) }).catch(function(){}) },3000);
  return function(){ unsub(); clearInterval(poll) } }
function onRoom(room,cb){ return subscribe("roomrow-"+room.id,[{event:"UPDATE",schema:"public",table:"rooms",filter:"id=eq."+room.id}],function(r){ if(r&&r.id===room.id) cb(r) }) }

window.CollabCore={configured:configured,iceServers:iceServers,turnConfigured:turnConfigured,api:api,me:me,uid:uid,session:function(){return session},
  subscribe:subscribe,invite:invite,getRoom:getRoom,accept:accept,decline:decline,end:end,myInvites:myInvites,signal:signal,onSignals:onSignals,onRoom:onRoom,isMember:isMember,peerOf:peerOf,MAX_PEERS:1};
})();
