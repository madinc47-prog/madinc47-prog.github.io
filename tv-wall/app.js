(()=>{"use strict";
const $=s=>document.querySelector(s),TZ="America/Dominica";
const CAT={news:"News / Gov",culture:"Culture & Music",faith:"Faith",radio:"Radio & Music"};let liveMap={},prevIdx=null;let autoSkip=false,skips=0,tapPending=false;let CH=[],EV=[],idx=0,on=false,vol=+(localStorage.tvVol||70),muted=false,numBuf="",numT,osdT,volT,wallOn=false,audio=null,guideSel=0;
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:TZ}).format(new Date());
const fmt=d=>new Date(d+"T12:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function nextFor(n){const t=today();const e=EV.filter(e=>e.channel===n&&e.end>=t).sort((a,b)=>a.start<b.start?-1:1)[0];return e?`${e.title} — ${fmt(e.start)}${e.time!=="TBA"?" "+e.time:""}`:"TBA"}
function ytSrc(id,m){return `https://www.youtube.com/embed/live_stream?channel=${id}&autoplay=1&playsinline=1&enablejsapi=1${m?"&mute=1":""}`}
function stopAudio(){if(audio){audio.pause();audio.src="";audio=null}}
function slate(c,msg){return `<div class="slate"><div class="box"><h3>${esc(c.num)} · ${esc(c.name)}</h3><p>${esc(msg||"Off air")}</p><p>Next live: ${esc(nextFor(c.num))}</p>${c.site?`<a href="${esc(c.site)}" target="_blank" rel="noopener">Official page ↗</a>`:""}</div></div>`}
function render(el,src,c,small){
  if(src.type==="youtube"){el.innerHTML=`<iframe allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen src="${ytSrc(src.channelId,small||muted)}"></iframe>${small?"":`<div class="ytnote">If YouTube shows “unavailable”, ${esc(c.name)} is off air · next live: ${esc(nextFor(c.num))}</div>`}`;return}
  if(src.type==="facebook"){el.innerHTML=`<iframe allow="autoplay; encrypted-media" allowfullscreen src="https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(src.url)}&show_text=false&autoplay=1"></iframe>`;return}
  if(src.type==="hls"){el.innerHTML=`<video playsinline autoplay controls></video>`;const v=el.querySelector("video");v.volume=vol/100;v.muted=muted||small;
    const fail=()=>c.fallback&&src!==c.fallback?render(el,c.fallback,c,small):(!small&&autoSkip&&skips<CH.length)?(skips++,tune(nextPlayable(idx+1))):el.innerHTML=slate(c,"Stream not reachable right now");
    if(v.canPlayType("application/vnd.apple.mpegurl")){v.src=src.url;v.onerror=fail}else loadHls().then(H=>{const h=new H();h.loadSource(src.url);h.attachMedia(v);h.on(H.Events.ERROR,(e,d)=>d.fatal&&fail())}).catch(fail);return}
  if(src.type==="radio"){if(small){el.innerHTML=slate(c,"Radio — open full screen to listen");return}
    el.innerHTML=`<div class="slate radio"><div class="box"><h3>📻 ${esc(c.num)} · ${esc(c.name)}</h3><div class="eq">${"<i></i>".repeat(12)}</div><p>Now: ${esc(c.now||"Live radio")}</p><p id="rstat">Tuning…</p></div></div>`;
    stopAudio();audio=new Audio();audio.volume=vol/100;audio.muted=muted;const a=audio;let ok=false;
    const fail=()=>{if(a!==audio||ok)return;stopAudio();if(c.fallback&&src!==c.fallback)render(el,c.fallback,c,small);else if(autoSkip&&skips<CH.length){skips++;tune(nextPlayable(idx+1))}else el.innerHTML=slate(c,"Radio stream not reachable right now")};
    a.onerror=fail;a.onplaying=()=>{ok=true;autoSkip=false;const s=$("#rstat");if(s)s.textContent="● LIVE"};setTimeout(()=>{if(!ok&&a===audio&&a.readyState<2)fail()},12000);
    a.src=src.url;a.play().catch(e=>{if(e.name==="NotAllowedError"){showTap();const s=$("#rstat");if(s)s.innerHTML='<button id="tap">▶ Tap to listen</button>';$("#tap").onclick=()=>a.play()}else fail()});return}
  el.innerHTML=slate(c,c.now||"No free web stream");
}

function nextPlayable(i){for(let k=0;k<CH.length;k++){const j=(i+k)%CH.length;if(CH[j].type==="radio"||CH[j].type==="hls")return j}return i}
function showTap(){const t=$("#tapPlay");if(t)t.classList.remove("hidden")}
function hideTap(){const t=$("#tapPlay");if(t)t.classList.add("hidden")}
function firstTap(){if(!tapPending)return;tapPending=false;hideTap();muted=false;apply();if(audio)audio.play().catch(()=>{});document.querySelectorAll("video").forEach(v=>v.play().catch(()=>{}));ytCmd("unMute");ytCmd("playVideo")}
function ytCmd(f){document.querySelectorAll("#main iframe").forEach(i=>{try{i.contentWindow.postMessage(JSON.stringify({event:"command",func:f,args:[]}),"*")}catch(e){}})}
document.addEventListener("pointerdown",firstTap,true);document.addEventListener("keydown",firstTap,true);
function autoStart(){const sv=CH.findIndex(x=>x.num===+localStorage.tvNum);let i=sv>=0?sv:Math.max(0,CH.findIndex(c=>c.num===782));const t=CH[i]&&CH[i].type;if(t!=="radio"&&t!=="hls")i=nextPlayable(i);idx=i;muted=true;tapPending=true;autoSkip=true;skips=0;showTap();if(!on)power();else tune(idx);startLiveWatch()}

/* ---- free live check via YouTube IFrame API (no keys) ---- */
let ytP,liveT,liveNum=null;
function loadYT(){return ytP||(ytP=new Promise((r,j)=>{if(window.YT&&YT.Player)return r(YT);const prev=window.onYouTubeIframeAPIReady;window.onYouTubeIframeAPIReady=()=>{prev&&prev();r(YT)};const s=document.createElement("script");s.src="https://www.youtube.com/iframe_api";s.onerror=j;document.head.appendChild(s);setTimeout(()=>j("timeout"),15000)}))}
function probe(id){return loadYT().then(Y=>new Promise(res=>{const host=document.createElement("div");host.className="ytprobe";const d=document.createElement("div");host.appendChild(d);document.body.appendChild(host);let done=false,p;
  const fin=v=>{if(done)return;done=true;clearTimeout(t);try{p.destroy()}catch(e){}host.remove();res(v)};const t=setTimeout(()=>fin(false),9000);
  p=new Y.Player(d,{width:200,height:113,videoId:"live_stream",playerVars:{channel:id,autoplay:1,mute:1,playsinline:1,controls:0},
   events:{onReady:e=>{try{e.target.mute();e.target.playVideo()}catch(_){}},onError:()=>fin(false),onStateChange:e=>{if(e.data===1){let live=true;try{const v=e.target.getVideoData();if(v&&v.isLive===false)live=false}catch(_){}fin(live)}else if(e.data===0)fin(false)}}})})).catch(()=>false)}
const LIVE_ORDER=[21,20,1,2,55,56,781];
function ytIdOf(c){return c.type==="youtube"?c.channelId:(c.fallback&&c.fallback.type==="youtube"?c.fallback.channelId:null)}
async function findLive(){const list=LIVE_ORDER.map(n=>CH.find(c=>c.num===n)).filter(c=>c&&ytIdOf(c));const ids=[...new Set(list.map(ytIdOf))];
  const res=await Promise.all(ids.map(probe));const ok={};ids.forEach((id,k)=>ok[id]=res[k]);
  CH.forEach(c=>{if(c.type==="youtube")liveMap[c.num]=!!ok[c.channelId]});if(!$("#guide").classList.contains("hidden"))drawGuide();
  return list.find(c=>ok[ytIdOf(c)])||null}
function badge(c){const b=$("#liveBadge");if(!b)return;if(!c){b.classList.add("hidden");return}b.textContent="🔴 LIVE now: "+c.name;b.classList.remove("hidden")}
function toast(c){const t=$("#liveToast");t.innerHTML=`🔴 ${esc(c.name)} just went live <button>Watch</button>`;t.classList.remove("hidden");t.querySelector("button").onclick=e=>{e.stopPropagation();t.classList.add("hidden");playLive(c)};setTimeout(()=>t.classList.add("hidden"),20000)}
function playLive(c){autoSkip=false;liveNum=c.num;const i=CH.indexOf(c);if(i!==idx)prevIdx=idx;idx=i;localStorage.tvNum=c.num;stopAudio();if(wallOn)toggleWall(false);render($("#main"),{type:"youtube",channelId:ytIdOf(c)},c,false);showOSD();badge(c)}
async function liveCheck(first){if(!on||wallOn)return;const cur=CH[idx];if(cur&&cur.type==="youtube"&&liveNum===cur.num)return;const c=await findLive();
  if(c){if(first)playLive(c);else toast(c)}}
function startLiveWatch(){clearInterval(liveT);liveCheck(true);liveT=setInterval(()=>liveCheck(false),4*60*1000)}
let hlsP;function loadHls(){return hlsP||(hlsP=new Promise((r,j)=>{const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js";s.onload=()=>r(window.Hls);s.onerror=j;document.head.appendChild(s)}))}
function tune(i){if(!CH.length)return;{const n=(i+CH.length)%CH.length;if(n!==idx)prevIdx=idx;idx=n}localStorage.tvNum=CH[idx].num;const c=CH[idx];stopAudio();if(wallOn)toggleWall(false);render($("#main"),c,c,false);showOSD();if(liveNum!==c.num)badge(null);}
function status(c){if(c.type==="radio")return["radio","📻 RADIO"];if(c.type==="link")return["off","OFF AIR"];if(liveMap[c.num]===true||liveNum===c.num)return["live","🔴 LIVE"];if(liveMap[c.num]===false)return["off","OFF AIR"];return["unk","TV"]}
function showOSD(){const c=CH[idx],[k,t]=status(c);$("#osdNum").textContent=c.num;$("#osdName").innerHTML=`<span class="bn">${esc(c.name)}</span><span class="bs ${k}">${t}</span><span class="bc">${esc(CAT[c.cat]||"")}</span><br><small>${esc(c.now||"")}</small>`;$("#osd").classList.remove("hidden");clearTimeout(osdT);osdT=setTimeout(()=>$("#osd").classList.add("hidden"),4000)}
function info(){const c=CH[idx],i=$("#info");if(!i.classList.contains("hidden")){i.classList.add("hidden");return}
  i.innerHTML=`<b>${c.num} ${esc(c.name)}</b> <span class="tag">${esc(CAT[c.cat]||"")}</span><br>Now: ${esc(c.now||"Live")}<br>Next: ${esc(nextFor(c.num))}<br>${c.site?`<a href="${esc(c.site)}" target="_blank" rel="noopener">${esc(c.site)}</a>`:""}`;i.classList.remove("hidden");setTimeout(()=>i.classList.add("hidden"),8000)}
function setVol(d){vol=Math.max(0,Math.min(100,vol+d));localStorage.tvVol=vol;muted=false;apply();const b=$("#vol");b.firstChild.style.width=vol+"%";b.classList.remove("hidden");clearTimeout(volT);volT=setTimeout(()=>b.classList.add("hidden"),1500)}
function apply(){if(audio){audio.volume=vol/100;audio.muted=muted}document.querySelectorAll("video").forEach(v=>{v.volume=vol/100;v.muted=muted})}
function panel(id){["guide","events"].forEach(p=>{const e=$("#"+p);e.classList.toggle("hidden",p!==id||!e.classList.contains("hidden"))});if(id==="guide"&&!$("#guide").classList.contains("hidden")){guideSel=idx;drawGuide()}}
function drawGuide(){const now=new Date(),t0=new Date(now);t0.setMinutes(now.getMinutes()<30?0:30,0,0);const slots=[0,1,2,3].map(k=>new Date(t0.getTime()+k*1800000).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",timeZone:TZ}));
  const rank=c=>status(c)[0]==="live"?0:1;const order=CH.map((c,i)=>i).sort((a,b)=>rank(CH[a])-rank(CH[b])||CH[a].num-CH[b].num);
  let h=`<div class="gh ch">${now.toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",timeZone:TZ})}</div>`+slots.map(x=>`<div class="gh">${x}</div>`).join("");let cat=null;
  order.forEach(i=>{const c=CH[i],[k,t]=status(c);const lc=k==="live"?"live":c.cat;if(lc!==cat){cat=lc;h+=`<div class="gcat">${k==="live"?"🔴 Live now":esc(CAT[c.cat]||"")}</div>`}
   h+=`<div class="gch row ${k} ${i===guideSel?"sel":""}" data-i="${i}" tabindex="0"><b>${c.num}</b> ${esc(c.name)}</div><div class="gprog row ${k}" data-i="${i}"><span class="bs ${k}">${t}</span> ${esc(k==="off"?"Off air · next: "+nextFor(c.num):(c.now||"Live"))}</div>`});
  $("#epg").innerHTML=h;$("#epg").querySelectorAll(".row").forEach(r=>r.onclick=()=>{panel(null);tune(+r.dataset.i)});const s=$("#epg .sel");s&&s.scrollIntoView({block:"nearest"})}
function drawEvents(){const t=today();$("#evlist").innerHTML=EV.slice().sort((a,b)=>a.start<b.start?-1:1).map((e,i)=>`<div class="ev ${e.end<t?"past":""}"><b>${esc(e.title)}</b><span class="tag ${e.free}">free: ${esc(e.free)}</span><br>${fmt(e.start)}${e.end!==e.start?" – "+fmt(e.end):""} · ${esc(e.time)} · ${esc(e.venue)}${e.note?"<br><small>"+esc(e.note)+"</small>":""}<br>${e.channel?`<button data-ch="${e.channel}">▶ CH ${e.channel}</button>`:""}<button data-ics="${EV.indexOf(e)}">+ Calendar</button><a href="${esc(e.source)}" target="_blank" rel="noopener">Source ↗</a></div>`).join("");
  $("#evlist").querySelectorAll("[data-ch]").forEach(b=>b.onclick=()=>{panel(null);tune(CH.findIndex(c=>c.num===+b.dataset.ch))});
  $("#evlist").querySelectorAll("[data-ics]").forEach(b=>b.onclick=()=>ics(EV[+b.dataset.ics]))}
function ics(e){const d=s=>s.replace(/-/g,""),p=e.time.match(/(\d\d):(\d\d)-(\d\d):(\d\d)/);let ds,de;
  if(p){ds=`DTSTART;TZID=America/Dominica:${d(e.start)}T${p[1]}${p[2]}00`;de=`DTEND;TZID=America/Dominica:${d(e.start)}T${p[3]}${p[4]}00`+(e.end!==e.start?`\nRRULE:FREQ=DAILY;UNTIL=${d(e.end)}T235959Z`:"")}
  else{const x=new Date(e.end+"T00:00:00Z");x.setUTCDate(x.getUTCDate()+1);ds=`DTSTART;VALUE=DATE:${d(e.start)}`;de=`DTEND;VALUE=DATE:${x.toISOString().slice(0,10).replace(/-/g,"")}`}
  const body=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//IslandTVWall//EN","BEGIN:VTIMEZONE","TZID:America/Dominica","BEGIN:STANDARD","DTSTART:19700101T000000","TZOFFSETFROM:-0400","TZOFFSETTO:-0400","END:STANDARD","END:VTIMEZONE","BEGIN:VEVENT",`UID:${d(e.start)}-${e.title.replace(/\W/g,"")}@islandtv`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,"").slice(0,15)}Z`,ds,de,`SUMMARY:${e.title}`,`LOCATION:${e.venue}`,`DESCRIPTION:${(e.note||"")} Source: ${e.source}`,"END:VEVENT","END:VCALENDAR"].join("\r\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([body],{type:"text/calendar"}));a.download=e.title.replace(/[^\w]+/g,"-")+".ics";a.click()}
function toggleWall(f){wallOn=f??!wallOn;const w=$("#wall");if(!wallOn){w.innerHTML="";w.classList.add("hidden");return}
  stopAudio();$("#main").innerHTML="";const vids=CH.filter(c=>c.type!=="radio"&&c.type!=="link").sort((a,b)=>(status(b)[0]==="live")-(status(a)[0]==="live")).slice(0,4);
  w.innerHTML=vids.map(()=>"<div></div>").join("");w.querySelectorAll("div").forEach((d,i)=>{render(d,vids[i],vids[i],true);d.insertAdjacentHTML("beforeend",`<span class="lbl">${vids[i].num} ${esc(vids[i].name)}</span>`)});w.classList.remove("hidden")}
function power(){on=!on;const t=$("#tv");if(on){t.classList.remove("off");t.classList.add("on-anim");setTimeout(()=>t.classList.remove("on-anim"),1000);tune(idx)}else{stopAudio();$("#main").innerHTML="";toggleWall(false);t.classList.add("off")}}
function full(){const d=document;if(d.fullscreenElement)d.exitFullscreen();else window.tvFullToggle&&window.tvFullToggle()}
function num(n){numBuf+=n;$("#osdNum").textContent=numBuf.padEnd(2,"-");$("#osdName").textContent="";$("#osd").classList.remove("hidden");clearTimeout(numT);numT=setTimeout(()=>{const i=CH.findIndex(c=>c.num===+numBuf);numBuf="";if(i>=0){if(!on)power();tune(i)}else{$("#osdName").textContent="No channel";}},1300)}
function key(k){if(k==="last"){if(prevIdx!=null&&CH[prevIdx])tune(prevIdx);return}if(k==="power")return power();if(k==="full")return full();if(!on)power();
  ({chup:()=>tune(idx+1),chdn:()=>tune(idx-1),volup:()=>setVol(10),voldn:()=>setVol(-10),mute:()=>{muted=!muted;apply()},guide:()=>panel("guide"),events:()=>panel("events"),info,wall:()=>toggleWall()}[k]||(()=>{}))()}
document.querySelectorAll("[data-k]").forEach(b=>b.onclick=()=>key(b.dataset.k));document.querySelectorAll("[data-n]").forEach(b=>b.onclick=()=>num(b.dataset.n));
addEventListener("keydown",e=>{const g=!$("#guide").classList.contains("hidden");
  if(g&&(e.key==="ArrowDown"||e.key==="ArrowUp")){guideSel=(guideSel+(e.key==="ArrowDown"?1:-1)+CH.length)%CH.length;drawGuide();e.preventDefault();return}
  if(g&&e.key==="Enter"){panel(null);tune(guideSel);return}
  const m={ArrowUp:"chup",PageUp:"chup",ChannelUp:"chup",ArrowDown:"chdn",PageDown:"chdn",ChannelDown:"chdn",ArrowRight:"volup",ArrowLeft:"voldn",m:"mute",g:"guide",e:"events",i:"info",w:"wall",l:"last",f:"full",p:"power",Escape:"",Backspace:""};
  if(/^\d$/.test(e.key))return num(e.key);if(e.key==="Escape"||e.key==="Backspace"){panel(null);return}if(m[e.key]){e.preventDefault();key(m[e.key])}});
Promise.all([fetch("channels.json?v=1").then(r=>r.json()),fetch("events.json?v=1").then(r=>r.json())]).then(([c,e])=>{
  CH=c.channels.sort((a,b)=>a.num-b.num);EV=e.events;idx=Math.max(0,CH.findIndex(x=>x.num===+localStorage.tvNum));drawEvents();$("#vol").innerHTML="<i></i>";autoStart();
}).catch(()=>{$("#main").innerHTML='<div class="slate"><div class="box">Could not load channel list</div></div>'});
})();
