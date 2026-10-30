

(function () {
  'use strict';

  var activeDropdown = null;

  function closeActiveDropdown() {
    if (activeDropdown) {
      activeDropdown.classList.remove('ux-row-dropdown--open');
      activeDropdown = null;
    }
  }

  document.addEventListener('click', closeActiveDropdown);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeActiveDropdown();
  });

  function allowRowDeleteMenu(resultList) {
    var flag = resultList && resultList.getAttribute('data-ux-allow-row-delete');
    if (flag === 'true') return true;
    if (flag === 'false') return false;
    return document.body.classList.contains('app-records');
  }

  function initRowActions() {
    var resultList = document.getElementById('result_list');
    if (!resultList || resultList.dataset.uxNoRowActions === 'true') return;

    var tbody = resultList.querySelector('tbody');
    var thead = resultList.querySelector('thead tr');
    if (!tbody || !thead) return;

    if (!thead.querySelector('.ux-row-actions-header')) {
      var th = document.createElement('th');
      th.className = 'ux-row-actions-header';
      th.setAttribute('scope', 'col');
      thead.appendChild(th);
    }

    var dropdown = document.getElementById('ux-row-dropdown');
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.className = 'ux-row-dropdown';
      dropdown.id = 'ux-row-dropdown';
      document.body.appendChild(dropdown);
    }

    var rowDeleteAllowed = allowRowDeleteMenu(resultList);
    var rows = tbody.querySelectorAll('tr');

    rows.forEach(function (row) {

      var firstLink = row.querySelector('th a') || row.querySelector('td:not(.action-checkbox) a');
      var editUrl   = firstLink ? firstLink.href : null;

      var deleteUrl = null;
      var canDeleteEl = row.querySelector('[data-ux-can-delete]');
      var canDelete = !canDeleteEl || canDeleteEl.getAttribute('data-ux-can-delete') !== 'false';
      if (editUrl && rowDeleteAllowed && canDelete) {
        var candidate = editUrl.replace('/change/', '/delete/');
        if (candidate !== editUrl) {
          deleteUrl = candidate;
        } else {

          var url = editUrl.replace(/\/$/, '');
          deleteUrl = url + '/delete/';
        }
      }

      if (row.querySelector('.ux-row-actions')) return;
      var td = document.createElement('td');
      td.className = 'ux-row-actions';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ux-row-menu-btn';
      btn.setAttribute('aria-label', 'Row actions');
      btn.setAttribute('tabindex', '-1');
      btn.innerHTML = '<i class="bi bi-three-dots-vertical"></i>';

      btn.addEventListener('click', function (e) {
        e.stopPropagation();

        if (activeDropdown === dropdown && dropdown.dataset.row === row.rowIndex.toString()) {
          closeActiveDropdown();
          return;
        }

        closeActiveDropdown();

        dropdown.innerHTML = '';
        dropdown.dataset.row = row.rowIndex.toString();

        if (editUrl) {
          dropdown.appendChild(makeItem('bi bi-pencil', 'Edit', editUrl));
        }

        if (deleteUrl) {
          if (editUrl) {
            var div = document.createElement('div');
            div.className = 'ux-row-dropdown-divider';
            dropdown.appendChild(div);
          }
          dropdown.appendChild(makeItem('bi bi-trash', 'Delete', deleteUrl, true));
        }

        if (!editUrl && !deleteUrl) {
          var fallback = document.createElement('span');
          fallback.className = 'ux-row-dropdown-item';
          fallback.style.color = 'var(--ux-grey-400)';
          fallback.textContent = 'No actions';
          dropdown.appendChild(fallback);
        }

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

        dropdown.classList.add('ux-row-dropdown--open');
        activeDropdown = dropdown;
      });

      td.appendChild(btn);
      row.appendChild(td);
    });
  }

  function makeItem(iconClass, label, href, isDanger) {
    var a = document.createElement('a');
    a.href = href;
    a.className = 'ux-row-dropdown-item' + (isDanger ? ' ux-row-dropdown-item--danger' : '');
    a.innerHTML = '<i class="' + iconClass + '"></i>' + label;
    return a;
  }

  function initSelectionToolbar() {
    var resultList = document.getElementById('result_list');
    if (!resultList) return;

    var toolbar      = document.getElementById('ux-selection-toolbar');
    var countEl      = document.getElementById('ux-selected-count');
    var countBadge   = document.getElementById('ux-selected-badge');
    var toolbarActs  = document.getElementById('ux-toolbar-actions');
    var clearBtn     = document.getElementById('ux-clear-selection');
    var actionsBar   = document.querySelector('#listing-form .actions');
    var actionSelect = actionsBar && actionsBar.querySelector('select[name="action"]');

    if (!toolbar) return;

    if (actionsBar) actionsBar.style.display = 'none';

    if (actionSelect && toolbarActs) {
      Array.prototype.forEach.call(actionSelect.options, function (opt) {
        if (!opt.value) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ux-toolbar-action-btn' +
          (isDangerAction(opt.value) ? ' ux-toolbar-action-btn--danger' : '');
        btn.textContent = opt.text;
        btn.dataset.action = opt.value;
        btn.addEventListener('click', function () {
          actionSelect.value = opt.value;

          var form = document.getElementById('listing-form');
          if (form) {

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

      }
    }

    if (!resultList.dataset.uxToolbarBound) {
      resultList.addEventListener('change', function (e) {
        if (e.target && e.target.type === 'checkbox') {
          updateToolbar();
        }
      });
      resultList.dataset.uxToolbarBound = '1';
    }

    var headerCheckbox = document.querySelector('#action-toggle, thead input[type="checkbox"]');
    if (headerCheckbox && !headerCheckbox.dataset.uxToolbarBound) {
      headerCheckbox.addEventListener('change', function () {

        setTimeout(updateToolbar, 10);
      });
      headerCheckbox.dataset.uxToolbarBound = '1';
    }

    if (clearBtn && !clearBtn.dataset.uxToolbarBound) {
      clearBtn.addEventListener('click', function () {
        getCheckboxes().forEach(function (cb) { cb.checked = false; });
        if (headerCheckbox) headerCheckbox.checked = false;
        updateToolbar();
      });
      clearBtn.dataset.uxToolbarBound = '1';
    }

    updateToolbar();
  }

  function isDangerAction(value) {
    return value === 'delete_selected' || value.indexOf('delete') !== -1;
  }

  function initAdminActions() {

    var actionsBar = document.querySelector('#listing-form .actions');
    if (actionsBar) actionsBar.style.display = 'none';

    var resultList = document.getElementById('result_list');
    if (!resultList) return;
    initRowActions();
    initSelectionToolbar();
  }

  window.uxInitAdminActions = initAdminActions;

  document.addEventListener('DOMContentLoaded', function () {
    initAdminActions();
  });

})();
