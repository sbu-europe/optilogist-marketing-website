/* TUM-06 — Select2 chips on Site (POI) multi-selects (invite + per-role edit).

   Do not include select2.full.js in ModelAdmin.Media extrahead: admin jQuery
   is initialized at the bottom of the page, so a head load fails with
   "jQuery was not found". Lazy-load after django.jQuery exists.
*/
(function () {
  function $jq() {
    return window.django && django.jQuery;
  }

  function select2ScriptSrc() {
    var css = document.querySelector('link[href*="admin/css/vendor/select2/select2"]');
    if (!css || !css.href) {
      return "/static/admin/js/vendor/select2/select2.full.js";
    }
    return css.href
      .replace("admin/css/vendor/select2/select2.min.css", "admin/js/vendor/select2/select2.full.min.js")
      .replace("admin/css/vendor/select2/select2.css", "admin/js/vendor/select2/select2.full.js");
  }

  function initOne(el) {
    var $ = $jq();
    if (!$ || !$.fn || !$.fn.select2 || !el) return;
    var $el = $(el);
    if ($el.hasClass("select2-hidden-accessible")) return;
    $el.select2({
      width: "100%",
      placeholder: $el.attr("data-placeholder") || "Select sites…",
      closeOnSelect: false,
      allowClear: true,
    });
  }

  function initAll(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var nodes = scope.querySelectorAll("select.dfms-poi-multiselect");
    Array.prototype.forEach.call(nodes, initOne);
  }

  function withSelect2(cb) {
    var $ = $jq();
    if (!$ ) return;
    if ($.fn.select2) {
      cb();
      return;
    }
    if (window._dfmsSelect2Loading) {
      window._dfmsSelect2Loading.push(cb);
      return;
    }
    window._dfmsSelect2Loading = [cb];
    window.jQuery = $;
    window.$ = $;
    var script = document.createElement("script");
    script.src = select2ScriptSrc();
    script.onload = function () {
      var cbs = window._dfmsSelect2Loading || [];
      window._dfmsSelect2Loading = null;
      cbs.forEach(function (fn) { fn(); });
    };
    (document.body || document.head).appendChild(script);
  }

  window.dfmsInitPoiSelect2 = function (root) {
    withSelect2(function () { initAll(root); });
  };

  window.dfmsClearPoiSelect2 = function (el) {
    var $ = $jq();
    if (!$ || !el) return;
    var $el = $(el);
    $el.val(null);
    if ($el.hasClass("select2-hidden-accessible")) {
      $el.trigger("change");
    }
  };
})();
