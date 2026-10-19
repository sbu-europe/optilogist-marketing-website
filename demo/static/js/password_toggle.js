// Generic password visibility toggle (suffix icon).
// Works for any button with: .dfms-password-toggle[data-target="input_id"]
(function () {
  function setIcon(btn, visible) {
    var icon = btn.querySelector("i.bi");
    if (!icon) return;
    icon.classList.toggle("bi-eye", !visible);
    icon.classList.toggle("bi-eye-slash", !!visible);
  }

  function setAria(btn, visible) {
    btn.setAttribute("aria-pressed", visible ? "true" : "false");
    btn.setAttribute("aria-label", visible ? "Hide password" : "Show password");
    btn.setAttribute("title", visible ? "Hide password" : "Show password");
  }

  function toggle(btn) {
    var targetId = btn.getAttribute("data-target");
    if (!targetId) return;
    var input = document.getElementById(targetId);
    if (!input) return;

    var visible = input.type === "text";
    input.type = visible ? "password" : "text";
    setIcon(btn, !visible);
    setAria(btn, !visible);
  }

  document.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest ? e.target.closest(".dfms-password-toggle") : null;
    if (!btn) return;
    e.preventDefault();
    toggle(btn);
  });

  document.addEventListener("DOMContentLoaded", function () {
    var btns = document.querySelectorAll(".dfms-password-toggle[data-target]");
    for (var i = 0; i < btns.length; i++) {
      var btn = btns[i];
      var input = document.getElementById(btn.getAttribute("data-target") || "");
      var visible = !!(input && input.type === "text");
      setIcon(btn, visible);
      setAria(btn, visible);
    }
  });
})();

