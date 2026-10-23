export const $ = s => document.querySelector(s);
export function el(tag, attrs = {}, ...kids) { const e = document.createElement(tag); for (const k in attrs) { if (k === 'style') e.style.cssText = attrs[k]; else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); } kids.flat().forEach(k => e.append(k)); return e; }
export function sub(t) { const s = $('#sub'); s.textContent = t; s.style.opacity = t ? 1 : 0; }
export function hud() { return $('#hud'); }
export function clearHud() { $('#hud').innerHTML = ''; }
export function toast(t, ms = 2200) { const d = el('div', { class: 'toast' }, t); document.body.append(d); setTimeout(() => d.remove(), ms); }
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
