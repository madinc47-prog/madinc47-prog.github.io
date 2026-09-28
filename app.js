(function () {
  "use strict";

  var STORAGE_KEY = "islepin_v1";
  var PARISHES = [
    "All",
    "Roseau",
    "Portsmouth",
    "Marigot",
    "Grand Bay",
    "Mahaut",
    "Castle Bruce",
    "St. Joseph",
    "Soufriere",
    "Calibishie",
    "Wesley",
    "Other"
  ];

  var state = loadState();
  var activeParish = "All";

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { jobs: [], shops: [] };
      var parsed = JSON.parse(raw);
      return {
        jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
        shops: Array.isArray(parsed.shops) ? parsed.shops : []
      };
    } catch (e) {
      return { jobs: [], shops: [] };
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function uid() {
    return "id_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fillParishSelects() {
    var options = PARISHES.filter(function (p) { return p !== "All"; })
      .map(function (p) {
        return '<option value="' + escapeHtml(p) + '">' + escapeHtml(p) + "</option>";
      })
      .join("");
    var jobSel = document.getElementById("job-parish");
    var shopSel = document.getElementById("shop-parish");
    if (jobSel) jobSel.innerHTML = options;
    if (shopSel) shopSel.innerHTML = options;
  }

  function renderChips() {
    var el = document.getElementById("parish-chips");
    if (!el) return;
    el.innerHTML = PARISHES.map(function (p) {
      var cls = p === activeParish ? "chip active" : "chip";
      return '<button type="button" class="' + cls + '" data-parish="' + escapeHtml(p) + '">' + escapeHtml(p) + "</button>";
    }).join("");
    el.querySelectorAll(".chip").forEach(function (btn) {
      btn.addEventListener("click", function () {
        activeParish = btn.getAttribute("data-parish");
        render();
      });
    });
  }

  function filterByParish(items) {
    if (activeParish === "All") return items;
    return items.filter(function (item) { return item.parish === activeParish; });
  }

  function renderStats() {
    var jobs = state.jobs.length;
    var shops = state.shops.length;
    var parishes = {};
    state.jobs.forEach(function (j) { parishes[j.parish] = true; });
    state.shops.forEach(function (s) { parishes[s.parish] = true; });
    document.getElementById("stat-jobs").textContent = String(jobs);
    document.getElementById("stat-shops").textContent = String(shops);
    document.getElementById("stat-parishes").textContent = String(Object.keys(parishes).length);
  }

  function renderJobs() {
    var list = document.getElementById("jobs-list");
    if (!list) return;
    var jobs = filterByParish(state.jobs).slice().sort(function (a, b) {
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    if (!jobs.length) {
      list.innerHTML = '<div class="empty">No open jobs yet — be the first to post.</div>';
      return;
    }
    list.innerHTML = jobs.map(function (j) {
      return (
        '<article class="card" data-id="' + escapeHtml(j.id) + '">' +
          '<div class="card-top"><h3>' + escapeHtml(j.title) + '</h3><span class="badge">' + escapeHtml(j.parish) + "</span></div>" +
          (j.pay ? '<div class="meta">' + escapeHtml(j.pay) + "</div>" : "") +
          '<div class="meta">Contact: ' + escapeHtml(j.contact) + "</div>" +
          (j.details ? "<p>" + escapeHtml(j.details) + "</p>" : "") +
          '<div class="card-actions"><button type="button" data-remove-job="' + escapeHtml(j.id) + '">Remove</button></div>' +
        "</article>"
      );
    }).join("");
    list.querySelectorAll("[data-remove-job]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-remove-job");
        state.jobs = state.jobs.filter(function (j) { return j.id !== id; });
        saveState();
        render();
      });
    });
  }

  function renderShops() {
    var list = document.getElementById("shops-list");
    if (!list) return;
    var shops = filterByParish(state.shops).slice().sort(function (a, b) {
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    if (!shops.length) {
      list.innerHTML = '<div class="empty">No pinned shops yet — pin your trade.</div>';
      return;
    }
    list.innerHTML = shops.map(function (s) {
      return (
        '<article class="card" data-id="' + escapeHtml(s.id) + '">' +
          '<div class="card-top"><h3>' + escapeHtml(s.name) + '</h3><span class="badge">' + escapeHtml(s.parish) + "</span></div>" +
          '<div class="meta">' + escapeHtml(s.trade) + "</div>" +
          '<div class="meta">Contact: ' + escapeHtml(s.contact) + "</div>" +
          (s.about ? "<p>" + escapeHtml(s.about) + "</p>" : "") +
          '<div class="card-actions"><button type="button" data-remove-shop="' + escapeHtml(s.id) + '">Remove</button></div>' +
        "</article>"
      );
    }).join("");
    list.querySelectorAll("[data-remove-shop]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-remove-shop");
        state.shops = state.shops.filter(function (s) { return s.id !== id; });
        saveState();
        render();
      });
    });
  }

  function render() {
    renderChips();
    renderStats();
    renderJobs();
    renderShops();
  }

  function bindForms() {
    var jobForm = document.getElementById("post-job");
    if (jobForm) {
      jobForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var fd = new FormData(jobForm);
        state.jobs.push({
          id: uid(),
          title: String(fd.get("title") || "").trim(),
          parish: String(fd.get("parish") || "").trim(),
          pay: String(fd.get("pay") || "").trim(),
          contact: String(fd.get("contact") || "").trim(),
          details: String(fd.get("details") || "").trim(),
          createdAt: Date.now()
        });
        saveState();
        jobForm.reset();
        activeParish = "All";
        render();
        document.getElementById("jobs").scrollIntoView({ behavior: "smooth" });
      });
    }

    var shopForm = document.getElementById("post-shop");
    if (shopForm) {
      shopForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var fd = new FormData(shopForm);
        state.shops.push({
          id: uid(),
          name: String(fd.get("name") || "").trim(),
          trade: String(fd.get("trade") || "").trim(),
          parish: String(fd.get("parish") || "").trim(),
          contact: String(fd.get("contact") || "").trim(),
          about: String(fd.get("about") || "").trim(),
          createdAt: Date.now()
        });
        saveState();
        shopForm.reset();
        activeParish = "All";
        render();
        document.getElementById("shops").scrollIntoView({ behavior: "smooth" });
      });
    }

    var clearBtn = document.getElementById("clear-data");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        if (!confirm("Clear all jobs and shops saved on this device?")) return;
        state = { jobs: [], shops: [] };
        saveState();
        render();
      });
    }
  }

  fillParishSelects();
  bindForms();
  render();
})();
