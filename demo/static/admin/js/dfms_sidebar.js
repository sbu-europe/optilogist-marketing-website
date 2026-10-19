/**
 * DFMS Admin — Modern Sidebar
 *
 * Handles:
 * 1. Sidebar collapse/expand (240px <-> 64px icon-only)
 * 2. Per-app group expand/collapse with localStorage persistence
 * 3. Live filter/search across all nav items
 * 4. Mobile slide-in/out
 * 5. Active item detection from current URL
 *
 * Design spec: 11-design-system/02-components/navigation.md
 */

(function () {
  'use strict';

  var SIDEBAR_KEY    = 'dfms-sidebar-collapsed';
  var GROUPS_KEY     = 'dfms-sidebar-groups';
  var MOBILE_BP      = 768;

  /* ── DOM refs (resolved after DOMContentLoaded) ── */
  var sidebar, toggleBtn, closeBtn, filterInput, navBody, backdrop;

  /* ── State ── */
  var isCollapsed = false;
  var isMobile    = window.innerWidth < MOBILE_BP;

  function ensureBackdrop() {
    if (backdrop) return backdrop;
    backdrop = document.getElementById('dfms-nav-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('button');
      backdrop.type = 'button';
      backdrop.id = 'dfms-nav-backdrop';
      backdrop.className = 'dfms-nav-backdrop';
      backdrop.setAttribute('aria-label', 'Close menu');
      document.body.appendChild(backdrop);
      backdrop.addEventListener('click', closeMobileDrawer);
    }
    return backdrop;
  }

  function openMobileDrawer() {
    if (!sidebar) return;
    sidebar.classList.add('dfms-nav-sidebar--mobile-open');
    document.body.classList.add('dfms-nav-drawer-open');
    ensureBackdrop().classList.add('dfms-nav-backdrop--visible');
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', 'true');
      toggleBtn.setAttribute('aria-label', 'Close menu');
      toggleBtn.title = 'Close menu';
    }
  }

  function closeMobileDrawer() {
    if (!sidebar) return;
    sidebar.classList.remove('dfms-nav-sidebar--mobile-open');
    document.body.classList.remove('dfms-nav-drawer-open');
    if (backdrop) backdrop.classList.remove('dfms-nav-backdrop--visible');
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.setAttribute('aria-label', 'Open menu');
      toggleBtn.title = 'Open menu';
    }
  }

  /* ────────────────────────────────────────────────
     Sidebar collapse
     ──────────────────────────────────────────────── */

  function getSavedCollapsed() {
    return localStorage.getItem(SIDEBAR_KEY) === 'true';
  }

  function applyCollapsed(collapsed) {
    isCollapsed = collapsed;
    if (!sidebar) return;

    if (isMobile) {
      if (collapsed) {
        closeMobileDrawer();
      } else {
        openMobileDrawer();
      }
      return;
    }

    closeMobileDrawer();
    sidebar.classList.toggle('dfms-nav-sidebar--collapsed', collapsed);

    // Sync body class so the topbar toggle icon can animate via CSS
    document.body.classList.toggle('dfms-sidebar-collapsed', collapsed);

    // Update topbar toggle tooltip
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
      toggleBtn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    }

    // Add title tooltips to group headers in collapsed mode (for discoverability)
    document.querySelectorAll('.dfms-nav-group-header').forEach(function (btn) {
      var label = btn.querySelector('.dfms-nav-group-label');
      btn.title = collapsed && label ? label.textContent.trim() : '';
    });

    localStorage.setItem(SIDEBAR_KEY, collapsed ? 'true' : 'false');
  }

  function toggleSidebar() {
    if (isMobile) {
      var open = sidebar.classList.contains('dfms-nav-sidebar--mobile-open');
      applyCollapsed(open); // open → collapse/close; closed → expand/open
    } else {
      applyCollapsed(!isCollapsed);
    }
  }

  /* ────────────────────────────────────────────────
     Group expand/collapse
     ──────────────────────────────────────────────── */

  function getSavedGroups() {
    try {
      return JSON.parse(localStorage.getItem(GROUPS_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveGroups(state) {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(state));
  }

  function applyGroupState(btn, expanded) {
    var groupEl = btn.closest('.dfms-nav-group');
    var itemsList = groupEl && groupEl.querySelector('.dfms-nav-items');
    if (!itemsList) return;

    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    itemsList.classList.toggle('dfms-nav-items--hidden', !expanded);
  }

  function initGroups() {
    var savedState = getSavedGroups();
    var headers = document.querySelectorAll('.dfms-nav-group-header');

    // Disable list transitions during initial open so there's no expand animation on load
    document.querySelectorAll('.dfms-nav-items').forEach(function (el) {
      el.style.transition = 'none';
    });

    headers.forEach(function (btn) {
      var groupKey = btn.getAttribute('data-group');
      var groupEl  = btn.closest('.dfms-nav-group');

      // Only expand a group if it contains the currently active page item.
      // Saved state is intentionally ignored so all groups start collapsed on
      // pages where nothing is active (e.g. the dashboard).
      var hasActive = groupEl && groupEl.querySelector('.dfms-nav-item--active');
      var expanded  = !!hasActive;

      applyGroupState(btn, expanded);

      btn.addEventListener('click', function () {
        // Check DOM class directly — more reliable than the JS variable
        var sidebarCollapsed = sidebar && sidebar.classList.contains('dfms-nav-sidebar--collapsed');

        // In icon-only mode: expand sidebar and open this group
        if (sidebarCollapsed && !isMobile) {
          applyCollapsed(false);
          applyGroupState(btn, true);
          var state = getSavedGroups();
          state[groupKey] = true;
          saveGroups(state);
          return;
        }

        var currentlyExpanded = btn.getAttribute('aria-expanded') === 'true';
        var newState = !currentlyExpanded;
        applyGroupState(btn, newState);

        var state = getSavedGroups();
        state[groupKey] = newState;
        saveGroups(state);
      });
    });
  }

  /* ────────────────────────────────────────────────
     Filter / Search
     ──────────────────────────────────────────────── */

  function filterNav(query) {
    var q = query.toLowerCase().trim();
    var groups = document.querySelectorAll('.dfms-nav-group');

    groups.forEach(function (group) {
      var items   = group.querySelectorAll('.dfms-nav-item');
      var header  = group.querySelector('.dfms-nav-group-header');
      var list    = group.querySelector('.dfms-nav-items');
      var visible = 0;

      items.forEach(function (item) {
        var label = (item.getAttribute('data-label') || '').toLowerCase();
        var match = !q || label.indexOf(q) !== -1;
        item.classList.toggle('dfms-nav-item--hidden', !match);
        if (match) visible++;
      });

      // Show/hide the whole group
      group.classList.toggle('dfms-nav-group--all-hidden', visible === 0);

      // Auto-expand groups with matching items when filtering
      if (q && visible > 0 && header && list) {
        header.setAttribute('aria-expanded', 'true');
        list.classList.remove('dfms-nav-items--hidden');
      }
    });
  }

  /* ────────────────────────────────────────────────
     Active item
     ──────────────────────────────────────────────── */

  var LAST_NAV_KEY = 'dfms-nav-last-id';
  var ADMIN_QUERY_IGNORE = { e: 1, p: 1, o: 1, q: 1, all: 1 };

  function rememberNavId(id) {
    if (!id) return;
    try { sessionStorage.setItem(LAST_NAV_KEY, id); } catch (e) { /* ignore */ }
  }

  function lastNavId() {
    try { return sessionStorage.getItem(LAST_NAV_KEY) || ''; } catch (e) { return ''; }
  }

  function navQueryMap(url) {
    var out = {};
    url.searchParams.forEach(function (value, key) {
      if (ADMIN_QUERY_IGNORE[key] || key === '_changelist_filters' || key === '_popup' || key === '_to_field') {
        return;
      }
      out[key] = value;
    });
    return out;
  }

  function pathsEquivalent(a, b) {
    return (a || '/').replace(/\/$/, '') === (b || '/').replace(/\/$/, '');
  }

  function pathMatchesLink(path, linkPath) {
    var isShort = linkPath === '/' || linkPath === '/admin/' || linkPath === '/admin';
    if (isShort) return pathsEquivalent(path, linkPath);
    return path === linkPath || path.startsWith(linkPath);
  }

  function querySubsetMatch(linkParams, locParams) {
    var keys = Object.keys(linkParams);
    for (var i = 0; i < keys.length; i++) {
      if (locParams[keys[i]] !== linkParams[keys[i]]) return false;
    }
    return true;
  }

  function markActive() {
    try {
      _markActive();
    } catch (e) { /* never block group expand / nav clicks */ }
  }

  function _markActive() {
    var loc = window.location;
    var path = loc.pathname;
    var locParams = navQueryMap(new URL(loc.href));
    var remembered = lastNavId();
    var links = document.querySelectorAll('.dfms-nav-link');

    function scoreLinks(requireQuery) {
      var match = null;
      var scoreBest = -1;
      links.forEach(function (a) {
        if (!a.href) return;
        try {
          var linkUrl = new URL(a.href, loc.origin);
          var linkPath = linkUrl.pathname;
          if (!pathMatchesLink(path, linkPath)) return;

          var linkParams = navQueryMap(linkUrl);
          var linkKeys = Object.keys(linkParams);
          var exactPath = pathsEquivalent(path, linkPath);
          var isChild = !exactPath && path.startsWith(linkPath);
          var queryHit = linkKeys.length && exactPath && querySubsetMatch(linkParams, locParams);

          if (linkKeys.length && exactPath && requireQuery && !queryHit) {
            return;
          }

          var score = linkPath.replace(/\/$/, '').length;
          if (queryHit) {
            score += 10000 + linkKeys.length;
          }
          if (isChild && remembered && a.getAttribute('data-nav-id') === remembered) {
            score += 20000;
          }
          if (score > scoreBest) {
            scoreBest = score;
            match = a;
          }
        } catch (e) { /* ignore */ }
      });
      return match;
    }

    var bestMatch = scoreLinks(true) || scoreLinks(false);

    links.forEach(function (a) {
      var item = a.closest('.dfms-nav-item');
      var active = a === bestMatch;
      if (item) item.classList.toggle('dfms-nav-item--active', active);
      if (active) {
        a.setAttribute('aria-current', 'page');
      } else {
        a.removeAttribute('aria-current');
      }
    });

    if (bestMatch && pathsEquivalent(path, new URL(bestMatch.href, loc.origin).pathname)) {
      var winningParams = navQueryMap(new URL(bestMatch.href, loc.origin));
      if (Object.keys(winningParams).length) {
        rememberNavId(bestMatch.getAttribute('data-nav-id'));
      }
    }
  }

  /* ────────────────────────────────────────────────
     Responsive
     ──────────────────────────────────────────────── */

  function handleResize() {
    var wasMobile = isMobile;
    isMobile = window.innerWidth < MOBILE_BP;
    if (wasMobile !== isMobile) {
      // Reset classes when crossing breakpoint
      closeMobileDrawer();
      applyCollapsed(isMobile ? true : getSavedCollapsed());
    }
  }

  /* ────────────────────────────────────────────────
     Init
     ──────────────────────────────────────────────── */

  /* ────────────────────────────────────────────────
     User dropdown
     ──────────────────────────────────────────────── */

  function initUserDropdown() {
    var avatarBtn  = document.getElementById('dfms-user-avatar-btn');
    var dropdown   = document.getElementById('dfms-user-dropdown');
    if (!avatarBtn || !dropdown) return;

    function openDropdown() {
      dropdown.classList.add('dfms-dropdown--open');
      avatarBtn.setAttribute('aria-expanded', 'true');
    }

    function closeDropdown() {
      dropdown.classList.remove('dfms-dropdown--open');
      avatarBtn.setAttribute('aria-expanded', 'false');
    }

    function toggleDropdown() {
      if (dropdown.classList.contains('dfms-dropdown--open')) {
        closeDropdown();
      } else {
        openDropdown();
      }
    }

    avatarBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleDropdown();
    });

    // Close when clicking outside
    document.addEventListener('click', function (e) {
      if (!avatarBtn.contains(e.target) && !dropdown.contains(e.target)) {
        closeDropdown();
      }
    });

    // Close on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDropdown();
    });
  }

  /* ────────────────────────────────────────────────
     POI / working-site picker (profile dropdown)
     ──────────────────────────────────────────────── */

  function initPoiProfileForm() {
    ['dfms-role-select', 'dfms-poi-select'].forEach(function (id) {
      var select = document.getElementById(id);
      if (!select) return;
      // Keep the profile menu open while opening the native select list.
      ['click', 'mousedown'].forEach(function (evt) {
        select.addEventListener(evt, function (e) {
          e.stopPropagation();
        });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    sidebar    = document.getElementById('dfms-nav-sidebar');
    toggleBtn  = document.getElementById('dfms-sidebar-toggle');
    closeBtn   = document.getElementById('dfms-sidebar-close');
    filterInput= document.getElementById('dfms-nav-filter');
    navBody    = document.getElementById('dfms-nav-body');

    if (!sidebar) return;

    ensureBackdrop();

    // Apply saved collapse state (inline script already pre-painted the correct size)
    applyCollapsed(isMobile ? true : getSavedCollapsed());

    // Remove pre-paint attribute and enable transitions now that JS state is synced
    document.documentElement.removeAttribute('data-sidebar-collapsed');
    // Small rAF delay ensures the browser has committed the no-transition paint
    // before we switch transitions on — prevents any residual flash
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        // Re-enable transitions now that initial state is painted
        sidebar.classList.add('dfms-nav-sidebar--ready');
        document.body.classList.add('dfms-js-ready');
        document.querySelectorAll('.dfms-nav-items').forEach(function (el) {
          el.style.transition = '';
        });
      });
    });

    // Collapse toggle
    if (toggleBtn) {
      toggleBtn.addEventListener('click', toggleSidebar);
      if (isMobile) {
        toggleBtn.setAttribute('aria-expanded', 'false');
        toggleBtn.setAttribute('aria-label', 'Open menu');
        toggleBtn.title = 'Open menu';
      }
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        closeMobileDrawer();
      });
    }

    // Remember which menu item was clicked so change/add pages keep that
    // section highlighted when several items share the same changelist path.
    sidebar.addEventListener('click', function (e) {
      var navLink = e.target.closest('a.dfms-nav-link');
      if (navLink) rememberNavId(navLink.getAttribute('data-nav-id'));
      if (!isMobile) return;
      var link = e.target.closest('a.dfms-nav-link, a.dfms-sidebar-brand-link');
      if (link) closeMobileDrawer();
    }, true);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isMobile) closeMobileDrawer();
    });

    // Mark active items first so initGroups can open the correct group
    markActive();

    // Group expand/collapse
    initGroups();

    // Filter input
    if (filterInput) {
      filterInput.addEventListener('input', function () {
        filterNav(this.value);
      });
      // Clear filter on Escape
      filterInput.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          this.value = '';
          filterNav('');
        }
      });
    }

    // User dropdown
    initUserDropdown();

    // Working-site picker in profile dropdown
    initPoiProfileForm();

    // Resize handler
    window.addEventListener('resize', handleResize);
  });

})();
