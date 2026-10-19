// Tenant login domain. Each organization signs in at <workspace>.<domain>.
// TODO: replace with the real production domain before going live.
var WORKSPACE_DOMAIN = "optilogist.example";

(function () {
  // ---------- Language toggle ----------
  var EN = {};
  var nodes = document.querySelectorAll("[data-i18n]");
  nodes.forEach(function (el) { var k = el.getAttribute("data-i18n"); if (!(k in EN)) EN[k] = el.innerHTML; });
  var phNodes = document.querySelectorAll("[data-i18n-ph]");
  phNodes.forEach(function (el) { EN[el.getAttribute("data-i18n-ph")] = el.getAttribute("placeholder"); });
  var titles = { en: document.title, bn: document.documentElement.getAttribute("data-title-bn") || "Optilogist | ডিস্ট্রিবিউশন ও ফ্লিট ম্যানেজমেন্ট" };

  function setLang(lang) {
    var dict = lang === "bn" ? (window.OPTILOGIST_BN || {}) : EN;
    nodes.forEach(function (el) { var k = el.getAttribute("data-i18n"); el.innerHTML = dict[k] || EN[k]; });
    phNodes.forEach(function (el) { var k = el.getAttribute("data-i18n-ph"); el.setAttribute("placeholder", dict[k] || EN[k]); });
    document.documentElement.lang = lang;
    document.title = titles[lang];
    document.querySelectorAll(".lang button").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.lang === lang ? "true" : "false"); });
    try { localStorage.setItem("optilogist-lang", lang); } catch (e) {}
  }
  document.querySelectorAll(".lang button").forEach(function (b) {
    b.addEventListener("click", function () { setLang(b.dataset.lang); });
  });
  var saved = null;
  try { saved = localStorage.getItem("optilogist-lang"); } catch (e) {}
  var urlLang = new URLSearchParams(window.location.search).get("lang");
  if (urlLang === "bn" || (urlLang !== "en" && saved === "bn")) setLang("bn");

  // ---------- Mobile menu ----------
  var toggle = document.querySelector(".nav__toggle");
  var menu = document.getElementById("nav-menu");
  toggle.addEventListener("click", function () {
    var open = menu.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
  menu.querySelectorAll("a, .js-login").forEach(function (link) {
    link.addEventListener("click", function () {
      menu.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    });
  });

  // ---------- Features dropdown (mega menu) ----------
  document.querySelectorAll(".nav__dd").forEach(function (dd) {
    var btn = dd.querySelector(".nav__ddbtn");
    var panel = document.getElementById(btn.getAttribute("aria-controls"));
    var card = panel.querySelector(".mega__card");
    var hoverable = window.matchMedia("(hover: hover) and (min-width: 901px)");
    var closeTimer = null;
    function place() { // point the card's caret at the button
      var b = btn.getBoundingClientRect(), c = card.getBoundingClientRect();
      if (c.width) card.style.setProperty("--caret-x", Math.round(b.left + b.width / 2 - c.left) + "px");
    }
    function setOpen(open) {
      clearTimeout(closeTimer);
      panel.hidden = !open;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) place();
    }
    btn.addEventListener("click", function () { setOpen(panel.hidden); });
    dd.addEventListener("mouseenter", function () { if (hoverable.matches) setOpen(true); });
    dd.addEventListener("mouseleave", function () {
      if (hoverable.matches) closeTimer = setTimeout(function () { setOpen(false); }, 150);
    });
    document.addEventListener("click", function (e) { if (!dd.contains(e.target)) setOpen(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !panel.hidden) { setOpen(false); btn.focus(); }
    });
    dd.addEventListener("focusout", function (e) { if (hoverable.matches && !dd.contains(e.relatedTarget)) setOpen(false); });
    panel.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", function () { setOpen(false); }); });
    window.addEventListener("resize", function () { if (!panel.hidden) place(); });
  });

  // ---------- Tabs (workflow steps and roles) ----------
  function initTabs(tablist) {
    var tabs = Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"]'));
    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
      });
      if (focus) tab.focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { select(t); });
      t.addEventListener("keydown", function (e) {
        if (e.key === "ArrowRight") select(tabs[(i + 1) % tabs.length], true);
        if (e.key === "ArrowLeft") select(tabs[(i - 1 + tabs.length) % tabs.length], true);
      });
    });
  }
  document.querySelectorAll('[role="tablist"]').forEach(initTabs);

  // ---------- Workspace login ----------
  var dialog = document.getElementById("login-dialog");
  var form = document.getElementById("login-form");
  var input = document.getElementById("workspace");
  document.querySelector(".js-domain").textContent = "." + WORKSPACE_DOMAIN;
  document.querySelectorAll(".js-login").forEach(function (b) {
    b.addEventListener("click", function () {
      if (typeof dialog.showModal === "function") { dialog.showModal(); input.focus(); }
    });
  });
  form.addEventListener("submit", function (e) {
    if (e.submitter && e.submitter.value === "cancel") return;
    e.preventDefault();
    if (!input.checkValidity()) { input.reportValidity(); return; }
    window.location.href = "https://" + input.value.trim().toLowerCase() + "." + WORKSPACE_DOMAIN + "/";
  });

  // ---------- Footer year ----------
  document.getElementById("year").textContent = new Date().getFullYear();
})();
