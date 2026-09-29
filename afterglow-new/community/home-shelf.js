/* Afterglow · Local Films teaser for the main New & Recent page.
   Self-contained: include with <script src="community/home-shelf.js" defer></script>
   and a <section id="local-films-shelf" data-base="community/"></section>.
   Shows up to 8 newest approved non-mature films; cards link to the Local Films page. */
(function(){
  "use strict";
  var box = document.getElementById("local-films-shelf"); if (!box) return;
  var base = box.getAttribute("data-base") || "community/";
  var OK_EMBED = /^https:\/\/(www\.youtube-nocookie\.com\/embed\/|player\.vimeo\.com\/video\/|drive\.google\.com\/file\/d\/|archive\.org\/embed\/)/;
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  var css = document.createElement("style");
  css.textContent = "#local-films-shelf .lf-card{display:flex;flex-direction:column;text-decoration:none;color:inherit;min-width:0}" +
    "#local-films-shelf .lf-card .thumb img{position:absolute;inset:0;z-index:1}#local-films-shelf .lf-card .badge{z-index:2}" +
    "#local-films-shelf .lf-card:hover .thumb img{transform:scale(1.03)}#local-films-shelf .lf-card:focus-visible{outline:none}#local-films-shelf .lf-card:focus-visible .thumb{box-shadow:0 0 0 2px var(--accent)}" +
    "#local-films-shelf .lf-card h3{font-size:.92rem;font-weight:500;margin:.55rem 0 .1rem;line-height:1.3}" +
    "#local-films-shelf .ph{position:absolute;inset:0;display:flex;align-items:flex-end;padding:.8rem;background:radial-gradient(120% 90% at 20% 110%,rgba(232,165,75,.45),transparent 60%),linear-gradient(160deg,#2b2117,#15100b);font-family:var(--display);font-size:1.1rem;line-height:1.15}" +
    "#local-films-shelf .lf-cta{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;padding:1.2rem 1.3rem;border-radius:18px;background:var(--surface);box-shadow:0 0 0 1px var(--border)}" +
    "#local-films-shelf .lf-cta p{margin:0;color:var(--muted);max-width:40rem}#local-films-shelf .lf-all{color:var(--accent);text-decoration:none;font-size:.88rem}";
  document.head.appendChild(css);
  var RATING = {all: "All ages", teen: "Teen 13+"};
  function card(it){
    var img = /^https:\/\//.test(it.poster || "") ? '<img loading="lazy" src="' + esc(it.poster) + '" alt="" onerror="this.remove()">' : "";
    return '<a class="lf-card" href="' + esc(base) + 'local-films.html#watch/' + encodeURIComponent(it.id) + '" aria-label="Watch ' + esc(it.title) + ' by ' + esc(it.filmmaker) + '">' +
      '<div class="thumb"><div class="ph" aria-hidden="true">' + esc(it.title) + '</div>' + img +
      '<span class="badge l">' + esc(it.genre || "Film") + '</span><span class="badge r">' + esc(RATING[it.rating]) + '</span></div>' +
      '<h3>' + esc(it.title) + '</h3><p class="sub">' + esc(it.filmmaker) + ' · ' + esc(it.year) + ' · ' + esc(it.runtime) + ' min</p></a>';
  }
  function draw(items){
    var head = '<div class="shelf-head"><h2 id="lf-title">Local Films <span class="soft">(made in Dominica)</span></h2>' +
      '<a class="lf-all" href="' + esc(base) + 'local-films.html">' + (items.length ? "See all local films →" : "About Local Films →") + '</a></div>';
    var body = items.length
      ? '<div class="grid">' + items.slice(0, 8).map(card).join("") + '</div>'
      : '<div class="lf-cta"><p>Made a film in Dominica? Share it free on Afterglow. We review every film before it goes on air.</p><a class="btn btn-primary" href="' + esc(base) + 'submit.html">＋ Submit your film</a></div>';
    box.setAttribute("aria-labelledby", "lf-title");
    box.innerHTML = head + body;
    box.hidden = false;
  }
  fetch(base + "community.json", {cache: "no-cache"}).then(function(r){ return r.ok ? r.json() : {items: []}; })
    .then(function(d){
      var items = (Array.isArray(d) ? d : (d.items || [])).filter(function(it){
        return it && it.id && it.title && (it.rating === "all" || it.rating === "teen") && it.embed && OK_EMBED.test(it.embed.url || "");
      });
      items.sort(function(a, b){ return String(b.approvedDate || "").localeCompare(String(a.approvedDate || "")); });
      draw(items);
    }).catch(function(){ draw([]); });
})();
