

(function () {
  const STORAGE_KEY = 'dfms-admin-theme';
  const DARK = 'dark';
  const LIGHT = 'light';

  function getSystemPreference() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? DARK : LIGHT;
  }

  function getSavedTheme() {
    return localStorage.getItem(STORAGE_KEY);
  }

  function getActiveTheme() {
    return getSavedTheme() || getSystemPreference();
  }

  function applyTheme(theme) {
    if (document.documentElement.getAttribute('data-theme') !== theme) {
      document.documentElement.setAttribute('data-theme', theme);
    }
    document.documentElement.style.colorScheme = theme === DARK ? DARK : LIGHT;
    localStorage.setItem(STORAGE_KEY, theme);
    updateToggleButton(theme);
  }

  function updateToggleButton(theme) {
    const btn = document.getElementById('dfms-theme-toggle');
    if (!btn) return;
    const icon = btn.querySelector('.toggle-icon');
    if (theme === DARK) {
      if (icon) { icon.className = 'toggle-icon bi bi-sun'; icon.textContent = ''; }
      btn.setAttribute('title', 'Switch to light mode');
      btn.setAttribute('aria-label', 'Switch to light mode');
    } else {
      if (icon) { icon.className = 'toggle-icon bi bi-moon'; icon.textContent = ''; }
      btn.setAttribute('title', 'Switch to dark mode');
      btn.setAttribute('aria-label', 'Switch to dark mode');
    }
  }

  function toggleTheme() {
    const current = getActiveTheme();
    applyTheme(current === DARK ? LIGHT : DARK);
  }

  document.documentElement.style.colorScheme = getActiveTheme() === DARK ? DARK : LIGHT;
  updateToggleButton(getActiveTheme());

  document.addEventListener('DOMContentLoaded', function () {
    const btn = document.getElementById('dfms-theme-toggle');
    if (btn) {
      btn.addEventListener('click', toggleTheme);
      updateToggleButton(getActiveTheme());
    }
  });

  window.addEventListener('storage', function (e) {
    if (e.key === STORAGE_KEY && e.newValue && e.newValue !== document.documentElement.getAttribute('data-theme')) {
      document.documentElement.setAttribute('data-theme', e.newValue);
      document.documentElement.style.colorScheme = e.newValue === DARK ? DARK : LIGHT;
      updateToggleButton(e.newValue);
    }
  });
})();
