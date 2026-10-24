/* On Demand: poster rows, full-screen player with resume · v20261024f */
(function(){
 const d=document,$=s=>d.querySelector(s),esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const K=id=>"vod:"+id,get=id=>+(localStorage[K(id)]||0),put=(id,t,dur)=>{if(dur&&t>dur-120){delete localStorage[K(id)];return}localStorage[K(id)]=Math.floor(t);localStorage["vodLast:"+id]=Date.now()};
 const P=d.createElement("div");P.id="vodPanel";P.className="vodp hidden";P.innerHTML='<div class="vodhead"><h2>On Demand</h2><button class="vodx" data-x>✕ Close</button></div><div id="vodRows"></div>';d.body.appendChild(P);
 const PL=d.createElement("div");PL.id="vodPlayer";PL.className="vodpl hidden";PL.innerHTML='<div id="vodStage"></div><div class="vodbar"><span id="vodTitle"></span><button id="vodNext" class="hidden">Next ▶</button><button id="vodClose">✕ Back</button></div>';d.body.appendChild(PL);
 const fmt=s=>s?`${Math.floor(s/3600)?Math.floor(s/3600)+"h ":""}${Math.round(s%3600/60)}m`:"";
 const card=(o,kind)=>{const r=get(o.rid||o.id),pct=o.d&&r?Math.min(100,r/o.d*100):0;return `<button class="vc" data-kind="${kind}" data-id="${esc(o.id)}"><img loading="lazy" src="${esc(o.poster)}" alt=""><span class="vt">${esc(o.t)}${o.y?` <small>${o.y}</small>`:""}</span>${pct?`<i style="width:${pct}%"></i>`:""}${o.d?`<em>${fmt(o.d)}</em>`:""}</button>`};
 function rows(){const V=window.TVVOD||{movies:[],shows:[]},M=V.movies,g=(...x)=>M.filter(m=>m.g.some(y=>x.includes(y)));
  const cont=M.filter(m=>get(m.id)>30).sort((a,b)=>(+localStorage["vodLast:"+b.id]||0)-(+localStorage["vodLast:"+a.id]||0));
  const R=[["▶ Continue watching",cont,"m"],["Action",g("action"),"m"],["Westerns",g("western"),"m"],["Comedy",g("comedy"),"m"],["Horror / Sci-Fi",g("horror","scifi","sci-fi"),"m"],["Drama & Noir",g("drama","noir","musical"),"m"],["Documentaries",g("documentary"),"m"],["Animation & Shorts",g("animation"),"m"],["📺 TV Shows",V.shows.map(s=>({...s,d:0})),"s"]];
  $("#vodRows").innerHTML=R.filter(r=>r[1].length).map(([h,l,k])=>`<h3>${h} <small>${l.length}</small></h3><div class="vrow">${l.map(o=>card(o,k)).join("")}</div>`).join("")+`<p class="vodsrc">${esc(V.policy||"")}</p>`;
  $("#vodRows").querySelectorAll(".vc").forEach(b=>b.onclick=()=>{const V=window.TVVOD;if(b.dataset.kind==="m")play(V.movies.find(m=>m.id===b.dataset.id));else show(V.shows.find(s=>s.id===b.dataset.id))})}
 function show(s){$("#vodRows").innerHTML=`<button class="vodback" data-b>‹ All titles</button><h3>${esc(s.t)} <small>${esc(s.src)}</small></h3><div class="eps">${s.eps.map((e,i)=>{const id=s.id+"#"+i,r=get(id);return `<button class="ep" data-i="${i}">${i+1}. ${esc(e.t)} <small>${fmt(e.d)}${r?" · resume "+fmt(r):""}</small></button>`}).join("")}</div>`;
  $("[data-b]").onclick=rows;$("#vodRows").querySelectorAll(".ep").forEach(b=>b.onclick=()=>playEp(s,+b.dataset.i));const f=$("#vodRows .ep");f&&f.focus()}
 function playEp(s,i){const e=s.eps[i];play({...e,id:s.id+"#"+i,t:s.t+" · "+e.t},i+1<s.eps.length?()=>playEp(s,i+1):null)}
 let saveT,cur=null,ytp=null;
 function loadYT(){return new Promise(r=>{if(window.YT&&YT.Player)return r(YT);const p=window.onYouTubeIframeAPIReady;window.onYouTubeIframeAPIReady=()=>{p&&p();r(YT)};if(!d.querySelector('script[src*="iframe_api"]')){const s=d.createElement("script");s.src="https://www.youtube.com/iframe_api";d.head.appendChild(s)}})}
 function play(o,next){if(!o)return;stop();cur=o;window.TV&&(TV.setUserTuned(),TV.stopAudio(),TV.clearFast());const m=d.querySelector("#main");if(m)m.innerHTML="";
  P.classList.add("hidden");PL.classList.remove("hidden");$("#vodTitle").textContent=o.t;const nb=$("#vodNext");nb.classList.toggle("hidden",!next);nb.onclick=next;const st=$("#vodStage"),start=get(o.id);
  if(o.yt){st.innerHTML="<div id=vodYT></div>";loadYT().then(Y=>{ytp=new Y.Player("vodYT",{width:"100%",height:"100%",videoId:o.yt,playerVars:{autoplay:1,start:start|0,playsinline:1,rel:0},events:{onReady:e=>e.target.playVideo(),onStateChange:e=>{if(e.data===0){delete localStorage[K(o.id)];next&&next()}}}});
    saveT=setInterval(()=>{try{put(o.id,ytp.getCurrentTime(),ytp.getDuration())}catch(_){}},5000)})}
  else{st.innerHTML=`<video playsinline autoplay controls preload="auto" src="${esc(o.mp4)}"></video>`;const v=st.querySelector("video");v.addEventListener("loadedmetadata",()=>{if(start)v.currentTime=start},{once:true});
    v.addEventListener("timeupdate",()=>{if(!saveT)saveT=setTimeout(()=>{saveT=null;put(o.id,v.currentTime,v.duration)},4000)});v.addEventListener("ended",()=>{delete localStorage[K(o.id)];next&&next()});v.play().catch(()=>{})}
  window.tvFullToggle&&!d.fullscreenElement&&!d.webkitFullscreenElement&&window.tvFullToggle()}
 function stop(){if(cur){const v=$("#vodStage video");if(v)put(cur.id,v.currentTime,v.duration);else try{ytp&&put(cur.id,ytp.getCurrentTime(),ytp.getDuration())}catch(_){}}
  clearInterval(saveT);clearTimeout(saveT);saveT=null;try{ytp&&ytp.destroy()}catch(_){}ytp=null;$("#vodStage").innerHTML="";cur=null}
 $("#vodClose").onclick=()=>{stop();PL.classList.add("hidden");open()};
 P.querySelector("[data-x]").onclick=()=>P.classList.add("hidden");
 function open(){rows();P.classList.remove("hidden");const f=P.querySelector(".vc");f&&f.focus()}
 window.VODUI={toggle(){if(!PL.classList.contains("hidden")){stop();PL.classList.add("hidden");return}P.classList.contains("hidden")?open():P.classList.add("hidden")},
  back(){if(!PL.classList.contains("hidden")){stop();PL.classList.add("hidden");open();return true}if(!P.classList.contains("hidden")){P.classList.add("hidden");return true}return false},isOpen:()=>!P.classList.contains("hidden")||!PL.classList.contains("hidden")};
 addEventListener("pagehide",stop);
})();
