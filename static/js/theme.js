// Dark / light theme. Loaded in <head> so the page never flashes the wrong theme.
(function () {
  var KEY = "ux-admin-theme"; // same key as the live demo, so the choice carries between them
  var root = document.documentElement;
  var LABELS = {
    en: { dark: "Switch to dark mode", light: "Switch to light mode" },
    bn: { dark: "ডার্ক মোডে যান", light: "লাইট মোডে যান" }
  };

  function saved() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function preferred() {
    return saved() || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }
  function label() {
    var btn = document.getElementById("theme-toggle");
    if (!btn) return;
    var text = (LABELS[root.lang] || LABELS.en)[root.getAttribute("data-theme") === "dark" ? "light" : "dark"];
    btn.setAttribute("title", text);
    btn.setAttribute("aria-label", text);
  }
  function apply(theme) {
    root.setAttribute("data-theme", theme);
    label();
  }

  apply(preferred());

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("theme-toggle");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      apply(next);
      try { localStorage.setItem(KEY, next); } catch (e) {}
    });
    new MutationObserver(label).observe(root, { attributes: true, attributeFilter: ["lang"] });
    label();
  });

  window.addEventListener("storage", function (e) {
    if (e.key === KEY && e.newValue) apply(e.newValue);
  });
  // The back button can restore this page from cache after the theme was changed in the demo.
  window.addEventListener("pageshow", function () { apply(preferred()); });
})();
