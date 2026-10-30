

(function () {
  function $jq() {
    return window.appCore && appCore.jQuery;
  }

  function select2ScriptSrc() {
    var css = document.querySelector('link[href*="app/css/vendor/select2/select2"]');
    if (!css || !css.href) {
      return "/static/app/js/vendor/select2/select2.full.js";
    }
    return css.href
      .replace("app/css/vendor/select2/select2.min.css", "app/js/vendor/select2/select2.full.min.js")
      .replace("app/css/vendor/select2/select2.css", "app/js/vendor/select2/select2.full.js");
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
    var nodes = scope.querySelectorAll("select.ux-poi-multiselect");
    Array.prototype.forEach.call(nodes, initOne);
  }

  function withSelect2(cb) {
    var $ = $jq();
    if (!$ ) return;
    if ($.fn.select2) {
      cb();
      return;
    }
    if (window._uxSelect2Loading) {
      window._uxSelect2Loading.push(cb);
      return;
    }
    window._uxSelect2Loading = [cb];
    window.jQuery = $;
    window.$ = $;
    var script = document.createElement("script");
    script.src = select2ScriptSrc();
    script.onload = function () {
      var cbs = window._uxSelect2Loading || [];
      window._uxSelect2Loading = null;
      cbs.forEach(function (fn) { fn(); });
    };
    (document.body || document.head).appendChild(script);
  }

  window.uxInitPoiSelect2 = function (root) {
    withSelect2(function () { initAll(root); });
  };

  window.uxClearPoiSelect2 = function (el) {
    var $ = $jq();
    if (!$ || !el) return;
    var $el = $(el);
    $el.val(null);
    if ($el.hasClass("select2-hidden-accessible")) {
      $el.trigger("change");
    }
  };
})();
