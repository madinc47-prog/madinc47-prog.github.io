/* Ask AI — clean handoff, no iframe/popups. AI chats block iframing (grok.com X-Frame-Options: SAMEORIGIN, verified 2026-10);
   Claude web ?q= removed (~Oct 2025, unverified for all flows) so we never rely on auto-submit except Grok.
   Pattern: panel builds a prompt from EXPLICIT context checkboxes -> Copy prompt (always) -> optionally open AI in a NEW TAB.
   Playback/state untouched: opening a tab or copying never calls stop(). No silent upload: nothing leaves until user taps Copy/Open. */
(function(){
"use strict";
function $(id){return document.getElementById(id)}
function ctx(){
  var b=(document.getElementById("bpm")||{}).value||"", kit=(document.getElementById("kit-name")||{}).textContent||"", keyEl=document.querySelector(".js-songkey"), song=(document.getElementById("ly-song")||{});
  var title=(song.options&&song.selectedIndex>=0&&song.options[song.selectedIndex])?song.options[song.selectedIndex].textContent:"";
  var lyr=(document.getElementById("ly-text")||{}).value||"";
  return {bpm:b,kit:kit.trim(),key:keyEl?keyEl.value:"",song:title,lyrics:lyr};
}
var TEMPLATES={
 lyrics:function(c){return "Help me write lyrics for my beat.\nBeat: "+(c.kit||"")+" at "+c.bpm+" BPM, key "+(c.key||"?")+". Song: "+(c.song||"Untitled")+".\nGive me a hook (4 lines) + one verse (8 lines), Caribbean hip-hop feel, bars that land on the beat. Keep my lines if I pasted any.\nMy lyrics so far:\n"+(c.lyrics||"(none yet)")},
 mix:function(c){return "Give me mix advice for this beat: "+(c.kit||"")+", "+c.bpm+" BPM, key "+(c.key||"?")+".\nAsk me what I hear wrong, then give 3 concrete fixes (EQ/comp/levels) I can do in a browser mixer. No mastering chain longer than 5 steps."},
 chords:function(c){return "Suggest chord ideas for this beat: "+(c.kit||"")+", "+c.bpm+" BPM, song key "+(c.key||"?")+".\nGive 3 different 4-chord loops (named chords + why they fit), one safe, one moody, one surprising. Note which fit boom-bap vs trap."}
};
function build(){
 if($("ai-panel")) return;
 var fab=document.createElement("button"); fab.id="ai-fab"; fab.className="ai-fab"; fab.type="button"; fab.textContent="✨ Ask AI"; fab.setAttribute("aria-haspopup","dialog");
 var p=document.createElement("aside"); p.id="ai-panel"; p.className="ai-panel"; p.hidden=true; p.setAttribute("role","dialog"); p.setAttribute("aria-label","Ask AI");
 p.innerHTML='<div class="row" style="justify-content:space-between"><strong>✨ Ask AI</strong><button type="button" id="ai-close" class="btn small ghost">Close ✕</button></div>'+
 '<p class="hint">Your beat keeps playing. Nothing is sent anywhere until you tap Copy or Open. AI chats can\u2019t be embedded here (they block iframes), so this hands off in a new tab.</p>'+
 '<div class="row"><button type="button" class="btn small" data-ai-t="lyrics">🎤 Lyrics help</button><button type="button" class="btn small" data-ai-t="mix">🎚 Mix advice</button><button type="button" class="btn small" data-ai-t="chords">🎹 Chord ideas</button></div>'+
 '<label><input type="checkbox" id="ai-inc-lyrics"> Include my current lyrics (only if ticked)</label>'+
 '<textarea id="ai-prompt" aria-label="Prompt to copy to your AI"></textarea>'+
 '<div class="row"><button type="button" id="ai-copy" class="btn primary">Copy prompt</button>'+
 '<button type="button" id="ai-grok" class="btn">Open Grok (new tab)</button>'+
 '<button type="button" id="ai-chatgpt" class="btn">Open ChatGPT (new tab)</button>'+
 '<button type="button" id="ai-claude" class="btn ghost">Open Claude (new tab, paste)</button></div>'+
 '<p class="hint" id="ai-note">Grok links auto-send the prompt on open (verified); ChatGPT pre-fills, you press send; Claude: prompt is copied — paste it there. Keep prompts short: lyrics can make links long, Copy is safest.</p>';
 document.body.appendChild(fab); document.body.appendChild(p);
 function setT(name){ var c=ctx(); if(!$("ai-inc-lyrics").checked) c.lyrics=""; $("ai-prompt").value=TEMPLATES[name](c); }
 p.querySelectorAll("[data-ai-t]").forEach(function(b){b.addEventListener("click",function(){setT(b.dataset.aiT)})});
 fab.addEventListener("click",function(){ p.hidden=false; if(!$("ai-prompt").value) setT("chords"); });
 $("ai-close").addEventListener("click",function(){p.hidden=true});
 function copy(){ var t=$("ai-prompt").value; if(navigator.clipboard) return navigator.clipboard.writeText(t); $("ai-prompt").select(); document.execCommand("copy"); return Promise.resolve(); }
 $("ai-copy").addEventListener("click",function(){ copy().then(function(){$("ai-note").textContent="Copied ✓ — paste it into any AI chat.";}); });
 function openAI(url){ copy().finally(function(){ window.open(url,"_blank","noopener"); }); }
 $("ai-grok").addEventListener("click",function(){ var t=$("ai-prompt").value.slice(0,1800); openAI("https://grok.com/?q="+encodeURIComponent(t)); });
 $("ai-chatgpt").addEventListener("click",function(){ var t=$("ai-prompt").value.slice(0,1800); openAI("https://chatgpt.com/?q="+encodeURIComponent(t)); });
 $("ai-claude").addEventListener("click",function(){ openAI("https://claude.ai/new"); });
}
window.IPBAI={templates:Object.keys(TEMPLATES)};
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",build); else build();
})();
