/* D-pad / TV remote navigation (Fire TV, Android TV, keyboards) · v20261024f */
(function(){
 const d=document,SEL='button:not([disabled]),a[href],[tabindex="0"],.vc,.ep';
 const vis=e=>{if(!e.offsetParent&&getComputedStyle(e).position!=="fixed")return false;const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>-2&&r.top<innerHeight+400};
 function scope(){const pl=d.querySelector("#vodPlayer:not(.hidden)");if(pl)return pl;const p=d.querySelector("#vodPanel:not(.hidden)");if(p)return p;
  for(const id of["guide","events"]){const e=d.getElementById(id);if(e&&!e.classList.contains("hidden"))return e}return d}
 function cands(){return[...scope().querySelectorAll(SEL)].filter(vis)}
 function move(dir){const L=cands();if(!L.length)return;let cur=d.activeElement;if(!cur||!L.includes(cur)){focus(L[0]);return}
  const a=cur.getBoundingClientRect(),ax=a.left+a.width/2,ay=a.top+a.height/2;let best=null,bs=1e9;
  for(const e of L){if(e===cur)continue;const b=e.getBoundingClientRect(),bx=b.left+b.width/2,by=b.top+b.height/2,dx=bx-ax,dy=by-ay;
   const ok=dir==="right"?dx>4:dir==="left"?dx<-4:dir==="down"?dy>4:dy<-4;if(!ok)continue;
   const main=dir==="left"||dir==="right"?Math.abs(dx):Math.abs(dy),off=dir==="left"||dir==="right"?Math.abs(dy):Math.abs(dx);const s=main+off*2.5;if(s<bs){bs=s;best=e}}
  if(best)focus(best)}
 function focus(e){d.body.classList.add("tvnav");e.focus({preventScroll:true});e.scrollIntoView({block:"nearest",inline:"nearest",behavior:"smooth"})}
 window.tvBack=function(){if(window.VODUI&&VODUI.back())return true;for(const id of["guide","events","info"]){const e=d.getElementById(id);if(e&&!e.classList.contains("hidden")){e.classList.add("hidden");return true}}
  if(d.fullscreenElement){d.exitFullscreen().catch(()=>{});return true}return false};
 const press=k=>{const b=d.querySelector(`[data-k="${k}"]`);b&&b.click()};
 addEventListener("keydown",e=>{const k=e.key,c=e.keyCode;
  const dir={ArrowUp:"up",ArrowDown:"down",ArrowLeft:"left",ArrowRight:"right"}[k];
  if(dir){e.preventDefault();e.stopImmediatePropagation();move(dir);return}
  if(k==="Enter"||c===23||c===66){const a=d.activeElement;if(a&&a!==d.body&&a.matches(SEL)){e.preventDefault();e.stopImmediatePropagation();a.click()}return}
  if(k==="Escape"||k==="Backspace"||k==="GoBack"||k==="BrowserBack"||c===4){e.preventDefault();e.stopImmediatePropagation();tvBack();return}
  if(k==="MediaPlayPause"||k==="MediaPlay"||k==="MediaPause"||c===85||c===126||c===127||c===179){e.preventDefault();const v=d.querySelector("#vodStage video,#main video");if(v){v.paused?v.play():v.pause()}else press("mute");return}
  if(k==="ChannelUp"||k==="MediaTrackNext"||c===166||c===87){e.preventDefault();e.stopImmediatePropagation();press("chup");return}
  if(k==="ChannelDown"||k==="MediaTrackPrevious"||c===167||c===88){e.preventDefault();e.stopImmediatePropagation();press("chdn");return}
  if(k==="MediaFastForward"||c===90){const v=d.querySelector("#vodStage video");if(v)v.currentTime+=30;return}
  if(k==="MediaRewind"||c===89){const v=d.querySelector("#vodStage video");if(v)v.currentTime-=10;return}
  if(k==="ContextMenu"||c===82){e.preventDefault();press("guide")}
 },true);
 // first remote key also counts as the "first tap" (unmute) where allowed
 if(/AFT|Android TV|AndroidTV|BRAVIA|GoogleTV|TVWall-FireTV/i.test(navigator.userAgent))d.documentElement.classList.add("tv10ft");
 addEventListener("load",()=>{if(d.documentElement.classList.contains("tv10ft")){const b=d.querySelector('[data-k="guide"]');b&&focus(b)}});
})();
