// Psycho Fingers Player — DJ booth scene (original layered SVG art, IK arms, choreography)
import { applyOutfit } from './outfits.js';
const NS = 'http://www.w3.org/2000/svg';
const D2R = Math.PI / 180;
const ease = {
  io: (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  lin: (t) => t,
};

// key geometry (viewBox 0 0 1000 660)
const G = {
  platter: { x: 545, y: 498, r: 168, k: 0.37 },
  arm: { x: 742, y: 440, len: 130, rest: -8, play0: 40, play1: 55 },
  sh: { L: { x: 352, y: 300 }, R: { x: 588, y: 300 } },
  upper: 150, fore: 152,
  crate: { x: 140, y: 474 },
  sleeveUp: { x: 182, y: 300 },
  fly: 68,
};

const svgMarkup = `
<svg class="scene-svg" viewBox="0 0 1000 660" preserveAspectRatio="xMidYMax meet" role="img" aria-label="Animated DJ performing at turntables">
<defs>
  <radialGradient id="skin" cx="45%" cy="38%" r="70%"><stop offset="0" stop-color="#7a4f36"/><stop offset=".55" stop-color="#58361f"/><stop offset="1" stop-color="#3a2214"/></radialGradient>
  <linearGradient id="skinNeck" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2315"/><stop offset="1" stop-color="#55331e"/></linearGradient>
  <linearGradient id="jacket" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3c3f"/><stop offset=".5" stop-color="#2b2d2f"/><stop offset="1" stop-color="#1d1e20"/></linearGradient>
  <linearGradient id="jacketSide" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset=".25" stop-color="#000" stop-opacity="0"/><stop offset=".75" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient>
  <linearGradient id="tee" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#18181b"/><stop offset="1" stop-color="#0b0b0d"/></linearGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0a8"/><stop offset=".45" stop-color="#e2b23a"/><stop offset="1" stop-color="#8f6510"/></linearGradient>
  <linearGradient id="cap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26262a"/><stop offset="1" stop-color="#08080a"/></linearGradient>
  <pattern id="ribs" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#1c1d1f"/><rect width="2" height="5" fill="#2a2b2e"/></pattern>
  <radialGradient id="vinyl" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#2a2a2e"/><stop offset=".35" stop-color="#121214"/><stop offset=".98" stop-color="#1b1b1f"/><stop offset="1" stop-color="#3a3a40"/></radialGradient>
  <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".42" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".16"/><stop offset=".58" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="plinth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2d34"/><stop offset="1" stop-color="#15161b"/></linearGradient>
  <linearGradient id="metal" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6d7079"/><stop offset=".5" stop-color="#d7dbe2"/><stop offset="1" stop-color="#5d6068"/></linearGradient>
  <linearGradient id="table" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16131f"/><stop offset="1" stop-color="#0b0a10"/></linearGradient>
  <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b4528"/><stop offset=".5" stop-color="#4f311b"/><stop offset="1" stop-color="#342011"/></linearGradient>
  <linearGradient id="woodSide" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a2414"/><stop offset="1" stop-color="#22150b"/></linearGradient>
  <linearGradient id="led" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="var(--c1)"/><stop offset=".5" stop-color="var(--c4)"/><stop offset="1" stop-color="var(--c2)"/></linearGradient>
  <linearGradient id="brimShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
  <linearGradient id="skinBody" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3e2516"/><stop offset=".5" stop-color="#5e3a22"/><stop offset="1" stop-color="#3e2516"/></linearGradient>
  <linearGradient id="beanieG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2f36"/><stop offset="1" stop-color="#1a1c21"/></linearGradient>
  <linearGradient id="bucketG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4e7c8"/><stop offset="1" stop-color="#d9c69a"/></linearGradient>
  <pattern id="knit" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="none"/><path d="M0,0 L3,6 L6,0" stroke="#000" stroke-opacity=".5" fill="none"/></pattern>
  <clipPath id="clipLabel"><circle r="56"/></clipPath>
  <clipPath id="clipFlyLabel"><circle r="23"/></clipPath>
  <clipPath id="clipSleeve"><rect x="-75" y="-75" width="150" height="150" rx="3"/></clipPath>
  <symbol id="hand" overflow="visible">
    <g class="hand-shape">
      <path class="h-out" d="M-2,-15 C10,-18 26,-17 33,-14 L52,-13 C56,-12 56,-8 52,-7 L54,-4 C58,-3 58,1 54,2 L54,5 C58,6 58,10 53,11 L50,13 C53,15 51,18 47,17 L33,15 C24,18 8,18 -2,15 Z" fill="#24140b"/>
      <path d="M0,-13 C10,-16 25,-15 32,-12.5 L51,-11.5 C53.5,-11 53.5,-8.6 51,-8.2 L52.5,-4.6 C55.6,-4 55.6,-0.4 52.6,0.4 L52.4,4.4 C55.6,5 55.6,8.6 51.6,9.4 L48.6,12 C50.8,13.6 49.6,15.8 46.4,15.4 L32.5,13.5 C24,16.2 9,16.2 0,13.5 Z" fill="url(#skin)"/>
      <path d="M33,-8.5 L48,-8 M34,-1.6 L51,-1.6 M34,5 L50,6.4 M32,11 L45,13" stroke="#2b170c" stroke-width="1.3" stroke-linecap="round" opacity=".7"/>
      <path d="M8,-14 C14,-24 24,-27 31,-24 C34,-22 33,-19 29,-18 C22,-17 18,-14 14,-11 Z" fill="url(#skin)" stroke="#24140b" stroke-width="1.6"/>
      <path d="M18,-8 C22,-9 27,-9 30,-8 M17,3 C22,2 27,2 30,3" stroke="#8a5a3d" stroke-width="1.4" stroke-linecap="round" opacity=".55"/>
    </g>
  </symbol>
</defs>

<!-- ===== DJ body (behind booth) ===== -->
<g id="dj">
  <g id="body">
    <g data-ov="hood" style="display:none"><path d="M372,292 C366,236 414,214 470,214 C526,214 574,236 568,292 C548,276 508,268 470,268 C432,268 392,276 372,292Z" fill="url(#jacket)" stroke="#060607" stroke-width="2"/><path d="M392,284 C404,250 436,240 470,240 C504,240 536,250 548,284" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="6"/></g>
    <path class="o-ph-band" d="M422,286 C418,240 522,240 518,286" fill="none" stroke="#0c0c0e" stroke-width="11" stroke-linecap="round"/>
    <path d="M444,226 L496,226 L500,276 L440,276 Z" fill="url(#skinNeck)"/>
    <g class="o-jacketpart">
    <path id="torso" d="M342,284 C382,268 424,262 470,262 C516,262 558,268 598,284 C626,294 640,322 642,362 L652,470 L288,470 L298,362 C300,322 314,294 342,284 Z" fill="url(#jacket)"/>
    <path d="M342,284 C382,268 424,262 470,262 C516,262 558,268 598,284 C626,294 640,322 642,362 L652,470 L288,470 L298,362 C300,322 314,294 342,284 Z" fill="url(#jacketSide)"/>
    </g>
    <g data-ov="tank" style="display:none">
      <path d="M342,284 C382,268 424,262 470,262 C516,262 558,268 598,284 C626,294 640,322 642,362 L652,470 L288,470 L298,362 C300,322 314,294 342,284 Z" fill="url(#skinBody)"/>
      <path d="M396,270 L414,268 C420,300 440,316 470,316 C500,316 520,300 526,268 L544,270 C548,330 566,400 590,470 L350,470 C374,400 392,330 396,270Z" fill="url(#tee)"/>
      <path d="M414,268 C420,300 440,316 470,316 C500,316 520,300 526,268" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="3"/>
      <text x="470" y="420" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-weight="900" font-size="34" class="o-pf" fill="#f08c2a" stroke="#7a3f05" stroke-width=".8" opacity=".9">PF</text>
    </g>
    <g class="o-jacketpart">
    <path d="M432,266 L508,266 L548,470 L392,470 Z" fill="url(#tee)"/>
    <path class="o-collar" d="M440,264 C452,282 488,282 500,264" fill="none" stroke="#26262a" stroke-width="7" stroke-linecap="round"/>
    <path class="o-zip" d="M410,266 C424,256 436,258 444,264 L430,318 L400,300 Z" fill="url(#ribs)" stroke="#121315" stroke-width="1.5"/>
    <path class="o-zip" d="M530,266 C516,256 504,258 496,264 L510,318 L540,300 Z" fill="url(#ribs)" stroke="#121315" stroke-width="1.5"/>
    <path class="o-zip o-zip-a" d="M430,314 L394,470 M510,314 L546,470" stroke="#4a4c51" stroke-width="3"/>
    <path class="o-zip" d="M430,314 L394,470 M510,314 L546,470" stroke="#9a9ca2" stroke-width="2" stroke-dasharray="1.5 3.5"/>
    <path class="o-seam" d="M330,360 C350,372 380,378 405,378 M610,360 C590,372 560,378 535,378" fill="none" stroke="#1a1b1d" stroke-width="2.5" opacity=".8"/>
    <path class="o-seam" d="M318,410 L368,410 L364,446 L322,446 Z M572,410 L622,410 L618,446 L576,446 Z" fill="none" stroke="#18191b" stroke-width="2.4" opacity=".9"/>
    <g data-ov="hood" style="display:none"><path d="M452,280 C450,300 452,330 448,352 M488,280 C490,300 488,330 492,352" stroke="#d9d9d9" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="448" cy="354" r="3" fill="#bbb"/><circle cx="492" cy="354" r="3" fill="#bbb"/></g>
    <g data-ov="pocket" style="display:none"><path d="M392,470 L404,404 C440,396 500,396 536,404 L548,470" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="3"/><path d="M404,404 C440,396 500,396 536,404" fill="none" stroke="#3a3c42" stroke-width="1.5"/></g>
    <g data-ov="lapels" style="display:none">
      <path d="M432,266 L470,358 L446,344 L420,298 L426,276Z" fill="#1a1d27" stroke="#0b0d12" stroke-width="1.5"/>
      <path d="M508,266 L470,358 L494,344 L520,298 L514,276Z" fill="#1a1d27" stroke="#0b0d12" stroke-width="1.5"/>
      <circle cx="470" cy="400" r="4" fill="#0b0d12"/><circle cx="470" cy="436" r="4" fill="#0b0d12"/>
      <path d="M560,326 L590,322 L592,330 L562,334Z" fill="#f6f6f4" opacity=".9"/>
    </g>
    <g data-ov="tie" style="display:none"><path d="M450,268 L470,284 L490,268 L486,280 L470,292 L454,280Z" fill="#fff" stroke="#c9c9c4"/><path d="M463,286 L477,286 L474,298 L482,368 L470,384 L458,368 L466,298Z" fill="#8a1d2c" stroke="#4a0d16" stroke-width="1"/></g>
    <g data-ov="stripes" style="display:none"><path d="M302,470 L304,362 C306,326 320,298 346,288 M638,470 L636,362 C634,326 620,298 594,288" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/><path d="M314,470 L316,364 C318,332 330,306 352,296 M626,470 L624,364 C622,332 610,306 588,296" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".9"/></g>
    <g data-ov="neon" class="neon-strips" style="display:none"><path d="M300,404 L392,404 M548,404 L640,404 M298,420 L388,420 M552,420 L642,420" stroke="var(--c2)" stroke-width="5" stroke-linecap="round"/><path d="M300,404 L392,404 M548,404 L640,404 M298,420 L388,420 M552,420 L642,420" stroke="#e8fdff" stroke-width="1.6" stroke-linecap="round"/><path d="M344,288 C330,300 316,320 312,350 M596,288 C610,300 624,320 628,350" stroke="var(--c1)" stroke-width="4" fill="none" stroke-linecap="round"/></g>
    </g>
    <path id="rimL" d="M300,470 L302,362 C304,324 318,296 344,286 C372,276 400,270 430,266" fill="none" stroke="var(--c1)" stroke-width="3" opacity=".35" stroke-linecap="round"/>
    <path id="rimR" d="M640,470 L638,362 C636,324 622,296 596,286 C568,276 540,270 510,266" fill="none" stroke="var(--c2)" stroke-width="3" opacity=".35" stroke-linecap="round"/>
    <!-- gold rope chain(s) -->
    <g class="o-chain1"><path d="M444,270 C446,318 462,346 470,348 C478,346 494,318 496,270" fill="none" stroke="url(#gold)" stroke-width="6" stroke-linecap="round"/>
    <path d="M444,270 C446,318 462,346 470,348 C478,346 494,318 496,270" fill="none" stroke="#7a5408" stroke-width="6" stroke-dasharray="2 3.2" stroke-linecap="butt" opacity=".75"/></g>
    <g class="o-chain2" style="display:none"><path d="M438,272 C438,340 458,382 470,384 C482,382 502,340 502,272" fill="none" stroke="url(#gold)" stroke-width="5" stroke-linecap="round"/><path d="M438,272 C438,340 458,382 470,384 C482,382 502,340 502,272" fill="none" stroke="#7a5408" stroke-width="5" stroke-dasharray="2 3" opacity=".7"/><circle cx="470" cy="392" r="10" fill="url(#gold)" stroke="#7a5408"/><text x="470" y="396" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-weight="900" font-size="10" fill="#5a3d05">PF</text></g>
    <!-- headphones around neck -->
    <g id="phones">
      <g transform="translate(424,292) rotate(-24)"><ellipse class="o-ph-cup" rx="25" ry="29" fill="#111215" stroke="#3b3d44" stroke-width="3"/><ellipse class="o-ph-in" rx="15" ry="18" fill="#1d1f24"/><ellipse class="o-ph-hub" rx="6" ry="7" fill="#2c2e35"/><path d="M-20,-10 A24 28 0 0 1 4,-27" stroke="#6d717c" stroke-width="2" fill="none" opacity=".6"/></g>
      <g transform="translate(516,292) rotate(24)"><ellipse class="o-ph-cup" rx="25" ry="29" fill="#111215" stroke="#3b3d44" stroke-width="3"/><ellipse class="o-ph-in" rx="15" ry="18" fill="#1d1f24"/><ellipse class="o-ph-hub" rx="6" ry="7" fill="#2c2e35"/><path d="M20,-10 A24 28 0 0 0 -4,-27" stroke="#6d717c" stroke-width="2" fill="none" opacity=".6"/></g>
    </g>
  </g>
  <g id="head">
    <g transform="translate(470,175)">
      <ellipse cx="-57" cy="4" rx="9" ry="15" fill="#4a2c19"/><ellipse cx="57" cy="4" rx="9" ry="15" fill="#4a2c19"/>
      <path d="M0,-75 C35,-75 58,-50 58,-10 C58,25 50,52 30,66 C18,74 -18,74 -30,66 C-50,52 -58,25 -58,-10 C-58,-50 -35,-75 0,-75Z" fill="url(#skin)"/>
      <path d="M-59,-32 C-61,-18 -60,-6 -57,2 L-50,4 C-52,-8 -52,-20 -49,-32Z M59,-32 C61,-18 60,-6 57,2 L50,4 C52,-8 52,-20 49,-32Z" fill="#110b09"/>
      <ellipse cx="-30" cy="14" rx="10" ry="6" fill="#8a5a3d" opacity=".18"/><ellipse cx="30" cy="14" rx="10" ry="6" fill="#8a5a3d" opacity=".18"/>
      <path d="M-58,-2 C-57,30 -48,60 -28,74 C-14,84 14,84 28,74 C48,60 57,30 58,-2 C52,10 46,22 34,27 C22,31 -22,31 -34,27 C-46,22 -52,10 -58,-2Z" fill="#141010"/>
      <path d="M-58,-2 C-52,10 -46,22 -34,27 C-28,29 -24,30 -20,30" fill="none" stroke="#2a1d17" stroke-width="2" opacity=".6"/>
      <path d="M-24,36 C-14,29 -5,30 0,32 C5,30 14,29 24,36 C16,35 8,36 0,37 C-8,36 -16,35 -24,36Z" fill="#0d0a0a"/>
      <path d="M-13,43 C-6,40 6,40 13,43 C7,45 -7,45 -13,43Z" fill="#2c1713"/>
      <path d="M-11,44 C-5,50 5,50 11,44 C6,46 -6,46 -11,44Z" fill="#5a3127"/>
      <path d="M-6,4 C-8,12 -12,18 -12,22 C-10,26 -4,26 0,26 C4,26 10,26 12,22 C12,18 8,12 6,4" fill="#4c2d1a" opacity=".55"/>
      <ellipse cx="-8" cy="23" rx="4.2" ry="2.4" fill="#1d0f08"/><ellipse cx="8" cy="23" rx="4.2" ry="2.4" fill="#1d0f08"/>
      <ellipse cx="0" cy="16" rx="5" ry="3" fill="#8a5a3d" opacity=".35"/>
      <g id="eyes">
        <ellipse cx="-22" cy="2" rx="9" ry="4.2" fill="#e9e1d6"/><ellipse cx="22" cy="2" rx="9" ry="4.2" fill="#e9e1d6"/>
        <circle cx="-21" cy="3.4" r="3.9" fill="#1b0f09"/><circle cx="23" cy="3.4" r="3.9" fill="#1b0f09"/>
        <path d="M-32,1 C-26,-4 -18,-4 -12,0 L-12,1.6 C-18,-1.2 -26,-1.2 -32,2.4Z M32,1 C26,-4 18,-4 12,0 L12,1.6 C18,-1.2 26,-1.2 32,2.4Z" fill="#160c07"/>
      </g>
      <path d="M-35,-11 C-28,-17 -17,-17 -9,-12 L-10,-8 C-18,-12 -27,-12 -34,-7Z M35,-11 C28,-17 17,-17 9,-12 L10,-8 C18,-12 27,-12 34,-7Z" fill="#0f0907"/>
      <g data-ov="hair" style="display:none"><path d="M-58,-14 C-62,-60 -34,-80 0,-80 C34,-80 62,-60 58,-14 C54,-36 40,-50 0,-52 C-40,-50 -54,-36 -58,-14Z" fill="#120c0a"/><path d="M-50,-40 C-30,-56 30,-56 50,-40" fill="none" stroke="#2a1d17" stroke-width="1.5" opacity=".6"/></g>
      <g data-ov="shades" style="display:none"><path d="M-36,-6 L-6,-6 C-6,8 -10,14 -22,14 C-34,14 -37,6 -36,-6Z M36,-6 L6,-6 C6,8 10,14 22,14 C34,14 37,6 36,-6Z" fill="#07080b" stroke="#c9ccd4" stroke-width="1.6"/><path d="M-6,-3 C-3,-6 3,-6 6,-3 M-36,-5 L-56,-8 M36,-5 L56,-8" stroke="#c9ccd4" stroke-width="2" fill="none"/><path d="M-30,-3 L-20,-3 M14,-3 L26,-3" stroke="#fff" stroke-opacity=".35" stroke-width="2"/></g>
      <g class="o-cap">
      <path d="M-62,-36 C-40,-24 40,-24 62,-36 L62,-14 C40,-4 -40,-4 -62,-14Z" fill="url(#brimShade)" opacity=".7"/>
      <path d="M-64,-34 C-67,-74 -40,-102 0,-102 C40,-102 67,-74 64,-34 C40,-42 -40,-42 -64,-34Z" fill="url(#cap)"/>
      <path class="o-capseam" d="M0,-102 L0,-40 M-36,-92 C-30,-70 -28,-52 -28,-39 M36,-92 C30,-70 28,-52 28,-39" stroke="#2f3035" stroke-width="1.4" fill="none"/>
      <ellipse cx="0" cy="-101" rx="5" ry="2.6" fill="#1b1b1f"/>
      <text class="o-pf" x="0" y="-55" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-weight="900" font-size="30" fill="url(#gold)" stroke="#5a3d05" stroke-width=".8" letter-spacing="-2">PF</text>
      <path class="o-brim" d="M-68,-36 C-40,-46 40,-46 68,-36 C72,-26 52,-10 0,-8 C-52,-10 -72,-26 -68,-36Z" fill="#0b0b0d"/>
      <path class="o-brimedge" d="M-68,-36 C-40,-46 40,-46 68,-36" fill="none" stroke="#3a3b41" stroke-width="1.6"/>
      <path d="M-58,-24 C-30,-14 30,-14 58,-24" fill="none" stroke="#1f2024" stroke-width="1.2"/>
      </g>
      <g class="o-beanie" style="display:none">
        <path d="M-62,-22 C-68,-76 -38,-108 0,-108 C38,-108 68,-76 62,-22Z" fill="url(#beanieG)"/>
        <path d="M-40,-96 L-44,-30 M-20,-104 L-22,-30 M0,-108 L0,-30 M20,-104 L22,-30 M40,-96 L44,-30" stroke="#000" stroke-opacity=".22" stroke-width="2"/>
        <path d="M-64,-44 C-40,-52 40,-52 64,-44 L64,-18 C40,-26 -40,-26 -64,-18Z" fill="url(#beanieG)" stroke="#000" stroke-opacity=".35" stroke-width="1.5"/>
        <path d="M-64,-44 C-40,-52 40,-52 64,-44 L64,-18 C40,-26 -40,-26 -64,-18Z" fill="url(#knit)" opacity=".5"/>
        <rect x="-16" y="-44" width="32" height="18" rx="3" fill="#0d0e11" stroke="#3a3c42"/>
        <text class="o-pf" x="0" y="-30" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-weight="900" font-size="14" fill="url(#gold)" stroke="#5a3d05" stroke-width=".5">PF</text>
      </g>
      <g class="o-bucket" style="display:none">
        <path d="M-50,-30 C-54,-80 -30,-100 0,-100 C30,-100 54,-80 50,-30Z" fill="url(#bucketG)"/>
        <path d="M-84,-26 C-70,-44 70,-44 84,-26 C88,-14 60,-4 0,-4 C-60,-4 -88,-14 -84,-26Z" fill="url(#bucketG)" stroke="#000" stroke-opacity=".3" stroke-width="1.5"/>
        <path d="M-52,-40 C-30,-46 30,-46 52,-40" stroke="#000" stroke-opacity=".25" stroke-width="5" fill="none"/>
        <path d="M-74,-22 C-50,-14 50,-14 74,-22" stroke="#000" stroke-opacity=".2" stroke-width="1.2" stroke-dasharray="3 3" fill="none"/>
        <text class="o-pf" x="0" y="-58" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-weight="900" font-size="24" fill="#f08c2a" stroke="#7a3f05" stroke-width=".6">PF</text>
      </g>
    </g>
  </g>
</g>

<!-- ===== booth ===== -->
<g id="booth">
  <path d="M150,410 L1000,410 L1000,604 L118,604 Z" fill="url(#table)"/>
  <path d="M150,410 L1000,410" stroke="#2d2840" stroke-width="2"/>
  <rect x="100" y="604" width="900" height="60" fill="#09080d"/>
  <rect id="ledStrip" x="110" y="606" width="890" height="5" fill="url(#led)" opacity=".7"/>
  <rect x="110" y="611" width="890" height="40" fill="url(#led)" opacity=".06" id="ledGlow"/>
  <!-- turntable -->
  <g id="turntable">
    <path d="M352,418 L748,418 L772,586 L328,586 Z" fill="url(#plinth)" stroke="#3a3c46" stroke-width="1.5"/>
    <path d="M328,586 L772,586 L772,602 L328,602 Z" fill="#0d0e12"/>
    <path d="M330,586 L770,586" stroke="#4a4d58" stroke-width="1"/>
    <rect x="352" y="560" width="34" height="14" rx="3" fill="#22242b" stroke="#454854"/>
    <rect id="startBtn" x="355" y="563" width="28" height="8" rx="2" fill="var(--c2)" opacity=".25"/>
    <circle cx="400" cy="567" r="4" fill="#3a3d47"/><circle cx="414" cy="567" r="4" fill="#3a3d47"/>
    <rect x="722" y="470" width="10" height="92" rx="4" fill="#0c0d10" stroke="#3a3d47"/>
    <rect id="pitchCap" x="715" y="508" width="24" height="12" rx="2" fill="url(#metal)"/>
    <circle cx="372" cy="436" r="8" fill="#1b1c22" stroke="#4a4d58"/><circle id="targetLight" cx="372" cy="436" r="3" fill="var(--c3)" opacity=".5"/>
    <g id="neon" transform="translate(545,500)">
      <ellipse rx="190" ry="72" fill="none" stroke="var(--c1)" stroke-width="14" opacity=".08" class="neonGlow"/>
      <ellipse rx="190" ry="72" fill="none" stroke="var(--c1)" stroke-width="7" opacity=".18" class="neonGlow"/>
      <ellipse rx="190" ry="72" fill="none" stroke="var(--c1)" stroke-width="2.4" opacity=".95" class="neonCore"/>
      <ellipse rx="198" ry="76" fill="none" stroke="var(--c2)" stroke-width="6" opacity=".12" class="neonGlow2"/>
      <ellipse rx="198" ry="76" fill="none" stroke="var(--c2)" stroke-width="1.6" opacity=".8" class="neonCore2"/>
    </g>
    <g id="ringBars" transform="translate(545,500)"></g>
    <ellipse cx="545" cy="506" rx="180" ry="67" fill="#0b0b0e"/>
    <ellipse cx="545" cy="502" rx="180" ry="67" fill="url(#metal)" opacity=".8"/>
    <ellipse cx="545" cy="500" rx="176" ry="65" fill="#1a1b20"/>
    <g id="strobe" transform="translate(545,500) scale(1,0.37)"><circle r="174" fill="none" stroke="#8d919b" stroke-width="4" stroke-dasharray="2 7"/></g>
    <g transform="translate(545,498) scale(1,0.37)">
      <g id="platterRec">
        <circle r="168" fill="url(#vinyl)"/>
        <g fill="none" stroke="#2c2c31" stroke-width="1.2"><circle r="160"/><circle r="148"/><circle r="136"/><circle r="122"/><circle r="110"/><circle r="96"/><circle r="84"/><circle r="72"/></g>
        <circle r="150" fill="none" stroke="#0a0a0c" stroke-width="3"/><circle r="104" fill="none" stroke="#0a0a0c" stroke-width="2.5"/>
        <g id="platterRot">
          <image id="labelImg" href="" x="-56" y="-56" width="112" height="112" clip-path="url(#clipLabel)" preserveAspectRatio="xMidYMid slice"/>
          <circle r="56" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="2"/>
          <rect x="-3" y="-54" width="6" height="16" rx="2" fill="#fff" opacity=".55"/>
          <path d="M-160,0 A160 160 0 0 1 -150,-55" stroke="#55565e" stroke-width="3" fill="none" opacity=".7"/>
          <path d="M150,55 A160 160 0 0 1 120,105" stroke="#55565e" stroke-width="3" fill="none" opacity=".5"/>
        </g>
        <circle r="168" fill="url(#sheen)"/>
      </g>
      <circle r="5" fill="url(#metal)"/>
    </g>
    <!-- tonearm -->
    <circle cx="742" cy="440" r="22" fill="#1f2026" stroke="#4a4d58" stroke-width="2"/>
    <circle cx="742" cy="440" r="14" fill="url(#metal)"/>
    <ellipse id="needleShadow" cx="0" cy="0" rx="10" ry="4" fill="#000" opacity=".4"/>
    <g id="tonearm">
      <g id="armLift">
        <rect x="-7" y="-36" width="14" height="22" rx="4" fill="url(#metal)"/>
        <path d="M0,-8 L0,104 L-14,122" fill="none" stroke="url(#metal)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M0,-8 L0,104 L-14,122" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".4"/>
        <g transform="translate(-16,126) rotate(30)"><rect x="-10" y="-5" width="24" height="16" rx="3" fill="#202128" stroke="#5c5f6a"/><rect x="-6" y="-2" width="14" height="6" rx="1" fill="var(--c3)" opacity=".85"/><path d="M14,0 L24,-4" stroke="url(#metal)" stroke-width="3" stroke-linecap="round"/></g>
      </g>
    </g>
    <g id="spark" opacity="0">
      <g stroke="var(--c3)" stroke-width="2.2" stroke-linecap="round"><path d="M0,-10 L0,-22 M8,-6 L18,-14 M-8,-6 L-18,-14 M10,2 L22,0 M-10,2 L-22,0"/></g>
      <circle r="5" fill="#fff"/>
      <text x="16" y="-18" font-family="system-ui,sans-serif" font-size="13" font-weight="800" font-style="italic" fill="var(--c3)">crackle</text>
    </g>
  </g>
  <!-- mixer -->
  <g id="mixer">
    <path d="M788,422 L972,422 L992,590 L780,590 Z" fill="#191a20" stroke="#3a3c46" stroke-width="1.5"/>
    <path d="M780,590 L992,590 L992,604 L780,604 Z" fill="#0c0d11"/>
    <rect x="852" y="430" width="56" height="18" rx="2" fill="#050608" stroke="#2c2e36"/>
    <text id="bpmText" x="880" y="443" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-size="11" font-weight="700" fill="var(--c2)">--- BPM</text>
    <g id="mixKnobs"></g>
    <g id="vu"></g>
    <rect x="806" y="520" width="6" height="44" rx="3" fill="#050608"/><rect x="948" y="520" width="6" height="44" rx="3" fill="#050608"/>
    <rect id="chA" x="799" y="526" width="20" height="9" rx="2" fill="url(#metal)"/><rect id="chB" x="941" y="526" width="20" height="9" rx="2" fill="url(#metal)"/>
    <rect x="835" y="572" width="96" height="6" rx="3" fill="#050608"/>
    <rect id="xf" x="873" y="567" width="16" height="16" rx="3" fill="url(#metal)"/>
    <text x="882" y="600" text-anchor="middle" font-family="system-ui,sans-serif" font-size="8" font-weight="800" fill="#6b6f7c" letter-spacing="2">PF-2X</text>
  </g>
</g>

<!-- ===== crate ===== -->
<g id="crate">
  <path d="M48,452 L276,452 L276,470 L48,470 Z" fill="#2a1a0e"/>
  <g id="crateRecs"></g>
  <g id="sleeve" style="display:none">
    <g id="sleeveRecWrap"><g id="sleeveRec"><circle r="68" fill="url(#vinyl)"/><circle r="60" fill="none" stroke="#2c2c31"/><circle r="48" fill="none" stroke="#2c2c31"/><image id="sleeveRecLabel" href="" x="-23" y="-23" width="46" height="46" clip-path="url(#clipFlyLabel)" preserveAspectRatio="xMidYMid slice"/></g></g>
    <rect x="-77" y="-77" width="154" height="154" rx="4" fill="#0b0b0e"/>
    <image id="sleeveImg" href="" x="-75" y="-75" width="150" height="150" clip-path="url(#clipSleeve)" preserveAspectRatio="xMidYMid slice"/>
    <rect x="-75" y="-75" width="150" height="150" rx="3" fill="none" stroke="#fff" stroke-opacity=".18"/>
    <path d="M75,-60 L75,60" stroke="#000" stroke-opacity=".5" stroke-width="3"/>
  </g>
  <path d="M20,470 L248,470 L242,652 L26,652 Z" fill="url(#wood)" stroke="#1d1209" stroke-width="2"/>
  <path d="M248,470 L278,452 L272,628 L242,652 Z" fill="url(#woodSide)" stroke="#1d1209" stroke-width="2"/>
  <path d="M22,530 L246,530 M24,592 L244,592" stroke="#24160b" stroke-width="3"/>
  <path d="M22,532 L246,532 M24,594 L244,594" stroke="#7d5636" stroke-width="1" opacity=".5"/>
  <path d="M20,470 L44,470 L44,486 L22,486 Z M248,470 L224,470 L224,486 L248,486 Z M26,652 L48,652 L47,636 L26,636 Z M242,652 L220,652 L221,636 L242,636 Z" fill="#8d8f96" opacity=".75"/>
  <text x="134" y="574" text-anchor="middle" font-family="Impact, 'Roboto Condensed', 'Arial Narrow', sans-serif-condensed, sans-serif" font-weight="900" font-size="30" textLength="196" lengthAdjust="spacingAndGlyphs" fill="#e9a23b" stroke="#3a2410" stroke-width=".6" opacity=".93" transform="rotate(-2 134 574)">PSYCHO FINGERS</text>
  <g transform="translate(134,604) scale(.9)" opacity=".85"><circle r="12" fill="none" stroke="#e9a23b" stroke-width="3"/><circle r="3.5" fill="#e9a23b"/><path d="M-26,0 L-16,0 M16,0 L26,0" stroke="#e9a23b" stroke-width="3"/></g>
</g>

<!-- ===== flying record ===== -->
<g id="fly" style="display:none"><g id="flyScale"><g id="flyRot">
  <circle r="68" fill="url(#vinyl)"/><circle r="60" fill="none" stroke="#2c2c31"/><circle r="50" fill="none" stroke="#2c2c31"/><circle r="40" fill="none" stroke="#2c2c31"/>
  <image id="flyLabel" href="" x="-23" y="-23" width="46" height="46" clip-path="url(#clipFlyLabel)" preserveAspectRatio="xMidYMid slice"/>
  <circle r="68" fill="url(#sheen)"/>
</g></g></g>

<!-- ===== arms (top) ===== -->
<g id="arms">
  <g id="armL"><path class="a-up-o" fill="none" stroke="#111214" stroke-width="54" stroke-linecap="round"/><path class="a-fo-o" fill="none" stroke="#111214" stroke-width="46" stroke-linecap="round"/>
    <path class="a-up" fill="none" stroke="#2e3033" stroke-width="48" stroke-linecap="round"/><path class="a-fo" fill="none" stroke="#2a2c2f" stroke-width="40" stroke-linecap="round"/>
    <path class="a-hi" fill="none" stroke="#4b4e54" stroke-width="5" stroke-linecap="round" opacity=".7"/><path class="a-rim" fill="none" stroke="var(--c1)" stroke-width="3" stroke-linecap="round" opacity=".4"/>
    <g class="hand"><path class="cuff" d="M-16,-19 L2,-19 L2,19 L-16,19 Z" fill="url(#ribs)" stroke="#111214" stroke-width="2"/><use href="#hand" transform="scale(1,-1)"/></g></g>
  <g id="armR"><path class="a-up-o" fill="none" stroke="#111214" stroke-width="54" stroke-linecap="round"/><path class="a-fo-o" fill="none" stroke="#111214" stroke-width="46" stroke-linecap="round"/>
    <path class="a-up" fill="none" stroke="#2e3033" stroke-width="48" stroke-linecap="round"/><path class="a-fo" fill="none" stroke="#2a2c2f" stroke-width="40" stroke-linecap="round"/>
    <path class="a-hi" fill="none" stroke="#4b4e54" stroke-width="5" stroke-linecap="round" opacity=".7"/><path class="a-rim" fill="none" stroke="var(--c2)" stroke-width="3" stroke-linecap="round" opacity=".4"/>
    <g class="hand"><path class="cuff" d="M-16,-19 L2,-19 L2,19 L-16,19 Z" fill="url(#ribs)" stroke="#111214" stroke-width="2"/>
      <g class="o-watch"><rect x="1" y="-17" width="9" height="34" rx="3" fill="#0d0d10"/><circle cx="5.5" cy="0" r="8.5" fill="url(#gold)" stroke="#5c430b" stroke-width="1.2"/><circle cx="5.5" cy="0" r="5.6" fill="#101216"/><path d="M5.5,0 L5.5,-4 M5.5,0 L8.5,1" stroke="#e2b23a" stroke-width="1"/></g>
      <use href="#hand"/></g></g>
</g>
</svg>`;

export function createScene(container) {
  container.insertAdjacentHTML('beforeend', svgMarkup);
  const svg = container.querySelector('svg.scene-svg');
  const $ = (id) => svg.getElementById ? svg.getElementById(id) : svg.querySelector('#' + id);
  const el = {
    body: $('body'), head: $('head'), eyes: $('eyes'), dj: $('dj'), rimL: $('rimL'), rimR: $('rimR'),
    platterRec: $('platterRec'), platterRot: $('platterRot'), labelImg: $('labelImg'), strobe: $('strobe'),
    tonearm: $('tonearm'), armLift: $('armLift'), needleShadow: $('needleShadow'), spark: $('spark'),
    sleeve: $('sleeve'), sleeveImg: $('sleeveImg'), sleeveRecWrap: $('sleeveRecWrap'), sleeveRecLabel: $('sleeveRecLabel'),
    fly: $('fly'), flyScale: $('flyScale'), flyRot: $('flyRot'), flyLabel: $('flyLabel'),
    led: $('ledStrip'), ledGlow: $('ledGlow'), startBtn: $('startBtn'), targetLight: $('targetLight'),
    neonCore: svg.querySelectorAll('.neonCore,.neonCore2'), neonGlow: svg.querySelectorAll('.neonGlow,.neonGlow2'),
    ringBars: $('ringBars'), bpmText: $('bpmText'), xf: $('xf'), chA: $('chA'), chB: $('chB'), pitchCap: $('pitchCap'),
    mixKnobs: $('mixKnobs'), vu: $('vu'), crateRecs: $('crateRecs'),
    arms: { L: $('armL'), R: $('armR') }, neonStrips: svg.querySelector('.neon-strips'),
  };
  const setHref = (img, url) => { img.setAttribute('href', url || ''); };

  // crate records (spines)
  const crateCols = ['#ff2bd6', '#22e3ff', '#ffc531', '#7a5cff', '#ff7a3d', '#2de3c4', '#e23b6a', '#3a86ff', '#ffd166', '#9b5de5'];
  crateCols.forEach((c, i) => {
    const x = 52 + i * 21, tilt = -6 + (i % 3) * 2, top = 388 + (i % 4) * 5;
    const g = document.createElementNS(NS, 'g'); g.setAttribute('transform', `rotate(${tilt} ${x + 9} 470)`);
    g.innerHTML = `<rect x="${x}" y="${top}" width="19" height="${92 - (i % 4) * 5}" rx="2" fill="#15151a" stroke="#000"/><rect x="${x + 2}" y="${top + 2}" width="15" height="${88 - (i % 4) * 5}" rx="1" fill="${c}" opacity=".85"/><rect x="${x + 2}" y="${top + 2}" width="4" height="${88 - (i % 4) * 5}" fill="#fff" opacity=".18"/>`;
    el.crateRecs.appendChild(g);
  });
  // mixer knobs + vu
  const knobs = [];
  [[826, 462], [826, 486], [826, 508], [934, 462], [934, 486], [934, 508]].forEach(([x, y]) => {
    const g = document.createElementNS(NS, 'g'); g.setAttribute('transform', `translate(${x},${y})`);
    g.innerHTML = `<circle r="8" fill="#0c0d10" stroke="#3a3d47"/><g class="kr"><circle r="6" fill="#2a2c33"/><path d="M0,0 L0,-6" stroke="var(--c3)" stroke-width="2" stroke-linecap="round"/></g>`;
    el.mixKnobs.appendChild(g); knobs.push(g.querySelector('.kr'));
  });
  const vuCells = [[], []];
  for (let ch = 0; ch < 2; ch++) for (let i = 0; i < 12; i++) {
    const r = document.createElementNS(NS, 'rect');
    const x = ch ? 898 : 856, y = 548 - i * 7.6;
    r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', 6); r.setAttribute('height', 5.6); r.setAttribute('rx', 1);
    r.setAttribute('fill', i > 9 ? '#ff3b5c' : i > 6 ? '#ffc531' : '#22e39a'); r.setAttribute('opacity', '.12');
    el.vu.appendChild(r); vuCells[ch].push(r);
  }
  for (let ch = 0; ch < 2; ch++) { const t = document.createElementNS(NS, 'text'); t.setAttribute('x', ch ? 901 : 859); t.setAttribute('y', 566); t.setAttribute('font-size', 7); t.setAttribute('fill', '#6b6f7c'); t.setAttribute('text-anchor', 'middle'); t.setAttribute('font-family', 'system-ui'); t.textContent = ch ? 'B' : 'A'; el.vu.appendChild(t); }
  // spectrum bars around the deck
  const BARS = 72, bars = [];
  for (let i = 0; i < BARS; i++) {
    const a = (i / BARS) * Math.PI * 2; const l = document.createElementNS(NS, 'line');
    l.setAttribute('stroke', i % 2 ? 'var(--c2)' : 'var(--c1)'); l.setAttribute('stroke-width', '3'); l.setAttribute('stroke-linecap', 'round');
    el.ringBars.appendChild(l); bars.push({ l, c: Math.cos(a), s: Math.sin(a) });
  }

  // ---------------- state ----------------
  const st = {
    arm: G.arm.rest, lift: 1, spin: 0, spinTarget: 0, rot: 0, rate: 1, platterVisible: false,
    sleeve: { x: G.crate.x, y: G.crate.y, rot: 0, slide: 0, show: false, rec: true },
    fly: { x: 0, y: 0, sx: 1, sy: 1, o: 0, show: false, rot: 0 },
    hands: {
      L: { x: 430, y: 470, vx: 0, vy: 0, tx: 430, ty: 470, mode: 'idle', follow: null, grip: 0 },
      R: { x: 830, y: 470, vx: 0, vy: 0, tx: 830, ty: 470, mode: 'idle', follow: null, grip: 0 },
    },
    nod: 0, nodV: 0, bounce: 0, blink: 0, nextBlink: 2, pose: 0, poseBeat: 0, beats: 0,
    spark: 0, xf: 0.5, progress: 0, busy: false, energy: 0,
  };
  const tweens = new Set();
  function tween(obj, to, dur, fn = ease.io) {
    return new Promise((resolve) => {
      if (dur <= 0) { Object.assign(obj, to); resolve(); return; }
      const from = {}; for (const k in to) from[k] = obj[k];
      tweens.add({ obj, from, to, dur, t: 0, fn, resolve });
    });
  }
  const wait = (s) => tween({ v: 0 }, { v: 1 }, s, ease.lin);

  function armTip(angle = st.arm, lift = st.lift) {
    const a = angle * D2R; const L = G.arm.len - 2;
    // headshell tip (after the small bend)
    const x = G.arm.x - Math.sin(a) * L - Math.cos(a) * 18, y = G.arm.y + Math.cos(a) * L - Math.sin(a) * 18 - lift * 8;
    return { x, y };
  }
  function moveHand(side, x, y, dur, fn) {
    const h = st.hands[side]; const p = { x: h.x, y: h.y }; h.mode = 'anim'; h.follow = () => p; h.vx = h.vy = 0;
    return tween(p, { x, y }, dur, fn);
  }
  function follow(side, f) { const h = st.hands[side]; h.mode = 'anim'; h.follow = f; }
  function release(side) { const h = st.hands[side]; h.mode = 'idle'; h.follow = null; }

  const recEdgeR = () => ({ x: st.fly.x + G.fly * st.fly.sx - 14, y: st.fly.y - 4 });

  // ---------------- choreography ----------------
  let gen = 0;
  function sparkle() { st.spark = 1; }

  async function lift(speed, sounds) {
    if (!st.platterVisible) return;
    await moveHand('R', armTip().x - 6, armTip().y - 14, .26 / speed);
    follow('R', () => { const t = armTip(); return { x: t.x - 6, y: t.y - 14 }; });
    await tween(st, { lift: 1 }, .1 / speed); sounds && sounds.click && sounds.click();
    await tween(st, { arm: G.arm.rest }, .3 / speed);
    st.spinTarget = 0;
    await moveHand('R', G.platter.x + G.platter.r - 16, G.platter.y - 4, .2 / speed);
    // record leaves the platter
    st.platterVisible = false;
    Object.assign(st.fly, { x: G.platter.x, y: G.platter.y, sx: G.platter.r / G.fly, sy: G.platter.r * G.platter.k / G.fly, o: 1, show: true });
    setHref(el.flyLabel, el.labelImg.getAttribute('href'));
    follow('R', recEdgeR);
    await tween(st.fly, { x: 905, y: 330, sx: 1, sy: 1 }, .42 / speed, ease.io);
    tween(st.fly, { o: 0 }, .18 / speed).then(() => { st.fly.show = false; });
    release('R');
  }
  async function pull(speed, coverUrl, labelUrl) {
    setHref(el.sleeveImg, coverUrl); setHref(el.sleeveRecLabel, labelUrl);
    Object.assign(st.sleeve, { x: G.crate.x, y: G.crate.y, rot: 0, slide: 0, show: true, rec: true });
    await moveHand('L', G.crate.x - 4, G.crate.y - 70, .32 / speed);
    follow('L', () => ({ x: st.sleeve.x - 4, y: st.sleeve.y - 70 }));
    st.hands.L.grip = 1;
    await tween(st.sleeve, { x: G.sleeveUp.x, y: G.sleeveUp.y, rot: -5 }, .42 / speed, ease.out);
  }
  async function slide(speed) {
    await moveHand('R', st.sleeve.x + 70, st.sleeve.y + 4, .26 / speed);
    follow('R', () => ({ x: st.sleeve.x + 64 + st.sleeve.slide, y: st.sleeve.y + 4 }));
    st.hands.R.grip = 1;
    await tween(st.sleeve, { slide: 118 }, .38 / speed, ease.io);
  }
  async function carry(speed, labelUrl) {
    Object.assign(st.fly, { x: st.sleeve.x + st.sleeve.slide, y: st.sleeve.y, sx: 1, sy: 1, o: 1, show: true });
    setHref(el.flyLabel, labelUrl); st.sleeve.rec = false;
    follow('R', recEdgeR);
    const back = (async () => {
      await tween(st.sleeve, { x: G.crate.x, y: G.crate.y, rot: 0 }, .46 / speed, ease.io);
      st.sleeve.show = false; st.hands.L.grip = 0; release('L');
    })();
    await tween(st.fly, { x: G.platter.x, y: G.platter.y, sx: G.platter.r / G.fly, sy: G.platter.r * G.platter.k / G.fly }, .5 / speed, ease.io);
    setHref(el.labelImg, labelUrl);
    st.platterVisible = true; st.fly.show = false; st.hands.R.grip = 0;
    await back;
  }
  async function drop(speed, onDrop, sounds) {
    const t0 = armTip();
    await moveHand('R', t0.x - 6, t0.y - 14, .22 / speed);
    follow('R', () => { const t = armTip(); return { x: t.x - 6, y: t.y - 14 }; });
    await tween(st, { arm: G.arm.play0 + st.progress * (G.arm.play1 - G.arm.play0) }, .32 / speed);
    await tween(st, { lift: 0 }, .14 / speed, ease.in);
    sparkle();
    st.spinTarget = 1;
    if (onDrop) onDrop();
    await wait(.12);
    release('R');
  }

  /** Full load: [lift old || pull new] → slide → carry → drop. */
  async function loadRecord({ cover, label, speed = 1, onDrop, sounds, preDrop } = {}) {
    const my = ++gen; st.busy = true;
    try {
      if (speed >= 50) { // instant (animation off)
        setHref(el.labelImg, label); st.platterVisible = true; st.arm = G.arm.play0; st.lift = 0; st.spinTarget = 1;
        onDrop && onDrop(); return;
      }
      await Promise.all([lift(speed, sounds), pull(speed, cover, label)]);
      if (my !== gen) return;
      await slide(speed); if (my !== gen) return;
      if (preDrop) await preDrop();
      await carry(speed, label); if (my !== gen) return;
      await drop(speed, onDrop, sounds);
    } finally { if (my === gen) st.busy = false; }
  }
  /** Two-phase load for crossfades: prepare() pulls the sleeve and readies the record (old one keeps spinning);
   *  commit() lifts the old record, places the new one and drops the needle. */
  function prepareRecord({ cover, label, speed = 1 }) {
    const my = ++gen; st.busy = true;
    const ready = (async () => { await pull(speed, cover, label); if (my === gen) await slide(speed); })();
    return {
      ready,
      async commit({ onLift, onDrop, sounds }) {
        await ready; if (my !== gen) return;
        onLift && onLift();
        // lift old record with the right hand while the left holds the new one
        const L = st.hands.L; const hold = { x: st.sleeve.x + st.sleeve.slide, y: st.sleeve.y };
        Object.assign(st.fly, { x: hold.x, y: hold.y, sx: 1, sy: 1, o: 1, show: false });
        await lift(speed, sounds); if (my !== gen) return;
        // right hand comes back for the new record
        await moveHand('R', st.sleeve.x + 64 + st.sleeve.slide, st.sleeve.y + 4, .22 / speed);
        await carry(speed, label); if (my !== gen) return;
        await drop(speed, onDrop, sounds);
        if (my === gen) st.busy = false;
        void L;
      },
    };
  }
  async function needleRedrop(speed = 1, onDrop, sounds) {
    const my = ++gen; st.busy = true;
    await moveHand('R', armTip().x - 6, armTip().y - 14, .2 / speed);
    follow('R', () => { const t = armTip(); return { x: t.x - 6, y: t.y - 14 }; });
    await tween(st, { lift: 1 }, .12); sounds && sounds.click && sounds.click();
    await tween(st, { arm: G.arm.play0 }, .25 / speed);
    await tween(st, { lift: 0 }, .12, ease.in); sparkle(); onDrop && onDrop();
    release('R'); if (my === gen) st.busy = false;
  }
  function cancel() { gen++; tweens.forEach((t) => { Object.assign(t.obj, t.to); t.resolve(); }); tweens.clear(); release('L'); release('R'); st.busy = false; st.sleeve.show = false; st.fly.show = false; }

  // ---------------- IK + render ----------------
  function ik(S, T, side) {
    const L1 = G.upper, L2 = G.fore;
    let dx = T.x - S.x, dy = T.y - S.y; let d = Math.hypot(dx, dy);
    const maxD = L1 + L2 - 2;
    if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; }
    d = Math.max(d, 40);
    const a = Math.atan2(dy, dx);
    const b = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
    const ea = side === 'L' ? a + b : a - b;
    const E = { x: S.x + Math.cos(ea) * L1, y: S.y + Math.sin(ea) * L1 };
    const W = { x: S.x + dx, y: S.y + dy };
    return { E, W };
  }
  const f1 = (n) => n.toFixed(1);
  function drawArm(side, bodyDy) {
    const h = st.hands[side]; const S = { x: G.sh[side].x, y: G.sh[side].y + bodyDy };
    const { E, W } = ik(S, h, side);
    const g = el.arms[side];
    const ang = Math.atan2(W.y - E.y, W.x - E.x);
    // forearm ends a bit before the wrist so the cuff shows
    const Wc = { x: W.x - Math.cos(ang) * 14, y: W.y - Math.sin(ang) * 14 };
    const up = `M${f1(S.x)},${f1(S.y)} L${f1(E.x)},${f1(E.y)}`;
    const fo = `M${f1(E.x)},${f1(E.y)} L${f1(Wc.x)},${f1(Wc.y)}`;
    g._p = g._p || { uo: g.querySelector('.a-up-o'), fo_: g.querySelector('.a-fo-o'), u: g.querySelector('.a-up'), f: g.querySelector('.a-fo'), hi: g.querySelector('.a-hi'), rim: g.querySelector('.a-rim'), hand: g.querySelector('.hand') };
    const p = g._p;
    p.uo.setAttribute('d', up); p.u.setAttribute('d', up); p.fo_.setAttribute('d', fo); p.f.setAttribute('d', fo);
    const nx = side === 'L' ? -1 : 1;
    const ua = Math.atan2(E.y - S.y, E.x - S.x);
    const off = (a, k) => ({ x: Math.cos(a - Math.PI / 2 * nx) * k, y: Math.sin(a - Math.PI / 2 * nx) * k });
    const o1 = off(ua, 14), o2 = off(ang, 12);
    p.hi.setAttribute('d', `M${f1(S.x + o1.x)},${f1(S.y + o1.y)} L${f1(E.x + o1.x)},${f1(E.y + o1.y)} L${f1(Wc.x + o2.x)},${f1(Wc.y + o2.y)}`);
    const r1 = off(ua, -21), r2 = off(ang, -18);
    p.rim.setAttribute('d', `M${f1(S.x + r1.x)},${f1(S.y + r1.y)} L${f1(E.x + r1.x)},${f1(E.y + r1.y)} L${f1(Wc.x + r2.x)},${f1(Wc.y + r2.y)}`);
    p.hand.setAttribute('transform', `translate(${f1(W.x)},${f1(W.y)}) rotate(${f1(ang / D2R)})`);
  }

  let last = performance.now();
  const IDLE = {
    // [L target, R target]
    0: (t, p) => [{ x: 418 + Math.sin(t * 2) * 6, y: 486 + p * 6 }, { x: 828 + Math.cos(t * 3) * 5, y: 480 + p * 8 }],
    1: (t, p) => [{ x: 300, y: 150 + (1 - p) * 26 }, { x: 830 + Math.sin(t * 2.4) * 8, y: 486 + p * 8 }],
    2: (t, p) => [{ x: 420 + Math.sin(t * 6) * 10 * p, y: 490 }, { x: 880 + Math.sin(t * .9) * 22, y: 562 + p * 4 }],
    3: (t, p) => [{ x: 418, y: 486 + p * 5 }, { x: 640, y: 150 + (1 - p) * 26 }],
    rest: (t) => [{ x: 420, y: 500 + Math.sin(t * 1.2) * 3 }, { x: 836, y: 500 + Math.cos(t * 1.1) * 3 }],
  };

  function frame(now, a = {}) {
    let dt = Math.min(.05, (now - last) / 1000); last = now;
    // tweens
    for (const tw of tweens) {
      tw.t += dt; const k = Math.min(1, tw.t / tw.dur); const e = tw.fn(k);
      for (const key in tw.to) tw.obj[key] = tw.from[key] + (tw.to[key] - tw.from[key]) * e;
      if (k >= 1) { tweens.delete(tw); tw.resolve(); }
    }
    const t = now / 1000; const pulse = a.pulse || 0; const playing = !!a.playing;
    if (a.beat) { st.beats++; st.nodV += 2.6 + pulse * 1.5; }
    // pose cycle every 16 beats
    if (playing && st.beats - st.poseBeat >= 16) { st.poseBeat = st.beats; st.pose = (st.pose + 1 + (Math.random() < .35 ? 1 : 0)) % 4; }
    // spin
    const spinRate = st.spinTarget > st.spin ? 1.8 : 1.1;
    st.spin += (st.spinTarget - st.spin) * Math.min(1, dt * spinRate * 2.2);
    if (Math.abs(st.spinTarget - st.spin) < .002) st.spin = st.spinTarget;
    st.rot = (st.rot + dt * 200 * st.spin * (st.rate || 1)) % 360;
    // head nod (damped spring)
    st.nodV += (-st.nod * 60 - st.nodV * 9) * dt; st.nod += st.nodV * dt * 6;
    const nod = Math.max(-3, Math.min(12, st.nod)) + (playing ? 0 : Math.sin(t * 1.3) * .8);
    st.bounce = playing ? pulse * 5 : Math.sin(t * 1.3) * 1.2;
    // blink
    st.nextBlink -= dt; if (st.nextBlink < 0) { st.blink = .14; st.nextBlink = 2.5 + Math.random() * 3.5; }
    if (st.blink > 0) st.blink -= dt;
    el.eyes.setAttribute('transform', st.blink > 0 ? 'translate(0,2) scale(1,.15) translate(0,-2)' : '');
    el.body.setAttribute('transform', `translate(0,${f1(st.bounce)})`);
    el.head.setAttribute('transform', `translate(0,${f1(st.bounce + nod * .55)}) rotate(${f1(nod)} 470 262)`);
    // hands
    const pose = playing && !st.busy ? IDLE[st.pose](t, pulse) : IDLE.rest(t);
    ['L', 'R'].forEach((s, i) => {
      const h = st.hands[s];
      if (h.mode === 'anim' && h.follow) { const p = h.follow(); h.x = p.x; h.y = p.y; h.vx = h.vy = 0; }
      else { const T = pose[i]; const k = 70, c = 15; h.vx += ((T.x - h.x) * k - h.vx * c) * dt; h.vy += ((T.y - h.y) * k - h.vy * c) * dt; h.x += h.vx * dt; h.y += h.vy * dt; }
      drawArm(s, st.bounce);
    });
    // platter + record
    el.platterRec.style.display = st.platterVisible ? '' : 'none';
    el.platterRot.setAttribute('transform', `rotate(${f1(st.rot)})`);
    el.strobe.setAttribute('transform', `translate(545,500) scale(1,0.37) rotate(${f1(st.rot * .25)})`);
    // tonearm
    if (playing && !st.busy && st.lift === 0) st.arm = G.arm.play0 + st.progress * (G.arm.play1 - G.arm.play0);
    el.tonearm.setAttribute('transform', `translate(${G.arm.x},${G.arm.y}) rotate(${f1(st.arm)})`);
    el.armLift.setAttribute('transform', `translate(0,${f1(-st.lift * 8)})`);
    const tip = armTip(st.arm, 0);
    el.needleShadow.setAttribute('cx', f1(tip.x + 4)); el.needleShadow.setAttribute('cy', f1(tip.y + 6));
    el.needleShadow.setAttribute('opacity', (0.15 + (1 - st.lift) * .3).toFixed(2));
    if (st.spark > 0) { st.spark = Math.max(0, st.spark - dt * 1.1); }
    el.spark.setAttribute('opacity', st.spark.toFixed(2));
    el.spark.setAttribute('transform', `translate(${f1(tip.x - 4)},${f1(tip.y)}) scale(${(0.8 + (1 - st.spark) * .5).toFixed(2)})`);
    // sleeve
    el.sleeve.style.display = st.sleeve.show ? '' : 'none';
    if (st.sleeve.show) {
      el.sleeve.setAttribute('transform', `translate(${f1(st.sleeve.x)},${f1(st.sleeve.y)}) rotate(${f1(st.sleeve.rot)})`);
      el.sleeveRecWrap.style.display = st.sleeve.rec ? '' : 'none';
      el.sleeveRecWrap.setAttribute('transform', `translate(${f1(st.sleeve.slide)},0) rotate(${f1(st.sleeve.slide * 1.5)})`);
    }
    // fly record
    el.fly.style.display = st.fly.show ? '' : 'none';
    if (st.fly.show) {
      el.fly.setAttribute('transform', `translate(${f1(st.fly.x)},${f1(st.fly.y)})`);
      el.fly.setAttribute('opacity', st.fly.o.toFixed(2));
      el.flyScale.setAttribute('transform', `scale(${st.fly.sx.toFixed(3)},${st.fly.sy.toFixed(3)})`);
    }
    // lights
    const bass = a.bass || 0, lvl = a.level || 0;
    st.energy += ((playing ? lvl : 0) - st.energy) * Math.min(1, dt * 8);
    el.led.setAttribute('opacity', (0.35 + pulse * .65).toFixed(2));
    el.ledGlow.setAttribute('opacity', (0.04 + pulse * .2).toFixed(2));
    el.startBtn.setAttribute('opacity', st.spinTarget ? '.95' : '.25');
    el.targetLight.setAttribute('opacity', st.spinTarget ? '.9' : '.4');
    const ne = 0.55 + bass * .45 + pulse * .3;
    el.neonCore.forEach((n) => n.setAttribute('opacity', Math.min(1, ne).toFixed(2)));
    el.neonGlow.forEach((n, i) => n.setAttribute('opacity', ((i % 2 ? .1 : .06) + (bass * .2 + pulse * .25)).toFixed(2)));
    el.rimL.setAttribute('opacity', (0.25 + pulse * .5).toFixed(2)); el.rimR.setAttribute('opacity', (0.25 + (a.high || 0) * .6).toFixed(2));
    el.arms.L._p && el.arms.L._p.rim.setAttribute('opacity', (0.2 + pulse * .5).toFixed(2));
    el.arms.R._p && el.arms.R._p.rim.setAttribute('opacity', (0.2 + (a.high || 0) * .6).toFixed(2));
    // deck spectrum ring
    const spec = a.spectrum;
    for (let i = 0; i < BARS; i++) {
      const b = bars[i]; const v = spec ? spec[(i < BARS / 2 ? i : BARS - 1 - i) % spec.length] : 0;
      const r0 = 206, r1 = r0 + 4 + v * 46;
      b.l.setAttribute('x1', f1(b.c * r0)); b.l.setAttribute('y1', f1(b.s * r0 * .38));
      b.l.setAttribute('x2', f1(b.c * r1)); b.l.setAttribute('y2', f1(b.s * r1 * .38));
      b.l.setAttribute('opacity', (0.15 + v * .85).toFixed(2));
    }
    // mixer
    const vA = playing ? Math.min(1, lvl * 1.25 + pulse * .2) : 0, vB = playing ? Math.min(1, (a.mid || 0) * 1.1 + pulse * .15) : 0;
    for (let ch = 0; ch < 2; ch++) { const v = ch ? vB : vA; vuCells[ch].forEach((c, i) => c.setAttribute('opacity', i / 12 < v ? '1' : '.12')); }
    el.xf.setAttribute('x', f1(835 + st.xf * 80));
    knobs.forEach((k, i) => k.setAttribute('transform', `rotate(${f1(-40 + i * 17 + Math.sin(t * (0.6 + i * .21) + i) * (playing ? 26 : 4))})`));
    if (el.neonStrips && el.neonStrips.style.display !== 'none') el.neonStrips.setAttribute('opacity', (0.55 + pulse * .45).toFixed(2));
    if (a.bpm !== st._bpm) { st._bpm = a.bpm; el.bpmText.textContent = a.bpm ? `${Math.round(a.bpm)} BPM` : '--- BPM'; }
  }

  function anchors() {
    const m = svg.getScreenCTM(); if (!m) return null;
    const P = (x, y) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
    return { ring: P(620, 175), ringR: 160 * m.a, deck: P(545, 500), crowdTop: P(0, 250).y, crowdBottom: P(0, 430).y, booth: P(0, 410).y, scale: m.a, left: P(0, 0).x, right: P(1000, 0).x, head: P(470, 175) };
  }

  return {
    svg, st, frame, anchors, loadRecord, prepareRecord, needleRedrop, cancel, tween,
    setLabel(url) { setHref(el.labelImg, url); },
    setOutfit(id) { return applyOutfit(svg, id); },
    setXfader(v) { st.xf = v; },
    setProgress(p) { st.progress = Math.max(0, Math.min(1, p || 0)); },
    setPlaying(on) { st.spinTarget = on && st.platterVisible && st.lift === 0 ? 1 : 0; },
    get busy() { return st.busy; },
  };
}
