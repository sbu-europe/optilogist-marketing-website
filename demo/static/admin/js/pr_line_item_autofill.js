/**
 * PR Line Item Autofill
 *
 * Uses event delegation so it works for ALL product selects —
 * both pre-rendered rows (edit form) and rows added via "Add another".
 */
(function () {
  'use strict';

  var DETAIL_URL_BASE = '/admin/requisitions/product-detail/';

  function getRowField(selectEl, fieldName) {
    var idMatch = selectEl.id.match(/^(id_.+)-product$/);
    if (!idMatch) return null;
    return document.getElementById(idMatch[1] + '-' + fieldName);
  }

  function setField(el, value) {
    if (!el) return;
    var v = value || '';
    if (el.tagName === 'P') {
      el.textContent = v || '-';
    } else {
      // INPUT, TEXTAREA, or SELECT
      el.value = v;
    }
  }

  function autofillRow(selectEl, productId) {
    if (!productId) return;
    fetch(DETAIL_URL_BASE + productId + '/', {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'same-origin',
    })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (data) {
        setField(getRowField(selectEl, 'product_item_code'), data.product_item_code);
        setField(getRowField(selectEl, 'product_name'),      data.product_name);
        setField(getRowField(selectEl, 'product_category'),  data.product_category);
        setField(getRowField(selectEl, 'product_sub_category'), data.product_sub_category);
        setField(getRowField(selectEl, 'type_of_packing'),   data.type_of_packing);
        setField(getRowField(selectEl, 'unit_of_measure'), data.unit_of_measure);

        // Only set weight_per_unit if the API returns a real value
        var wgtEl = getRowField(selectEl, 'weight_per_unit');
        if (wgtEl && data.weight_per_unit) {
          setField(wgtEl, data.weight_per_unit);
        }

        // Recalculate total weight after product autofill
        var idMatch = selectEl.id.match(/^(id_.+)-product$/);
        if (idMatch) recalcTotalWeightByPrefix(idMatch[1]);
      })
      .catch(function () {});
  }

  function formatQty(value) {
    var n = Number(value);
    if (!isFinite(n)) return '0';
    var rounded = Math.round(n * 1000) / 1000;
    if (Math.abs(rounded - Math.round(rounded)) < 1e-9) {
      return String(Math.round(rounded));
    }
    return rounded.toFixed(3);
  }

  function recalcTotalWeightByPrefix(prefix) {
    var qtyEl   = document.getElementById(prefix + '-product_quantity');
    var wgtEl   = document.getElementById(prefix + '-weight_per_unit');
    var totalEl = document.getElementById(prefix + '-total_weight_kg');
    if (!qtyEl || !wgtEl || !totalEl) return;

    var qty = parseFloat(qtyEl.value) || 0;
    var wgt = parseFloat(wgtEl.value) || 0;
    var total = formatQty(qty * wgt);

    if (totalEl.tagName === 'P') {
      totalEl.textContent = total;
    } else {
      totalEl.value = total;
    }
    document.dispatchEvent(new CustomEvent('dfms-pr-line-weight-updated'));
  }

  function recalcTotalWeight(quantityInput) {
    var idMatch = quantityInput.id.match(/^(id_.+)-product_quantity$/);
    if (!idMatch) return;
    recalcTotalWeightByPrefix(idMatch[1]);
  }

  function clearProductSnapshot(el) {
    ['product_item_code', 'product_name', 'product_category',
     'product_sub_category', 'type_of_packing', 'unit_of_measure'].forEach(function (f) {
      setField(getRowField(el, f), '');
    });
  }

  function onProductChosen(el) {
    if (el.value) {
      autofillRow(el, el.value);
    } else {
      clearProductSnapshot(el);
    }
  }

  // On page load: trigger autofill for product selects on ADD forms (no pk in URL)
  // On edit forms, existing data is already correct; only fill empty UOM fields.
  // Bind Select2 after jquery.init.js (this file can load before django.jQuery exists).
  document.addEventListener('DOMContentLoaded', function () {
    var isAddForm = /\/add\/$/.test(window.location.pathname);
    document.querySelectorAll('select[id$="-product"]').forEach(function (sel) {
      if (!sel.value) return;
      var uomEl = getRowField(sel, 'unit_of_measure');
      // Autofill if: add form, OR UOM is empty/default placeholder
      var uomIsDefault = !uomEl || !uomEl.value || uomEl.value === 'Tons';
      if (isAddForm || uomIsDefault) {
        autofillRow(sel, sel.value);
      }
    });

    if (window.django && django.jQuery) {
      var $ = django.jQuery;
      $(document.body).on(
        'select2:select',
        '#line_items-group select[id$="-product"]',
        function () {
          onProductChosen(this);
        }
      );
      $(document.body).on(
        'select2:clear change',
        '#line_items-group select[id$="-product"]',
        function () {
          onProductChosen(this);
        }
      );
    }
  });

  // Product selection — autofill readonly fields (Port native <select>)
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (!el || !el.id) return;

    if (el.id.match(/-product$/)) {
      onProductChosen(el);
    }
  });

  // Quantity input — recalculate total weight live
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (!el || !el.id) return;
    if (el.id.match(/-product_quantity$/)) {
      recalcTotalWeight(el);
    }
  });
})();
