/**
 * Cascade Division -> District -> Upazila -> Village from the local admin list.
 * Villages load from the selected upazila (DPHE geo list).
 */
(function () {
  "use strict";

  function readTree() {
    var node = document.getElementById("bd-admin-locations");
    if (!node) return null;
    try {
      return JSON.parse(node.textContent);
    } catch (error) {
      return null;
    }
  }

  function fillSelect(select, names, selected, labels) {
    destroySearch(select);
    var current = selected == null ? "" : selected;
    select.innerHTML = "";
    var blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "";
    select.appendChild(blank);
    (names || []).forEach(function (name) {
      var option = document.createElement("option");
      option.value = name;
      option.textContent = (labels && labels[name]) || name;
      select.appendChild(option);
    });
    if (current && (names || []).indexOf(current) === -1) {
      var extra = document.createElement("option");
      extra.value = current;
      extra.textContent = current;
      select.appendChild(extra);
    }
    select.value = current;
    attachSearch(select);
  }

  function jquery() {
    return window.django && window.django.jQuery;
  }

  function destroySearch(select) {
    var $ = jquery();
    if (!$ || !select) return;
    var $el = $(select);
    if ($el.data("select2")) $el.select2("destroy");
  }

  function boxWidth(select) {
    var text = "Search";
    if (select.selectedIndex >= 0 && select.options[select.selectedIndex]) {
      text = (select.options[select.selectedIndex].textContent || "").trim() || text;
    }
    if (text === "---------") text = "Search";
    return Math.max(text.length + 6, 22) + "ch";
  }

  function attachSearch(select) {
    var $ = jquery();
    if (!select) return;
    if (!$ || !$.fn || !$.fn.select2) {
      if (!select.dataset.searchWait) {
        select.dataset.searchWait = "1";
        window.setTimeout(function () {
          delete select.dataset.searchWait;
          attachSearch(select);
        }, 50);
      }
      return;
    }
    var $el = $(select);
    if ($el.data("select2")) $el.select2("destroy");
    $el.select2({
      width: boxWidth(select),
      placeholder: "Search",
      allowClear: false,
      minimumResultsForSearch: 0,
      dropdownAutoWidth: true,
    });
    $el.off("select2:open.area").on("select2:open.area", function () {
      window.setTimeout(function () {
        var field = document.querySelector(
          ".select2-container--open .select2-search--dropdown .select2-search__field"
        );
        if (field) field.setAttribute("placeholder", "Search");
      }, 0);
    });
    $el.off("change.areaSize").on("change.areaSize", function () {
      var box = $el.next(".select2-container");
      if (box.length) box.css("width", boxWidth(select));
    });
  }

  function fillLabeled(select, rows, selected, allowExtra) {
    destroySearch(select);
    var current = selected == null ? "" : selected;
    var values = [];
    select.innerHTML = "";
    var blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "";
    select.appendChild(blank);
    (rows || []).forEach(function (row) {
      var option = document.createElement("option");
      option.value = row.value;
      option.textContent = row.label;
      select.appendChild(option);
      values.push(row.value);
    });
    if (allowExtra !== false && current && values.indexOf(current) === -1) {
      var extra = document.createElement("option");
      extra.value = current;
      extra.textContent = current;
      select.appendChild(extra);
    }
    select.value = current;
    attachSearch(select);
  }

  function init() {
    var data = readTree();
    var division = document.getElementById("id_region");
    var district = document.getElementById("id_district");
    var upazila = document.getElementById("id_upazila");
    var village = document.getElementById("id_village");
    var geo = document.getElementById("dphe-geo");
    if (!data || !division || !district || !upazila) return;
    if (division.dataset.areaBound) return;
    var $ = jquery();
    if (!$ || !$.fn || !$.fn.select2) {
      window.setTimeout(init, 50);
      return;
    }
    division.dataset.areaBound = "1";

    var labels = data.labels || {};
    var requestId = 0;

    function clearVillage() {
      if (village) fillLabeled(village, [], "");
    }

    function loadVillages(keepVillage) {
      if (!village || !geo || !geo.getAttribute("data-url")) return;
      var url = geo.getAttribute("data-url");
      var current = ++requestId;
      var params = new URLSearchParams({
        district: district.value,
        upazila: upazila.value,
      });
      fetch(url + "?" + params.toString(), { credentials: "same-origin" })
        .then(function (response) {
          if (!response.ok) throw new Error("geo");
          return response.json();
        })
        .then(function (payload) {
          if (current !== requestId) return;
          fillLabeled(village, payload.villages || [], keepVillage || "");
        })
        .catch(function () {
          if (current !== requestId) return;
          fillLabeled(village, [], keepVillage || "");
        });
    }

    function refillFromDistrict(keepUpazila) {
      fillSelect(
        upazila,
        data.upazilas_by_district[district.value] || [],
        keepUpazila,
        (labels.upazilas || {})[district.value]
      );
    }

    $(division).on("change", function () {
      requestId += 1;
      fillSelect(district, data.districts_by_division[division.value] || [], "", labels.districts);
      refillFromDistrict("");
      clearVillage();
    });

    $(district).on("change", function () {
      requestId += 1;
      refillFromDistrict("");
      clearVillage();
    });

    $(upazila).on("change", function () {
      loadVillages("");
    });

    attachSearch(division);
    fillSelect(
      district,
      data.districts_by_division[division.value] || [],
      district.value,
      labels.districts
    );
    refillFromDistrict(upazila.value);
    loadVillages(village ? village.value : "");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  function attachSitePoiHint() {
    var select = document.getElementById("id_site_pois");
    if (!select || !window.django || !window.django.jQuery) {
      return;
    }
    var $select = window.django.jQuery(select);
    if (!$select.data("select2")) {
      window.setTimeout(attachSitePoiHint, 50);
      return;
    }
    var box = select.nextElementSibling;
    if (!box || !box.classList.contains("select2-container")) {
      window.setTimeout(attachSitePoiHint, 50);
      return;
    }
    function setHint() {
      var field = box.querySelector(".select2-search__field");
      if (!field) {
        return;
      }
      var hint = select.selectedOptions.length ? "Click to add more" : "Click to add";
      if (field.getAttribute("placeholder") !== hint) {
        field.setAttribute("placeholder", hint);
      }
    }
    setHint();
    new MutationObserver(setHint).observe(box, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["placeholder"],
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachSitePoiHint);
  } else {
    attachSitePoiHint();
  }
})();
