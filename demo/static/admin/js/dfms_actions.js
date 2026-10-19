/**
 * DFMS Admin — Changelist Table Actions
 *
 * Provides:
 *  1. Per-row ⋮ dropdown menu (Edit / Delete / custom actions)
 *  2. Contextual selection toolbar (slides in when rows are checked)
 */

(function () {
  'use strict';

  /* ── Shared singleton dropdown ─────────────────────────────────────────── */

  var activeDropdown = null;

  function closeActiveDropdown() {
    if (activeDropdown) {
      activeDropdown.classList.remove('dfms-row-dropdown--open');
      activeDropdown = null;
    }
  }

  document.addEventListener('click', closeActiveDropdown);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeActiveDropdown();
  });

  /* ─────────────────────────────────────────────────────────────────────────
     1. Per-row dropdown menus
     ───────────────────────────────────────────────────────────────────────── */

  /**
   * ⋮ Delete is Master Data only (body.app-master_data from Django changelist).
   * Override per table with data-dfms-allow-row-delete="true"|"false" on #result_list.
   */
  function allowRowDeleteMenu(resultList) {
    var flag = resultList && resultList.getAttribute('data-dfms-allow-row-delete');
    if (flag === 'true') return true;
    if (flag === 'false') return false;
    return document.body.classList.contains('app-master_data');
  }

  function initRowActions() {
    var resultList = document.getElementById('result_list');
    if (!resultList || resultList.dataset.dfmsNoRowActions === 'true') return;

    var tbody = resultList.querySelector('tbody');
    var thead = resultList.querySelector('thead tr');
    if (!tbody || !thead) return;

    // Add header cell for the actions column
    if (!thead.querySelector('.dfms-row-actions-header')) {
      var th = document.createElement('th');
      th.className = 'dfms-row-actions-header';
      th.setAttribute('scope', 'col');
      thead.appendChild(th);
    }

    // Create a single shared dropdown panel
    var dropdown = document.getElementById('dfms-row-dropdown');
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.className = 'dfms-row-dropdown';
      dropdown.id = 'dfms-row-dropdown';
      document.body.appendChild(dropdown);
    }

    var rowDeleteAllowed = allowRowDeleteMenu(resultList);
    var rows = tbody.querySelectorAll('tr');

    rows.forEach(function (row) {
      // Extract edit URL — Django puts the object link on the first <th> or first non-checkbox <td>
      var firstLink = row.querySelector('th a') || row.querySelector('td:not(.action-checkbox) a');
      var editUrl   = firstLink ? firstLink.href : null;

      // Build delete URL only on Master Data (or explicit allow). Still respect
      // per-row data-dfms-can-delete="false" when delete is otherwise allowed.
      var deleteUrl = null;
      var canDeleteEl = row.querySelector('[data-dfms-can-delete]');
      var canDelete = !canDeleteEl || canDeleteEl.getAttribute('data-dfms-can-delete') !== 'false';
      if (editUrl && rowDeleteAllowed && canDelete) {
        var candidate = editUrl.replace('/change/', '/delete/');
        if (candidate !== editUrl) {
          deleteUrl = candidate;
        } else {
          // URL doesn't contain /change/ — derive delete from the path directly
          // e.g. /admin/app/model/123/ -> /admin/app/model/123/delete/
          var url = editUrl.replace(/\/$/, '');
          deleteUrl = url + '/delete/';
        }
      }

      // Create the ⋮ cell
      if (row.querySelector('.dfms-row-actions')) return;
      var td = document.createElement('td');
      td.className = 'dfms-row-actions';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dfms-row-menu-btn';
      btn.setAttribute('aria-label', 'Row actions');
      btn.setAttribute('tabindex', '-1');
      btn.innerHTML = '<i class="bi bi-three-dots-vertical"></i>';

      btn.addEventListener('click', function (e) {
        e.stopPropagation();

        // If this row's dropdown is already open, close it
        if (activeDropdown === dropdown && dropdown.dataset.row === row.rowIndex.toString()) {
          closeActiveDropdown();
          return;
        }

        closeActiveDropdown();

        // Build menu items
        dropdown.innerHTML = '';
        dropdown.dataset.row = row.rowIndex.toString();

        if (editUrl) {
          dropdown.appendChild(makeItem('bi bi-pencil', 'Edit', editUrl));
        }

        if (deleteUrl) {
          if (editUrl) {
            var div = document.createElement('div');
            div.className = 'dfms-row-dropdown-divider';
            dropdown.appendChild(div);
          }
          dropdown.appendChild(makeItem('bi bi-trash', 'Delete', deleteUrl, true));
        }

        // If no links were found, show a fallback
        if (!editUrl && !deleteUrl) {
          var fallback = document.createElement('span');
          fallback.className = 'dfms-row-dropdown-item';
          fallback.style.color = 'var(--dfms-grey-400)';
          fallback.textContent = 'No actions';
          dropdown.appendChild(fallback);
        }

        // Position in viewport coords (panel is position:fixed). Prefer below the
        // button; flip above when there is not enough space; clamp to edges.
        var gap = 4;
        var rect = btn.getBoundingClientRect();
        var menuW = Math.max(dropdown.offsetWidth, 148);
        var menuH = dropdown.offsetHeight;
        var top = rect.bottom + gap;
        if (top + menuH > window.innerHeight - gap && rect.top - menuH - gap >= gap) {
          top = rect.top - menuH - gap;
        } else {
          top = Math.min(top, Math.max(gap, window.innerHeight - menuH - gap));
        }
        var left = rect.right - menuW;
        left = Math.max(gap, Math.min(left, window.innerWidth - menuW - gap));
        dropdown.style.top = top + 'px';
        dropdown.style.left = left + 'px';

        dropdown.classList.add('dfms-row-dropdown--open');
        activeDropdown = dropdown;
      });

      td.appendChild(btn);
      row.appendChild(td);
    });
  }

  function makeItem(iconClass, label, href, isDanger) {
    var a = document.createElement('a');
    a.href = href;
    a.className = 'dfms-row-dropdown-item' + (isDanger ? ' dfms-row-dropdown-item--danger' : '');
    a.innerHTML = '<i class="' + iconClass + '"></i>' + label;
    return a;
  }

  /* ─────────────────────────────────────────────────────────────────────────
     2. Contextual selection toolbar
     ───────────────────────────────────────────────────────────────────────── */

  function initSelectionToolbar() {
    var resultList = document.getElementById('result_list');
    if (!resultList) return;

    var toolbar      = document.getElementById('dfms-selection-toolbar');
    var countEl      = document.getElementById('dfms-selected-count');
    var countBadge   = document.getElementById('dfms-selected-badge');
    var toolbarActs  = document.getElementById('dfms-toolbar-actions');
    var clearBtn     = document.getElementById('dfms-clear-selection');
    var actionsBar   = document.querySelector('#changelist-form .actions');
    var actionSelect = actionsBar && actionsBar.querySelector('select[name="action"]');

    if (!toolbar) return;

    // Hide the original actions bar immediately — the selection toolbar replaces it
    if (actionsBar) actionsBar.style.display = 'none';

    // Build toolbar action buttons from the existing Django actions <select>
    if (actionSelect && toolbarActs) {
      Array.prototype.forEach.call(actionSelect.options, function (opt) {
        if (!opt.value) return; // skip the "---" placeholder
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dfms-toolbar-action-btn' +
          (isDangerAction(opt.value) ? ' dfms-toolbar-action-btn--danger' : '');
        btn.textContent = opt.text;
        btn.dataset.action = opt.value;
        btn.addEventListener('click', function () {
          actionSelect.value = opt.value;
          // Submit the changelist form
          var form = document.getElementById('changelist-form');
          if (form) {
            // Use a hidden submit to trigger Django's action processing
            var hidden = document.createElement('input');
            hidden.type = 'hidden';
            hidden.name = 'index';
            hidden.value = '0';
            form.appendChild(hidden);
            form.submit();
          }
        });
        toolbarActs.appendChild(btn);
      });
    }

    // Watch checkboxes
    function getCheckboxes() {
      return resultList.querySelectorAll('input[type="checkbox"].action-select');
    }

    function updateToolbar() {
      var boxes   = getCheckboxes();
      var checked = 0;
      boxes.forEach(function (cb) { if (cb.checked) checked++; });

      if (checked > 0) {
        toolbar.removeAttribute('hidden');
        if (countEl)    countEl.textContent = checked;
        if (countBadge) countBadge.textContent = checked;
      } else {
        toolbar.setAttribute('hidden', '');
        // Keep actionsBar hidden — toolbar is the permanent replacement
      }
    }

    // Delegate change events
    if (!resultList.dataset.dfmsToolbarBound) {
      resultList.addEventListener('change', function (e) {
        if (e.target && e.target.type === 'checkbox') {
          updateToolbar();
        }
      });
      resultList.dataset.dfmsToolbarBound = '1';
    }

    // Also watch the select-all checkbox in the header
    var headerCheckbox = document.querySelector('#action-toggle, thead input[type="checkbox"]');
    if (headerCheckbox && !headerCheckbox.dataset.dfmsToolbarBound) {
      headerCheckbox.addEventListener('change', function () {
        // Small delay to let Django's built-in toggle script run first
        setTimeout(updateToolbar, 10);
      });
      headerCheckbox.dataset.dfmsToolbarBound = '1';
    }

    // Clear button
    if (clearBtn && !clearBtn.dataset.dfmsToolbarBound) {
      clearBtn.addEventListener('click', function () {
        getCheckboxes().forEach(function (cb) { cb.checked = false; });
        if (headerCheckbox) headerCheckbox.checked = false;
        updateToolbar();
      });
      clearBtn.dataset.dfmsToolbarBound = '1';
    }

    // Initial state
    updateToolbar();
  }

  function isDangerAction(value) {
    return value === 'delete_selected' || value.indexOf('delete') !== -1;
  }

  /* ─────────────────────────────────────────────────────────────────────────
     Init
     ───────────────────────────────────────────────────────────────────────── */

  function initAdminActions() {
    // Always hide the original Django actions bar on any changelist page
    // (our selection toolbar is the permanent replacement)
    var actionsBar = document.querySelector('#changelist-form .actions');
    if (actionsBar) actionsBar.style.display = 'none';

    var resultList = document.getElementById('result_list');
    if (!resultList) return;
    initRowActions();
    initSelectionToolbar();
  }

  window.dfmsInitAdminActions = initAdminActions;

  document.addEventListener('DOMContentLoaded', function () {
    initAdminActions();
  });

})();
