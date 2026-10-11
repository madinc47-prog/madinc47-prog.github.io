// Psycho Fingers Player — DJ booth scene (original layered SVG art, IK arms, choreography)
// Two turntables (Deck A / Deck B) with a mixer + crossfader in the middle; the DJ stands behind the mixer.
import { applyOutfit } from './outfits.js?v=30';
const NS = 'http://www.w3.org/2000/svg';
const D2R = Math.PI / 180;
const ease = {
  io: (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  lin: (t) => t,
};

// key geometry (viewBox 0 0 1000 660). Turntable art is drawn in deck-local units and scaled by DS.
const DS = 0.64;
const DECKS = { A: { tx: 58, ty: 214.7 }, B: { tx: 438, ty: 214.7 } };
const DJX = 130; // the DJ is centred behind the mixer (x = 600)
const G = {
  platter: { x: 545, y: 498, r: 168, k: 0.37 },
  arm: { x: 742, y: 440, len: 130, rest: -8, play0: 40, play1: 55 },
  sh: { L: { x: 352, y: 300 }, R: { x: 588, y: 300 } },
  upper: 150, fore: 152,
  crate: { x: 140, y: 474 },
  sleeveUp: { x: 182, y: 300 },
  fly: 68,
  xf: { x0: 572, x1: 628, y: 592 },
};
const deckSvg = (d) => `<g id="deck${d}" class="deck" transform="translate(${DECKS[d].tx},${DECKS[d].ty}) scale(${DS})">
    <path d="M352,418 L748,418 L772,586 L328,586 Z" fill="url(#plinth)" stroke="#3a3c46" stroke-width="1.5"/>
    <path d="M328,586 L772,586 L772,602 L328,602 Z" fill="#0d0e12"/>
    <path d="M330,586 L770,586" stroke="#4a4d58" stroke-width="1"/>
    <g class="t-hw" transform="rotate(180 545 500)"><!-- deck hardware faces the DJ behind the booth: start/stop at his front-left, pitch fader on his right, tonearm at the back right (from the crowd: near-left) -->
    <rect x="352" y="560" width="34" height="14" rx="3" fill="#22242b" stroke="#454854"/>
    <rect class="t-startBtn" x="355" y="563" width="28" height="8" rx="2" fill="var(--c2)" opacity=".25"/>
    <circle cx="400" cy="567" r="4" fill="#3a3d47"/><circle cx="414" cy="567" r="4" fill="#3a3d47"/>
    <rect x="722" y="470" width="10" height="92" rx="4" fill="#0c0d10" stroke="#3a3d47"/>
    <rect class="t-pitchCap" x="715" y="508" width="24" height="12" rx="2" fill="url(#metal)"/>
    <circle cx="372" cy="436" r="8" fill="#1b1c22" stroke="#4a4d58"/><circle class="t-targetLight" cx="372" cy="436" r="3" fill="var(--c3)" opacity=".5"/>
    </g>
    <g class="t-neon" transform="translate(545,511)"><!-- deck light ring sits UNDER the platter lip and spills toward the front (it used to peek out at the back = upside down) -->
      <ellipse rx="190" ry="72" fill="none" stroke="var(--c1)" stroke-width="14" opacity=".08" class="neonGlow"/>
      <ellipse rx="190" ry="72" fill="none" stroke="var(--c1)" stroke-width="7" opacity=".18" class="neonGlow"/>
      <ellipse rx="190" ry="72" fill="none" stroke="var(--c1)" stroke-width="2.4" opacity=".95" class="neonCore"/>
      <ellipse rx="198" ry="76" fill="none" stroke="var(--c2)" stroke-width="6" opacity=".12" class="neonGlow2"/>
      <ellipse rx="198" ry="76" fill="none" stroke="var(--c2)" stroke-width="1.6" opacity=".8" class="neonCore2"/>
    </g>
    <g class="t-ringBars" transform="translate(545,500)"></g>
    <ellipse cx="545" cy="506" rx="180" ry="67" fill="#0b0b0e"/>
    <ellipse cx="545" cy="502" rx="180" ry="67" fill="url(#metal)" opacity=".8"/>
    <ellipse cx="545" cy="500" rx="176" ry="65" fill="#1a1b20"/>
    <g class="t-strobe" transform="translate(545,500) scale(1,0.37)"><circle r="174" fill="none" stroke="#8d919b" stroke-width="4" stroke-dasharray="2 7"/></g>
    <g transform="translate(545,498) scale(1,0.37)">
      <g class="t-platterRec">
        <circle r="168" fill="url(#vinyl)"/>
        <g fill="none" stroke="#2c2c31" stroke-width="1.2"><circle r="160"/><circle r="148"/><circle r="136"/><circle r="122"/><circle r="110"/><circle r="96"/><circle r="84"/><circle r="72"/></g>
        <circle r="150" fill="none" stroke="#0a0a0c" stroke-width="3"/><circle r="104" fill="none" stroke="#0a0a0c" stroke-width="2.5"/>
        <g class="t-platterRot">
          <image class="t-labelImg" href="" x="-56" y="-56" width="112" height="112" clip-path="url(#clipLabel)" preserveAspectRatio="xMidYMid slice"/>
          <circle r="56" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="2"/>
          <rect x="-3" y="-54" width="6" height="16" rx="2" fill="#fff" opacity=".55"/>
          <path d="M-160,0 A160 160 0 0 1 -150,-55" stroke="#55565e" stroke-width="3" fill="none" opacity=".7"/>
          <path d="M150,55 A160 160 0 0 1 120,105" stroke="#55565e" stroke-width="3" fill="none" opacity=".5"/>
        </g>
        <circle r="168" fill="url(#sheen)"/>
      </g>
      <circle r="5" fill="url(#metal)"/>
    </g>
    <!-- tonearm (turned with the hardware, see .t-hw) -->
    <g class="t-hw2" transform="translate(20,-8) rotate(180 545 500)">
    <circle cx="742" cy="440" r="22" fill="#1f2026" stroke="#4a4d58" stroke-width="2"/>
    <circle cx="742" cy="440" r="14" fill="url(#metal)"/>
    <ellipse class="t-needleShadow" cx="0" cy="0" rx="10" ry="4" fill="#000" opacity=".4"/>
    <g class="t-tonearm">
      <g class="t-armLift">
        <rect x="-7" y="-36" width="14" height="22" rx="4" fill="url(#metal)"/>
        <path d="M0,-8 L0,104 L-14,122" fill="none" stroke="url(#metal)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M0,-8 L0,104 L-14,122" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".4"/>
        <g transform="translate(-16,126) rotate(30)"><rect x="-10" y="-5" width="24" height="16" rx="3" fill="#202128" stroke="#5c5f6a"/><rect x="-6" y="-2" width="14" height="6" rx="1" fill="var(--c3)" opacity=".85"/><path d="M14,0 L24,-4" stroke="url(#metal)" stroke-width="3" stroke-linecap="round"/></g>
      </g>
    </g>
    </g>
    <text class="deck-letter" x="550" y="598" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="900" font-size="14" letter-spacing="4" fill="#4a4d58">DECK ${d}</text>
  </g>`;

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
<g id="dj" transform="translate(130,0)">
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
      <g id="cupL" transform="translate(424,292) rotate(-24)"><ellipse class="o-ph-cup" rx="25" ry="29" fill="#111215" stroke="#3b3d44" stroke-width="3"/><ellipse class="o-ph-in" rx="15" ry="18" fill="#1d1f24"/><ellipse class="o-ph-hub" rx="6" ry="7" fill="#2c2e35"/><path d="M-20,-10 A24 28 0 0 1 4,-27" stroke="#6d717c" stroke-width="2" fill="none" opacity=".6"/></g>
      <g id="cupR" transform="translate(516,292) rotate(24)"><ellipse class="o-ph-cup" rx="25" ry="29" fill="#111215" stroke="#3b3d44" stroke-width="3"/><ellipse class="o-ph-in" rx="15" ry="18" fill="#1d1f24"/><ellipse class="o-ph-hub" rx="6" ry="7" fill="#2c2e35"/><path d="M20,-10 A24 28 0 0 0 -4,-27" stroke="#6d717c" stroke-width="2" fill="none" opacity=".6"/></g>
    </g>
  </g>
  <g id="head">
    <g transform="translate(470,175)">
      <g class="dj-v dj-psycho">
      <ellipse cx="-57" cy="4" rx="9" ry="15" fill="#4a2c19"/><ellipse cx="57" cy="4" rx="9" ry="15" fill="#4a2c19"/>
      <path d="M0,-75 C35,-75 58,-50 58,-10 C58,25 50,52 30,66 C18,74 -18,74 -30,66 C-50,52 -58,25 -58,-10 C-58,-50 -35,-75 0,-75Z" fill="url(#skin)"/>
      <path d="M-59,-32 C-61,-18 -60,-6 -57,2 L-50,4 C-52,-8 -52,-20 -49,-32Z M59,-32 C61,-18 60,-6 57,2 L50,4 C52,-8 52,-20 49,-32Z" fill="#110b09"/>
      <g class="stockface"><!-- drawn face: hidden under a user face photo -->
      <ellipse cx="-30" cy="14" rx="10" ry="6" fill="#8a5a3d" opacity=".18"/><ellipse cx="30" cy="14" rx="10" ry="6" fill="#8a5a3d" opacity=".18"/>
      <path d="M-58,-2 C-57,30 -48,60 -28,74 C-14,84 14,84 28,74 C48,60 57,30 58,-2 C52,10 46,22 34,27 C22,31 -22,31 -34,27 C-46,22 -52,10 -58,-2Z" fill="#141010"/>
      <path d="M-58,-2 C-52,10 -46,22 -34,27 C-28,29 -24,30 -20,30" fill="none" stroke="#2a1d17" stroke-width="2" opacity=".6"/>
      <path d="M-24,36 C-14,29 -5,30 0,32 C5,30 14,29 24,36 C16,35 8,36 0,37 C-8,36 -16,35 -24,36Z" fill="#0d0a0a"/>
      <path d="M-13,43 C-6,40 6,40 13,43 C7,45 -7,45 -13,43Z" fill="#2c1713"/>
      <ellipse id="mouthOpen" cx="0" cy="44.5" rx="9" ry="0" fill="#1a0705"/><path id="mouthTeeth" d="M-7,42.6 C-3,41.4 3,41.4 7,42.6 L6,44 C2,43.4 -2,43.4 -6,44Z" fill="#efe6da" opacity="0"/>
      <path id="lipLow" d="M-11,44 C-5,50 5,50 11,44 C6,46 -6,46 -11,44Z" fill="#5a3127"/>
      <path d="M-6,4 C-8,12 -12,18 -12,22 C-10,26 -4,26 0,26 C4,26 10,26 12,22 C12,18 8,12 6,4" fill="#4c2d1a" opacity=".55"/>
      <ellipse cx="-8" cy="23" rx="4.2" ry="2.4" fill="#1d0f08"/><ellipse cx="8" cy="23" rx="4.2" ry="2.4" fill="#1d0f08"/>
      <ellipse cx="0" cy="16" rx="5" ry="3" fill="#8a5a3d" opacity=".35"/>
      <g id="eyes">
        <ellipse cx="-22" cy="2" rx="9" ry="4.2" fill="#e9e1d6"/><ellipse cx="22" cy="2" rx="9" ry="4.2" fill="#e9e1d6"/>
        <circle class="pupil" cx="-21" cy="3.4" r="3.9" fill="#1b0f09"/><circle class="pupil" cx="23" cy="3.4" r="3.9" fill="#1b0f09"/>
        <path d="M-32,1 C-26,-4 -18,-4 -12,0 L-12,1.6 C-18,-1.2 -26,-1.2 -32,2.4Z M32,1 C26,-4 18,-4 12,0 L12,1.6 C18,-1.2 26,-1.2 32,2.4Z" fill="#160c07"/>
      </g>
      <path d="M-35,-11 C-28,-17 -17,-17 -9,-12 L-10,-8 C-18,-12 -27,-12 -34,-7Z M35,-11 C28,-17 17,-17 9,-12 L10,-8 C18,-12 27,-12 34,-7Z" fill="#0f0907"/>
      </g>
      </g>
      <g class="dj-v dj-emm" style="display:none"><!-- "Emmanuel" DJ: hand-drawn from his selfie (cap stays the PF cap) -->
      <defs>
        <radialGradient id="swSkin" cx="47%" cy="40%" r="68%"><stop offset="0" stop-color="#9c5e3f"/><stop offset=".55" stop-color="#7a4329"/><stop offset="1" stop-color="#4a2716"/></radialGradient>
        <linearGradient id="swLens" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="#c9cbd0"/><stop offset=".45" stop-color="#8d9097"/><stop offset="1" stop-color="#55585f"/></linearGradient>
        <linearGradient id="swMetal" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8f8a80"/><stop offset=".5" stop-color="#e9e4d8"/><stop offset="1" stop-color="#8f8a80"/></linearGradient>
        <pattern id="swStub" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M3.89,1.81 l-0.14,0.65" stroke="#d9d4cf" stroke-width="0.26" stroke-linecap="round"/><path d="M6.09,0.45 l0.05,0.65" stroke="#2b1d17" stroke-width="0.32" stroke-linecap="round"/><path d="M6.79,11.37 l0.49,0.64" stroke="#d9d4cf" stroke-width="0.35" stroke-linecap="round"/><path d="M10.30,3.48 l0.11,1.15" stroke="#b5afaa" stroke-width="0.34" stroke-linecap="round"/><path d="M1.24,6.85 l-0.45,0.65" stroke="#b5afaa" stroke-width="0.31" stroke-linecap="round"/><path d="M2.47,8.16 l0.60,0.89" stroke="#2b1d17" stroke-width="0.38" stroke-linecap="round"/><path d="M2.98,2.16 l-0.01,0.87" stroke="#b5afaa" stroke-width="0.26" stroke-linecap="round"/><path d="M5.39,7.31 l0.30,0.72" stroke="#d9d4cf" stroke-width="0.27" stroke-linecap="round"/><path d="M5.87,0.47 l0.51,0.85" stroke="#d9d4cf" stroke-width="0.38" stroke-linecap="round"/><path d="M8.34,7.13 l-0.43,1.16" stroke="#2b1d17" stroke-width="0.26" stroke-linecap="round"/><circle cx="0.78" cy="8.77" r="0.36" fill="#c9c3be"/><path d="M9.86,3.42 l0.62,0.88" stroke="#2b1d17" stroke-width="0.40" stroke-linecap="round"/><path d="M7.33,5.92 l-0.37,0.91" stroke="#b5afaa" stroke-width="0.38" stroke-linecap="round"/><path d="M10.46,0.97 l-0.55,0.94" stroke="#2b1d17" stroke-width="0.32" stroke-linecap="round"/><path d="M6.60,8.48 l-0.29,0.67" stroke="#c9c3be" stroke-width="0.37" stroke-linecap="round"/><path d="M1.82,7.90 l-0.23,0.60" stroke="#d9d4cf" stroke-width="0.33" stroke-linecap="round"/><circle cx="5.03" cy="4.43" r="0.41" fill="#c9c3be"/><circle cx="6.19" cy="7.41" r="0.33" fill="#d9d4cf"/><path d="M11.42,8.17 l-0.03,0.92" stroke="#2b1d17" stroke-width="0.32" stroke-linecap="round"/><path d="M2.29,11.82 l-0.43,0.60" stroke="#2b1d17" stroke-width="0.28" stroke-linecap="round"/><path d="M1.82,1.22 l-0.42,0.90" stroke="#c9c3be" stroke-width="0.35" stroke-linecap="round"/><path d="M7.61,11.47 l-0.03,1.38" stroke="#c9c3be" stroke-width="0.33" stroke-linecap="round"/><path d="M5.76,3.74 l-0.48,1.26" stroke="#b5afaa" stroke-width="0.27" stroke-linecap="round"/><path d="M1.94,0.28 l-0.77,1.02" stroke="#c9c3be" stroke-width="0.27" stroke-linecap="round"/><circle cx="11.74" cy="10.36" r="0.34" fill="#c9c3be"/><circle cx="4.27" cy="2.67" r="0.36" fill="#c9c3be"/><circle cx="9.46" cy="9.10" r="0.39" fill="#b5afaa"/><path d="M8.88,2.72 l-0.62,0.82" stroke="#2b1d17" stroke-width="0.31" stroke-linecap="round"/><circle cx="3.11" cy="8.31" r="0.33" fill="#c9c3be"/><path d="M11.86,11.46 l-0.04,0.87" stroke="#c9c3be" stroke-width="0.26" stroke-linecap="round"/><circle cx="5.79" cy="11.82" r="0.33" fill="#d9d4cf"/><circle cx="9.60" cy="1.02" r="0.40" fill="#d9d4cf"/><circle cx="9.00" cy="5.74" r="0.32" fill="#b5afaa"/><circle cx="1.04" cy="11.35" r="0.33" fill="#2b1d17"/><path d="M1.02,1.91 l-0.06,1.12" stroke="#b5afaa" stroke-width="0.25" stroke-linecap="round"/><path d="M7.34,7.15 l0.05,0.70" stroke="#2b1d17" stroke-width="0.36" stroke-linecap="round"/><circle cx="0.17" cy="11.65" r="0.34" fill="#d9d4cf"/><path d="M5.21,10.46 l0.00,1.21" stroke="#b5afaa" stroke-width="0.25" stroke-linecap="round"/><circle cx="3.91" cy="6.53" r="0.26" fill="#b5afaa"/><circle cx="10.77" cy="7.95" r="0.39" fill="#2b1d17"/><circle cx="1.57" cy="1.82" r="0.40" fill="#d9d4cf"/><path d="M7.30,9.31 l0.38,1.05" stroke="#b5afaa" stroke-width="0.28" stroke-linecap="round"/><path d="M3.91,6.22 l0.08,0.80" stroke="#2b1d17" stroke-width="0.38" stroke-linecap="round"/><circle cx="3.32" cy="9.27" r="0.35" fill="#2b1d17"/><path d="M10.95,5.32 l0.05,0.98" stroke="#b5afaa" stroke-width="0.37" stroke-linecap="round"/><circle cx="11.30" cy="8.39" r="0.41" fill="#c9c3be"/></pattern>
        <pattern id="swGoat" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#8a827d"/><path d="M2.03,4.48 l-0.54,0.79" stroke="#5a4e48" stroke-width="0.38" stroke-linecap="round"/><path d="M0.73,6.69 l0.39,1.13" stroke="#f1f0ed" stroke-width="0.57" stroke-linecap="round"/><circle cx="1.43" cy="8.83" r="0.40" fill="#5a4e48"/><path d="M3.98,4.87 l-0.11,1.01" stroke="#e4e2df" stroke-width="0.56" stroke-linecap="round"/><path d="M3.39,1.96 l-0.25,0.97" stroke="#b3aea9" stroke-width="0.37" stroke-linecap="round"/><path d="M7.03,3.84 l-0.97,1.39" stroke="#3a2e29" stroke-width="0.51" stroke-linecap="round"/><path d="M7.88,9.72 l0.48,0.75" stroke="#f1f0ed" stroke-width="0.37" stroke-linecap="round"/><path d="M7.56,8.20 l-0.75,1.34" stroke="#e4e2df" stroke-width="0.55" stroke-linecap="round"/><circle cx="5.71" cy="7.00" r="0.42" fill="#f1f0ed"/><circle cx="1.83" cy="8.95" r="0.58" fill="#b3aea9"/><circle cx="8.02" cy="0.84" r="0.37" fill="#d2cec9"/><circle cx="4.54" cy="3.39" r="0.45" fill="#3a2e29"/><path d="M6.22,0.43 l-0.35,0.64" stroke="#e4e2df" stroke-width="0.41" stroke-linecap="round"/><path d="M2.02,3.12 l-0.10,1.14" stroke="#b3aea9" stroke-width="0.48" stroke-linecap="round"/><path d="M2.71,8.04 l0.01,1.38" stroke="#b3aea9" stroke-width="0.36" stroke-linecap="round"/><circle cx="5.14" cy="2.46" r="0.38" fill="#5a4e48"/><path d="M4.32,4.95 l-0.36,0.78" stroke="#5a4e48" stroke-width="0.59" stroke-linecap="round"/><path d="M1.99,8.82 l-0.16,0.64" stroke="#e4e2df" stroke-width="0.51" stroke-linecap="round"/><path d="M1.30,0.71 l-0.81,1.13" stroke="#e4e2df" stroke-width="0.57" stroke-linecap="round"/><circle cx="3.81" cy="5.06" r="0.50" fill="#b3aea9"/><path d="M0.45,1.85 l1.02,1.38" stroke="#b3aea9" stroke-width="0.46" stroke-linecap="round"/><path d="M5.47,2.44 l-0.18,0.67" stroke="#b3aea9" stroke-width="0.40" stroke-linecap="round"/><path d="M2.79,6.56 l-0.25,0.67" stroke="#d2cec9" stroke-width="0.48" stroke-linecap="round"/><circle cx="4.00" cy="0.42" r="0.42" fill="#f1f0ed"/><circle cx="0.84" cy="9.58" r="0.51" fill="#d2cec9"/><path d="M8.79,3.90 l-0.38,1.09" stroke="#b3aea9" stroke-width="0.53" stroke-linecap="round"/><circle cx="1.45" cy="8.25" r="0.57" fill="#e4e2df"/><circle cx="7.34" cy="8.12" r="0.58" fill="#d2cec9"/><path d="M5.68,8.13 l0.72,1.15" stroke="#f1f0ed" stroke-width="0.56" stroke-linecap="round"/><circle cx="6.93" cy="2.30" r="0.36" fill="#f1f0ed"/><circle cx="9.60" cy="3.77" r="0.49" fill="#5a4e48"/><path d="M6.26,6.81 l-0.93,1.35" stroke="#5a4e48" stroke-width="0.42" stroke-linecap="round"/><circle cx="8.98" cy="0.92" r="0.37" fill="#3a2e29"/><circle cx="2.52" cy="0.74" r="0.41" fill="#b3aea9"/><path d="M2.31,6.50 l-0.04,1.15" stroke="#5a4e48" stroke-width="0.47" stroke-linecap="round"/><path d="M7.67,6.17 l-0.30,1.12" stroke="#e4e2df" stroke-width="0.40" stroke-linecap="round"/><path d="M6.93,6.21 l-0.42,1.14" stroke="#d2cec9" stroke-width="0.35" stroke-linecap="round"/><path d="M6.92,6.76 l-0.07,1.21" stroke="#b3aea9" stroke-width="0.53" stroke-linecap="round"/><circle cx="9.93" cy="5.49" r="0.59" fill="#b3aea9"/><path d="M0.18,4.59 l-0.28,0.77" stroke="#3a2e29" stroke-width="0.59" stroke-linecap="round"/><circle cx="9.46" cy="2.11" r="0.37" fill="#3a2e29"/><path d="M2.62,3.60 l0.72,1.16" stroke="#3a2e29" stroke-width="0.56" stroke-linecap="round"/><path d="M2.31,8.98 l0.82,1.15" stroke="#5a4e48" stroke-width="0.45" stroke-linecap="round"/><path d="M4.05,7.27 l0.33,0.60" stroke="#5a4e48" stroke-width="0.44" stroke-linecap="round"/><path d="M7.51,8.39 l-0.93,1.19" stroke="#f1f0ed" stroke-width="0.58" stroke-linecap="round"/><path d="M2.53,0.65 l-0.21,0.94" stroke="#5a4e48" stroke-width="0.60" stroke-linecap="round"/><circle cx="2.75" cy="0.48" r="0.36" fill="#f1f0ed"/><path d="M6.35,1.49 l0.54,1.23" stroke="#b3aea9" stroke-width="0.46" stroke-linecap="round"/><circle cx="4.28" cy="0.29" r="0.45" fill="#e4e2df"/><circle cx="5.54" cy="2.03" r="0.36" fill="#f1f0ed"/><path d="M4.51,7.53 l0.69,1.04" stroke="#e4e2df" stroke-width="0.57" stroke-linecap="round"/><circle cx="1.71" cy="4.15" r="0.42" fill="#b3aea9"/><path d="M9.76,2.60 l0.19,0.70" stroke="#e4e2df" stroke-width="0.41" stroke-linecap="round"/><path d="M6.43,0.75 l-0.59,1.33" stroke="#3a2e29" stroke-width="0.58" stroke-linecap="round"/><path d="M9.96,4.50 l-0.54,1.04" stroke="#d2cec9" stroke-width="0.49" stroke-linecap="round"/><path d="M3.19,3.68 l0.54,0.91" stroke="#3a2e29" stroke-width="0.40" stroke-linecap="round"/><path d="M7.46,2.10 l-0.49,1.37" stroke="#b3aea9" stroke-width="0.43" stroke-linecap="round"/><circle cx="1.26" cy="5.03" r="0.55" fill="#e4e2df"/><path d="M0.93,8.97 l0.93,1.28" stroke="#5a4e48" stroke-width="0.45" stroke-linecap="round"/><circle cx="8.73" cy="0.22" r="0.46" fill="#f1f0ed"/><path d="M8.04,9.68 l0.86,1.26" stroke="#5a4e48" stroke-width="0.35" stroke-linecap="round"/><path d="M8.55,9.72 l-0.77,1.38" stroke="#d2cec9" stroke-width="0.55" stroke-linecap="round"/><circle cx="1.09" cy="8.25" r="0.51" fill="#e4e2df"/><path d="M4.57,5.52 l0.07,0.63" stroke="#f1f0ed" stroke-width="0.35" stroke-linecap="round"/><circle cx="7.15" cy="9.62" r="0.41" fill="#e4e2df"/><circle cx="6.99" cy="1.12" r="0.43" fill="#f1f0ed"/><path d="M1.92,2.61 l0.65,0.82" stroke="#3a2e29" stroke-width="0.35" stroke-linecap="round"/><path d="M3.16,8.39 l-0.55,1.37" stroke="#d2cec9" stroke-width="0.47" stroke-linecap="round"/><circle cx="7.05" cy="3.07" r="0.40" fill="#f1f0ed"/><circle cx="6.47" cy="0.81" r="0.52" fill="#d2cec9"/><path d="M2.27,0.34 l-0.10,0.61" stroke="#b3aea9" stroke-width="0.53" stroke-linecap="round"/><circle cx="2.92" cy="8.45" r="0.40" fill="#f1f0ed"/><path d="M3.12,8.20 l0.43,0.69" stroke="#d2cec9" stroke-width="0.47" stroke-linecap="round"/><circle cx="6.24" cy="6.10" r="0.47" fill="#d2cec9"/><path d="M0.56,5.95 l0.14,0.93" stroke="#5a4e48" stroke-width="0.36" stroke-linecap="round"/><circle cx="7.10" cy="1.84" r="0.57" fill="#5a4e48"/><path d="M7.33,9.98 l0.83,1.20" stroke="#d2cec9" stroke-width="0.43" stroke-linecap="round"/><circle cx="0.32" cy="6.64" r="0.56" fill="#5a4e48"/><path d="M4.42,1.09 l0.51,0.70" stroke="#f1f0ed" stroke-width="0.42" stroke-linecap="round"/><path d="M9.64,2.07 l0.33,0.67" stroke="#b3aea9" stroke-width="0.54" stroke-linecap="round"/><path d="M7.05,1.96 l-0.29,1.32" stroke="#3a2e29" stroke-width="0.58" stroke-linecap="round"/><path d="M0.30,4.11 l-0.48,0.65" stroke="#e4e2df" stroke-width="0.54" stroke-linecap="round"/><circle cx="9.20" cy="2.57" r="0.37" fill="#e4e2df"/><circle cx="3.63" cy="3.35" r="0.36" fill="#3a2e29"/><circle cx="6.90" cy="9.24" r="0.35" fill="#b3aea9"/><path d="M9.16,6.34 l-0.05,1.37" stroke="#f1f0ed" stroke-width="0.36" stroke-linecap="round"/><circle cx="9.54" cy="3.87" r="0.58" fill="#b3aea9"/><circle cx="1.33" cy="4.97" r="0.55" fill="#f1f0ed"/><circle cx="8.23" cy="7.73" r="0.41" fill="#3a2e29"/><path d="M4.61,7.84 l0.32,0.80" stroke="#3a2e29" stroke-width="0.37" stroke-linecap="round"/><path d="M0.65,0.34 l-0.08,0.68" stroke="#3a2e29" stroke-width="0.49" stroke-linecap="round"/><path d="M0.72,6.25 l0.32,0.96" stroke="#d2cec9" stroke-width="0.37" stroke-linecap="round"/><path d="M2.34,4.17 l0.08,1.22" stroke="#3a2e29" stroke-width="0.57" stroke-linecap="round"/><path d="M7.60,7.80 l-0.24,1.19" stroke="#b3aea9" stroke-width="0.42" stroke-linecap="round"/><path d="M1.99,2.47 l0.49,0.75" stroke="#d2cec9" stroke-width="0.41" stroke-linecap="round"/><path d="M0.65,2.52 l0.55,1.12" stroke="#d2cec9" stroke-width="0.48" stroke-linecap="round"/><path d="M9.91,1.02 l-0.07,0.90" stroke="#5a4e48" stroke-width="0.57" stroke-linecap="round"/><circle cx="8.77" cy="2.33" r="0.40" fill="#f1f0ed"/><path d="M5.83,9.30 l0.20,1.22" stroke="#b3aea9" stroke-width="0.48" stroke-linecap="round"/><circle cx="6.65" cy="0.06" r="0.50" fill="#e4e2df"/><circle cx="2.18" cy="3.69" r="0.36" fill="#d2cec9"/><circle cx="0.38" cy="7.32" r="0.55" fill="#d2cec9"/><path d="M4.09,3.72 l0.49,1.04" stroke="#3a2e29" stroke-width="0.43" stroke-linecap="round"/><path d="M0.63,1.01 l0.06,1.12" stroke="#5a4e48" stroke-width="0.52" stroke-linecap="round"/><path d="M3.98,2.71 l-0.86,1.20" stroke="#b3aea9" stroke-width="0.52" stroke-linecap="round"/><circle cx="8.84" cy="4.14" r="0.57" fill="#f1f0ed"/><circle cx="3.64" cy="1.97" r="0.45" fill="#e4e2df"/><path d="M4.34,1.57 l0.59,0.97" stroke="#f1f0ed" stroke-width="0.56" stroke-linecap="round"/><circle cx="1.63" cy="0.15" r="0.39" fill="#3a2e29"/><path d="M3.97,5.73 l-0.18,0.73" stroke="#b3aea9" stroke-width="0.53" stroke-linecap="round"/><circle cx="1.72" cy="0.67" r="0.47" fill="#5a4e48"/><path d="M9.67,1.97 l0.56,0.85" stroke="#d2cec9" stroke-width="0.56" stroke-linecap="round"/><circle cx="6.08" cy="6.36" r="0.58" fill="#f1f0ed"/><circle cx="8.25" cy="1.60" r="0.51" fill="#d2cec9"/><path d="M1.96,4.73 l0.03,0.91" stroke="#3a2e29" stroke-width="0.40" stroke-linecap="round"/><path d="M1.23,2.47 l0.78,1.27" stroke="#e4e2df" stroke-width="0.55" stroke-linecap="round"/><path d="M6.72,6.68 l0.09,1.10" stroke="#b3aea9" stroke-width="0.38" stroke-linecap="round"/><path d="M3.06,4.20 l-0.21,1.00" stroke="#3a2e29" stroke-width="0.41" stroke-linecap="round"/><path d="M1.79,0.04 l0.24,1.26" stroke="#5a4e48" stroke-width="0.47" stroke-linecap="round"/><path d="M8.37,8.11 l-0.07,0.67" stroke="#5a4e48" stroke-width="0.38" stroke-linecap="round"/></pattern>
      </defs>
      <!-- Swap DJ: Emmanuel's head (hand-drawn from his selfie) -->
      <ellipse cx="-55" cy="6" rx="8" ry="14" fill="#6a3a22"/><ellipse cx="55" cy="6" rx="8" ry="14" fill="#5a311c"/>
      <ellipse cx="-55" cy="7" rx="4" ry="8" fill="#4a2716" opacity=".6"/><ellipse cx="55" cy="7" rx="4" ry="8" fill="#3e2012" opacity=".6"/>
      <!-- longer face, tapered jaw -->
      <path d="M0,-75 C36,-75 56,-50 56,-12 C56,22 51,48 38,66 C28,80 14,89 0,89 C-14,89 -28,80 -38,66 C-51,48 -56,22 -56,-12 C-56,-50 -36,-75 0,-75Z" fill="url(#swSkin)"/>
      <!-- jaw/side shading -->
      <path d="M56,-12 C56,22 51,48 38,66 C28,80 14,89 0,89 C16,82 30,66 38,46 C46,26 50,8 50,-12Z" fill="#2e170c" opacity=".35"/>
      <path d="M-56,-12 C-56,22 -51,48 -38,66 C-30,76 -20,84 -10,87 C-24,76 -36,58 -44,36 C-50,18 -52,2 -52,-12Z" fill="#2e170c" opacity=".22"/>
      <!-- cheekbone light -->
      <ellipse cx="-30" cy="22" rx="12" ry="7" fill="#c07a55" opacity=".28"/><ellipse cx="31" cy="22" rx="11" ry="6" fill="#b06a45" opacity=".2"/>
      <!-- light grey stubble on cheeks and jaw -->
      <path d="M-52,10 C-51,36 -44,58 -30,74 C-20,84 -10,88 0,89 C10,88 20,84 30,74 C44,58 51,36 52,10 C46,30 40,44 30,52 C22,58 14,58 8,56 L-8,56 C-14,58 -22,58 -30,52 C-40,44 -46,30 -52,10Z" fill="url(#swStub)" opacity=".45"/>
      <!-- smile lines -->
      <path d="M-15,28 C-22,36 -24,44 -21,52" fill="none" stroke="#3d1f10" stroke-width="1.6" stroke-linecap="round" opacity=".45"/>
      <path d="M15,28 C22,36 24,44 21,52" fill="none" stroke="#3d1f10" stroke-width="1.6" stroke-linecap="round" opacity=".45"/>
      <!-- broad nose -->
      <path d="M-5,6 C-6,14 -9,20 -13,25 C-16,29 -13,34 -8,33 C-5,35 5,35 8,33 C13,34 16,29 13,25 C9,20 6,14 5,6" fill="#5c3019" opacity=".6"/>
      <ellipse cx="0" cy="26" rx="8.5" ry="5.5" fill="#a8664a" opacity=".55"/><ellipse cx="-1" cy="23" rx="2.6" ry="1.6" fill="#d39a7c" opacity=".55"/>
      <ellipse cx="-12.5" cy="28" rx="6" ry="5.2" fill="#874b30" opacity=".8"/><ellipse cx="12.5" cy="28" rx="6" ry="5.2" fill="#7a4229" opacity=".8"/><path d="M-18,29 C-17,24 -14,22 -11,23 M18,29 C17,24 14,22 11,23" fill="none" stroke="#3a1d0f" stroke-width="1.2" opacity=".55"/>
      <ellipse cx="-7.5" cy="31.4" rx="4.2" ry="2.1" fill="#1d0d06"/><ellipse cx="7.5" cy="31.4" rx="4.2" ry="2.1" fill="#1d0d06"/>
      <!-- thin salt-and-pepper moustache -->
      <path d="M-17,40 C-10,35.5 -4,36 0,37.5 C4,36 10,35.5 17,40 C10,38.8 5,39.4 0,40.2 C-5,39.4 -10,38.8 -17,40Z" fill="url(#swGoat)" opacity=".75"/>
      <!-- fuller lips, slight smile -->
      <ellipse id="mouthOpenE" cx="0" cy="45.5" rx="11" ry="0" fill="#1a0705"/><path id="mouthTeethE" d="M-8,43.8 C-3,42.6 3,42.6 8,43.8 L7,45.4 C2,44.8 -2,44.8 -7,45.4Z" fill="#efe6da" opacity="0"/>
      <path d="M-17,43.5 C-12,40.2 -6,39.6 -2,41 C0,40.4 1,40.4 2,41 C6,39.6 12,40.2 17,43.5 C11,44.6 5,45.2 0,45.2 C-5,45.2 -11,44.6 -17,43.5Z" fill="#5a2f24"/>
      <path d="M-17,43.5 C-11,45 -5,45.6 0,45.6 C5,45.6 11,45 17,43.5" fill="none" stroke="#2a110b" stroke-width="1.3" stroke-linecap="round"/>
      <g id="lipLowE"><path d="M-16,44.6 C-11,54 -4,55.5 0,55.5 C4,55.5 11,54 16,44.6 C10,46.4 5,46.8 0,46.8 C-5,46.8 -10,46.4 -15,44.6Z" fill="#7d4434"/><ellipse cx="0" cy="49.5" rx="6" ry="1.6" fill="#a8695a" opacity=".55"/></g>
      <!-- short grey goatee: soul patch + chin -->
      <path d="M-4,56 C-2,55 2,55 4,56 L3,61 C1,61.6 -1,61.6 -3,61Z" fill="url(#swGoat)"/>
      <path d="M-20,60 C-14,58.5 -7,60 0,60.5 C7,60 14,58.5 20,60 C21,70 17,80 10,86 C5,90 -5,90 -10,86 C-17,80 -21,70 -20,60Z" fill="url(#swGoat)"/><path d="M-20,60 C-14,58.5 -7,60 0,60.5 C7,60 14,58.5 20,60 C21,70 17,80 10,86 C5,90 -5,90 -10,86 C-17,80 -21,70 -20,60Z" fill="#6f6762" opacity=".3"/>
      <path d="M-20,60 C-21,70 -17,80 -10,86 C-5,90 5,90 10,86 C17,80 21,70 20,60" fill="none" stroke="#d8d5d1" stroke-width="1.4" stroke-dasharray="1 1.4" opacity=".7"/>
      <!-- eyes stay behind the reflective lenses -->
      <g id="eyesE" opacity="0"><circle class="pupil" cx="-21" cy="4" r="3"/><circle class="pupil" cx="23" cy="4" r="3"/></g>
      <!-- half-rim browline sunglasses -->
      <g id="swShades">
        <path d="M-41,-5 L-56,-8 M41,-5 L56,-8" stroke="#0c0c0e" stroke-width="3.2" stroke-linecap="round"/>
        <path d="M-40,-4 C-40,8 -36,16 -24,16.5 C-11,17 -6,10 -6,-4Z" fill="url(#swLens)" opacity=".95"/>
        <path d="M40,-4 C40,8 36,16 24,16.5 C11,17 6,10 6,-4Z" fill="url(#swLens)" opacity=".95"/>
        <path d="M-36,-1 L-14,-1 L-26,12 L-34,12Z M30,-1 L37,-1 L24,13 L17,13Z" fill="#fff" opacity=".22"/>
        <path d="M-40,-4 C-40,8 -36,16 -24,16.5 C-11,17 -6,10 -6,-4 M40,-4 C40,8 36,16 24,16.5 C11,17 6,10 6,-4" fill="none" stroke="url(#swMetal)" stroke-width="1.3"/>
        <path d="M-43,-6 C-34,-10 -14,-10 -5,-6 L-5,-1 C-14,-4 -34,-4 -42,-1Z M43,-6 C34,-10 14,-10 5,-6 L5,-1 C14,-4 34,-4 42,-1Z" fill="#0c0c0e"/>
        <path d="M-6,-4.5 C-3,-6 3,-6 6,-4.5 L6,-2.5 C3,-3.8 -3,-3.8 -6,-2.5Z" fill="url(#swMetal)"/>
        <circle cx="-39" cy="-5" r="1.1" fill="#e9e4d8"/><circle cx="39" cy="-5" r="1.1" fill="#e9e4d8"/>
        <path d="M-41,-8 C-30,-11 -14,-10.5 -6,-8" fill="none" stroke="#5a5a62" stroke-width=".8" opacity=".7"/>
      </g>
      </g>
      <g id="photoFace" style="display:none"><defs><radialGradient id="faceFeather"><stop offset=".86" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><mask id="faceMask" maskContentUnits="userSpaceOnUse"><ellipse cx="0" cy="28" rx="41" ry="46" fill="url(#faceFeather)"/></mask></defs>
        <image id="photoImg" href="" x="-48" y="-20" width="96" height="96" mask="url(#faceMask)" preserveAspectRatio="xMidYMid slice"/></g>
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
  ${deckSvg('A')}
  ${deckSvg('B')}
  <!-- mixer + crossfader (centre) -->
  <g id="mixer">
    <path d="M556,484 L644,484 L654,600 L546,600 Z" fill="#191a20" stroke="#3a3c46" stroke-width="1.5"/>
    <path d="M546,600 L654,600 L654,612 L546,612 Z" fill="#0c0d11"/>
    <rect x="572" y="490" width="56" height="16" rx="2" fill="#050608" stroke="#2c2e36"/>
    <text id="bpmText" x="600" y="502" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-size="10" font-weight="700" fill="var(--c2)">--- BPM</text>
    <g id="mixKnobs"></g>
    <g id="vu"></g>
    <rect x="569" y="556" width="6" height="28" rx="3" fill="#050608"/><rect x="625" y="556" width="6" height="28" rx="3" fill="#050608"/>
    <rect id="chA" x="563" y="556" width="18" height="8" rx="2" fill="url(#metal)"/><rect id="chB" x="619" y="556" width="18" height="8" rx="2" fill="url(#metal)"/>
    <text x="572" y="517" text-anchor="middle" font-family="system-ui" font-size="8" font-weight="800" fill="#6b6f7c">A</text><text x="628" y="517" text-anchor="middle" font-family="system-ui" font-size="8" font-weight="800" fill="#6b6f7c">B</text>
    <rect x="566" y="589" width="68" height="5" rx="2.5" fill="#050608"/>
    <rect id="xf" x="565" y="584" width="14" height="14" rx="3" fill="url(#metal)" stroke="var(--c3)" stroke-width=".8"/>
  </g>
</g>
    <g id="spark" opacity="0">
      <g stroke="var(--c3)" stroke-width="2.2" stroke-linecap="round"><path d="M0,-10 L0,-22 M8,-6 L18,-14 M-8,-6 L-18,-14 M10,2 L22,0 M-10,2 L-22,0"/></g>
      <circle r="5" fill="#fff"/>
      <text x="16" y="-18" font-family="system-ui,sans-serif" font-size="13" font-weight="800" font-style="italic" fill="var(--c3)">crackle</text>
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
    <g class="hand"><path class="cuff" d="M-16,-19 L2,-19 L2,19 L-16,19 Z" fill="url(#ribs)" stroke="#111214" stroke-width="2"/><use href="#hand"/></g></g>
  <g id="armR"><path class="a-up-o" fill="none" stroke="#111214" stroke-width="54" stroke-linecap="round"/><path class="a-fo-o" fill="none" stroke="#111214" stroke-width="46" stroke-linecap="round"/>
    <path class="a-up" fill="none" stroke="#2e3033" stroke-width="48" stroke-linecap="round"/><path class="a-fo" fill="none" stroke="#2a2c2f" stroke-width="40" stroke-linecap="round"/>
    <path class="a-hi" fill="none" stroke="#4b4e54" stroke-width="5" stroke-linecap="round" opacity=".7"/><path class="a-rim" fill="none" stroke="var(--c2)" stroke-width="3" stroke-linecap="round" opacity=".4"/>
    <g class="hand"><path class="cuff" d="M-16,-19 L2,-19 L2,19 L-16,19 Z" fill="url(#ribs)" stroke="#111214" stroke-width="2"/>
      <g class="o-watch"><rect x="1" y="-17" width="9" height="34" rx="3" fill="#0d0d10"/><circle cx="5.5" cy="0" r="8.5" fill="url(#gold)" stroke="#5c430b" stroke-width="1.2"/><circle cx="5.5" cy="0" r="5.6" fill="#101216"/><path d="M5.5,0 L5.5,-4 M5.5,0 L8.5,1" stroke="#e2b23a" stroke-width="1"/></g>
      <use href="#hand" transform="scale(1,-1)"/></g></g>
</g>
<g id="bubble" opacity="0" style="pointer-events:none">
  <g id="bubbleIn">
    <path id="bubbleTail" d="M0,0 L30,0 L-10,40Z" fill="#fff"/>
    <rect id="bubbleBox" x="0" y="0" width="200" height="60" rx="22" fill="#fff" stroke="var(--c1)" stroke-width="3"/>
    <text id="bubbleText" x="0" y="0" fill="#14101f" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-weight="800" font-size="23"></text>
  </g>
</g>
</svg>`;

export function createScene(container) {
  container.insertAdjacentHTML('beforeend', svgMarkup);
  const svg = container.querySelector('svg.scene-svg');
  const $ = (id) => svg.getElementById ? svg.getElementById(id) : svg.querySelector('#' + id);
  const dq = (d, c) => $('deck' + d).querySelector('.t-' + c);
  const deckEls = (d) => ({
    g: $('deck' + d), platterRec: dq(d, 'platterRec'), platterRot: dq(d, 'platterRot'), labelImg: dq(d, 'labelImg'), strobe: dq(d, 'strobe'),
    tonearm: dq(d, 'tonearm'), armLift: dq(d, 'armLift'), needleShadow: dq(d, 'needleShadow'), startBtn: dq(d, 'startBtn'), targetLight: dq(d, 'targetLight'),
    ringBars: dq(d, 'ringBars'), neonCore: $('deck' + d).querySelectorAll('.neonCore,.neonCore2'), neonGlow: $('deck' + d).querySelectorAll('.neonGlow,.neonGlow2'),
    letter: $('deck' + d).querySelector('.deck-letter'), pitchCap: dq(d, 'pitchCap'),
  });
  const el = {
    body: $('body'), head: $('head'), eyes: $('eyes'), dj: $('dj'), rimL: $('rimL'), rimR: $('rimR'), spark: $('spark'),
    sleeve: $('sleeve'), sleeveImg: $('sleeveImg'), sleeveRecWrap: $('sleeveRecWrap'), sleeveRecLabel: $('sleeveRecLabel'),
    fly: $('fly'), flyScale: $('flyScale'), flyRot: $('flyRot'), flyLabel: $('flyLabel'),
    led: $('ledStrip'), ledGlow: $('ledGlow'), bpmText: $('bpmText'), xf: $('xf'), chA: $('chA'), chB: $('chB'),
    mixKnobs: $('mixKnobs'), vu: $('vu'), crateRecs: $('crateRecs'), pupils: svg.querySelectorAll('.pupil'),
    cupL: $('cupL'), cupR: $('cupR'), mouthOpen: $('mouthOpen'), mouthTeeth: $('mouthTeeth'), lipLow: $('lipLow'), djSets: { psycho: [$('mouthOpen'), $('mouthTeeth'), $('lipLow')], emmanuel: [$('mouthOpenE'), $('mouthTeethE'), $('lipLowE')] },
    bubble: $('bubble'), bubbleIn: $('bubbleIn'), bubbleBox: $('bubbleBox'), bubbleTail: $('bubbleTail'), bubbleText: $('bubbleText'),
    arms: { L: $('armL'), R: $('armR') }, neonStrips: svg.querySelector('.neon-strips'),
    deck: { A: deckEls('A'), B: deckEls('B') },
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
  // mixer knobs + vu (centre mixer)
  const knobs = [];
  [[572, 528], [572, 546], [628, 528], [628, 546]].forEach(([x, y]) => {
    const g = document.createElementNS(NS, 'g'); g.setAttribute('transform', `translate(${x},${y})`);
    g.innerHTML = `<circle r="6.5" fill="#0c0d10" stroke="#3a3d47"/><g class="kr"><circle r="4.8" fill="#2a2c33"/><path d="M0,0 L0,-4.8" stroke="var(--c3)" stroke-width="1.8" stroke-linecap="round"/></g>`;
    el.mixKnobs.appendChild(g); knobs.push(g.querySelector('.kr'));
  });
  const vuCells = [[], []];
  for (let ch = 0; ch < 2; ch++) for (let i = 0; i < 10; i++) {
    const r = document.createElementNS(NS, 'rect');
    const x = ch ? 603 : 591, y = 572 - i * 6;
    r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', 6); r.setAttribute('height', 4.4); r.setAttribute('rx', 1);
    r.setAttribute('fill', i > 7 ? '#ff3b5c' : i > 5 ? '#ffc531' : '#22e39a'); r.setAttribute('opacity', '.12');
    el.vu.appendChild(r); vuCells[ch].push(r);
  }
  // spectrum bars around each deck (only the active deck's ring is drawn)
  const BARS = 72, bars = { A: [], B: [] };
  ['A', 'B'].forEach((d) => {
    for (let i = 0; i < BARS; i++) {
      const a = (i / BARS) * Math.PI * 2; const l = document.createElementNS(NS, 'line');
      l.setAttribute('stroke', i % 2 ? 'var(--c2)' : 'var(--c1)'); l.setAttribute('stroke-width', '3'); l.setAttribute('stroke-linecap', 'round');
      el.deck[d].ringBars.appendChild(l); bars[d].push({ l, c: Math.cos(a), s: Math.sin(a) });
    }
  });

  // ---------------- state ----------------
  const mkDeck = () => ({ arm: G.arm.rest, lift: 1, spin: 0, spinTarget: 0, rot: Math.random() * 360, rate: 1, visible: false, progress: 0, held: false, label: '' });
  const st = {
    decks: { A: mkDeck(), B: mkDeck() }, active: 'A', turn: -1, lean: 0, leanT: 0, leanV: 0, leanHold: false,
    sleeve: { x: G.crate.x, y: G.crate.y, rot: 0, slide: 0, show: false, rec: true },
    fly: { x: 0, y: 0, sx: 1, sy: 1, o: 0, show: false, rot: 0 },
    hands: {
      L: { x: 450, y: 540, vx: 0, vy: 0, mode: 'idle', follow: null, grip: 0 },
      R: { x: 750, y: 540, vx: 0, vy: 0, mode: 'idle', follow: null, grip: 0 },
    },
    nod: 0, nodV: 0, bounce: 0, blink: 0, nextBlink: 2, pose: 0, poseBeat: 0, beats: 0,
    spark: 0, sparkDeck: 'A', xf: 0, busy: false, energy: 0, instant: false,
    get platterVisible() { return st.decks[st.active].visible; },
  };
  const tweens = new Set();
  function tween(obj, to, dur, fn = ease.io) {
    return new Promise((resolve) => {
      if (dur <= 0 || st.instant) { Object.assign(obj, to); resolve(); return; }
      const from = {}; for (const k in to) from[k] = obj[k];
      tweens.add({ obj, from, to, dur, t: 0, fn, resolve });
    });
  }
  function flush() { tweens.forEach((t) => { Object.assign(t.obj, t.to); t.resolve(); }); tweens.clear(); }
  const wait = (s) => tween({ v: 0 }, { v: 1 }, s, ease.lin);

  const toS = (d, x, y) => ({ x: DECKS[d].tx + DS * x, y: DECKS[d].ty + DS * y });
  const platterS = (d) => toS(d, G.platter.x, G.platter.y);
  const PR = G.platter.r * DS; // platter radius in scene units
  function armTipLocal(angle, lift) {
    const a = angle * D2R; const L = G.arm.len - 2;
    return { x: G.arm.x - Math.sin(a) * L - Math.cos(a) * 18, y: G.arm.y + Math.cos(a) * L - Math.sin(a) * 18 - lift * 8 };
  }
  // the tonearm art sits in .t-hw2 (turned 180° about the platter centre 545,500, then nudged 20,-8 so the base sits on the plinth): local → deck coords
  function armTip(d, angle = st.decks[d].arm, lift = st.decks[d].lift) { const t = armTipLocal(angle, lift); return toS(d, 1110 - t.x, 992 - t.y); }
  const armHand = (d) => (d === 'A' ? 'L' : 'R'); // hand that works each deck's tonearm
  function moveHand(side, x, y, dur, fn) {
    const h = st.hands[side]; const p = { x: h.x, y: h.y }; h.mode = 'anim'; h.follow = () => p; h.vx = h.vy = 0;
    return tween(p, { x, y }, dur, fn);
  }
  function follow(side, f) { const h = st.hands[side]; h.mode = 'anim'; h.follow = f; }
  function release(side) { const h = st.hands[side]; h.mode = 'idle'; h.follow = null; }
  const recEdgeR = () => ({ x: st.fly.x + G.fly * st.fly.sx - 14, y: st.fly.y - 4 });
  function leanTo(v) { st.leanT = v; st.leanHold = true; }

  // ---------------- choreography (serialised queue) ----------------
  let gen = 0, chain = Promise.resolve(), pending = 0;
  function enqueue(fn) {
    const my = gen; pending++; st.busy = true;
    const p = chain.then(() => (my === gen ? fn(my) : null)).catch((e) => console.warn('[scene]', e)).finally(() => { pending--; if (!pending) { st.busy = false; st.leanHold = false; } });
    chain = p; return p;
  }
  function sparkle(d) { st.spark = 1; st.sparkDeck = d; }

  async function lowerNeedle(d, speed, onDrop, my) {
    const D = st.decks[d], hs = armHand(d);
    D.held = true;
    const t0 = armTip(d); await moveHand(hs, t0.x - 4, t0.y - 10, .22 / speed);
    follow(hs, () => { const t = armTip(d); return { x: t.x - 4, y: t.y - 10 }; });
    await tween(D, { arm: G.arm.play0 + D.progress * (G.arm.play1 - G.arm.play0) }, .32 / speed);
    await tween(D, { lift: 0 }, .14 / speed, ease.in);
    sparkle(d); D.spinTarget = 1; D.held = false;
    if (onDrop && my === gen) onDrop();
    await wait(.12); release(hs);
  }
  async function raiseNeedle(d, speed, sounds) {
    const D = st.decks[d], hs = armHand(d);
    if (D.lift >= 1 && D.arm === G.arm.rest) { D.spinTarget = 0; return; }
    D.held = true;
    const t0 = armTip(d); await moveHand(hs, t0.x - 4, t0.y - 10, .24 / speed);
    follow(hs, () => { const t = armTip(d); return { x: t.x - 4, y: t.y - 10 }; });
    await tween(D, { lift: 1 }, .1 / speed); sounds && sounds.click && sounds.click();
    D.spinTarget = 0;
    await tween(D, { arm: G.arm.rest }, .3 / speed);
    D.held = false; release(hs);
  }
  async function recordOff(d, speed, sounds) {
    const D = st.decks[d]; if (!D.visible) return;
    await raiseNeedle(d, speed, sounds);
    const P = platterS(d);
    await moveHand('R', P.x + PR - 12, P.y - 4, .22 / speed);
    D.visible = false;
    Object.assign(st.fly, { x: P.x, y: P.y, sx: PR / G.fly, sy: PR * G.platter.k / G.fly, o: 1, show: true });
    setHref(el.flyLabel, D.label);
    follow('R', recEdgeR);
    const away = d === 'A' ? { x: 300, y: 330 } : { x: 960, y: 330 };
    await tween(st.fly, { x: away.x, y: away.y, sx: 1, sy: 1 }, .4 / speed, ease.io);
    tween(st.fly, { o: 0 }, .16 / speed).then(() => { st.fly.show = false; });
    release('R');
  }
  async function pull(speed, coverUrl, labelUrl) {
    setHref(el.sleeveImg, coverUrl); setHref(el.sleeveRecLabel, labelUrl);
    Object.assign(st.sleeve, { x: G.crate.x, y: G.crate.y, rot: 0, slide: 0, show: true, rec: true });
    leanTo(-150);
    await moveHand('L', G.crate.x - 4, G.crate.y - 70, .36 / speed);
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
  async function carry(d, speed, labelUrl) {
    const D = st.decks[d], P = platterS(d);
    Object.assign(st.fly, { x: st.sleeve.x + st.sleeve.slide, y: st.sleeve.y, sx: 1, sy: 1, o: 1, show: true });
    setHref(el.flyLabel, labelUrl); st.sleeve.rec = false;
    follow('R', recEdgeR);
    leanTo(d === 'A' ? -70 : 40);
    const back = (async () => {
      await tween(st.sleeve, { x: G.crate.x, y: G.crate.y, rot: 0 }, .46 / speed, ease.io);
      st.sleeve.show = false; st.hands.L.grip = 0; release('L');
    })();
    await tween(st.fly, { x: P.x, y: P.y, sx: PR / G.fly, sy: PR * G.platter.k / G.fly }, .52 / speed, ease.io);
    setHref(D.labelEl, labelUrl); D.label = labelUrl;
    D.visible = true; st.fly.show = false; st.hands.R.grip = 0; release('R');
    await back;
    leanTo(d === 'A' ? -25 : 25);
  }
  const instantSpeed = (speed) => speed >= 50;
  function placeInstant(d, label, drop) {
    const D = st.decks[d]; setHref(D.labelEl, label); D.label = label; D.visible = true;
    if (drop) { D.arm = G.arm.play0 + D.progress * (G.arm.play1 - G.arm.play0); D.lift = 0; D.spinTarget = 1; } else { D.arm = G.arm.rest; D.lift = 1; D.spinTarget = 0; }
  }

  /** Full load onto a deck: old record off (if any) + pull new from the crate → slide → carry → drop needle. */
  function loadRecord({ deck = st.active, cover, label, speed = 1, onDrop, sounds } = {}) {
    return enqueue(async (my) => {
      if (instantSpeed(speed) || st.instant) { placeInstant(deck, label, true); onDrop && onDrop(); return; }
      await Promise.all([recordOff(deck, speed, sounds), pull(speed, cover, label)]); if (my !== gen) return;
      await slide(speed); if (my !== gen) return;
      await carry(deck, speed, label); if (my !== gen) return;
      await lowerNeedle(deck, speed, onDrop, my);
    });
  }
  /** Cue the next record on a deck (needle stays up). */
  function cueRecord({ deck, cover, label, speed = 1, sounds } = {}) {
    return enqueue(async (my) => {
      if (instantSpeed(speed) || st.instant) { placeInstant(deck, label, false); return; }
      await Promise.all([recordOff(deck, speed, sounds), pull(speed, cover, label)]); if (my !== gen) return;
      await slide(speed); if (my !== gen) return;
      await carry(deck, speed, label);
    });
  }
  function dropNeedle({ deck, speed = 1, onDrop } = {}) {
    return enqueue(async (my) => {
      if (instantSpeed(speed) || st.instant) { const D = st.decks[deck]; D.visible = true; D.arm = G.arm.play0; D.lift = 0; D.spinTarget = 1; sparkle(deck); onDrop && onDrop(); return; }
      await lowerNeedle(deck, speed, onDrop, my);
    });
  }
  function liftNeedle({ deck, speed = 1, sounds } = {}) {
    return enqueue(async () => {
      if (instantSpeed(speed) || st.instant) { const D = st.decks[deck]; D.lift = 1; D.arm = G.arm.rest; D.spinTarget = 0; return; }
      await raiseNeedle(deck, speed, sounds);
    });
  }
  function needleRedrop(speed = 1, onDrop, sounds) {
    const d = st.active;
    return enqueue(async () => {
      const D = st.decks[d], hs = armHand(d);
      if (instantSpeed(speed) || st.instant) { sparkle(d); onDrop && onDrop(); return; }
      D.held = true;
      await moveHand(hs, armTip(d).x - 4, armTip(d).y - 10, .2 / speed);
      follow(hs, () => { const t = armTip(d); return { x: t.x - 4, y: t.y - 10 }; });
      await tween(D, { lift: 1 }, .12); sounds && sounds.click && sounds.click();
      await tween(D, { arm: G.arm.play0 }, .25 / speed);
      await tween(D, { lift: 0 }, .12, ease.in); sparkle(d); D.held = false; onDrop && onDrop();
      release(hs);
    });
  }
  /** Stop any choreography and put the record on the deck right away, needle up (used when audio must not wait). */
  function snapRecord(d, label) { cancel(); placeInstant(d, label, false); }
  function cancel() { gen++; flush(); chain = Promise.resolve(); release('L'); release('R'); st.sleeve.show = false; st.fly.show = false; ['A', 'B'].forEach((d) => { st.decks[d].held = false; }); }
  ['A', 'B'].forEach((d) => { st.decks[d].labelEl = el.deck[d].labelImg; });

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
  const rotP = (x, y, deg) => { const r = deg * D2R, c = Math.cos(r), s = Math.sin(r); return { x: 470 + (x - 470) * c - (y - 470) * s, y: 470 + (x - 470) * s + (y - 470) * c }; };
  const lerp = (a, b, k) => a + (b - a) * k;
  const cupT = (x0, y0, r0, x1, y1, r1, k) => `translate(${f1(lerp(x0, x1, k))},${f1(lerp(y0, y1, k))}) rotate(${f1(lerp(r0, r1, k))})`;
  const shoulder = (side, dy) => { const P = rotP(G.sh[side].x, G.sh[side].y, st.bodyRot || 0); return { x: P.x + DJX + st.lean + (st.bodyX || 0), y: P.y + dy + (st.shY ? st.shY[side] : 0) }; };
  function drawArm(side, bodyDy) {
    const h = st.hands[side]; const S = shoulder(side, bodyDy);
    { const dx = h.x - S.x, dy = h.y - S.y, d = Math.hypot(dx, dy), max = (G.upper + G.fore) * .96; // reach: lean the shoulder in
      const ex = Math.max(0, d - max); h.reachEx = (h.reachEx || 0) + (Math.min(80, ex) - (h.reachEx || 0)) * .25;
      if (h.reachEx > .5 && d > 1) { S.x += dx / d * h.reachEx; S.y += dy / d * h.reachEx * .6; } }
    const { E, W } = ik(S, h, side);
    const g = el.arms[side];
    const ang = Math.atan2(W.y - E.y, W.x - E.x);
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
    let ha = ang; if (W.y > 470) { let dv = Math.PI / 2 - ang; while (dv > Math.PI) dv -= 2 * Math.PI; while (dv < -Math.PI) dv += 2 * Math.PI; ha = ang + Math.max(-.6, Math.min(.6, dv * .45)); }
    h.ha = h.ha == null ? ha : h.ha + (ha - h.ha) * .3; // eased wrist, no snapping
    p.hand.setAttribute('transform', `translate(${f1(W.x)},${f1(W.y)}) rotate(${f1(h.ha / D2R)})`);
  }

  // key hand spots (scene coords)
  const SPOT = {
    platA: () => { const P = platterS('A'); return { x: P.x + 34, y: P.y - 6 }; },
    platB: () => { const P = platterS('B'); return { x: P.x - 34, y: P.y - 6 }; },
    mix: { x: 600, y: 534 }, xfader: () => ({ x: G.xf.x0 + st.xf * (G.xf.x1 - G.xf.x0) + 8, y: G.xf.y - 2 }),
  };
  // ---------------- dance moves (beat-locked) ----------------
  // A phase-locked beat clock follows the detected beats/BPM; a move is picked by energy every 4–8 bars.
  const MOVES = {
    nod: { name: 'Head nod', tier: 0 }, sway: { name: 'Two-step sway', tier: 0 },
    bounce: { name: 'Shoulder bounce', tier: 1 }, rock: { name: 'Lean-back rock', tier: 1 }, cue: { name: 'Headphone cue', tier: 1 }, pump: { name: 'Chest pump', tier: 1 },
    handup: { name: 'Hand in the air', tier: 2 }, scratch: { name: 'Scratch flourish', tier: 2 },
  };
  // natural club DJ: nod + weight shift most of the time, a shoulder bob / headphone cue when it gets busier; the big
  // gestures (hand in the air, chest pump, scratch flourish) stay out of the rotation (they looked robotic on loop)
  const POOL = [['nod', 'sway'], ['nod', 'sway', 'bounce', 'cue', 'nod', 'scratch'], ['sway', 'bounce', 'cue', 'rock', 'scratch']];
  const rmq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const dn = { phase: 0, bpm: 0, lastBeat: 0, move: 'nod', moveUntil: 16, eFast: 0, eSlow: 0, tier: 0, dropAt: -99, amp: 0, reduced: !!(rmq && rmq.matches), body: { bx: 0, by: 0, rot: 0, shL: 0, shR: 0, nod: 0, tilt: 0, cupL: 0, cupR: 0 } };
  if (rmq && rmq.addEventListener) rmq.addEventListener('change', (e) => { dn.reduced = e.matches; if (dn.reduced && MOVES[dn.move].tier > 0) pickMove(); });
  function pickMove(force) {
    const pool = dn.reduced ? POOL[0] : POOL[force != null ? force : dn.tier];
    let m; do { m = pool[(Math.random() * pool.length) | 0]; } while (pool.length > 1 && m === dn.move);
    dn.move = m; const bars = m === 'scratch' ? 1 + ((Math.random() * 2) | 0) : 4 + ((Math.random() * 5) | 0); // 4–8 bars (scratch: a 1–2 bar flourish)
    dn.moveUntil = Math.ceil((dn.phase + .01) / 4) * 4 + bars * 4;
  }
  function danceClock(dt, now, a, playing) {
    const tsec = now / 1000;
    if (a.bpm > 40) dn.bpm = a.bpm;
    const bpm = dn.bpm || 100;
    if (playing) dn.phase += dt * bpm / 60;
    if (a.beat && playing) { // pull the clock onto the detected onset (tempo changes stay in sync)
      const lag = .07 * bpm / 60; // onset detection fires ~70 ms after the kick → the beat is already that far behind us
      const err = Math.round(dn.phase - lag) + lag - dn.phase; dn.phase += err * (dn.bpm ? .35 : .8);
      if (!dn.bpm && dn.lastBeat) { const iv = tsec - dn.lastBeat; if (iv > .33 && iv < 1.2) dn.bpm = 60 / iv; }
      dn.lastBeat = tsec;
    }
    // energy: fast vs slow average → tiers and "drop" detection
    const lvl = playing ? (a.level || 0) * .6 + (a.bass || 0) * .4 : 0;
    dn.eFast += (lvl - dn.eFast) * Math.min(1, dt * 4); dn.eSlow += (lvl - dn.eSlow) * Math.min(1, dt * .35);
    const tier = dn.eSlow > .42 ? 2 : dn.eSlow > .2 ? 1 : 0;
    if (tier !== dn.tier) dn.tier = tier;
    const isDrop = dn.eFast > dn.eSlow * 1.45 + .08 && dn.eFast > .35 && dn.phase - dn.dropAt > 32;
    if (isDrop) { dn.dropAt = dn.phase; if (!dn.reduced) { dn.move = Math.random() < .5 ? 'bounce' : 'cue'; dn.moveUntil = Math.ceil(dn.phase / 4) * 4 + 16; } }
    if (playing && dn.phase >= dn.moveUntil) pickMove();
    // a move outside the current tier is swapped at the next bar line
    if (dn.reduced && MOVES[dn.move].tier > 0) pickMove();
    if (playing && !dn.reduced && MOVES[dn.move].tier > dn.tier + 1 && dn.phase % 4 < .1) pickMove();
    dn.amp += ((playing ? (dn.reduced ? .35 : 1) : 0) - dn.amp) * Math.min(1, dt * 3);
  }
  function danceBody(t) {
    // smooth beat curves (no spikes): `hit` = an eased dip that lands ON the beat (head down, knees give a little) and
    // comes back up in between; `sw` = weight shift from foot to foot over two beats
    const b = dn.phase, f = b - Math.floor(b), hit = Math.pow(.5 + .5 * Math.cos(2 * Math.PI * Math.min(1, f * 1.15)), 2), bar = b % 4, down = bar < 1 ? .5 + .5 * Math.cos(Math.PI * Math.min(1, bar * 1.5)) : 0;
    const sw = Math.sin(Math.PI * b), A = dn.amp * (st.busy ? .4 : 1), m = dn.move;
    const o = { bx: 0, by: 0, rot: 0, shL: 0, shR: 0, nod: 0, tilt: 0, cupL: 0, cupR: 0 };
    o.nod = 4 * hit; o.by = 1.5 * hit; o.bx = 3 * sw; o.rot = .6 * sw; // every move keeps a small nod + weight shift
    if (m === 'nod') { o.nod = 6 * hit; o.by = 2 * hit; }
    else if (m === 'sway') { o.bx = 7 * sw; o.rot = 1.2 * sw; o.tilt = -1.5 * sw; o.by = 2 * hit; o.nod = 4 * hit; }
    else if (m === 'bounce') { o.shL = o.shR = -4 * hit; o.by = 3 * hit; o.nod = 5 * hit; }
    else if (m === 'rock') { o.rot = -(1.5 + 1.5 * hit) * (st.active === 'A' ? -1 : 1); o.by = -1 - 1.5 * hit; o.nod = -1 + 5 * hit; o.tilt = 2 * hit; }
    else if (m === 'pump') { o.by = -9 * down + 3 * hit; o.shL = o.shR = -6 * down; o.nod = 10 * down + 4 * hit; }
    else if (m === 'cue') { const free = st.active === 'A' ? 'R' : 'L'; if (free === 'L') o.cupL = 1; else o.cupR = 1; o.tilt = free === 'L' ? -5 : 5; o.nod = 4 * hit; o.by = 1.5 * hit; }
    else if (m === 'handup') { o.by = 5 * hit; o.bx = 6 * sw; o.nod = 8 * hit; o.shL = st.active === 'A' ? 0 : -8; o.shR = st.active === 'A' ? -8 : 0; }
    else if (m === 'scratch') { o.nod = 7 * hit; o.by = 3 * hit; o.rot = 1.5 * Math.sin(Math.PI * b * 2); }
    for (const k in o) o[k] *= (k === 'cupL' || k === 'cupR') ? (dn.amp > .2 ? 1 : 0) : A;
    // smooth everything so move changes blend
    const B = dn.body; for (const k in o) B[k] += (o[k] - B[k]) * .14; // eased blend between moves
    return B;
  }
  /** Hand targets while performing (no choreography running). Returns [L, R]. */
  function poseTargets(t, p, playing) {
    const A = st.active === 'A';
    if (!playing) { const pa = SPOT.platA(), pb = SPOT.platB(), sw0 = Math.sin(t * .9) * 2.5, sw1 = Math.cos(t * .8) * 2.5;
      return A ? [{ x: pa.x + sw0, y: pa.y + 4 + sw1 }, { x: SPOT.mix.x + 14 + sw1, y: SPOT.mix.y + 6 + sw0 }] : [{ x: SPOT.mix.x - 14 + sw1, y: SPOT.mix.y + 6 + sw0 }, { x: pb.x + sw0, y: pb.y + 4 + sw1 }]; }
    const b = dn.phase, f = b - Math.floor(b), hit = Math.pow(.5 + .5 * Math.cos(2 * Math.PI * Math.min(1, f * 1.15)), 2), sw = Math.sin(Math.PI * b), amp = dn.reduced ? .35 : 1;
    const plat = A ? SPOT.platA() : SPOT.platB();
    const deckHand = { x: plat.x + Math.sin(Math.PI * b / 2) * 4 * amp, y: plat.y + hit * 3 * amp };
    // free hand: rests on the mixer, and every 2 bars eases over to a knob / the far EQ and back (a real DJ's "reach")
    const ph = (b % 8) / 8, reach = ph > .75 ? Math.sin((ph - .75) / .25 * Math.PI) : 0, rs = reach * reach * (3 - 2 * reach);
    const mixHand = { x: SPOT.mix.x + (A ? 12 : -12) + (A ? 18 : -18) * rs * amp, y: SPOT.mix.y + hit * 3 * amp - 22 * rs * amp };
    const xfH = SPOT.xfader();
    const sx = (side) => G.sh[side].x + DJX + st.lean + dn.body.bx;
    const pair = (deck, free) => (A ? [deck, free] : [free, deck]);
    if (st.mixing) return pair(deckHand, { x: xfH.x, y: xfH.y + hit * 3 }); // transitions: hands on the platter + crossfader
    if (st.talkPose) return talkTargets(t, deckHand);
    switch (dn.move) {
      case 'handup': { const side = A ? 'R' : 'L'; return pair(deckHand, { x: sx(side) + (side === 'L' ? -112 : 112) + sw * 18 * amp, y: 92 + hit * 16 }); }
      case 'cue': { const side = A ? 'R' : 'L'; return pair(deckHand, { x: 470 + DJX + st.lean + dn.body.bx + (side === 'L' ? -74 : 74), y: 196 + dn.body.by }); }
      case 'scratch': { const e8 = (b * 2) % 1, stroke = Math.sin(Math.PI * 2 * e8) * (.5 - .5 * Math.cos(Math.PI * 2 * e8)); const fl = (b * 4) % 1, flick = fl < .5 ? fl * 2 : 2 - fl * 2, ff = flick * flick * (3 - 2 * flick);
        return pair({ x: plat.x + stroke * 11 * amp, y: plat.y - 18 + stroke * 2 }, { x: xfH.x + (ff - .5) * 14 * amp, y: xfH.y + 1 }); }
      case 'pump': { const bar = b % 4, down = bar < 1 ? Math.exp(-bar * 5) : 0; return pair(deckHand, { x: SPOT.mix.x + (A ? 30 : -30), y: 440 - 70 * down * amp }); }
      case 'bounce': return pair(deckHand, { x: mixHand.x, y: mixHand.y + Math.abs(Math.sin(Math.PI * b * 2)) * -8 * amp });
      default: return pair(deckHand, mixHand);
    }
  }
  function talkTargets(t, deckHand) {
    const A = st.active === 'A', side = A ? 'R' : 'L', tp = st.talkPose;
    const sx = G.sh[side].x + DJX + st.lean + dn.body.bx;
    let free;
    if (tp === 'heart') free = { x: 470 + DJX + st.lean + dn.body.bx + 40, y: 336 + dn.body.by + Math.sin(t * 2.2) * 2 }; // hand on the heart (his left side)
    else if (tp === 'up') free = { x: sx + (side === 'L' ? -108 : 108) + Math.sin(t * 6) * 10, y: 92 };
    else free = { x: sx + (side === 'L' ? -150 : 150), y: 300 + Math.sin(t * 2.4) * 4 }; // point at the crowd (chest height, never across the face)
    return A ? [deckHand, free] : [free, deckHand];
  }

  // ---------------- speech bubble + lip flap (hype talk) ----------------
  const sp = { text: '', until: 0, shown: 0, mouth: 0, mouthT: 0, side: 1, w: 0, h: 0 };
  function layoutBubble(text) {
    const small = (svg.getBoundingClientRect().width || 1000) < 640, FS = small ? 36 : 23, MAXC = small ? 17 : 22; // bigger text when the stage is small (phones)
    el.bubbleText.setAttribute('font-size', FS);
    const words = String(text).split(/\s+/).filter(Boolean), lines = []; let cur = '';
    for (const w of words) { if ((cur + ' ' + w).trim().length > MAXC && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
    if (cur) lines.push(cur);
    const T = el.bubbleText; T.textContent = '';
    const LH = Math.round(FS * 1.17); let maxW = 0; sp.fs = FS;
    lines.slice(0, 4).forEach((ln, i) => {
      const ts = document.createElementNS('http://www.w3.org/2000/svg', 'tspan'); ts.textContent = ln; ts.setAttribute('x', '0'); ts.setAttribute('dy', i ? LH : 0); T.appendChild(ts);
      let w = 0; try { w = ts.getComputedTextLength(); } catch (e) {} if (!w) w = ln.length * FS * .54; maxW = Math.max(maxW, w);
    });
    const n = Math.min(4, lines.length), padX = Math.round(FS * .87), padY = Math.round(FS * .65);
    sp.w = Math.ceil(maxW + padX * 2); sp.h = n * LH + padY * 2 - 6;
    el.bubbleBox.setAttribute('width', sp.w); el.bubbleBox.setAttribute('height', sp.h);
    sp.padX = padX; sp.base = padY + Math.round(FS * .82);
  }
  function say(text, { pose = 'point', dur = 2.5 } = {}) {
    sp.text = text; sp.until = performance.now() + Math.max(.8, dur) * 1000; layoutBubble(text);
    st.talkPose = pose || null; el.bubble.setAttribute('aria-hidden', 'false');
  }
  function sayEnd() { sp.until = 0; st.talkPose = null; sp.mouthT = 0; }
  function drawSpeech(now, dt, headX, headY) {
    const on = now < sp.until; if (!on && st.talkPose && sp.text) { st.talkPose = null; sp.text = ''; }
    sp.shown += ((on ? 1 : 0) - sp.shown) * Math.min(1, dt * (on ? 14 : 8));
    sp.mouth += ((on ? sp.mouthT : 0) - sp.mouth) * Math.min(1, dt * 28);
    const m = Math.max(0, Math.min(1, sp.mouth));
    el.mouthOpen.setAttribute('ry', (m * 6.5).toFixed(2)); el.lipLow.setAttribute('transform', `translate(0,${(m * 5.5).toFixed(2)})`);
    el.mouthTeeth.setAttribute('opacity', m > .18 ? '.85' : '0');
    if (sp.shown < .01) { if (el.bubble.getAttribute('opacity') !== '0') el.bubble.setAttribute('opacity', '0'); return; }
    // to the right of the head, flip to the left if it would leave the stage
    let side = headX + 74 + sp.w < 990 ? 1 : -1;
    const bx = side > 0 ? headX + 74 : headX - 74 - sp.w, by = Math.max(6, headY - 70 - sp.h);
    const tx0 = side > 0 ? bx + 18 : bx + sp.w - 48, ty0 = by + sp.h - 3;
    el.bubbleTail.setAttribute('d', `M${f1(tx0)},${f1(ty0)} L${f1(tx0 + 30)},${f1(ty0)} L${f1(headX + side * 46)},${f1(headY + 18)}Z`);
    el.bubbleBox.setAttribute('x', f1(bx)); el.bubbleBox.setAttribute('y', f1(by));
    const T = el.bubbleText; T.setAttribute('transform', `translate(${f1(bx + sp.padX)},${f1(by + sp.base)})`);
    const k = .7 + .3 * sp.shown, ox = side > 0 ? bx : bx + sp.w, oy = by + sp.h;
    el.bubbleIn.setAttribute('transform', `translate(${f1(ox)},${f1(oy)}) scale(${k.toFixed(3)}) translate(${f1(-ox)},${f1(-oy)})`);
    el.bubble.setAttribute('opacity', Math.min(1, sp.shown * 1.15).toFixed(3));
  }

  let last = performance.now();
  function frame(now, a = {}) {
    // choreography (tweens) runs on real elapsed time so a slow phone does not stretch the needle drop and delay the
    // music; the springy physics keep a small step for stability
    const real = Math.min(.25, Math.max(0, (now - last) / 1000)); last = now;
    let dt = Math.min(.05, real);
    for (const tw of tweens) {
      tw.t += real; const k = Math.min(1, tw.t / tw.dur); const e = tw.fn(k);
      for (const key in tw.to) tw.obj[key] = tw.from[key] + (tw.to[key] - tw.from[key]) * e;
      if (k >= 1) { tweens.delete(tw); tw.resolve(); }
    }
    const t = now / 1000; const pulse = a.pulse || 0; const playing = !!a.playing;
    if (a.beat) { st.beats++; st.nodV += (1.1 + pulse * .6) * (dn.reduced ? .3 : 1); } // soft kick: the smooth beat curve does most of the nod
    danceClock(dt, now, a, playing); st.mixing = !!a.mixing;
    // decks: spin
    ['A', 'B'].forEach((d) => {
      const D = st.decks[d];
      const spinRate = D.spinTarget > D.spin ? 1.8 : 1.1;
      D.spin += (D.spinTarget - D.spin) * Math.min(1, dt * spinRate * 2.2);
      if (Math.abs(D.spinTarget - D.spin) < .002) D.spin = D.spinTarget;
      const rw = st.rew && now < st.rew.until && d === st.active ? st.rew : null; // rewind: hand drags the record backwards
      D.rot = rw ? (D.rot - dt * 200 * rw.speed * (1 - Math.pow((now - rw.start) / (rw.until - rw.start), 3) * .6) + 720) % 360 : (D.rot + dt * 200 * D.spin * (D.rate || 1)) % 360;
      D.scr = d === st.active && dn.move === 'scratch' && playing && !st.busy && !st.mixing ? (() => { const e8 = (dn.phase * 2) % 1; return Math.sin(Math.PI * 2 * e8) * (.5 - .5 * Math.cos(Math.PI * 2 * e8)) * 16 * dn.amp; })() : (D.scr || 0) * .8;
    });
    // head turns toward the active deck; body leans a little that way
    st.turn += ((st.active === 'A' ? -1 : 1) - st.turn) * Math.min(1, dt * 3);
    if (!st.leanHold) st.leanT = st.turn * 22;
    st.leanV += ((st.leanT - st.lean) * 40 - st.leanV * 13) * dt; // softer, ~critically damped body lean (no lurch) st.lean += st.leanV * dt;
    // head nod (damped spring)
    st.nodV += (-st.nod * 60 - st.nodV * 9) * dt; st.nod += st.nodV * dt * 6;
    const nod = Math.max(-3, Math.min(12, st.nod)) * .5 + (playing ? 0 : Math.sin(t * 1.3) * .8);
    st.nextBlink -= dt; if (st.nextBlink < 0) { st.blink = .14; st.nextBlink = 2.5 + Math.random() * 3.5; }
    if (st.blink > 0) st.blink -= dt;
    el.eyes.setAttribute('transform', st.blink > 0 ? 'translate(0,2) scale(1,.15) translate(0,-2)' : '');
    el.pupils.forEach((p) => p.setAttribute('transform', `translate(${f1(st.turn * 2.4)},0)`));
    const B = danceBody(t);
    st.pulseS = (st.pulseS || 0) + ((playing ? pulse : 0) - (st.pulseS || 0)) * Math.min(1, dt * 10); // eased: no per-kick jolt
    st.bounce = (playing ? st.pulseS * .9 : Math.sin(t * 1.3) * 1.2) + B.by;
    st.bodyRot = B.rot; st.bodyX = B.bx; st.shY = { L: B.shL, R: B.shR };
    el.dj.setAttribute('transform', `translate(${f1(DJX + st.lean + B.bx)},0)`);
    el.body.setAttribute('transform', `translate(0,${f1(st.bounce)}) rotate(${f1(B.rot)} 470 470)`);
    const neck = rotP(470, 262, B.rot);
    const hn = nod + B.nod;
    el.head.setAttribute('transform', `translate(${f1(st.turn * 6 + neck.x - 470)},${f1(st.bounce + neck.y - 262 + hn * .55)}) rotate(${f1(hn + st.turn * 3 + B.tilt + B.rot)} 470 262)`);
    el.cupL.setAttribute('transform', cupT(424, 292, -24, 410, 196, -8, B.cupL)); el.cupR.setAttribute('transform', cupT(516, 292, 24, 530, 196, 8, B.cupR));
    drawSpeech(now, dt, 470 + DJX + st.lean + B.bx + st.turn * 6, 175 + st.bounce + (neck.y - 262) + hn * .55);
    // hands
    const pose = st.busy ? poseTargets(t, pulse, false) : poseTargets(t, pulse, playing);
    if (st.rew && now < st.rew.until) { const A = st.active === 'A', pl = A ? SPOT.platA() : SPOT.platB(), ph = -(now - st.rew.start) / 1000 * 2.2 * Math.PI * Math.min(1, (now - st.rew.start) / 180); pose[A ? 0 : 1] = { x: pl.x + Math.cos(ph + 1.2) * 15, y: pl.y + 2 + Math.sin(ph + 1.2) * 5.5 }; }
    ['L', 'R'].forEach((s, i) => {
      const h = st.hands[s];
      if (h.mode === 'anim' && h.follow) { const p = h.follow(), kf = Math.min(1, dt * 30), jump = Math.hypot(p.x - h.x, p.y - h.y); if (jump > 60) { h.x += (p.x - h.x) * kf; h.y += (p.y - h.y) * kf; } else { h.x = p.x; h.y = p.y; } h.vx = h.vy = 0; }
      else { const T = pose[i]; const k = 70, c = 17; h.vx += ((T.x - h.x) * k - h.vx * c) * dt; h.vy += ((T.y - h.y) * k - h.vy * c) * dt; h.x += h.vx * dt; h.y += h.vy * dt; }
      drawArm(s, st.bounce);
    });
    // decks: render
    const bass = a.bass || 0, lvl = a.level || 0, spec = a.spectrum;
    ['A', 'B'].forEach((d) => {
      const D = st.decks[d], E = el.deck[d], on = d === st.active;
      E.platterRec.style.display = D.visible ? '' : 'none';
      E.platterRot.setAttribute('transform', `rotate(${f1(D.rot + (D.scr || 0))})`);
      E.strobe.setAttribute('transform', `translate(545,500) scale(1,0.37) rotate(${f1(D.rot * .25)})`);
      if (D.spinTarget && !D.held && D.lift === 0) D.arm = G.arm.play0 + D.progress * (G.arm.play1 - G.arm.play0);
      E.tonearm.setAttribute('transform', `translate(${G.arm.x},${G.arm.y}) rotate(${f1(D.arm)})`);
      E.armLift.setAttribute('transform', `translate(0,${f1(-D.lift * 8)})`);
      const tip = armTipLocal(D.arm, 0);
      E.needleShadow.setAttribute('cx', f1(tip.x + 4)); E.needleShadow.setAttribute('cy', f1(tip.y + 6));
      E.needleShadow.setAttribute('opacity', (0.15 + (1 - D.lift) * .3).toFixed(2));
      E.startBtn.setAttribute('opacity', D.spinTarget ? '.95' : '.25');
      E.targetLight.setAttribute('opacity', D.spinTarget ? '.9' : '.4');
      const spinning = D.spin > .05;
      const ne = (on || spinning) ? 0.55 + bass * .45 + pulse * .3 : 0.22;
      E.neonCore.forEach((n) => n.setAttribute('opacity', Math.min(1, ne).toFixed(2)));
      E.neonGlow.forEach((n, i) => n.setAttribute('opacity', ((on ? (i % 2 ? .1 : .06) + (bass * .2 + pulse * .25) : .03)).toFixed(2)));
      E.g.classList.toggle('active', on); E.letter.setAttribute('fill', on ? 'var(--c2)' : '#4a4d58');
      E.ringBars.style.display = on && spinning ? '' : 'none';
      if (on && spinning) for (let i = 0; i < BARS; i++) {
        const b = bars[d][i]; const v = spec ? spec[(i < BARS / 2 ? i : BARS - 1 - i) % spec.length] : 0;
        const r0 = 206, r1 = r0 + 4 + v * 46;
        b.l.setAttribute('x1', f1(b.c * r0)); b.l.setAttribute('y1', f1(b.s * r0 * .38));
        b.l.setAttribute('x2', f1(b.c * r1)); b.l.setAttribute('y2', f1(b.s * r1 * .38));
        b.l.setAttribute('opacity', (0.15 + v * .85).toFixed(2));
      }
    });
    const tipS = armTip(st.sparkDeck, st.decks[st.sparkDeck].arm, 0);
    if (st.spark > 0) { st.spark = Math.max(0, st.spark - dt * 1.1); }
    el.spark.setAttribute('opacity', st.spark.toFixed(2));
    el.spark.setAttribute('transform', `translate(${f1(tipS.x - 4)},${f1(tipS.y)}) scale(${(0.8 + (1 - st.spark) * .5).toFixed(2)})`);
    // sleeve
    el.sleeve.style.display = st.sleeve.show ? '' : 'none';
    if (st.sleeve.show) {
      el.sleeve.setAttribute('transform', `translate(${f1(st.sleeve.x)},${f1(st.sleeve.y)}) rotate(${f1(st.sleeve.rot)})`);
      el.sleeveRecWrap.style.display = st.sleeve.rec ? '' : 'none';
      el.sleeveRecWrap.setAttribute('transform', `translate(${f1(st.sleeve.slide)},0) rotate(${f1(st.sleeve.slide * 1.5)})`);
    }
    el.fly.style.display = st.fly.show ? '' : 'none';
    if (st.fly.show) {
      el.fly.setAttribute('transform', `translate(${f1(st.fly.x)},${f1(st.fly.y)})`);
      el.fly.setAttribute('opacity', st.fly.o.toFixed(2));
      el.flyScale.setAttribute('transform', `scale(${st.fly.sx.toFixed(3)},${st.fly.sy.toFixed(3)})`);
    }
    // lights
    st.energy += ((playing ? lvl : 0) - st.energy) * Math.min(1, dt * 8);
    el.led.setAttribute('opacity', (0.35 + pulse * .65).toFixed(2));
    el.ledGlow.setAttribute('opacity', (0.04 + pulse * .2).toFixed(2));
    el.rimL.setAttribute('opacity', (0.25 + pulse * .5).toFixed(2)); el.rimR.setAttribute('opacity', (0.25 + (a.high || 0) * .6).toFixed(2));
    el.arms.L._p && el.arms.L._p.rim.setAttribute('opacity', (0.2 + pulse * .5).toFixed(2));
    el.arms.R._p && el.arms.R._p.rim.setAttribute('opacity', (0.2 + (a.high || 0) * .6).toFixed(2));
    if (el.neonStrips && el.neonStrips.style.display !== 'none') el.neonStrips.setAttribute('opacity', (0.55 + pulse * .45).toFixed(2));
    // mixer: VU per channel follows the crossfader, faders up on spinning decks
    const gA = Math.cos(st.xf * Math.PI / 2), gB = Math.sin(st.xf * Math.PI / 2);
    const vA = st.decks.A.spin > .1 ? Math.min(1, (lvl * 1.25 + pulse * .2) * gA) : 0, vB = st.decks.B.spin > .1 ? Math.min(1, (lvl * 1.25 + pulse * .2) * gB) : 0;
    for (let ch = 0; ch < 2; ch++) { const v = ch ? vB : vA; vuCells[ch].forEach((c, i) => c.setAttribute('opacity', i / 10 < v ? '1' : '.12')); }
    el.chA.setAttribute('y', st.decks.A.spinTarget ? 556 : 574); el.chB.setAttribute('y', st.decks.B.spinTarget ? 556 : 574);
    el.xf.setAttribute('x', f1(G.xf.x0 + st.xf * (G.xf.x1 - G.xf.x0) - 7));
    knobs.forEach((k, i) => k.setAttribute('transform', `rotate(${f1(-40 + i * 17 + Math.sin(t * (0.6 + i * .21) + i) * (playing ? 26 : 4))})`));
    if (a.bpm !== st._bpm) { st._bpm = a.bpm; el.bpmText.textContent = a.bpm ? `${Math.round(a.bpm)} BPM` : '--- BPM'; }
  }

  function anchors() {
    const m = svg.getScreenCTM(); if (!m) return null;
    const P = (x, y) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
    const pl = platterS(st.active);
    return { ring: P(760, 175), ringR: 160 * m.a, deck: P(pl.x, pl.y), crowdTop: P(0, 250).y, crowdBottom: P(0, 430).y, booth: P(0, 410).y, scale: m.a, left: P(0, 0).x, right: P(1000, 0).x, head: P(470 + DJX + st.lean, 175) };
  }

  return {
    svg, st, frame, anchors, loadRecord, cueRecord, dropNeedle, liftNeedle, needleRedrop, cancel, tween, flush, snapRecord,
    setQuality(level) { st.quality = level; },
    /** debug: current dance move / force one (tests) */
    forceMove(m) { if (MOVES[m]) { dn.move = m; dn.moveUntil = dn.phase + 8; } },
    /** debug: arm reach per side (stretch = shoulder→hand distance / max reach) */
    armDebug() { const o = {}; ['L', 'R'].forEach((s) => { const S = shoulder(s, st.bounce || 0), h = st.hands[s]; o[s] = { d: Math.round(Math.hypot(h.x - S.x, h.y - S.y)), reach: G.upper + G.fore, hand: [Math.round(h.x), Math.round(h.y)], sh: [Math.round(S.x), Math.round(S.y)] }; }); o.move = dn.move; o.talk = st.talkPose || null; o.mixing = !!st.mixing; return o; },
    /** own photo on the DJ's face (data/object URL) or null for the drawn face */
    /** which cartoon DJ: 'psycho' (default) or 'emmanuel'; the photo face option still works on top of either */
    setDJ(v) {
      v = v === 'emmanuel' ? 'emmanuel' : 'psycho'; st.dj = v;
      svg.querySelector('.dj-psycho').style.display = v === 'psycho' ? '' : 'none'; svg.querySelector('.dj-emm').style.display = v === 'emmanuel' ? '' : 'none';
      [el.mouthOpen, el.mouthTeeth, el.lipLow] = el.djSets[v];
      const c = v === 'emmanuel' ? ['#3e1f10', '#6a3a22'] : ['#3b2315', '#55331e'];
      svg.querySelectorAll('#skinNeck stop').forEach((x, i) => x.setAttribute('stop-color', c[i]));
      svg.classList.toggle('dj-is-emm', v === 'emmanuel');
      return v;
    },
    get dj() { return st.dj || 'psycho'; },
    /** popularity rewind: platter spins backwards with the hand on the record for ms */
    rewind(ms = 1100, speed = 4.5) { const n = performance.now(); st.rew = { start: n, until: n + ms, speed }; },
    get rewinding() { return !!(st.rew && performance.now() < st.rew.until); },
    setPhoto(url) { const pf = svg.querySelector('#photoFace'), im = svg.querySelector('#photoImg'); if (!pf || !im) return; if (url) { im.setAttribute('href', url); pf.style.display = ''; } else { pf.style.display = 'none'; im.setAttribute('href', ''); } svg.classList.toggle('has-photo', !!url); },
    setOutfit(id) { return applyOutfit(svg, id); },
    setXfader(v) { st.xf = Math.max(0, Math.min(1, v)); },
    setActive(d) { st.active = d === 'B' ? 'B' : 'A'; },
    setDeckRate(d, r) { st.decks[d].rate = r; },
    setProgress(d, p) { st.decks[d].progress = Math.max(0, Math.min(1, p || 0)); },
    setPlaying(d, on) { const D = st.decks[d]; D.spinTarget = on && D.visible && D.lift === 0 ? 1 : 0; },
    setInstant(v) { st.instant = !!v; if (v) flush(); },
    get dance() { return { move: dn.move, name: MOVES[dn.move].name, phase: dn.phase, bpm: dn.bpm, dropAt: dn.dropAt || 0, tier: dn.tier, energy: dn.eSlow, reduced: dn.reduced, amp: dn.amp }; },
    setDance(m) { if (MOVES[m]) { dn.move = m; dn.moveUntil = dn.phase + 32; } },
    setReducedMotion(v) { dn.reduced = !!v; if (dn.reduced && MOVES[dn.move].tier > 0) pickMove(); },
    get busy() { return st.busy; },
    say, sayEnd, setMouth(v) { sp.mouthT = Math.max(0, Math.min(1, v || 0)); }, get talking() { return performance.now() < sp.until; },
  };
}
