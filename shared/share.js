/*! IslePin Share button — shared/share.js
 *  Self-contained, no dependencies, no CDN. Styles live in a shadow root (nothing leaks in or out).
 *  QR codes are drawn locally by shared/qrcode.js (qrcode-generator, MIT, Kazuhiko Arase), loaded on demand.
 *
 *  <script src="/shared/share.js" defer
 *          data-title="Island Pin Beats"                  share title        (default: og:title, then <title>)
 *          data-text="Make beats free in your browser"     share text         (default: og:description / description)
 *          data-url="https://…"                            fixed URL          (default: this page, cleaned, see below)
 *          data-keep="beat,track"                          query params kept from the current URL (default: none)
 *          data-keep-hash="1"                              keep #hash         (default: dropped)
 *          data-tab-selector=".tab.active[data-tab]"       deep link to the open tab: value of the element's data-tab …
 *          data-tab-attr="data-tab" data-tab-param="tab"   … added as ?tab=<value> …
 *          data-tab-default="beats"                        … unless it is the default tab
 *          data-position="br"                              br | bl | tr | tl (floating) | inline (inside data-target)
 *          data-target=".topbar .brand"                    inline: element to put the button in (falls back to floating br)
 *          data-insert="end"                               inline: start | end | before | after   (relative to data-target)
 *          data-offset="16,16"                             floating: x,y px from the corner (safe areas added)
 *          data-label="Share"                              button label
 *          data-compact="420"                              icon-only below this viewport width in px (0 = never, default 0)
 *          data-native="auto"                              auto = native share sheet on touch phones/tablets · always · never
 *          data-in-frame="hide"                            hide | show  — inside an iframe the parent page owns sharing
 *          data-auto="true"></script>                      false = don't add a button; use the JS API below
 *
 *  JS API (window.IslePinShare):
 *    share(opts?)      → Promise  native sheet on phones, else copy + panel   (opts: {title,text,url})
 *    open(opts?)       → opens the desktop panel (copies the link)
 *    close()
 *    getUrl()          → string   the link that will be shared
 *    configure(opts)   → merge {title,text,url,getUrl:fn,keep:[…],…} into the config
 *    attach(el, opts?) → make any existing button a share button (click → share(opts))
 *    copy(text)        → Promise<boolean>
 *    button            → the host element of the auto button (or null)
 *  Events: document dispatches 'islepin-share' with detail {method:'native'|'panel'|'copy', url}.
 */
(function () {
  "use strict";
  if (window.IslePinShare && window.IslePinShare.version) return; // included twice: keep the first
  var script = document.currentScript || (function () { var s = document.querySelectorAll('script[src*="share.js"]'); return s[s.length - 1]; })();
  var ds = (script && script.dataset) || {};
  var SCRIPT_BASE = script && script.src ? script.src.replace(/[^\/]*(\?.*)?$/, "") : "/shared/";

  function meta(sel) { var m = document.querySelector(sel); return m ? (m.getAttribute("content") || "").trim() : ""; }
  function list(s) { return String(s || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean); }

  var cfg = {
    title: ds.title || "",
    text: ds.text || "",
    url: ds.url || "",
    keep: list(ds.keep),
    keepHash: ds.keepHash === "1" || ds.keepHash === "true",
    tabSelector: ds.tabSelector || "",
    tabAttr: ds.tabAttr || "data-tab",
    tabParam: ds.tabParam || "tab",
    tabDefault: ds.tabDefault || "",
    position: (ds.position || "br").toLowerCase(),
    target: ds.target || "",
    insert: (ds.insert || "end").toLowerCase(),
    offset: list(ds.offset || "16,16").map(Number),
    label: ds.label || "Share",
    compact: +(ds.compact || 0),
    native: (ds.native || "auto").toLowerCase(),
    inFrame: (ds.inFrame || "hide").toLowerCase(),
    auto: ds.auto !== "false",
    getUrl: null
  };

  function title() { return cfg.title || meta('meta[property="og:title"]') || document.title || location.hostname; }
  function text() { return cfg.text || meta('meta[property="og:description"]') || meta('meta[name="description"]') || ""; }

  /* The link for this exact app: origin + path (index.html dropped), only allow-listed query params, no hash. */
  function getUrl() {
    if (typeof cfg.getUrl === "function") { try { var u = cfg.getUrl(); if (u) return String(u); } catch (e) {} }
    if (cfg.url) return new URL(cfg.url, location.href).href;
    var path = location.pathname.replace(/\/index\.html?$/i, "/");
    var out = new URL(location.origin + path);
    var cur = new URLSearchParams(location.search);
    cfg.keep.forEach(function (k) { if (cur.has(k) && k !== cfg.tabParam) out.searchParams.set(k, cur.get(k)); });
    if (cfg.tabSelector) {
      var el = document.querySelector(cfg.tabSelector), v = el && el.getAttribute(cfg.tabAttr);
      if (v && v !== cfg.tabDefault) out.searchParams.set(cfg.tabParam, v);
    }
    if (cfg.keepHash && location.hash.length > 1) out.hash = location.hash;
    return out.href;
  }

  function payload(o) {
    o = o || {};
    return { title: o.title || title(), text: o.text || text(), url: o.url || getUrl() };
  }

  function emit(method, url) {
    try { document.dispatchEvent(new CustomEvent("islepin-share", { detail: { method: method, url: url } })); } catch (e) {}
  }

  /* ---------- clipboard ---------- */
  function copyFallback(str) {
    var ta = document.createElement("textarea"), ok = false, sel = document.getSelection(), range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
    var active = document.activeElement;
    ta.value = str; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:-1000px;left:0;opacity:0;font-size:16px";
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, str.length);
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    if (range && sel) { sel.removeAllRanges(); sel.addRange(range); }
    if (active && active.focus) { try { active.focus({ preventScroll: true }); } catch (e) {} }
    return ok;
  }
  function copy(str) {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      return navigator.clipboard.writeText(str).then(function () { return true; }, function () { return copyFallback(str); });
    }
    return Promise.resolve(copyFallback(str));
  }

  /* ---------- QR (lazy: shared/qrcode.js) ---------- */
  var qrLoading = null;
  function loadQR() {
    if (typeof window.qrcode === "function") return Promise.resolve(window.qrcode);
    if (qrLoading) return qrLoading;
    qrLoading = new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = SCRIPT_BASE + "qrcode.js?v=2.0.4";
      s.async = true;
      s.onload = function () { typeof window.qrcode === "function" ? res(window.qrcode) : rej(new Error("qrcode.js")); };
      s.onerror = function () { qrLoading = null; rej(new Error("qrcode.js failed to load")); };
      document.head.appendChild(s);
    });
    return qrLoading;
  }
  function qrSvg(qrcode, str) {
    var q = qrcode(0, "M"); q.addData(str, "Byte"); q.make();
    var n = q.getModuleCount(), pad = 4, size = n + pad * 2, d = "";
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) d += "M" + (c + pad) + " " + (r + pad) + "h1v1h-1z";
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + " " + size + '" shape-rendering="crispEdges" role="img" aria-label="QR code for this link">' +
      '<rect width="' + size + '" height="' + size + '" fill="#fff"/><path fill="#000" d="' + d + '"/></svg>';
  }

  /* ---------- UI ---------- */
  var ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></g></svg>';
  var I = {
    wa: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.7 11.7 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2s.2-1.1.1-1.2l-.4-.2z"/></svg>',
    fb: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M13.5 22v-8h2.7l.4-3.2h-3.1v-2c0-.9.3-1.5 1.6-1.5h1.7V4.4c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.1v2.4H7.6V14h2.8v8h3.1z"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.2-8.3L1.8 3h6.4l4.4 5.9L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z"/></svg>',
    mail: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/></g></svg>',
    more: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></g></svg>',
    close: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
  };

  var CSS = [
    ":host{all:initial;font:500 14px/1.35 system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#eef0f6;-webkit-tap-highlight-color:transparent}",
    ":host([data-mode=float]){position:fixed;z-index:2147482000}",
    ":host([data-mode=inline]){display:inline-flex;vertical-align:middle;position:relative;flex:0 0 auto}",
    "*,*::before,*::after{box-sizing:border-box}",
    ".btn{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:7px;height:36px;min-width:36px;padding:0 13px 0 11px;border-radius:999px;cursor:pointer;",
    "  font:600 13.5px/1 system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;letter-spacing:.01em;color:#eef0f6;white-space:nowrap;user-select:none;-webkit-user-select:none;",
    "  background:#1b1e27;border:1px solid #ffffff26;box-shadow:0 1px 0 #ffffff0d inset;transition:background .15s,border-color .15s,transform .1s}",
    ":host([data-mode=float]) .btn{height:42px;padding:0 16px 0 14px;background:#161922f0;border-color:#ffffff2e;box-shadow:0 8px 28px #0009,0 1px 0 #ffffff12 inset;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}",
    ".btn:hover{background:#262a36;border-color:#ffffff40}",
    ".btn:active{transform:scale(.97)}",
    ".btn:focus-visible{outline:2px solid #8ab4ff;outline-offset:2px}",
    ".btn svg{flex:0 0 auto}",
    ":host([data-compact]) .btn{padding:0;width:36px}:host([data-compact][data-mode=float]) .btn{width:42px}:host([data-compact]) .lbl{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}",
    ".panel{position:fixed;z-index:2147483000;width:320px;max-width:calc(100vw - 16px);padding:16px;border-radius:16px;background:#14161d;color:#eef0f6;border:1px solid #ffffff21;",
    "  box-shadow:0 24px 70px #000b,0 1px 0 #ffffff0f inset;font:500 14px/1.35 system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;text-align:left}",
    ".panel[hidden]{display:none}",
    ".panel.sheet{left:8px!important;right:8px;width:auto;max-width:none;top:auto!important;bottom:max(8px,env(safe-area-inset-bottom));max-height:calc(100vh - 16px);overflow:auto}",
    ".hd{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 10px}",
    ".hd h2{margin:0;font-size:15px;font-weight:700;line-height:1.2;letter-spacing:.01em}",
    ".x{all:unset;display:grid;place-items:center;width:30px;height:30px;border-radius:8px;color:#aab0c0;cursor:pointer}.x:hover{background:#ffffff14;color:#fff}.x:focus-visible{outline:2px solid #8ab4ff}",
    ".sub{margin:0 0 12px;color:#aab0c0;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}",
    ".row{display:flex;gap:6px}",
    ".link{flex:1 1 auto;min-width:0;height:36px;padding:0 10px;border-radius:9px;border:1px solid #ffffff26;background:#0c0e13;color:#dfe3ee;font:500 13px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;outline:none}",
    ".link:focus{border-color:#8ab4ff}",
    ".cp{all:unset;box-sizing:border-box;flex:0 0 auto;height:36px;padding:0 14px;border-radius:9px;background:#eef0f6;color:#0c0e13;font-size:13px;font-weight:700;line-height:36px;cursor:pointer;text-align:center;min-width:70px}",
    ".cp:hover{background:#fff}.cp:focus-visible{outline:2px solid #8ab4ff;outline-offset:2px}",
    ".qr{margin:14px auto 4px;width:168px;height:168px;border-radius:10px;overflow:hidden;background:#fff;display:grid;place-items:center;color:#555;font-size:12px}",
    ".qr svg{display:block;width:100%;height:100%}",
    ".cap{margin:4px 0 12px;text-align:center;color:#8d93a3;font-size:11.5px}",
    ".grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}",
    ".grid a,.grid button{all:unset;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;height:58px;border-radius:10px;background:#1d2029;border:1px solid #ffffff14;",
    "  color:#dfe3ee;font-size:11.5px;font-weight:600;line-height:1;cursor:pointer;text-align:center}",
    ".grid a:hover,.grid button:hover{background:#272b37;border-color:#ffffff2e}.grid a:focus-visible,.grid button:focus-visible{outline:2px solid #8ab4ff;outline-offset:1px}",
    ".grid.five{grid-template-columns:repeat(5,1fr)}",
    ".toast{position:fixed;z-index:2147483001;left:50%;bottom:max(24px,calc(env(safe-area-inset-bottom) + 16px));transform:translate(-50%,12px);opacity:0;pointer-events:none;",
    "  padding:9px 16px;border-radius:999px;background:#eef0f6;color:#0c0e13;font:700 13px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;box-shadow:0 10px 30px #0008;transition:opacity .18s,transform .18s}",
    ".toast.show{opacity:1;transform:translate(-50%,0)}",
    ".toast.top{bottom:auto;top:max(16px,calc(env(safe-area-inset-top) + 12px));transform:translate(-50%,-12px)}.toast.top.show{transform:translate(-50%,0)}",
    ".sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}",
    "@media (prefers-reduced-motion:reduce){.btn,.toast{transition:none}}"
  ].join("\n");

  var host = null, broot = null, layer = null, root = null, btn = null, panel = null, toastEl = null, live = null, lastFocus = null, toastTimer = 0, current = null;

  /* Panel + toast live in their own body-level layer, so a sticky/blurred header (which traps position:fixed children) can't clip them. */
  function ensureRoot() {
    if (root) return root;
    layer = document.createElement("islepin-share-layer");
    layer.setAttribute("data-mode", "layer");
    layer.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483000;display:block";
    document.body.appendChild(layer);
    root = layer.attachShadow({ mode: "open" });
    var st = document.createElement("style"); st.textContent = CSS; root.appendChild(st);
    live = document.createElement("div"); live.className = "sr"; live.setAttribute("aria-live", "polite"); root.appendChild(live);
    toastEl = document.createElement("div"); toastEl.className = "toast"; toastEl.setAttribute("aria-hidden", "true"); root.appendChild(toastEl);
    return root;
  }

  function toast(msg) {
    ensureRoot();
    toastEl.textContent = msg; live.textContent = msg;
    toastEl.classList.toggle("top", !!(panel && !panel.hidden && panel.classList.contains("sheet")));
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 1800);
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function buildPanel() {
    ensureRoot();
    panel = document.createElement("div");
    panel.className = "panel"; panel.hidden = true;
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "false"); panel.setAttribute("aria-labelledby", "ips-h");
    root.appendChild(panel);
    panel.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.stopPropagation(); close(); }
      if (e.key === "Tab") { // keep Tab inside the panel while it is open
        var f = panel.querySelectorAll("button,a,input"), first = f[0], last = f[f.length - 1], a = root.activeElement;
        if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  function renderPanel(p) {
    var enc = encodeURIComponent, msg = p.text ? p.title + " — " + p.text : p.title;
    var links = [
      { k: "wa", n: "WhatsApp", h: "https://wa.me/?text=" + enc(msg + "\n" + p.url) },
      { k: "fb", n: "Facebook", h: "https://www.facebook.com/sharer/sharer.php?u=" + enc(p.url) },
      { k: "x", n: "X", h: "https://x.com/intent/tweet?text=" + enc(p.title) + "&url=" + enc(p.url) },
      { k: "mail", n: "Email", h: "mailto:?subject=" + enc(p.title) + "&body=" + enc((p.text ? p.text + "\n\n" : "") + p.url) }
    ];
    var hasNative = typeof navigator.share === "function";
    panel.innerHTML =
      '<div class="hd"><h2 id="ips-h">Share this app</h2><button class="x" type="button" aria-label="Close share panel">' + I.close + "</button></div>" +
      '<p class="sub">' + esc(msg) + "</p>" +
      '<div class="row"><input class="link" type="text" readonly aria-label="Link to share" value="' + esc(p.url) + '"><button class="cp" type="button">Copy</button></div>' +
      '<div class="qr" aria-busy="true">QR…</div><p class="cap">Scan with a phone camera to open</p>' +
      '<div class="grid' + (hasNative ? " five" : "") + '">' +
      links.map(function (l) {
        return '<a href="' + esc(l.h) + '" target="_blank" rel="noopener noreferrer" data-k="' + l.k + '" aria-label="Share on ' + l.n + '">' + I[l.k] + "<span>" + l.n + "</span></a>";
      }).join("") +
      (hasNative ? '<button type="button" class="more" aria-label="More share options">' + I.more + "<span>More</span></button>" : "") +
      "</div>";
    panel.querySelector(".x").addEventListener("click", close);
    var input = panel.querySelector(".link");
    input.addEventListener("focus", function () { input.select(); });
    panel.querySelector(".cp").addEventListener("click", function () {
      var b = this;
      copy(p.url).then(function (ok) {
        toast(ok ? "Copied!" : "Press Ctrl+C to copy");
        if (!ok) { input.focus(); input.select(); }
        b.textContent = ok ? "Copied" : "Copy";
        setTimeout(function () { b.textContent = "Copy"; }, 1600);
      });
    });
    var more = panel.querySelector(".more");
    if (more) more.addEventListener("click", function () { nativeShare(p).catch(function () {}); });
    var box = panel.querySelector(".qr");
    loadQR().then(function (qrcode) {
      box.innerHTML = qrSvg(qrcode, p.url); box.removeAttribute("aria-busy");
    }, function () { box.textContent = "QR unavailable offline"; box.removeAttribute("aria-busy"); });
  }

  function place() {
    if (!panel || panel.hidden) return;
    var vw = window.innerWidth, vh = window.innerHeight;
    panel.classList.toggle("sheet", vw < 520);
    if (vw < 520) { panel.style.left = panel.style.top = ""; return; }
    var w = panel.offsetWidth, h = panel.offsetHeight;
    var r = btn ? btn.getBoundingClientRect() : { left: vw - w - 16, right: vw - 16, top: vh - 16, bottom: vh - 16 };
    var left = Math.min(Math.max(8, r.right - w), vw - w - 8);
    if (r.left + w <= vw - 8 && r.left < vw / 2) left = Math.max(8, r.left);
    var top = r.bottom + 8;
    if (top + h > vh - 8) top = r.top - h - 8;
    if (top < 8) top = Math.max(8, (vh - h) / 2);
    panel.style.left = Math.round(left) + "px"; panel.style.top = Math.round(top) + "px";
  }

  function onDocDown(e) {
    if (!panel || panel.hidden) return;
    var path = e.composedPath ? e.composedPath() : [];
    if (path.indexOf(panel) >= 0 || (btn && path.indexOf(btn) >= 0)) return;
    close(false);
  }
  function onKey(e) { if (e.key === "Escape" && panel && !panel.hidden) close(); }

  function open(o) {
    var p = payload(o || current);
    if (!panel) buildPanel();
    lastFocus = (broot && broot.activeElement === btn) ? btn : document.activeElement;
    renderPanel(p);
    panel.hidden = false;
    if (btn) btn.setAttribute("aria-expanded", "true");
    place();
    document.addEventListener("pointerdown", onDocDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    var cpb = panel.querySelector(".cp");
    try { cpb.focus({ preventScroll: true }); } catch (e) { cpb.focus(); }
    return copy(p.url).then(function (ok) {
      toast(ok ? "Copied!" : "Link ready to copy");
      if (ok) { cpb.textContent = "Copied"; setTimeout(function () { cpb.textContent = "Copy"; }, 1600); }
      emit(ok ? "copy" : "panel", p.url);
      return ok;
    });
  }

  function close(restoreFocus) {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    if (btn) btn.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", onDocDown, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", place);
    window.removeEventListener("scroll", place, true);
    if (restoreFocus !== false && lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
  }

  function wantsNative() {
    if (typeof navigator.share !== "function" || cfg.native === "never") return false;
    if (cfg.native === "always") return true;
    var uaMobile = navigator.userAgentData ? navigator.userAgentData.mobile : /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    var coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches && !matchMedia("(any-pointer: fine)").matches;
    var iPadOS = /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
    return !!(uaMobile || coarse || iPadOS);
  }

  function nativeShare(p) {
    var data = { title: p.title, text: p.text, url: p.url };
    if (navigator.canShare && !navigator.canShare(data)) data = { title: p.title, url: p.url };
    if (navigator.canShare && !navigator.canShare(data)) return Promise.reject(new Error("canShare: no"));
    return navigator.share(data).then(function () { emit("native", p.url); });
  }

  function share(o) {
    var p = payload(o || current);
    if (wantsNative()) {
      return nativeShare(p).catch(function (err) {
        if (err && err.name === "AbortError") return; // user closed the sheet
        return open(p);                               // not allowed / not supported → panel
      });
    }
    if (panel && !panel.hidden) { close(); return Promise.resolve(); }
    return open(p);
  }

  function attach(el, o) {
    if (!el) return;
    el.addEventListener("click", function (e) { e.preventDefault(); share(o); });
    if (!el.getAttribute("aria-label") && !el.textContent.trim()) el.setAttribute("aria-label", "Share this app");
  }

  function setCompact() {
    if (!host || !cfg.compact) return;
    if (window.innerWidth < cfg.compact) host.setAttribute("data-compact", ""); else host.removeAttribute("data-compact");
  }

  function mount() {
    if (!cfg.auto) return;
    if (window.top !== window.self && cfg.inFrame !== "show") return; // embedded: the parent page has its own button
    var tgt = cfg.position === "inline" && cfg.target ? document.querySelector(cfg.target) : null;
    host = document.createElement("islepin-share");
    host.className = "islepin-share";
    if (tgt) {
      host.setAttribute("data-mode", "inline");
      if (cfg.insert === "start") tgt.insertBefore(host, tgt.firstChild);
      else if (cfg.insert === "before") tgt.parentNode.insertBefore(host, tgt);
      else if (cfg.insert === "after") tgt.parentNode.insertBefore(host, tgt.nextSibling);
      else tgt.appendChild(host);
    } else {
      var pos = /^(tl|tr|bl|br)$/.test(cfg.position) ? cfg.position : "br", x = cfg.offset[0] || 16, y = cfg.offset[1] == null || isNaN(cfg.offset[1]) ? x : cfg.offset[1];
      host.setAttribute("data-mode", "float");
      host.style[pos[0] === "t" ? "top" : "bottom"] = "calc(" + y + "px + env(safe-area-inset-" + (pos[0] === "t" ? "top" : "bottom") + ", 0px))";
      host.style[pos[1] === "l" ? "left" : "right"] = "calc(" + x + "px + env(safe-area-inset-" + (pos[1] === "l" ? "left" : "right") + ", 0px))";
      document.body.appendChild(host);
    }
    broot = host.attachShadow({ mode: "open" });
    var bst = document.createElement("style"); bst.textContent = CSS; broot.appendChild(bst);
    btn = document.createElement("button");
    btn.type = "button"; btn.className = "btn"; btn.setAttribute("part", "button");
    btn.setAttribute("aria-label", "Share this app: " + title());
    btn.setAttribute("aria-haspopup", "dialog"); btn.setAttribute("aria-expanded", "false");
    btn.title = "Share a link to this app";
    btn.innerHTML = ICON + '<span class="lbl">' + esc(cfg.label) + "</span>";
    btn.addEventListener("click", function () { share(); });
    broot.appendChild(btn);
    setCompact();
    window.addEventListener("resize", setCompact);
    api.button = host;
  }

  var api = window.IslePinShare = {
    version: "1.0.0",
    share: share, open: open, close: function () { close(); }, getUrl: getUrl, copy: copy, attach: attach,
    configure: function (o) { o = o || {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) cfg[k] = o[k]; if (btn && o.title) btn.setAttribute("aria-label", "Share this app: " + title()); },
    button: null
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
