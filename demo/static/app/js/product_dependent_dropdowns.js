

(function () {
  'use strict';

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

  function getCsrfToken() {
    var el = document.querySelector('[name=formtoken]');
    return el ? el.value : '';
  }

  function setDisabled(selectEl, disabled) {
    selectEl.disabled = disabled;
  }

  function normalizeValue(value) {
    return (value || '').toString().trim().toLowerCase();
  }

  function toggleWeightPerUnit(unitSelectEl, weightInputEl) {
    if (!unitSelectEl || !weightInputEl) {
      return;
    }

    var defaults = getUomKgDefaults(weightInputEl);
    var normalizedUnit = normalizeValue(unitSelectEl.value);
    var kgDefault = defaults[normalizedUnit];
    var isAutoUOM = kgDefault !== undefined;

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

  function fetchSubcategories(categoryId, selectEl, preserveId) {
    if (!categoryId) {
      populateOptions(selectEl, [], null);
      return;
    }

    var url = window.UX_SUBCATEGORY_AJAX_URL;
    if (!url) {
      return;
    }

    setDisabled(selectEl, true);

    fetch(url + '?category_id=' + encodeURIComponent(categoryId), {
      method: 'GET',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'X-Form-Token': getCsrfToken(),
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
        console.warn('[Fleet] Sub-category fetch failed:', err);
      })
      .finally(function () {
        setDisabled(selectEl, false);
      });
  }

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

    var url = window.UX_CATEGORY_AJAX_URL;
    if (!url) {
      return;
    }

    setDisabled(categorySelect, true);
    setDisabled(subCategorySelect, true);

    fetch(url + '?product_type=' + encodeURIComponent(productType), {
      method: 'GET',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'X-Form-Token': getCsrfToken(),
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
        console.warn('[Fleet] Category fetch failed:', err);
        setDisabled(subCategorySelect, false);
      })
      .finally(function () {
        setDisabled(categorySelect, false);
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var productTypeSelect = document.getElementById('id_product_type');
    var categorySelect = document.getElementById('id_category');
    var subCategorySelect = document.getElementById('id_sub_category');

    var uomSelect = document.getElementById('id_unit_of_measure');
    var weightPerUnitInput = document.getElementById('id_weight_per_unit');

    if (!categorySelect || !subCategorySelect) {
      return;
    }

    var savedCategoryId = categorySelect.value || null;
    var savedSubId = subCategorySelect.value || null;

    var initialProductType =
      (productTypeSelect && productTypeSelect.value) ||
      window.UX_PRODUCT_TYPE ||
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

      fetchSubcategories(savedCategoryId, subCategorySelect, savedSubId);
    }

    if (productTypeSelect) {
      productTypeSelect.addEventListener('change', function () {
        fetchCategories(this.value, categorySelect, subCategorySelect, null, null);
      });
    }

    categorySelect.addEventListener('change', function () {
      fetchSubcategories(this.value, subCategorySelect, null);
    });

    if (weightPerUnitInput) {
      if (uomSelect) {

        toggleWeightPerUnit(uomSelect, weightPerUnitInput);
        uomSelect.addEventListener('change', function () {
          toggleWeightPerUnit(uomSelect, weightPerUnitInput);
        });
      } else {

        var uomReadonlyEl = document.querySelector('.field-unit_of_measure .readonly');
        if (uomReadonlyEl) {
          var normalizedUnit = normalizeValue(uomReadonlyEl.textContent);
          var defaults = getUomKgDefaults(weightPerUnitInput);
          var kgDefault = defaults[normalizedUnit];
          if (kgDefault !== undefined) {

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

    var deleteSubCatBtn = document.getElementById('delete_id_sub_category');
    if (deleteSubCatBtn) {
      deleteSubCatBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        subCategorySelect.value = '';

        subCategorySelect.dispatchEvent(new Event('change', { bubbles: true }));
      });

      deleteSubCatBtn.title = 'Clear sub-category selection';
      var img = deleteSubCatBtn.querySelector('img');
      if (img) {
        img.alt = 'Clear sub-category selection';
      }
    }
  });

})();
