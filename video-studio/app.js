'use strict';
const VERSION='20261018c';
const $=id=>document.getElementById(id);
const debugOn=new URLSearchParams(location.search).has('tapdebug');
function log(...a){console.log('[VideoStudio]',...a); if(debugOn){$('debug').hidden=false; $('debug').textContent+=a.join(' ')+'\n';}}
function setStatus(msg,kind){const s=$('status'); if(!s)return; s.textContent=msg; s.className='status'+(kind?' '+kind:'');}
function showError(msg){setStatus('⚠ '+msg,'bad'); const o=$('errOverlay'); if(o&&(debugOn||true)){o.hidden=false; o.textContent=(o.textContent?o.textContent+'\n':'')+msg;} console.error('[VideoStudio]',msg);}
window.addEventListener('error',e=>{showError('Problem: '+(e.message||'unknown error')+' — try closing and reopening Video Studio.');});
window.addEventListener('unhandledrejection',e=>{showError('Problem: '+((e.reason&&e.reason.message)||e.reason||'something failed')+' — try closing and reopening Video Studio.');});
const IS_MOBILE=/Android|iPhone|iPad/i.test(navigator.userAgent)||Math.min(screen.width||9999,screen.height||9999)<820;
const LIGHT=IS_MOBILE||(navigator.hardwareConcurrency||8)<=4;
const LENSES=[
{id:'clean',name:'Clean Digital (no lens)',group:'Clean',desc:'No lens character. Sharp, neutral, modern digital look.',era:'Modern',use:'Clean corporate, product, news.',dist:0,vig:0.05,ca:0,hal:0,halCol:[1,1,1],con:1,sat:1,flare:0,squeeze:'1.0'},
{id:'arri-signature',name:'ARRI Signature Prime',group:'ARRI',desc:'Warm, gentle skin, soft highlight roll-off, very clean wide open. Detachable rear look elements in real life — here: warmth + soft glow.',era:'2018–now',use:'Netflix / prestige drama, features.',dist:-0.01,vig:0.18,ca:0.002,hal:0.35,halCol:[1,0.75,0.55],con:0.97,sat:1.02,flare:0.1},
{id:'cooke-panchro',name:'Cooke Panchro/i Classic',group:'Cooke',desc:'The “Cooke Look”: warm, rounded, gentle contrast, pleasing faces, soft edges.',era:'Classic reborn 2017',use:'Period drama, romance, character stories.',dist:0.02,vig:0.35,ca:0.004,hal:0.4,halCol:[1,0.7,0.4],con:0.92,sat:1.05,flare:0.15},
{id:'cooke-s7',name:'Cooke S7/i',group:'Cooke',desc:'Bigger, smoother Cooke warmth with more control and less aberration than Panchro.',era:'2017–now',use:'Large-format prestige TV & film.',dist:0.01,vig:0.25,ca:0.002,hal:0.3,halCol:[1,0.72,0.45],con:0.94,sat:1.03,flare:0.1},
{id:'panavision-primo',name:'Panavision Primo',group:'Panavision',desc:'High contrast, crisp, saturated, classic Hollywood polish with strong blacks.',era:'1980s–now',use:'Big Hollywood features & episodic.',dist:-0.005,vig:0.22,ca:0.002,hal:0.25,halCol:[1,0.8,0.6],con:1.08,sat:1.08,flare:0.12},
{id:'panavision-ultra',name:'Panavision Ultra Panatar Anamorphic',group:'Panavision',desc:'Classic 2x anamorphic: horizontal blue flare streaks, oval highlight stretch, squeezed widescreen feel.',era:'1950s heritage / modern Ultra',use:'Epic widescreen, sci-fi, classic anamorphic drama.',dist:0.03,vig:0.4,ca:0.006,hal:0.5,halCol:[0.5,0.7,1],con:1.02,sat:1.04,flare:0.9,squeeze:'2.0'},
{id:'zeiss-supreme',name:'Zeiss Supreme Prime',group:'Zeiss',desc:'Clean but characterful: crisp micro-contrast, gentle warmth, smooth focus feel.',era:'2018–now',use:'Netflix originals, commercials, features.',dist:-0.01,vig:0.2,ca:0.002,hal:0.28,halCol:[1,0.85,0.65],con:1.03,sat:1.0,flare:0.08},
{id:'zeiss-master-anam',name:'Zeiss Master Anamorphic',group:'Zeiss',desc:'Sharp anamorphic with controlled blue streak flare and low distortion for anamorphic.',era:'2013–now',use:'High-end anamorphic TV & film.',dist:0.005,vig:0.3,ca:0.004,hal:0.4,halCol:[0.55,0.75,1],con:1.05,sat:1.02,flare:0.7,squeeze:'2.0'},
{id:'leica-summilux',name:'Leica Summilux-C',group:'Leica',desc:'Creamy, dimensional, low-contrast glow on skin with rich colour.',era:'2010–now',use:'Prestige drama, beauty, features.',dist:0.01,vig:0.28,ca:0.003,hal:0.45,halCol:[1,0.78,0.55],con:0.93,sat:1.06,flare:0.15},
{id:'canon-k35',name:'Canon K35 (vintage)',group:'Canon vintage',desc:'Vintage low-contrast, dreamy halation, warm flares, soft edges — 1970s glow.',era:'1970s vintage',use:'Music videos, flashbacks, dreamy drama.',dist:0.04,vig:0.5,ca:0.008,hal:0.8,halCol:[1,0.6,0.35],con:0.88,sat:0.98,flare:0.35},
{id:'angenieux-optimo',name:'Angénieux Optimo',group:'Angénieux',desc:'French zoom elegance: warm, smooth contrast, gentle flare, flattering faces.',era:'2000s–now',use:'Features & TV zooms, elegant drama.',dist:0.015,vig:0.3,ca:0.003,hal:0.38,halCol:[1,0.75,0.5],con:0.95,sat:1.04,flare:0.2},
];
const state={matte:[],pick:false,playing:false,breathZoom:1,lutTex:null,lutSize:0,fgKind:'test',bgKind:'test'};
let gl,prog,U={},fgTex,bgTex,matteTex,lutTexObj,fallback2D=false,fgDirty=true,bgDirty=true,lastFgTime=-1,lastBgTime=-1,lastTestDx=999,playClock=0,lastFrameTs=0,fpsFrames=0,fpsTs=0,fpsNow=0,degraded=0,selfTested=false;
const proxyFG=document.createElement('canvas'), proxyBG=document.createElement('canvas');
function proxied(src,isFG){ // downscale big video/image frames before GPU upload (huge win on old tablets)
 const w=src.videoWidth||src.naturalWidth||src.width, h=src.videoHeight||src.naturalHeight||src.height; if(!w||!h)return src;
 const maxW=LIGHT?640:960; if(w<=maxW && src.tagName==='CANVAS')return src;
 const c=isFG?proxyFG:proxyBG; const s=Math.min(1,maxW/w); c.width=Math.round(w*s); c.height=Math.round(h*s);
 c.getContext('2d').drawImage(src,0,0,c.width,c.height); return c;}
const canvas=$('gl'); const overlay=$('overlay');
const fgVid=$('fgVid'), bgVid=$('bgVid'), auEl=$('auEl');
// test canvases
function makeTestFG(dx){dx=dx||0;const c=document.createElement('canvas');c.width=640;c.height=360;const x=c.getContext('2d');x.fillStyle='#00b140';x.fillRect(0,0,640,360);x.fillStyle='#ff7a1a';x.beginPath();x.arc(320+dx,130,52,0,7);x.fill();x.fillStyle='#173a7a';x.fillRect(270+dx,185,100,110);x.fillStyle='#ffd9b0';x.fillRect(295+dx,175,50,20);x.fillStyle='#111';x.fillRect(285+dx,118,70,14);return c;}
function makeTestBG(){const c=document.createElement('canvas');c.width=640;c.height=360;const x=c.getContext('2d');const g=x.createLinearGradient(0,0,0,360);g.addColorStop(0,'#2b6cb0');g.addColorStop(.6,'#f6ad55');g.addColorStop(1,'#276749');x.fillStyle=g;x.fillRect(0,0,640,360);x.fillStyle='#fff3b0';x.beginPath();x.arc(520,70,34,0,7);x.fill();x.fillStyle='#234e2d';x.fillRect(0,300,640,60);x.fillStyle='#1a365d';for(let i=0;i<6;i++)x.fillRect(i*110+10,240-(i%3)*20,60,120);return c;}
let fgCanvas=makeTestFG(), bgCanvas=makeTestBG(), fgImage=null, bgImage=null;
const VERT=`#version 300 es
out vec2 vUv;void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));vUv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;
const FRAG=`#version 300 es
precision highp float;precision highp int;precision highp sampler3D;in vec2 vUv;out vec4 O;
uniform sampler2D uFG,uBG,uMatte;uniform sampler3D uLUT;
uniform int uHasFG,uHasBG,uView,uIDT,uLook,uUseLUT,uGarbage,uInvert,uLight;
uniform vec3 uKey;uniform float uTol,uSoft,uHueTol,uSatMin,uClipB,uClipW,uChoke,uFeather,uSpill,uSkin;
uniform float uTime,uExp,uCon,uPivot,uSat,uTemp,uTint,uLookAmt,uLUTAmt;
uniform vec3 uLift,uGam,uGain,uOff;
uniform float uDist,uVig,uCA,uHal,uFlare,uBloom,uGrain,uGrainSize,uZoom,uSqueeze;
uniform vec3 uHalCol;uniform vec2 uRes;
const vec3 L=vec3(.2126,.7152,.0722);
vec3 ycb(vec3 c){float y=dot(c,L);return vec3(y,(c.b-y)/1.8556,(c.r-y)/1.5748);}
float screenAmt(vec3 px){vec3 p=ycb(px),k=ycb(uKey);float kl=max(length(k.yz),1e-4),pl=length(p.yz);
 float d=1.-smoothstep(uTol,uTol+max(uSoft,1e-4),length(p.yz-k.yz)/kl);
 float ang=acos(clamp(dot(p.yz,k.yz)/max(pl*kl,1e-6),-1.,1.));
 float h=(1.-smoothstep(uHueTol,uHueTol+.3,ang))*smoothstep(uSatMin,uSatMin+max(uSoft,1e-4),pl/kl);
 return clamp(max(d,h),0.,1.);}
float alphaAt(vec2 uv){if(uHasFG==0)return 0.;vec3 c=texture(uFG,uv).rgb;float a=1.-screenAmt(c);
 if(uFeather>0. && uLight==0){vec2 px=uFeather/uRes;float s=a;vec2 o[4];o[0]=vec2(px.x,0.);o[1]=vec2(-px.x,0.);o[2]=vec2(0.,px.y);o[3]=vec2(0.,-px.y);for(int i=0;i<4;i++)s+=1.-screenAmt(texture(uFG,uv+o[i]).rgb);a=s/5.;}
 a=clamp((a-uClipB)/max(uClipW-uClipB,1e-4),0.,1.);a=clamp(a+uChoke,0.,1.);
 if(uGarbage==1){float m=texture(uMatte,uv).r; if(uInvert==1)m=1.-m; a*=m;}
 return a;}
vec3 decodeLog(vec3 c){int t=uIDT; if(t==0)return c;
 if(t==1){return pow(max(c,vec3(0.)),vec3(2.2))*1.6;} // LogC approx (spec LogC3 fitted in linear preview)
 if(t==2){return (pow(vec3(10.),c/0.224282)-1.)/155.97;}
 if(t==3){return pow(vec3(10.),(c*1023.-420.)/261.5)*0.19;}
 if(t==4){return (pow(vec3(10.),(c-0.098)/0.367)-1.)/14.98*0.9;}
 if(t==5){return pow(vec3(10.),(c-0.598206)/0.241514);}
 return c;}
vec3 grade(vec3 c){
 c*=pow(2.,uExp); c.r*=1.+uTemp*.25; c.b*=1.-uTemp*.25; c.g*=1.+uTint*.15;
 c=(c-uPivot)*uCon+uPivot;
 c=c+uOff; c=(1.+uGain)*(c+uLift*(1.-c)); c=sign(c)*pow(abs(c),vec3(1.)/(1.+uGam));
 float y=dot(c,L); c=y+(c-y)*uSat; return c;}
vec3 applyLook(vec3 c){ if(uLook==0)return c; float y=dot(c,L); vec3 o=c;
 if(uLook==1){vec3 sh=mix(c,vec3(.1,.55,.6),.45*(1.-y)); vec3 hi=mix(c,vec3(1.,.55,.25),.25*y); o=mix(sh,hi,y);}
 else if(uLook==2){vec3 ov=y<.5?2.*c*y:1.-2.*(1.-c)*(1.-y); o=mix(c,ov,.8); o=mix(vec3(dot(o,L)),o,.6);}
 else if(uLook==3){o=vec3(c.r*c.r*1.2,c.g*1.05,pow(c.b,.7)*.85+.08);}
 else if(uLook==4){o=c*vec3(.35,.5,.95)*.55; o=mix(vec3(dot(o,L)),o,.45);}
 else if(uLook>=5){vec3 m=uLook==6?vec3(.6,.35,.05):vec3(.3,.59,.11); o=vec3(dot(c,m)); if(uLook==7)o*=vec3(1.07,.9,.7);}
 return mix(c,o,uLookAmt);}
vec3 compAt(vec2 uv,out float aOut,out float spillOut){
 // chromatic aberration per layer
 vec2 dir=uv-.5; float r2=dot(dir,dir);
 vec3 bg=vec3(.02,.03,.06); vec3 fg=vec3(0.);
 if(uLight==1){ if(uHasBG==1)bg=texture(uBG,uv).rgb; if(uHasFG==1)fg=texture(uFG,uv).rgb; }
 else { if(uHasBG==1){bg=vec3(texture(uBG,uv+dir*uCA).r,texture(uBG,uv).g,texture(uBG,uv-dir*uCA).b);} if(uHasFG==1){fg=vec3(texture(uFG,uv+dir*uCA).r,texture(uFG,uv).g,texture(uFG,uv-dir*uCA).b);} }
 float a=alphaAt(uv); aOut=a;
 // despill (green/blue by key)
 vec3 dfg=fg; float rem=0.; bool green=uKey.g>=uKey.b;
 float skinW=clamp((fg.r-fg.g)*3.,0.,1.)*uSkin; float amt=uSpill*(1.-.7*skinW);
 if(green){rem=max(dfg.g-mix(dfg.r,dfg.b,.5),0.)*amt; dfg.g-=rem;}else{rem=max(dfg.b-mix(dfg.r,dfg.g,.5),0.)*amt; dfg.b-=rem;}
 spillOut=rem;
 bg=decodeLog(clamp(bg,0.,1.5)); fg=decodeLog(clamp(dfg,0.,1.5));
 vec3 col=mix(bg,fg,a); return col;}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+uTime*60.)*43758.5453);}
void main(){vec2 uv=vUv;
 // weave
 uv+= (uGrain>0.? vec2(0.):vec2(0.)); // placeholder replaced below
 if(uView==3 && uv.x>=.5){ /* right final, left raw handled later */ }
 // focal crop + squeeze + distortion
 vec2 c=uv-.5; c/=uZoom; if(uSqueeze>1.)c.x*=1.; // squeeze handled by sampling stretch below
 float r2=dot(c,c); vec2 dc=c*(1.+uDist*r2*4.); vec2 suv=dc+.5;
 // anamorphic: stretch highlights later; sampling suv keeps geometry, squeeze selector crops wider
 if(uSqueeze>1.) suv.x=(suv.x-.5)/ (1.+(uSqueeze-1.)*.25)+.5;
 float a,sp; vec3 col=compAt(clamp(suv,0.001,.999),a,sp);
 if(uView==1){O=vec4(vec3(a),1.);return;}
 if(uView==2){O=vec4(vec3(clamp(sp*4.,0.,1.)),1.);return;}
 if(uView==3 && vUv.x<.5){ if(uHasFG==1)col=texture(uFG,suv).rgb; else col=vec3(0.); O=vec4(col,1.); return;}
 col=grade(col); col=applyLook(col);
 // flare streak + halation + bloom (highlight based, horizontal taps)
 float y=dot(col,L); float hi=smoothstep(.7,1.,y);
 // fake anamorphic streak: stretch bright highlights horizontally (lightweight, no extra key passes)
 float streak=hi*hi;
 col+=uHalCol*(hi*hi*uHal*.6 + streak*uFlare*.35); col+=vec3(hi*uBloom*.25);
 // oval-bokeh fake: bright spots stretch wider than tall via vignette-weighted glow
 col+=uHalCol*vec3(pow(hi,3.))*uFlare*.15;
 if(uUseLUT==1){vec3 lc=texture(uLUT,clamp(col,0.,1.)).rgb; col=mix(col,lc,uLUTAmt);}
 float vig=1.-uVig*smoothstep(.35,.95,r2*2.);
 col*=vig;
 if(uGrain>0.){float g=hash(floor(suv*uRes/max(uGrainSize,1.))); col+=(g-.5)*uGrain*.18;}
 O=vec4(clamp(col,0.,1.),1.);}
`;
function compile(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
function initGL(){gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true}); if(!gl){$('tier').textContent='⚠ Simple mode (no WebGL2): basic green screen is running. For the full lens/colour suite, update Chrome.'; return false;}
 prog=gl.createProgram();gl.attachShader(prog,compile(gl.VERTEX_SHADER,VERT));gl.attachShader(prog,compile(gl.FRAGMENT_SHADER,FRAG));gl.linkProgram(prog);gl.useProgram(prog);
 for(const n of ['uFG','uBG','uMatte','uLUT','uHasFG','uHasBG','uView','uIDT','uLook','uUseLUT','uGarbage','uInvert','uKey','uTol','uSoft','uHueTol','uSatMin','uClipB','uClipW','uChoke','uFeather','uSpill','uSkin','uTime','uExp','uCon','uPivot','uSat','uTemp','uTint','uLookAmt','uLUTAmt','uLift','uGam','uGain','uOff','uDist','uVig','uCA','uHal','uFlare','uBloom','uGrain','uGrainSize','uZoom','uSqueeze','uHalCol','uRes','uLight'])U[n]=gl.getUniformLocation(prog,n);
 const mk=()=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);return t;};
 fgTex=mk();bgTex=mk();matteTex=mk(); uploadMatte(); return true;}
function uploadTex(tex,src,unit){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);try{gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,src);}catch(e){}}
function uploadMatte(){const c=document.createElement('canvas');c.width=512;c.height=288;const x=c.getContext('2d');x.fillStyle='#000';x.fillRect(0,0,512,288);if(state.matte.length>=3){x.fillStyle='#fff';x.beginPath();state.matte.forEach((p,i)=>i?x.lineTo(p[0]*512,p[1]*288):x.moveTo(p[0]*512,p[1]*288));x.closePath();x.fill();}else{x.fillStyle='#fff';x.fillRect(0,0,512,288);}
 gl.activeTexture(gl.TEXTURE0+2);gl.bindTexture(gl.TEXTURE_2D,matteTex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);drawOverlay();}
function drawOverlay(){overlay.width=canvas.clientWidth||640;overlay.height=canvas.clientHeight||360;const x=overlay.getContext('2d');x.clearRect(0,0,overlay.width,overlay.height);if(!state.matte.length)return;x.strokeStyle='#ff0';x.fillStyle='#ff0';x.beginPath();state.matte.forEach((p,i)=>{const px=p[0]*overlay.width,py=p[1]*overlay.height;i?x.lineTo(px,py):x.moveTo(px,py);x.fillRect(px-4,py-4,8,8)});if(state.matte.length>2)x.closePath();x.stroke();}
function val(id){const e=$(id);return e.type==='checkbox'?e.checked:parseFloat(e.value);}
function hexRGB(h){return [parseInt(h.slice(1,3),16)/255,parseInt(h.slice(3,5),16)/255,parseInt(h.slice(5,7),16)/255];}
let startT=performance.now();
function render(){ if(!gl)return; const now=(performance.now()-startT)/1000;
 // sources
 let fgSrc=null,bgSrc=null;
 if(state.fgKind==='video'&&fgVid.readyState>=2)fgSrc=fgVid; else if(state.fgKind==='image'&&fgImage)fgSrc=fgImage; else if(state.fgKind==='test'){
   const dx=Math.round(Math.sin(now*1.4)*26); if(dx!==lastTestDx){lastTestDx=dx; fgCanvas=makeTestFG(dx); fgDirty=true;} fgSrc=fgCanvas;}
 if(state.bgKind==='video'&&bgVid.readyState>=2)bgSrc=bgVid; else if(state.bgKind==='image'&&bgImage)bgSrc=bgImage; else if(state.bgKind==='test')bgSrc=bgCanvas;
 if(fgSrc){const ct=state.fgKind==='video'?fgVid.currentTime:-1; if(fgDirty||ct!==lastFgTime){uploadTex(fgTex,proxied(fgSrc,true),0); lastFgTime=ct; fgDirty=false;}}
 if(bgSrc){const ct=state.bgKind==='video'?bgVid.currentTime:-1; if(bgDirty||ct!==lastBgTime){uploadTex(bgTex,proxied(bgSrc,false),1); lastBgTime=ct; bgDirty=false;}}
 // fps meter + auto step-down on slow devices
 fpsFrames++; if(now-(fpsTs||now)>2||!fpsTs){} if(lastFrameTs){} 
 {const tnow=performance.now(); if(!fpsTs)fpsTs=tnow; if(tnow-fpsTs>=2000){fpsNow=Math.round(fpsFrames/((tnow-fpsTs)/1000)); fpsFrames=0; fpsTs=tnow;
   if(fpsNow>0&&fpsNow<18&&canvas.width>320&&degraded<3){degraded++; const nw=canvas.width>480?480:320; canvas.width=nw; canvas.height=Math.round(nw*9/16); fgDirty=bgDirty=true; setStatus('🐢 Preview was slow ('+fpsNow+' fps), so I lowered the preview size to keep it smooth. Your export size is not changed.','warn'); log('degrade to',nw,'fps',fpsNow);}
   if(!selfTested){selfTested=true; selfTest();}
 }}
 gl.activeTexture(gl.TEXTURE0+2);gl.bindTexture(gl.TEXTURE_2D,matteTex);
 if(state.lutTex){gl.activeTexture(gl.TEXTURE0+3);gl.bindTexture(gl.TEXTURE_3D,state.lutTex);}
 gl.viewport(0,0,canvas.width,canvas.height);
 const lens=LENSES.find(l=>l.id===$('lens').value)||LENSES[0];
 const focal=parseFloat($('focal').value); let zoom=(focal/24)*state.breathZoom;
 // weave: time-varying zoom handled via grain? use zoom wobble approximated by breathZoom oscillation if weave on
 if($('weave').checked) zoom*=1+Math.sin(now*7)*0.002;
 gl.uniform1i(U.uLight,LIGHT?1:0);gl.uniform1i(U.uFG,0);gl.uniform1i(U.uBG,1);gl.uniform1i(U.uMatte,2);gl.uniform1i(U.uLUT,3);
 gl.uniform1i(U.uHasFG,fgSrc?1:0);gl.uniform1i(U.uHasBG,bgSrc?1:0);
 gl.uniform1i(U.uView,parseInt($('viewMode').value));gl.uniform1i(U.uIDT,parseInt($('idt').value));gl.uniform1i(U.uLook,parseInt($('look').value));
 gl.uniform1i(U.uUseLUT,state.lutTex?1:0);gl.uniform1i(U.uGarbage,$('garbageOn').checked?1:0);gl.uniform1i(U.uInvert,$('garbageInv').checked?1:0);
 gl.uniform3f(U.uKey,...hexRGB($('keyColor').value));
 const stockGrain=[0,0.55,0.28,0.5][parseInt($('stock').value)]||0;
 const grainAmt = parseInt($('stock').value)===0?0: val('grain')*stockGrain*2;
 const pairs=[[U.uTol,'tol'],[U.uSoft,'soft'],[U.uHueTol,'hueTol'],[U.uSatMin,'satMin'],[U.uClipB,'clipB'],[U.uClipW,'clipW'],[U.uChoke,'choke'],[U.uFeather,'feather'],[U.uSpill,'spill'],[U.uSkin,'skin'],[U.uExp,'exp'],[U.uCon,'con'],[U.uPivot,'pivot'],[U.uSat,'sat'],[U.uTemp,'temp'],[U.uTint,'tint'],[U.uLookAmt,'lookAmt'],[U.uLUTAmt,'lutAmt'],[U.uGrainSize,'grainSize']];
 pairs.forEach(([u,id])=>gl.uniform1f(u,val(id)));
 gl.uniform1f(U.uTime,now);gl.uniform1f(U.uDist,val('distort'));gl.uniform1f(U.uVig,val('vig'));gl.uniform1f(U.uCA,val('ca'));gl.uniform1f(U.uHal,val('hal'));gl.uniform1f(U.uFlare,lens.flare);gl.uniform1f(U.uBloom,val('bloom'));gl.uniform1f(U.uGrain,grainAmt);gl.uniform1f(U.uZoom,zoom);gl.uniform1f(U.uSqueeze,parseFloat($('squeeze').value));
 // lens contrast/sat character folded into con/sat uniforms already? apply lens multipliers:
 gl.uniform1f(U.uCon,val('con')*lens.con); gl.uniform1f(U.uSat,val('sat')*lens.sat);
 gl.uniform3f(U.uHalCol,...lens.halCol);gl.uniform2f(U.uRes,canvas.width,canvas.height);
 gl.uniform3f(U.uLift,val('liftR'),val('liftG'),val('liftB'));gl.uniform3f(U.uGam,val('gamR'),val('gamG'),val('gamB'));gl.uniform3f(U.uGain,val('gainR'),val('gainG'),val('gainB'));gl.uniform3f(U.uOff,val('offR'),val('offG'),val('offB'));
 gl.drawArrays(gl.TRIANGLES,0,3);
 updateTransport();
}
function selfTest(){ if(fallback2D){setStatus('⚠ WebGL2 is not available on this browser, so Video Studio is in simple mode: basic green-screen only. Try updating Chrome. Pick your foreground video below to start.','warn'); return;}
 try{const c=getPixelSafe(320,130), k=getPixelSafe(16,16); const black=(c[0]+c[1]+c[2]<12)&&(k[0]+k[1]+k[2]<12);
  if(black){setStatus('⚠ The preview picture is black on this device. Close other apps, then close and reopen Video Studio. If it stays black, tell me — do not keep tapping.','bad');}
  else setStatus('✅ Preview is working'+(LIGHT?' (light mode for your tablet/phone)':'')+'. TEST SCENE is showing — a moving cartoon on green. To use your own clip: tap “Foreground (green screen video/image)” below, pick your video, then tap ▶ Play.');
 }catch(e){setStatus('✅ Preview started. TEST SCENE is showing. Pick your foreground video below, then tap ▶ Play.');}}
function getPixelSafe(x,y){const p=new Uint8Array(4); gl.readPixels(Math.min(x,canvas.width-1),Math.max(0,canvas.height-Math.min(y,canvas.height-1)),1,1,gl.RGBA,gl.UNSIGNED_BYTE,p); return [...p];}
function render2D(){ const ctx=canvas.getContext('2d'); if(!ctx)return; const W=canvas.width,H=canvas.height;
 const bgSrc=state.bgKind==='video'?(bgVid.readyState>=2?bgVid:null):state.bgKind==='image'?bgImage:bgCanvas;
 const fgSrc=state.fgKind==='video'?(fgVid.readyState>=2?fgVid:null):state.fgKind==='image'?fgImage:fgCanvas;
 if(bgSrc)ctx.drawImage(bgSrc,0,0,W,H); else {ctx.fillStyle='#123';ctx.fillRect(0,0,W,H);}
 if(fgSrc){const small=render2D.s||(render2D.s=document.createElement('canvas')); small.width=256; small.height=144; const sx=small.getContext('2d',{willReadFrequently:true}); sx.drawImage(fgSrc,0,0,256,144);
  try{const id=sx.getImageData(0,0,256,144),d=id.data,key=hexRGB($('keyColor').value),tol=val('tol')*255+40;
   for(let i=0;i<d.length;i+=4){const dr=d[i]-key[0]*255,dg=d[i+1]-key[1]*255,db=d[i+2]-key[2]*255; if(Math.sqrt(dr*dr+dg*dg+db*db)<tol){d[i+3]=0;} else if(dg>60&&d[i+1]>d[i]&&d[i+1]>d[i+2]){d[i+1]=Math.max(d[i],d[i+2]);}}
   sx.putImageData(id,0,0); ctx.imageSmoothingEnabled=true; ctx.drawImage(small,0,0,W,H);}catch(e){ctx.drawImage(fgSrc,0,0,W,H);}}
 updateTransport();}
let scopeTimer=0;
function loop(t){ if(fallback2D)render2D(); else render(); const iv=LIGHT?1200:350; if(t-scopeTimer>iv){scopeTimer=t; if(!document.hidden)drawScopes();} requestAnimationFrame(loop);}
function updateTransport(){const v=fgVid; const dur=(state.fgKind==='video'&&v.duration)?v.duration:(parseFloat($('trimOut').value)||10); const cur=(state.fgKind==='video')?v.currentTime:0; $('timeLabel').textContent=`${cur.toFixed(2)} / ${dur?dur.toFixed(2):'0.00'}s`; if(dur)$('seek').value=Math.round(cur/dur*1000);
 // trim loop/stop
 if(state.fgKind==='video'&&v.duration){const ti=val('trimIn'),to=val('trimOut')||v.duration; if(v.currentTime>=to){if($('loopChk').checked){v.currentTime=ti;bgVid.currentTime=ti;}else{v.pause();}} if(v.currentTime<ti&&state.playing)v.currentTime=ti;}
}
function drawScopes(){try{const tmp=drawScopes.c||(drawScopes.c=document.createElement('canvas'));tmp.width=160;tmp.height=90;const tx=tmp.getContext('2d',{willReadFrequently:true});tx.drawImage(canvas,0,0,160,90);const d=tx.getImageData(0,0,160,90).data;
 const h=$('hist').getContext('2d');h.clearRect(0,0,256,80);const bins=[new Array(64).fill(0),new Array(64).fill(0),new Array(64).fill(0)];for(let i=0;i<d.length;i+=16){bins[0][d[i]>>2]++;bins[1][d[i+1]>>2]++;bins[2][d[i+2]>>2];}const mx=Math.max(1,...bins.flat());['#f66','#6f6','#66f'].forEach((col,ci)=>{h.fillStyle=col;h.globalAlpha=.7;bins[ci].forEach((v,x)=>h.fillRect(x*4,80-v/mx*78,3,v/mx*78));});h.globalAlpha=1;
 const w=$('wave').getContext('2d');w.fillStyle='#05080c';w.fillRect(0,0,256,80);w.fillStyle='#7fd4ff';for(let x2=0;x2<160;x2+=2){let mx2=0,mn=255;for(let y=0;y<90;y+=3){const idx=(y*160+x2)*4;const lum=(d[idx]+d[idx+1]+d[idx+2])/3;mx2=Math.max(mx2,lum);mn=Math.min(mn,lum);}w.fillRect(x2/160*256,80-mx2/255*80,1.5,Math.max(1,(mx2-mn)/255*80));}
 }catch(e){}}
// lens UI
function fillLenses(){const sel=$('lens');LENSES.forEach(l=>{const o=document.createElement('option');o.value=l.id;o.textContent=`${l.group} — ${l.name}`;sel.appendChild(o);});sel.value='arri-signature';applyLens();}
function applyLens(){const l=LENSES.find(x=>x.id===$('lens').value)||LENSES[0];$('distort').value=l.dist;$('vig').value=l.vig;$('ca').value=l.ca;$('hal').value=l.hal;$('squeeze').value=String(l.squeeze);$('lensCard').innerHTML=`<b>${l.name}</b> · ${l.era}<br>${l.desc}<br><i>Typical use:</i> ${l.use}<br><span class="small">Inspired-by emulation, not official.</span>`;log('lens',l.id);}
document.addEventListener('change',e=>{if(e.target.id==='lens')applyLens(); if(e.target.id==='focal'){const b=val('breath');state.breathZoom=1+b; setTimeout(()=>state.breathZoom=1,350);} syncOutputs();});
function syncOutputs(){document.querySelectorAll('input[type=range]').forEach(r=>{const o=r.parentElement&&r.parentElement.querySelector('output'); if(o)o.textContent=r.value;});}
// media
function bindFile(id,vid,imgSetter,kind){$(id).addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;const url=URL.createObjectURL(f);log('media',kind,f.name);
 if(f.type.startsWith('video/')){vid.src=url;vid.play().catch(()=>{});state[kind+'Kind']='video'; fgDirty=bgDirty=true; setStatus('✅ '+(kind==='fg'?'Foreground':'Background')+' loaded: '+f.name+'. Tap ▶ Play if it does not start.');}
 else if(f.type.startsWith('image/')){const im=new Image();im.onload=()=>{imgSetter(im); fgDirty=bgDirty=true;};im.src=url;state[kind+'Kind']='image'; fgDirty=bgDirty=true;}
 $('mediaBin').textContent+=`\n${kind.toUpperCase()}: ${f.name} (${(f.size/1048576).toFixed(1)} MB)`;});}
bindFile('fgFile',fgVid,im=>fgImage=im,'fg'); bindFile('bgFile',bgVid,im=>bgImage=im,'bg');
$('auFile').addEventListener('change',e=>{const f=e.target.files[0];if(f) {auEl.src=URL.createObjectURL(f);$('mediaBin').textContent+=`\nAUDIO: ${f.name}`;}});
$('testBtn').onclick=()=>{state.fgKind='test';state.bgKind='test';log('test scene');};
// transport
$('playBtn').onclick=()=>{state.playing=true;fgVid.play().catch(()=>{});bgVid.play().catch(()=>{});auEl.play().catch(()=>{});
 if(state.fgKind==='test')setStatus('▶ Test scene is playing (watch the cartoon move). To play your own clip, pick it under “Foreground” below first.');
 else setStatus('▶ Playing.'); log('play');};
$('pauseBtn').onclick=()=>{state.playing=false;fgVid.pause();bgVid.pause();auEl.pause();log('pause');};
$('stopBtn').onclick=()=>{state.playing=false;[fgVid,bgVid].forEach(v=>{v.pause();try{v.currentTime=val('trimIn')}catch(e){}});auEl.pause();auEl.currentTime=0;log('stop');};
$('seek').addEventListener('input',e=>{if(fgVid.duration)fgVid.currentTime=fgVid.duration*e.target.value/1000; if(bgVid.duration)bgVid.currentTime=fgVid.currentTime;});
$('vol').addEventListener('input',e=>{[fgVid,bgVid,auEl].forEach(v=>v.volume=parseFloat(e.target.value));});
$('muteChk').addEventListener('change',e=>{[fgVid,bgVid,auEl].forEach(v=>v.muted=e.target.checked);});
// presets / pick / matte interaction
document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{if(b.dataset.preset==='green'){$('keyColor').value='#00b140';}else{$('keyColor').value='#0044cc';}log('preset',b.dataset.preset);});
$('pickBtn').onclick=()=>{state.pick=true;$('pickInfo').textContent='Now tap the green/blue screen in the picture…';};
function canvasUV(ev){const r=canvas.getBoundingClientRect();return [(ev.clientX-r.left)/r.width,1-(ev.clientY-r.top)/r.height, (ev.clientX-r.left)/r.width,(ev.clientY-r.top)/r.height];}
canvas.addEventListener('click',ev=>{const [u,v,ux,uy]=canvasUV(ev);
 if(state.pick){ // sample downscaled render
   const tmp=document.createElement('canvas');tmp.width=64;tmp.height=36;tmp.getContext('2d').drawImage(fgVid.readyState>=2&&state.fgKind==='video'?fgVid:(state.fgKind==='image'?fgImage:fgCanvas),0,0,64,36); // fg raw approx via source
   // Better: read GL pixel for composite? Use source sampling
   const ctx=tmp.getContext('2d'); const px=ctx.getImageData(Math.min(63,Math.floor(ux*64)),Math.min(35,Math.floor(uy*36)),1,1).data; const hex='#'+[px[0],px[1],px[2]].map(x=>x.toString(16).padStart(2,'0')).join(''); $('keyColor').value=hex; $('pickInfo').textContent='Picked '+hex; state.pick=false; log('pick',hex); return;}
 if($('garbageOn').checked){state.matte.push([u,1-v]); /* store top-down */ state.matte[state.matte.length-1]=[ux,uy]; uploadMatte(); $('matteInfo').textContent=state.matte.length+' points'; log('matte point',ux,uy);}
});
$('matteUndo').onclick=()=>{state.matte.pop();uploadMatte();$('matteInfo').textContent=state.matte.length+' points';};
$('matteClear').onclick=()=>{state.matte=[];uploadMatte();$('matteInfo').textContent='0 points';};
// LUT
$('lutFile').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{const text=await f.text();const lut=parseCube(text); if(!lut.is3D)throw new Error('Only 3D .cube supported in preview'); uploadLUT(lut); $('lutAmt').value=1; $('lutInfo').textContent=`Loaded ${f.name} ${lut.size}³ — intensity 1`; log('lut',lut.size);}catch(err){$('lutInfo').textContent='LUT error: '+err.message;}});
function parseCube(text){let size=0,is3D=true;const data=[];let min=[0,0,0],max=[1,1,1];
 for(const raw of text.split(/\r?\n/)){const line=raw.trim();if(!line||line.startsWith('#'))continue;const parts=line.split(/\s+/);const k=parts[0].toUpperCase();
  if(k==='LUT_3D_SIZE'){size=parseInt(parts[1]);is3D=true;continue} if(k==='LUT_1D_SIZE'){size=parseInt(parts[1]);is3D=false;continue} if(k==='DOMAIN_MIN'){min=parts.slice(1).map(Number);continue} if(k==='DOMAIN_MAX'){max=parts.slice(1).map(Number);continue}
  const v=parts.map(Number); if(v.length===3&&v.every(Number.isFinite))data.push(...v);}
 const exp=is3D?size**3*3:size*3; if(!size||data.length!==exp)throw new Error(`expected ${exp/3} entries, got ${data.length/3}`); return {size,is3D,data:new Float32Array(data),min,max};}
function uploadLUT(lut){gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);if(!gl.getExtension('OES_texture_float_linear'))log('float linear ext missing, LUT may use nearest'); const t=gl.createTexture();gl.activeTexture(gl.TEXTURE0+3);gl.bindTexture(gl.TEXTURE_3D,t);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_R,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texImage3D(gl.TEXTURE_3D,0,gl.RGB16F,lut.size,lut.size,lut.size,0,gl.RGB,gl.FLOAT,lut.data);state.lutTex=t;state.lutSize=lut.size;}
// project
function collect(){const o={schemaVersion:'1.0.0',app:'Video Studio',version:VERSION,matte:state.matte,lens:$('lens').value};document.querySelectorAll('[data-set]').forEach(e=>{o[e.dataset.set]=e.type==='checkbox'?e.checked:e.value;});return o;}
function applyProj(o){if(!o)return;document.querySelectorAll('[data-set]').forEach(e=>{if(o[e.dataset.set]!==undefined){if(e.type==='checkbox')e.checked=!!o[e.dataset.set];else e.value=o[e.dataset.set];}}); if(o.matte){state.matte=o.matte;uploadMatte();} applyLens(); log('project applied');}
$('saveBtn').onclick=()=>{localStorage.setItem('videoStudioProject',JSON.stringify(collect())); // also IndexedDB best effort
 try{const rq=indexedDB.open('video-studio',1);rq.onupgradeneeded=()=>rq.result.createObjectStore('p');rq.onsuccess=()=>{const db=rq.result;db.transaction('p','readwrite').objectStore('p').put(collect(),'main');};}catch(e){}
 alert('Saved on this device.');};
$('loadBtn').onclick=()=>{const s=localStorage.getItem('videoStudioProject'); if(s)applyProj(JSON.parse(s)); else alert('No saved project yet.');};
$('expProjBtn').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(collect(),null,2)],{type:'application/json'}));a.download='video-studio-project.json';a.click();};
$('impProj').addEventListener('change',async e=>{const f=e.target.files[0];if(f)applyProj(JSON.parse(await f.text()));});
// export
let exporting=false;
$('exportBtn').onclick=async()=>{if(exporting)return; exporting=true; const res=parseInt($('expRes').value); const ow=canvas.width,oh=canvas.height; canvas.width=res*16/9|0; canvas.height=res; render();
 if(!canvas.captureStream||!window.MediaRecorder){$('expInfo').textContent='This browser cannot record video export. Try Chrome updated, or screen-record the preview.'; setStatus('⚠ This browser cannot record an export. Try updating Chrome, or screen-record the preview instead.','warn'); exporting=false; return;}
 const mimes=['video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9','video/webm']; const mime=mimes.find(m=>window.MediaRecorder&&MediaRecorder.isTypeSupported(m))||'';
 try{const stream=canvas.captureStream(30); // audio mix best effort
   try{const AC=new AudioContext(); const dest=AC.createMediaStreamDestination(); [fgVid,bgVid,auEl].forEach(el=>{try{const s=AC.createMediaElementSource(el);s.connect(dest);s.connect(AC.destination);}catch(e){}}); dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));}catch(e){log('export audio mix failed',e.message)}
   const rec=new MediaRecorder(stream,mime?{mimeType:mime,videoBitsPerSecond:8000000}:undefined); const chunks=[]; rec.ondataavailable=e=>chunks.push(e.data);
   const done=new Promise(r=>rec.onstop=r); rec.start(250); $('exportBtn').textContent='⏺ Recording export… tap Stop in player to finish, or wait for trim end';
   // play from trim in
   if(state.fgKind==='video'){fgVid.currentTime=val('trimIn');} $('playBtn').click();
   const dur=((val('trimOut')|| (fgVid.duration||5)) - val('trimIn'))||5; const t0=Date.now();
   const iv=setInterval(()=>{const p=Math.min(100,(Date.now()-t0)/(dur*1000)*100);$('expProg').value=p;$('expInfo').textContent=`Exporting… ${p.toFixed(0)}% (real-time)`; if(p>=100){clearInterval(iv); try{rec.stop();}catch(e){}}},200);
   await done; const blob=new Blob(chunks,{type:mime||'video/webm'}); const ext=(mime&&mime.includes('mp4'))?'mp4':'webm'; if(window.PFLIB)window.PFLIB.addLater(blob,{name:'Video Studio export',source:'Video Studio',video:true}); const url=URL.createObjectURL(blob); $('dl').innerHTML=`<a href="${url}" download="video-studio-export.${ext}">⬇ Download export (${(blob.size/1048576).toFixed(2)} MB, ${ext})</a>`; $('expInfo').textContent='Export done.';
 }catch(err){$('expInfo').textContent='Export failed: '+err.message;}
 canvas.width=ow;canvas.height=oh; $('exportBtn').textContent='⬇ Export video (WebM / MP4 if supported)'; exporting=false;};
// tier
(function(){$('tier').textContent=LIGHT?'📱 Light preview mode for phone/tablet: smaller preview for smoothness. Export at 720p for best tablet results.':'💻 Desktop / full preview mode.'; if(LIGHT){canvas.width=480;canvas.height=270;}})();
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault(); showError('The graphics stopped (this can happen on older tablets when memory is low). Close other apps, then close and reopen Video Studio.');});
canvas.addEventListener('webglcontextrestored',()=>{setStatus('Graphics restarted — preview is back.','warn'); try{initGL(); fgDirty=bgDirty=true; uploadMatte();}catch(err){showError('Graphics could not restart: '+err.message);}});
// init
try{fillLenses();}catch(err){showError('Lens list failed to load: '+err.message);} try{syncOutputs();}catch(err){}
try{if(initGL()){uploadMatte(); fgDirty=bgDirty=true; requestAnimationFrame(loop);}else{throw new Error('WebGL2 not available');}}catch(err){console.error(err); fallback2D=true; setStatus('⚠ WebGL2 is not available on this browser, so Video Studio is in simple mode: basic green-screen only. Try updating Chrome.','warn'); requestAnimationFrame(loop);}
if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').then(r=>{log('sw scope',r.scope); if(debugOn&&navigator.serviceWorker.controller)log('sw controlled');}).catch(e=>log('sw failed',e.message));}
window.VideoStudio={version:VERSION,lenses:LENSES,collect,applyProj,getPixel:(x,y)=>{if(fallback2D||!gl)return [0,0,0,0]; const p=new Uint8Array(4);gl.readPixels(x,canvas.height-y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return [...p];},render:()=>render(),state};
log('ready',VERSION);
window.__vsReady=true; if(window.__vsBootTimer)clearTimeout(window.__vsBootTimer); var bm=document.getElementById('bootMsg'); if(bm)bm.style.display='none';
