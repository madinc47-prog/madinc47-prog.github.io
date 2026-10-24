/* Full screen for Galaxy Tab (Android Chrome) · v20261024e */
(function(){
 const d=document,de=d.documentElement,K="tvAutoFS";
 const isFS=()=>!!(d.fullscreenElement||d.webkitFullscreenElement);
 const lock=()=>{try{const p=screen.orientation&&screen.orientation.lock&&screen.orientation.lock("landscape");if(p&&p.catch)p.catch(()=>{})}catch(e){}};
 function enter(){try{const r=de.requestFullscreen?de.requestFullscreen({navigationUI:"hide"}):de.webkitRequestFullscreen&&de.webkitRequestFullscreen();if(r&&r.then)r.then(lock).catch(()=>{});else lock()}catch(e){}}
 function exit(){try{const r=d.exitFullscreen?d.exitFullscreen():d.webkitExitFullscreen&&d.webkitExitFullscreen();if(r&&r.catch)r.catch(()=>{})}catch(e){}}
 function toggle(){isFS()?exit():enter()}
 window.tvFullToggle=toggle;
 let auto=localStorage[K]!=="0";
 const bar=d.querySelector(".brandbar");
 const b=d.createElement("button");b.id="fsBtn";b.className="fsbtn";b.type="button";
 const a=d.createElement("button");a.id="fsAuto";a.className="fsauto";a.type="button";
 bar.appendChild(b);bar.appendChild(a);
 const hint=d.createElement("div");hint.id="fsHint";hint.className="fshint hidden";hint.textContent="Tap anywhere for full screen";d.body.appendChild(hint);
 function label(){b.textContent=isFS()?"⛶ Exit full screen":"⛶ Full screen";b.setAttribute("aria-pressed",isFS());a.textContent="Auto full screen: "+(auto?"ON":"OFF")}
 b.addEventListener("click",e=>{e.stopPropagation();toggle()});
 a.addEventListener("click",e=>{e.stopPropagation();auto=!auto;localStorage[K]=auto?"1":"0";label()});
 d.addEventListener("fullscreenchange",label);d.addEventListener("webkitfullscreenchange",label);
 // remap existing remote ⛶ key
 const rk=d.querySelector('[data-k="full"]');if(rk)rk.addEventListener("click",e=>{e.stopImmediatePropagation();toggle()},true);
 if(auto&&!isFS()){
  if(!sessionStorage.fsHintShown){sessionStorage.fsHintShown=1;hint.classList.remove("hidden");setTimeout(()=>hint.classList.add("hidden"),4000)}
  const first=e=>{d.removeEventListener("pointerdown",first,true);hint.classList.add("hidden");if(auto&&!isFS()&&e.target!==b&&e.target!==a)enter()};
  d.addEventListener("pointerdown",first,true);
 }

 // installable app
 const app=matchMedia("(display-mode: fullscreen)").matches||matchMedia("(display-mode: standalone)").matches;
 if(app){lock();hint.classList.add("hidden")}
 const ib=d.createElement("button");ib.id="fsInstall";ib.className="fsbtn fsinst hidden";ib.type="button";ib.textContent="📲 Install as app";bar.appendChild(ib);
 let dp=null;addEventListener("beforeinstallprompt",e=>{e.preventDefault();dp=e;if(!app)ib.classList.remove("hidden")});
 ib.addEventListener("click",async e=>{e.stopPropagation();if(!dp){alert("In Chrome tap ⋮ then 'Add to Home screen' / 'Install app'.");return}dp.prompt();try{await dp.userChoice}catch(_){}dp=null;ib.classList.add("hidden")});
 addEventListener("appinstalled",()=>ib.classList.add("hidden"));
 if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
 label();
})();
