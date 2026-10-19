// Live demo layer, loaded before the app's own scripts on every page.
// - Answers the app's background requests (fetch/XHR) from sample data in api-data.js
// - Blocks every form submission (nothing is ever saved)
// - Explains links to screens that aren't part of the demo
// - Shows a "live demo" banner with a way back to the website
(function () {
  "use strict";
  var API = window.DEMO_API || {};

  function lookup(url) {
    var path;
    try { path = new URL(url, location.href).pathname; } catch (e) { return null; }
    var i = path.indexOf("/api/"), j = path.indexOf("/admin/");
    var k = i >= 0 ? i : j;
    if (k < 0) return null;
    var rawPath = path.slice(k);
    path = rawPath.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ":id");
    // Live handlers (e.g. master-crud.js answers lookups from the session's master data)
    var handlers = window.DEMO_API_HANDLERS || [];
    for (var h = 0; h < handlers.length; h++) {
      if (!handlers[h].match.test(rawPath)) continue;
      var out = handlers[h].fn(new URL(url, location.href), rawPath, API[path]);
      if (out != null) return { status: 200, body: out };
    }
    if (Object.prototype.hasOwnProperty.call(API, path)) return { status: 200, body: API[path] };
    return { status: 404, body: { success: false, detail: "Not available in the live demo." } };
  }

  var realFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var hit = lookup(url);
    if (!hit) return realFetch ? realFetch.apply(this, arguments) : Promise.reject(new Error("offline"));
    var method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
    if (method !== "GET") hit = { status: 403, body: { success: false, detail: "Changes aren't saved in the live demo." } };
    return Promise.resolve(new Response(JSON.stringify(hit.body), { status: hit.status, headers: { "Content-Type": "application/json" } }));
  };

  var XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) { this._demo = lookup(url); this._demoMethod = method; return XO.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    if (!this._demo) return XS.apply(this, arguments);
    var x = this, hit = (this._demoMethod || "GET").toUpperCase() === "GET" ? this._demo : { status: 403, body: { detail: "Changes aren't saved in the live demo." } };
    var text = JSON.stringify(hit.body);
    Object.defineProperty(x, "readyState", { value: 4 });
    Object.defineProperty(x, "status", { value: hit.status });
    Object.defineProperty(x, "responseText", { value: text });
    Object.defineProperty(x, "response", { value: x.responseType === "json" ? hit.body : text });
    setTimeout(function () {
      if (typeof x.onreadystatechange === "function") x.onreadystatechange();
      if (typeof x.onload === "function") x.onload();
      x.dispatchEvent(new Event("readystatechange")); x.dispatchEvent(new Event("load")); x.dispatchEvent(new Event("loadend"));
    }, 30);
  };

  // ---------- UI ----------
  var toastTimer;
  window.demoToast = function (msg) { toast(msg); };
  function toast(msg) {
    var t = document.getElementById("demo-toast");
    if (!t) { t = document.createElement("div"); t.id = "demo-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("is-on");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("is-on"); }, 3200);
  }

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[data-demo-missing]");
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    toast("This screen isn’t part of the live demo. Explore the other menus to see more.");
  }, true);

  // ---------- Working site (POI) switcher ----------
  // The real app saves the choice on the server; the demo keeps it in this browser.
  var POI_KEY = "optilogist-demo-working-site";
  // Session storage: the choice lasts for this demo session only (cleared on Exit demo / closing the tab).
  function readPoi() { try { return sessionStorage.getItem(POI_KEY) || ""; } catch (e) { return ""; } }
  // This script runs in <head>, before the page is drawn: flag a chosen site now so the page's
  // "Select a working site…" warning is hidden by CSS from the first paint (no flash).
  if (readPoi()) document.documentElement.classList.add("demo-site-set");
  // QA saves the site, reloads the page and shows Django's message above the content:
  //   <ul class="messagelist"><li class="success">Working site set to QA-Bhaluka.</li></ul>
  var SITE_MSG = "optilogist-demo-site-message";
  function showSiteMessage() {
    var text; try { text = sessionStorage.getItem(SITE_MSG); sessionStorage.removeItem(SITE_MSG); } catch (e) {}
    var content = document.getElementById("content");
    if (!text || !content) return;
    var ul = document.createElement("ul"); ul.className = "messagelist";
    var li = document.createElement("li"); li.className = "success"; li.textContent = text;
    ul.appendChild(li);
    content.parentNode.insertBefore(ul, content);
  }
  function applyWorkingSite() {
    var sel = document.getElementById("dfms-poi-select");
    if (!sel) return;
    var id = readPoi();
    var opt = id && sel.querySelector('option[value="' + id.replace(/"/g, "") + '"]');
    if (!opt) return;
    sel.value = id;
    var name = opt.textContent.trim();
    // With a site chosen, QA no longer asks for one ("Select a working site from the sidebar…")
    document.querySelectorAll(".messagelist li.warning").forEach(function (li) {
      if (/^Select a working site/.test(li.textContent.trim())) { var ul = li.parentNode; li.remove(); if (!ul.children.length) ul.remove(); }
    });
    var badge = document.querySelector(".dfms-dropdown-poi__badge");
    if (badge) badge.remove();
    var warn = document.querySelector(".dfms-dropdown-meta--poi-warn");
    if (warn) {
      warn.classList.remove("dfms-dropdown-meta--poi-warn");
      warn.innerHTML = '<i class="bi bi-geo-alt"></i> ';
      warn.appendChild(document.createTextNode(name));
    }
  }
  function handleSubmit(f, submitter) {
    // Feature handlers first (master-crud.js saves Master Data forms and list actions in the session).
    var hooks = window.DEMO_SUBMIT_HANDLERS || [];
    for (var i = 0; i < hooks.length; i++) if (hooks[i](f, submitter)) return true;
    if (f.id === "dfms-poi-switcher-form") {
      var sel = f.querySelector("select[name=poi_id]");
      var opt = sel && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null;
      try {
        if (sel && sel.value) sessionStorage.setItem(POI_KEY, sel.value); else sessionStorage.removeItem(POI_KEY);
        if (opt && sel.value) sessionStorage.setItem(SITE_MSG, "Working site set to " + opt.textContent.trim() + ".");
      } catch (e) {}
      location.reload();
      return true;
    }
    return false;
  }
  // Scripts call form.submit() directly (e.g. onchange="this.form.submit()"), which skips the submit
  // event. Route those through the demo too, so nothing is ever posted anywhere.
  HTMLFormElement.prototype.submit = function () {
    if (handleSubmit(this)) return;
    this.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  };

  document.addEventListener("submit", function (e) {
    var f = e.target;
    e.preventDefault(); e.stopImmediatePropagation();
    if (handleSubmit(f, e.submitter)) return;
    if (f.id === "changelist-search") {
      // Search the rows already on the page.
      var q = ((f.querySelector("input[name=q]") || {}).value || "").trim().toLowerCase(), shown = 0;
      document.querySelectorAll("#result_list tbody tr").forEach(function (tr) {
        var ok = !q || tr.textContent.toLowerCase().indexOf(q) >= 0; tr.style.display = ok ? "" : "none"; if (ok) shown++;
      });
      toast(q ? shown + " matching row" + (shown === 1 ? "" : "s") + " on this page." : "Showing all rows.");
      return;
    }
    toast("In the live demo, only Master Data, user and driver changes are saved. This form isn’t saved.");
  }, true);

  // Today's date in Bangladesh (Asia/Dhaka, UTC+6) from the visitor's clock, in the app's format
  // (Django "l, j N Y": "Thursday, 8 Oct. 2026", "Monday, 2 March 2026", "Friday, 11 Sept. 2026").
  var MONTHS = ["Jan.", "Feb.", "March", "April", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
  function dhakaToday(now) {
    var parts = {};
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dhaka", weekday: "long", day: "numeric", month: "numeric", year: "numeric" })
        .formatToParts(now).forEach(function (p) { parts[p.type] = p.value; });
    } catch (e) { // no time-zone support: Bangladesh is UTC+6 all year (no daylight saving)
      var d = new Date(now.getTime() + 6 * 3600 * 1000);
      parts = { weekday: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getUTCDay()],
        day: String(d.getUTCDate()), month: String(d.getUTCMonth() + 1), year: String(d.getUTCFullYear()) };
    }
    return parts.weekday + ", " + (+parts.day) + " " + MONTHS[+parts.month - 1] + " " + parts.year;
  }
  window.demoDhakaToday = dhakaToday;
  function showToday() { document.querySelectorAll("[data-demo-today]").forEach(function (el) { el.textContent = dhakaToday(new Date()); }); }

  document.addEventListener("DOMContentLoaded", function () {
    showToday();
    // A page left open past midnight (Dhaka) moves to the new day
    setInterval(showToday, 60 * 1000);
    var b = document.createElement("div");
    b.className = "demo-banner";
    b.innerHTML = '<span><b>Live demo</b> · Sample data. Master Data, user and driver changes last until you exit the demo.</span>' +
      '<a class="demo-banner__btn" href="../index.html">Exit demo</a>';
    document.body.insertBefore(b, document.body.firstChild);
    document.body.classList.add("has-demo-banner");
    // Exit demo: wipe everything this session created so the next demo starts from the original data.
    b.querySelector(".demo-banner__btn").addEventListener("click", function () {
      try {
        Object.keys(sessionStorage).forEach(function (k) { if (k.indexOf("optilogist-demo") === 0) sessionStorage.removeItem(k); });
        localStorage.removeItem(POI_KEY); // left over from older demo builds
      } catch (e) {}
    });
    applyWorkingSite();
    showSiteMessage();
  });
})();
