/**
 * Live POI stock & capacity panel — PR (destination) and TR create (source/destination).
 * Panel element: .dfms-poi-stock-panel with data-poi-select-name and data-incoming-mode.
 */
(function () {
  'use strict';

  var STOCK_URL_BASE = '/admin/requisitions/poi-stock/';
  var GLOBAL_BOUND = false;

  function getPanels() {
    return Array.prototype.slice.call(document.querySelectorAll('.dfms-poi-stock-panel'));
  }

  function getLivePanels() {
    return getPanels().filter(function (panel) {
      return panel.dataset.static !== '1' && panel.dataset.poiSelectName;
    });
  }

  function getPoiSelect(panel) {
    var name = panel && panel.dataset.poiSelectName;
    if (!name) return null;
    return (
      document.getElementById('id_' + name) ||
      document.querySelector('select[name="' + name + '"]')
    );
  }

  function getPoiId(selectEl) {
    if (!selectEl) return '';
    if (window.django && window.django.jQuery) {
      var val = window.django.jQuery(selectEl).val();
      if (val) return String(val);
    }
    return selectEl.value ? String(selectEl.value) : '';
  }

  function fmtMt(value) {
    if (value === null || value === undefined || value === '') return '—';
    var n = Number(value);
    if (Number.isNaN(n)) return '—';
    return n.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' MT';
  }

  function sumPrLineWeightKg() {
    var total = 0;
    document.querySelectorAll('[id$="-total_weight_kg"]').forEach(function (el) {
      var v = parseFloat(el.value || el.textContent || '0');
      if (!Number.isNaN(v)) total += v;
    });
    return total;
  }

  function sumTrAllocationKg() {
    var total = 0;
    document.querySelectorAll('.tr-alloc-table tbody tr').forEach(function (row) {
      var input = row.querySelector('.tr-alloc-input');
      var wpu = parseFloat(row.getAttribute('data-weight-per-unit') || '0');
      var qty = parseFloat((input && input.value) || '0');
      if (!Number.isNaN(qty) && !Number.isNaN(wpu)) total += qty * wpu;
    });
    return total;
  }

  function incomingWeightKg(panel) {
    var mode = (panel && panel.dataset.incomingMode) || 'pr_lines';
    if (mode === 'none') return 0;
    if (mode === 'tr_allocation') return sumTrAllocationKg();
    return sumPrLineWeightKg();
  }

  function hideWhenEmpty(panel) {
    return !!(panel && panel.dataset.hideWhenEmpty === '1');
  }

  function panelWrap(panel) {
    if (!panel) return null;
    return panel.closest('[data-poi-stock-panel-wrap]') || panel.closest('.tr-field') || panel;
  }

  function setPanelVisible(panel, visible) {
    if (!panel) return;
    if (hideWhenEmpty(panel)) {
      var wrap = panelWrap(panel);
      if (wrap) wrap.hidden = !visible;
    }
  }

  function setPanelLoading(panel) {
    if (!panel) return;
    setPanelVisible(panel, true);
    panel.querySelector('.dfms-poi-stock-panel__hint').textContent = 'Loading stock snapshot…';
    panel.querySelector('.dfms-poi-stock-panel__grid').hidden = true;
  }

  function setPanelError(panel, message) {
    if (!panel) return;
    setPanelVisible(panel, true);
    panel.querySelector('.dfms-poi-stock-panel__hint').textContent = message;
    panel.querySelector('.dfms-poi-stock-panel__grid').hidden = true;
  }

  function renderSnapshot(panel, data) {
    if (!panel || !data) return;
    setPanelVisible(panel, true);

    var grid = panel.querySelector('.dfms-poi-stock-panel__grid');
    var hint = panel.querySelector('.dfms-poi-stock-panel__hint');

    hint.textContent = data.poi_name
      ? 'Live snapshot for ' + data.poi_name + (data.poi_type ? ' (' + data.poi_type + ')' : '')
      : 'Stock snapshot';

    grid.hidden = false;
    grid.querySelector('[data-k="storage_capacity_mt"]').textContent = fmtMt(data.storage_capacity_mt);
    grid.querySelector('[data-k="current_stock_mt"]').textContent = fmtMt(data.current_stock_mt);
    grid.querySelector('[data-k="free_capacity_mt"]').textContent = fmtMt(data.free_capacity_mt);
  }

  function clearPanel(panel) {
    if (!panel) return;
    if (hideWhenEmpty(panel)) {
      setPanelVisible(panel, false);
      return;
    }
    panel.querySelector('.dfms-poi-stock-panel__hint').textContent =
      'Select a POI to view live stock.';
    panel.querySelector('.dfms-poi-stock-panel__grid').hidden = true;
  }

  function initialSnapshotForPanel(panel) {
    if (
      window.dfmsInitialPoiStockByPanel &&
      panel.id &&
      window.dfmsInitialPoiStockByPanel[panel.id]
    ) {
      return window.dfmsInitialPoiStockByPanel[panel.id];
    }
    if (window.dfmsInitialPoiStock && getLivePanels().length === 1) {
      return window.dfmsInitialPoiStock;
    }
    return null;
  }

  function panelsForSelect(selectEl) {
    if (!selectEl || !selectEl.id || selectEl.id.indexOf('id_') !== 0) return [];
    var name = selectEl.id.slice(3);
    return getLivePanels().filter(function (panel) {
      return panel.dataset.poiSelectName === name;
    });
  }

  function loadSnapshot(panel, poiId) {
    if (!poiId) {
      clearPanel(panel);
      return;
    }
    setPanelLoading(panel);
    var incoming = incomingWeightKg(panel);
    var url = STOCK_URL_BASE + encodeURIComponent(poiId) + '/';
    if (incoming > 0) {
      url += '?incoming_weight_kg=' + encodeURIComponent(Number(incoming).toFixed(3));
    }
    fetch(url, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'same-origin',
    })
      .then(function (r) {
        var contentType = r.headers.get('content-type') || '';
        if (!r.ok) {
          if (r.status === 403) {
            return Promise.reject(new Error('forbidden'));
          }
          return Promise.reject(new Error('http-' + r.status));
        }
        if (contentType.indexOf('application/json') === -1) {
          return Promise.reject(new Error('not-json'));
        }
        return r.json();
      })
      .then(function (data) {
        renderSnapshot(panel, data);
      })
      .catch(function (err) {
        if (!panel) return;
        if (err && err.message === 'forbidden') {
          setPanelError(panel, 'Stock snapshot is not available for the selected POI.');
          return;
        }
        setPanelError(panel, 'Unable to load stock snapshot for the selected POI.');
      });
  }

  function scheduleLoad(panel, poiId) {
    if (panel._dfmsStockFetchTimer) clearTimeout(panel._dfmsStockFetchTimer);
    panel._dfmsStockFetchTimer = setTimeout(function () {
      loadSnapshot(panel, poiId);
    }, 200);
  }

  function refreshPanel(panel) {
    var selectEl = getPoiSelect(panel);
    var poiId = getPoiId(selectEl);
    if (poiId) {
      scheduleLoad(panel, poiId);
      return;
    }
    var initial = initialSnapshotForPanel(panel);
    if (initial) {
      renderSnapshot(panel, initial);
      return;
    }
    if (hideWhenEmpty(panel)) {
      setPanelVisible(panel, false);
      return;
    }
    clearPanel(panel);
  }

  function bindGlobalListeners() {
    if (GLOBAL_BOUND) return;
    GLOBAL_BOUND = true;

    document.addEventListener('change', function (e) {
      var target = e.target;
      if (!target) return;
      panelsForSelect(target).forEach(function (panel) {
        scheduleLoad(panel, getPoiId(target));
      });
    });

    if (window.django && window.django.jQuery) {
      var $ = window.django.jQuery;
      $(document.body).on('select2:select select2:clear', 'select[id^="id_"]', function (e) {
        var selectEl = this;
        var poiId = (e.params && e.params.data && e.params.data.id) || getPoiId(selectEl);
        panelsForSelect(selectEl).forEach(function (panel) {
          if (!poiId) {
            clearPanel(panel);
            return;
          }
          scheduleLoad(panel, poiId);
        });
      });
    }
  }

  function init() {
    bindGlobalListeners();
    getLivePanels().forEach(refreshPanel);
  }

  function boot() {
    init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      boot();
      setTimeout(boot, 300);
    });
  } else {
    boot();
    setTimeout(boot, 300);
  }
  window.addEventListener('load', boot);

  document.addEventListener('input', function (e) {
    if (!e.target || !e.target.id) return;
    if (
      e.target.id.match(/-product_quantity$/) ||
      e.target.id.match(/-total_weight_kg$/) ||
      e.target.classList.contains('tr-alloc-input')
    ) {
      getLivePanels().forEach(refreshPanel);
    }
  });

  document.addEventListener('dfms-pr-line-weight-updated', function () {
    getLivePanels().forEach(refreshPanel);
  });
})();
