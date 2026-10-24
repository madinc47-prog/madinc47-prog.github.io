(()=>{"use strict";
const $=s=>document.querySelector(s),TZ="America/Dominica";
let CH=[],EV=[],idx=0,on=false,vol=+(localStorage.tvVol||70),muted=false,numBuf="",numT,osdT,volT,wallOn=false,audio=null,guideSel=0;
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:TZ}).format(new Date());
const fmt=d=>new Date(d+"T12:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function nextFor(n){const t=today();const e=EV.filter(e=>e.channel===n&&e.end>=t).sort((a,b)=>a.start<b.start?-1:1)[0];return e?`${e.title} — ${fmt(e.start)}${e.time!=="TBA"?" "+e.time:""}`:"TBA"}
function ytSrc(id,m){return `https://www.youtube.com/embed/live_stream?channel=${id}&autoplay=1&playsinline=1${m?"&mute=1":""}`}
function stopAudio(){if(audio){audio.pause();audio.src="";audio=null}}
function slate(c,msg){return `<div class="slate"><div class="box"><h3>${esc(c.num)} · ${esc(c.name)}</h3><p>${esc(msg||"Off air")}</p><p>Next live: ${esc(nextFor(c.num))}</p>${c.site?`<a href="${esc(c.site)}" target="_blank" rel="noopener">Official page ↗</a>`:""}</div></div>`}
function render(el,src,c,small){
  if(src.type==="youtube"){el.innerHTML=`<iframe allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen src="${ytSrc(src.channelId,small)}"></iframe>${small?"":`<div class="ytnote">If YouTube shows “unavailable”, ${esc(c.name)} is off air · next live: ${esc(nextFor(c.num))}</div>`}`;return}
  if(src.type==="facebook"){el.innerHTML=`<iframe allow="autoplay; encrypted-media" allowfullscreen src="https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(src.url)}&show_text=false&autoplay=1"></iframe>`;return}
  if(src.type==="hls"){el.innerHTML=`<video playsinline autoplay controls></video>`;const v=el.querySelector("video");v.volume=vol/100;v.muted=muted||small;
    const fail=()=>c.fallback&&src!==c.fallback?render(el,c.fallback,c,small):el.innerHTML=slate(c,"Stream not reachable right now");
    if(v.canPlayType("application/vnd.apple.mpegurl")){v.src=src.url;v.onerror=fail}else loadHls().then(H=>{const h=new H();h.loadSource(src.url);h.attachMedia(v);h.on(H.Events.ERROR,(e,d)=>d.fatal&&fail())}).catch(fail);return}
  if(src.type==="radio"){if(small){el.innerHTML=slate(c,"Radio — open full screen to listen");return}
    el.innerHTML=`<div class="slate radio"><div class="box"><h3>📻 ${esc(c.num)} · ${esc(c.name)}</h3><div class="eq">${"<i></i>".repeat(12)}</div><p>Now: ${esc(c.now||"Live radio")}</p><p id="rstat">Tuning…</p></div></div>`;
    stopAudio();audio=new Audio();audio.volume=vol/100;audio.muted=muted;const a=audio;let ok=false;
    const fail=()=>{if(a!==audio||ok)return;stopAudio();if(c.fallback&&src!==c.fallback)render(el,c.fallback,c,small);else el.innerHTML=slate(c,"Radio stream not reachable right now")};
    a.onerror=fail;a.onplaying=()=>{ok=true;const s=$("#rstat");if(s)s.textContent="● LIVE"};setTimeout(()=>{if(!ok&&a===audio&&a.readyState<2)fail()},12000);
    a.src=src.url;a.play().catch(e=>{if(e.name==="NotAllowedError"){const s=$("#rstat");if(s)s.innerHTML='<button id="tap">▶ Tap to listen</button>';$("#tap").onclick=()=>a.play()}else fail()});return}
  el.innerHTML=slate(c,c.now||"No free web stream");
}
let hlsP;function loadHls(){return hlsP||(hlsP=new Promise((r,j)=>{const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js";s.onload=()=>r(window.Hls);s.onerror=j;document.head.appendChild(s)}))}
function tune(i){if(!CH.length)return;idx=(i+CH.length)%CH.length;localStorage.tvCh=idx;const c=CH[idx];stopAudio();if(wallOn)toggleWall(false);render($("#main"),c,c,false);showOSD();}
function showOSD(){const c=CH[idx];$("#osdNum").textContent=String(c.num).padStart(2,"0");$("#osdName").textContent=c.name;$("#osd").classList.remove("hidden");clearTimeout(osdT);osdT=setTimeout(()=>$("#osd").classList.add("hidden"),3000)}
function info(){const c=CH[idx],i=$("#info");if(!i.classList.contains("hidden")){i.classList.add("hidden");return}
  i.innerHTML=`<b>${c.num} ${esc(c.name)}</b> <span class="tag">${c.group}</span><br>Now: ${esc(c.now||"Live")}<br>Next: ${esc(nextFor(c.num))}<br>${c.site?`<a href="${esc(c.site)}" target="_blank" rel="noopener">${esc(c.site)}</a>`:""}`;i.classList.remove("hidden");setTimeout(()=>i.classList.add("hidden"),8000)}
function setVol(d){vol=Math.max(0,Math.min(100,vol+d));localStorage.tvVol=vol;muted=false;apply();const b=$("#vol");b.firstChild.style.width=vol+"%";b.classList.remove("hidden");clearTimeout(volT);volT=setTimeout(()=>b.classList.add("hidden"),1500)}
function apply(){if(audio){audio.volume=vol/100;audio.muted=muted}document.querySelectorAll("video").forEach(v=>{v.volume=vol/100;v.muted=muted})}
function panel(id){["guide","events"].forEach(p=>{const e=$("#"+p);e.classList.toggle("hidden",p!==id||!e.classList.contains("hidden"))});if(id==="guide"&&!$("#guide").classList.contains("hidden")){guideSel=idx;drawGuide()}}
function drawGuide(){$("#epg").innerHTML=`<div class="h">Channel</div><div class="h">Now</div><div class="h nx">Next live</div>`+CH.map((c,i)=>`<div class="row ${i===guideSel?"sel":""}" data-i="${i}" tabindex="0"><b>${c.num}</b> ${esc(c.name)}<br><small>${c.group==="local"?"Local":"Events"} · ${c.type}</small></div><div class="row" data-i="${i}">${esc(c.now||"")}</div><div class="row nx" data-i="${i}">${esc(nextFor(c.num))}</div>`).join("");
  $("#epg").querySelectorAll(".row").forEach(r=>r.onclick=()=>{panel(null);tune(+r.dataset.i)});const s=$("#epg .sel");s&&s.scrollIntoView({block:"nearest"})}
function drawEvents(){const t=today();$("#evlist").innerHTML=EV.slice().sort((a,b)=>a.start<b.start?-1:1).map((e,i)=>`<div class="ev ${e.end<t?"past":""}"><b>${esc(e.title)}</b><span class="tag ${e.free}">free: ${esc(e.free)}</span><br>${fmt(e.start)}${e.end!==e.start?" – "+fmt(e.end):""} · ${esc(e.time)} · ${esc(e.venue)}${e.note?"<br><small>"+esc(e.note)+"</small>":""}<br>${e.channel?`<button data-ch="${e.channel}">▶ CH ${e.channel}</button>`:""}<button data-ics="${EV.indexOf(e)}">+ Calendar</button><a href="${esc(e.source)}" target="_blank" rel="noopener">Source ↗</a></div>`).join("");
  $("#evlist").querySelectorAll("[data-ch]").forEach(b=>b.onclick=()=>{panel(null);tune(CH.findIndex(c=>c.num===+b.dataset.ch))});
  $("#evlist").querySelectorAll("[data-ics]").forEach(b=>b.onclick=()=>ics(EV[+b.dataset.ics]))}
function ics(e){const d=s=>s.replace(/-/g,""),p=e.time.match(/(\d\d):(\d\d)-(\d\d):(\d\d)/);let ds,de;
  if(p){ds=`DTSTART;TZID=America/Dominica:${d(e.start)}T${p[1]}${p[2]}00`;de=`DTEND;TZID=America/Dominica:${d(e.start)}T${p[3]}${p[4]}00`+(e.end!==e.start?`\nRRULE:FREQ=DAILY;UNTIL=${d(e.end)}T235959Z`:"")}
  else{const x=new Date(e.end+"T00:00:00Z");x.setUTCDate(x.getUTCDate()+1);ds=`DTSTART;VALUE=DATE:${d(e.start)}`;de=`DTEND;VALUE=DATE:${x.toISOString().slice(0,10).replace(/-/g,"")}`}
  const body=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//IslandTVWall//EN","BEGIN:VTIMEZONE","TZID:America/Dominica","BEGIN:STANDARD","DTSTART:19700101T000000","TZOFFSETFROM:-0400","TZOFFSETTO:-0400","END:STANDARD","END:VTIMEZONE","BEGIN:VEVENT",`UID:${d(e.start)}-${e.title.replace(/\W/g,"")}@islandtv`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,"").slice(0,15)}Z`,ds,de,`SUMMARY:${e.title}`,`LOCATION:${e.venue}`,`DESCRIPTION:${(e.note||"")} Source: ${e.source}`,"END:VEVENT","END:VCALENDAR"].join("\r\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([body],{type:"text/calendar"}));a.download=e.title.replace(/[^\w]+/g,"-")+".ics";a.click()}
function toggleWall(f){wallOn=f??!wallOn;const w=$("#wall");if(!wallOn){w.innerHTML="";w.classList.add("hidden");return}
  stopAudio();$("#main").innerHTML="";const vids=CH.filter(c=>c.type!=="radio"&&c.type!=="link").slice(0,4);
  w.innerHTML=vids.map(()=>"<div></div>").join("");w.querySelectorAll("div").forEach((d,i)=>{render(d,vids[i],vids[i],true);d.insertAdjacentHTML("beforeend",`<span class="lbl">${vids[i].num} ${esc(vids[i].name)}</span>`)});w.classList.remove("hidden")}
function power(){on=!on;const t=$("#tv");if(on){t.classList.remove("off");t.classList.add("on-anim");setTimeout(()=>t.classList.remove("on-anim"),1000);tune(idx)}else{stopAudio();$("#main").innerHTML="";toggleWall(false);t.classList.add("off")}}
function full(){const d=document;if(d.fullscreenElement)d.exitFullscreen();else window.tvFullToggle&&window.tvFullToggle()}
function num(n){numBuf+=n;$("#osdNum").textContent=numBuf.padEnd(2,"-");$("#osdName").textContent="";$("#osd").classList.remove("hidden");clearTimeout(numT);numT=setTimeout(()=>{const i=CH.findIndex(c=>c.num===+numBuf);numBuf="";if(i>=0){if(!on)power();tune(i)}else{$("#osdName").textContent="No channel";}},1300)}
function key(k){if(k==="power")return power();if(k==="full")return full();if(!on)power();
  ({chup:()=>tune(idx+1),chdn:()=>tune(idx-1),volup:()=>setVol(10),voldn:()=>setVol(-10),mute:()=>{muted=!muted;apply()},guide:()=>panel("guide"),events:()=>panel("events"),info,wall:()=>toggleWall()}[k]||(()=>{}))()}
document.querySelectorAll("[data-k]").forEach(b=>b.onclick=()=>key(b.dataset.k));document.querySelectorAll("[data-n]").forEach(b=>b.onclick=()=>num(b.dataset.n));
addEventListener("keydown",e=>{const g=!$("#guide").classList.contains("hidden");
  if(g&&(e.key==="ArrowDown"||e.key==="ArrowUp")){guideSel=(guideSel+(e.key==="ArrowDown"?1:-1)+CH.length)%CH.length;drawGuide();e.preventDefault();return}
  if(g&&e.key==="Enter"){panel(null);tune(guideSel);return}
  const m={ArrowUp:"chup",PageUp:"chup",ChannelUp:"chup",ArrowDown:"chdn",PageDown:"chdn",ChannelDown:"chdn",ArrowRight:"volup",ArrowLeft:"voldn",m:"mute",g:"guide",e:"events",i:"info",w:"wall",f:"full",p:"power",Escape:"",Backspace:""};
  if(/^\d$/.test(e.key))return num(e.key);if(e.key==="Escape"||e.key==="Backspace"){panel(null);return}if(m[e.key]){e.preventDefault();key(m[e.key])}});
Promise.all([fetch("channels.json?v=1").then(r=>r.json()),fetch("events.json?v=1").then(r=>r.json())]).then(([c,e])=>{
  CH=c.channels.sort((a,b)=>(a.group===b.group?0:a.group==="local"?-1:1)||a.num-b.num);EV=e.events;idx=Math.min(+(localStorage.tvCh||0),CH.length-1);drawEvents();$("#vol").innerHTML="<i></i>";
}).catch(()=>{$("#main").innerHTML='<div class="slate"><div class="box">Could not load channel list</div></div>'});
})();
