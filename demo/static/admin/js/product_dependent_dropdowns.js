/**
 * DFMS Admin — Product form: dependent Category + Sub-Category dropdowns.
 *
 * - When Product Type changes, fetches matching active categories via AJAX
 *   and repopulates Category (then clears / reloads Sub-Category).
 * - When Category changes, fetches matching active sub-categories via AJAX.
 *
 * URLs are injected by the product change_form template:
 *   window.DFMS_CATEGORY_AJAX_URL
 *   window.DFMS_SUBCATEGORY_AJAX_URL
 * On edit forms (readonly product_type), also:
 *   window.DFMS_PRODUCT_TYPE
 */
(function () {
  'use strict';

  // Resolved lazily from data-uom-kg-defaults attribute on the weight input.
  var UOM_KG_DEFAULTS = null;

  function getUomKgDefaults(weightInputEl) {
    if (UOM_KG_DEFAULTS) return UOM_KG_DEFAULTS;
    try {
      UOM_KG_DEFAULTS = JSON.parse(weightInputEl.dataset.uomKgDefaults || '{}');
    } catch (e) {
      UOM_KG_DEFAULTS = {};
    }
    return UOM_KG_DEFAULTS;
  }

  /* ── CSRF helper ──────────────────────────────────────────────────────── */

  function getCsrfToken() {
    var el = document.querySelector('[name=csrfmiddlewaretoken]');
    return el ? el.value : '';
  }

  /* ── DOM helpers ──────────────────────────────────────────────────────── */

  function setDisabled(selectEl, disabled) {
    selectEl.disabled = disabled;
  }

  /**
   * Normalize select values to a lowercase token for robust comparisons.
   *
   * @param {string} value
   * @returns {string}
   */
  function normalizeValue(value) {
    return (value || '').toString().trim().toLowerCase();
  }

  /**
   * Enable/disable weight_per_unit based on selected unit_of_measure.
   *
   * @param {HTMLSelectElement} unitSelectEl
   * @param {HTMLElement}       weightInputEl
   */
  function toggleWeightPerUnit(unitSelectEl, weightInputEl) {
    if (!unitSelectEl || !weightInputEl) {
      return;
    }

    var defaults = getUomKgDefaults(weightInputEl);
    var normalizedUnit = normalizeValue(unitSelectEl.value);
    var kgDefault = defaults[normalizedUnit];
    var isAutoUOM = kgDefault !== undefined;

    // Always remove readonly first so value assignment is accepted
    weightInputEl.removeAttribute('readonly');

    if (isAutoUOM) {
      weightInputEl.value = String(kgDefault);
      weightInputEl.setAttribute('readonly', 'readonly');
      weightInputEl.style.opacity = '0.6';
      weightInputEl.style.cursor = 'default';
      weightInputEl.dataset.autoFilled = 'true';
    } else {
      weightInputEl.style.opacity = '';
      weightInputEl.style.cursor = '';
      if (weightInputEl.dataset.autoFilled === 'true') {
        weightInputEl.value = '';
        weightInputEl.dataset.autoFilled = 'false';
      }
    }
  }

  /**
   * Rebuild a <select> options list.
   *
   * @param {HTMLSelectElement} selectEl
   * @param {Array}             items      [{id, label}, ...]
   * @param {string|null}       preserveId UUID to keep selected
   */
  function populateOptions(selectEl, items, preserveId) {
    selectEl.innerHTML = '<option value="">---------</option>';
    items.forEach(function (item) {
      var opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = item.label;
      if (preserveId && item.id === preserveId) {
        opt.selected = true;
      }
      selectEl.appendChild(opt);
    });
  }

  /* ── Core fetch ───────────────────────────────────────────────────────── */

  /**
   * Fetch sub-categories for a given category UUID and repopulate the select.
   *
   * @param {string}            categoryId
   * @param {HTMLSelectElement} selectEl
   * @param {string|null}       preserveId
   */
  function fetchSubcategories(categoryId, selectEl, preserveId) {
    if (!categoryId) {
      populateOptions(selectEl, [], null);
      return;
    }

    var url = window.DFMS_SUBCATEGORY_AJAX_URL;
    if (!url) {
      return;
    }

    setDisabled(selectEl, true);

    fetch(url + '?category_id=' + encodeURIComponent(categoryId), {
      method: 'GET',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRFToken': getCsrfToken(),
      },
      credentials: 'same-origin',
    })
      .then(function (res) {
        if (!res.ok) {
          throw new Error('HTTP ' + res.status);
        }
        return res.json();
      })
      .then(function (data) {
        populateOptions(selectEl, data, preserveId);
      })
      .catch(function (err) {
        console.warn('[DFMS] Sub-category fetch failed:', err);
      })
      .finally(function () {
        setDisabled(selectEl, false);
      });
  }

  /**
   * Fetch categories for a given product_type and repopulate Category
   * (then refresh Sub-Category from the resulting selection).
   *
   * @param {string}            productType
   * @param {HTMLSelectElement} categorySelect
   * @param {HTMLSelectElement} subCategorySelect
   * @param {string|null}       preserveCategoryId
   * @param {string|null}       preserveSubId
   */
  function fetchCategories(
    productType,
    categorySelect,
    subCategorySelect,
    preserveCategoryId,
    preserveSubId
  ) {
    if (!productType) {
      populateOptions(categorySelect, [], null);
      populateOptions(subCategorySelect, [], null);
      return;
    }

    var url = window.DFMS_CATEGORY_AJAX_URL;
    if (!url) {
      return;
    }

    setDisabled(categorySelect, true);
    setDisabled(subCategorySelect, true);

    fetch(url + '?product_type=' + encodeURIComponent(productType), {
      method: 'GET',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRFToken': getCsrfToken(),
      },
      credentials: 'same-origin',
    })
      .then(function (res) {
        if (!res.ok) {
          throw new Error('HTTP ' + res.status);
        }
        return res.json();
      })
      .then(function (data) {
        populateOptions(categorySelect, data, preserveCategoryId);
        var selectedCategoryId = categorySelect.value || null;
        if (selectedCategoryId) {
          fetchSubcategories(
            selectedCategoryId,
            subCategorySelect,
            preserveSubId || null
          );
        } else {
          populateOptions(subCategorySelect, [], null);
          setDisabled(subCategorySelect, false);
        }
      })
      .catch(function (err) {
        console.warn('[DFMS] Category fetch failed:', err);
        setDisabled(subCategorySelect, false);
      })
      .finally(function () {
        setDisabled(categorySelect, false);
      });
  }

  /* ── Init ─────────────────────────────────────────────────────────────── */

  document.addEventListener('DOMContentLoaded', function () {
    var productTypeSelect = document.getElementById('id_product_type');
    var categorySelect = document.getElementById('id_category');
    var subCategorySelect = document.getElementById('id_sub_category');
    // On edit forms unit_of_measure is readonly — rendered as a <p> with no id.
    // On add forms it's a <select> with id_unit_of_measure.
    var uomSelect = document.getElementById('id_unit_of_measure');
    var weightPerUnitInput = document.getElementById('id_weight_per_unit');

    if (!categorySelect || !subCategorySelect) {
      return; // Not on the product add/change form.
    }

    var savedCategoryId = categorySelect.value || null;
    var savedSubId = subCategorySelect.value || null;

    // Resolve product_type: live <select> on add, or injected value on edit.
    var initialProductType =
      (productTypeSelect && productTypeSelect.value) ||
      window.DFMS_PRODUCT_TYPE ||
      '';

    if (initialProductType) {
      fetchCategories(
        initialProductType,
        categorySelect,
        subCategorySelect,
        savedCategoryId,
        savedSubId
      );
    } else if (savedCategoryId) {
      // No type yet — still refresh sub-categories for the saved category.
      fetchSubcategories(savedCategoryId, subCategorySelect, savedSubId);
    }

    if (productTypeSelect) {
      productTypeSelect.addEventListener('change', function () {
        fetchCategories(this.value, categorySelect, subCategorySelect, null, null);
      });
    }

    // React to the user changing the category.
    categorySelect.addEventListener('change', function () {
      fetchSubcategories(this.value, subCategorySelect, null);
    });

    if (weightPerUnitInput) {
      if (uomSelect) {
        // ADD form: UOM is a live <select> — toggle on load and on change.
        toggleWeightPerUnit(uomSelect, weightPerUnitInput);
        uomSelect.addEventListener('change', function () {
          toggleWeightPerUnit(uomSelect, weightPerUnitInput);
        });
      } else {
        // EDIT form: UOM is rendered as a readonly <p class="readonly"> — no select.
        var uomReadonlyEl = document.querySelector('.field-unit_of_measure .readonly');
        if (uomReadonlyEl) {
          var normalizedUnit = normalizeValue(uomReadonlyEl.textContent);
          var defaults = getUomKgDefaults(weightPerUnitInput);
          var kgDefault = defaults[normalizedUnit];
          if (kgDefault !== undefined) {
            // Always unlock → set → re-lock so the correct value is shown
            weightPerUnitInput.removeAttribute('readonly');
            weightPerUnitInput.value = String(kgDefault);
            weightPerUnitInput.setAttribute('readonly', 'readonly');
            weightPerUnitInput.style.opacity = '0.6';
            weightPerUnitInput.style.cursor = 'default';
            weightPerUnitInput.dataset.autoFilled = 'true';
          }
        }
      }
    }

    // Override the sub_category "delete related" button.
    // Django's default behaviour navigates to the object's delete page, but
    // for a nullable FK the user simply wants to clear the selection so they
    // can pick a different value — not destroy the sub-category record.
    var deleteSubCatBtn = document.getElementById('delete_id_sub_category');
    if (deleteSubCatBtn) {
      deleteSubCatBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        subCategorySelect.value = '';
        // Fire a change event so any other listeners (e.g. django-admin
        // related-widget handlers) stay in sync.
        subCategorySelect.dispatchEvent(new Event('change', { bubbles: true }));
      });

      // Update the tooltip to reflect the new behaviour.
      deleteSubCatBtn.title = 'Clear sub-category selection';
      var img = deleteSubCatBtn.querySelector('img');
      if (img) {
        img.alt = 'Clear sub-category selection';
      }
    }
  });

})();
