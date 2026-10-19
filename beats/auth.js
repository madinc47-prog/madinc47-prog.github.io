/* Island Pin Beats — email magic-link login (Supabase Auth + PostgREST), local-first.
   Syncs ONLY: session/songs/piano lib/pad-assign metadata/MIDI settings+learn.
   Never syncs: USB deviceId, Vault/Studio audio, voice clone, device prefs.
   No config (auth-config.js empty) => panel says "Login not set up yet", guest/local unchanged. */
(function(){
"use strict";
var CFG=window.IPB_AUTH_CONFIG||{};
var URL0=(CFG.supabaseUrl||"").replace(/\/$/,""), KEY=CFG.supabaseAnonKey||"";
var SYNC_KEYS=["ipb_session_v1","ipb_songs_v1","ipb_piano_lib_v1","ipb_padassign_v1","ipb_midi_settings_v2","ipb_midi_learn_v2"];
var SESS="ipb_auth_session_v1", INIT="ipb_auth_initialized_v1", GUEST="ipb_guest_snapshot_v1";
var session=null, user=null, lastHash="", syncTimer=null;
function $(id){return document.getElementById(id)}
function msg(t){var e=$("auth-msg"); if(e)e.textContent=t||"";}
function syncLine(t){var e=$("auth-sync"); if(e)e.textContent=t||"";}
function configured(){return !!(URL0&&KEY)}
function headers(extra){var h={"apikey":KEY,"Content-Type":"application/json"}; if(session&&session.access_token)h.Authorization="Bearer "+session.access_token; if(extra)Object.keys(extra).forEach(function(k){h[k]=extra[k]}); return h;}
function saveSession(){try{session?localStorage.setItem(SESS,JSON.stringify(session)):localStorage.removeItem(SESS)}catch(e){}}
function loadSession(){try{session=JSON.parse(localStorage.getItem(SESS)||"null")}catch(e){session=null}}
function snapshot(keys){var o={}; keys.forEach(function(k){try{var v=localStorage.getItem(k); if(v!=null)o[k]=v}catch(e){}}); return o;}
function applySnap(o){SYNC_KEYS.forEach(function(k){try{ if(o&&o[k]!=null)localStorage.setItem(k,o[k]); else localStorage.removeItem(k)}catch(e){}});}
function clearLive(){applySnap({}); try{localStorage.removeItem(INIT)}catch(e){}}
function hashKeys(){var s=""; SYNC_KEYS.forEach(function(k){s+=(localStorage.getItem(k)||"")+"|"}); var h=0; for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0; return h+":"+s.length;}
async function api(path,opts){opts=opts||{}; var r=await fetch(URL0+path,{method:opts.method||"GET",headers:headers(opts.headers),body:opts.body?JSON.stringify(opts.body):undefined}); if(!r.ok) throw new Error(path+" "+r.status+" "+(await r.text()).slice(0,180)); var t=await r.text(); return t?JSON.parse(t):null;}
async function getUser(){ if(!session) return null; user=await api("/auth/v1/user"); return user;}
async function download(){
  var rows=await api("/rest/v1/user_data?user_id=eq."+encodeURIComponent(user.id)+"&select=key,value");
  if(!rows||!rows.length) return null;
  var o={}; rows.forEach(function(r){o[r.key]=typeof r.value==="string"?r.value:JSON.stringify(r.value)}); return o;
}
async function upload(){
  if(!user) return false;
  var snap=snapshot(SYNC_KEYS), rows=Object.keys(snap).map(function(k){var v; try{v=JSON.parse(snap[k])}catch(e){v=snap[k]} return {user_id:user.id,key:k,value:v,updated_at:new Date().toISOString()};});
  // delete-mark: send rows; keys removed locally stay stale remotely (v1 limitation, noted in AUTH-SETUP.md)
  if(rows.length) await api("/rest/v1/user_data",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates"},body:rows});
  lastHash=hashKeys(); syncLine("Synced ✓ "+new Date().toLocaleTimeString()+" · Saved on this device too"); return true;
}
async function syncNow(manual){
  if(!configured()||!user) return;
  try{ await upload(); if(manual) msg("Synced your beats/settings for "+(user.email||"your account")+"."); }
  catch(e){ syncLine("Saved on this device · will sync when online ("+(e.message||e)+")"); if(manual) msg("Offline or sync failed — your work is saved on this device."); }
}
function render(){
  var st=$("auth-state"), em=$("auth-email"), login=$("auth-login"), out=$("auth-logout"), choice=$("auth-choice"), syncb=$("auth-sync-btn");
  if(!st) return;
  if(!configured()){ st.textContent="Login not set up yet — playing as Guest (everything stays on this device)."; if(login)login.disabled=true; if(em)em.disabled=true; if(out)out.hidden=true; if(syncb)syncb.hidden=true; return; }
  if(user){ st.textContent="Signed in as "+(user.email||"")+" · your beats/settings sync to your account."; if(login)login.hidden=true; if(em)em.hidden=true; if(out)out.hidden=false; if(syncb)syncb.hidden=false; }
  else { st.textContent="Guest — beats stay on this device only. Sign in to see them on another computer."; if(login){login.hidden=false;login.disabled=false} if(em){em.hidden=false;em.disabled=false} if(out)out.hidden=true; if(syncb)syncb.hidden=true; if(choice)choice.hidden=true; }
}
async function afterLogin(){
  await getUser(); render();
  var initFor=""; try{initFor=localStorage.getItem(INIT)||""}catch(e){}
  if(initFor===user.id){ // returning: pull account copy over live device copy
    try{ var remote=await download(); if(remote){ applySnap(remote); syncLine("Synced ✓ account copy loaded"); setTimeout(function(){location.reload()},400); return; } }catch(e){ syncLine("Saved on this device · will sync when online"); }
    startAuto(); return;
  }
  // first sign-in for this user on any device: check account
  var remote=null; try{ remote=await download(); }catch(e){}
  if(remote){ applySnap(remote); try{localStorage.setItem(INIT,user.id)}catch(e){} syncLine("Synced ✓ account copy loaded"); setTimeout(function(){location.reload()},400); return; }
  // brand-new account: explicit choice only, nothing auto-uploaded
  try{ if(!localStorage.getItem(GUEST)) localStorage.setItem(GUEST,JSON.stringify(snapshot(SYNC_KEYS))); }catch(e){}
  var hasLocal=SYNC_KEYS.some(function(k){return !!localStorage.getItem(k)});
  var ch=$("auth-choice"); if(ch&&hasLocal){ ch.hidden=false; msg("First sign-in: choose what to do with the beats already on this device. Nothing was uploaded yet."); }
  else { try{localStorage.setItem(INIT,user.id)}catch(e){} startAuto(); }
  render();
}
function startAuto(){ if(syncTimer)clearInterval(syncTimer); lastHash=hashKeys(); syncTimer=setInterval(function(){ if(user&&hashKeys()!==lastHash) syncNow(false); },20000); }
function build(){
  if($("auth-panel")) return;
  var host=document.createElement("details"); host.id="auth-panel"; host.className="auth-panel";
  host.innerHTML='<summary>👤 Account & sync <span id="auth-state" style="font-weight:400"></span></summary>'+
  '<div class="auth-row"><input id="auth-email" type="email" autocomplete="email" placeholder="you@example.com" aria-label="Email for magic link"><button type="button" id="auth-login" class="btn primary">Email me a sign-in link</button><button type="button" id="auth-logout" class="btn ghost" hidden>Log out</button><button type="button" id="auth-sync-btn" class="btn small" hidden>Sync now</button></div>'+
  '<div id="auth-choice" hidden><p>First sign-in — what should happen to the beats/settings already on this device?</p><div class="auth-row"><button type="button" id="auth-bring" class="btn primary">Bring this device\u2019s beats into my account</button><button type="button" id="auth-empty" class="btn ghost">Start empty (clears them on this device)</button></div></div>'+
  '<div class="auth-row"><button type="button" id="auth-guest-restore" class="btn small ghost" hidden>Restore pre-login guest beats on this device</button></div>'+
  '<p id="auth-msg" role="status"></p><p id="auth-sync">Saved on this device</p>'+
  '<p class="hint">Magic link = no password. Synced: beat/session, songs/lyrics, Piano Roll library, pad assignments, MIDI settings. Not synced in v1: Vault/Studio audio, USB mic choice (device-specific). Audio stays on the device that recorded it.</p>';
  var main=document.querySelector("main"); if(main&&main.parentNode) main.parentNode.insertBefore(host,main); else document.body.appendChild(host);
  try{ var g=localStorage.getItem(GUEST); var rb=$("auth-guest-restore"); if(rb&&g&&!user) rb.hidden=false; }catch(e){}
  $("auth-login").addEventListener("click",async function(){
    var email=($("auth-email").value||"").trim(); if(!email){msg("Type your email first.");return;}
    msg("Sending sign-in link…");
    try{ await api("/auth/v1/otp",{method:"POST",body:{email:email,options:{emailRedirectTo:location.origin+location.pathname}}}); msg("Check your email — tap the sign-in link in it. It brings you back here signed in."); }
    catch(e){ msg("Could not send link: "+(e.message||e)); }
  });
  $("auth-logout").addEventListener("click",async function(){
    if(!confirm("Log out? Your account beats will be removed from THIS device (they stay in your account). Unsyced changes will try to sync first.")) return;
    try{ await syncNow(false); await api("/auth/v1/logout",{method:"POST"}); }catch(e){}
    session=null; user=null; saveSession(); clearLive();
    location.reload(); // clean empty state; guest snapshot NOT auto-loaded (Restore button offers it)
  });
  $("auth-sync-btn").addEventListener("click",function(){syncNow(true)});
  var bring=$("auth-bring"); if(bring) bring.addEventListener("click",async function(){ try{localStorage.setItem(INIT,user.id)}catch(e){} $("auth-choice").hidden=true; await syncNow(true); startAuto(); render(); });
  var empty=$("auth-empty"); if(empty) empty.addEventListener("click",async function(){ if(!confirm("Start empty? This clears the current beats/settings on THIS device (your pre-login guest copy is kept under Restore)."))return; clearLive(); try{localStorage.setItem(INIT,user.id)}catch(e){} location.reload(); });
  var rest=$("auth-guest-restore"); if(rest) rest.addEventListener("click",function(){ try{var g=JSON.parse(localStorage.getItem(GUEST)||"null"); if(g){applySnap(g); location.reload();}}catch(e){} });
  render();
}
async function init(){
  build();
  // magic-link return: tokens in #hash
  if(location.hash&&/access_token=/.test(location.hash)){
    var p=new URLSearchParams(location.hash.slice(1));
    session={access_token:p.get("access_token"),refresh_token:p.get("refresh_token")};
    saveSession(); try{history.replaceState(null,"",location.pathname+location.search)}catch(e){}
    if(configured()){ try{await afterLogin();}catch(e){msg("Sign-in failed: "+(e.message||e))} }
    return;
  }
  loadSession();
  if(configured()&&session){ try{ await afterLogin(); }catch(e){ session=null; saveSession(); render(); syncLine("Saved on this device (sign-in expired)"); } }
  else render();
}
window.IPBAuth={configured:configured,user:function(){return user},syncNow:function(){return syncNow(true)},syncKeys:SYNC_KEYS.slice()};
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init); else init();
})();
