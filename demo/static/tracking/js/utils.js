window.LiveGpsUtils = (function () {
  'use strict';

  function debounce(fn, ms) {
    let timer;
    return function () {
      const args = arguments;
      const self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function escHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function liveGpsIcon(glyph, size) {
    const sz = size || 'md';
    return '<i class="bi bi-' + glyph + ' live-gps-bi live-gps-bi--' + sz + '" aria-hidden="true"></i>';
  }

  function setLiveGpsButtonIcon(btn, glyph, size) {
    if (!btn) return;
    btn.innerHTML = liveGpsIcon(glyph, size || 'sm');
  }

  function formatListTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    const day = pad(d.getDate());
    const mon = pad(d.getMonth() + 1);
    const year = d.getFullYear();
    let h = d.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return day + '-' + mon + '-' + year + ' ' + pad(h) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + ' ' + ampm;
  }

  function haversineKm(a, b) {
    const R = 6371;
    const dLat = (b[0] - a[0]) * Math.PI / 180;
    const dLng = (b[1] - a[1]) * Math.PI / 180;
    const lat1 = a[0] * Math.PI / 180;
    const lat2 = b[0] * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function bearingDegrees(lat1, lng1, lat2, lng2) {
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const lat1r = lat1 * Math.PI / 180;
    const lat2r = lat2 * Math.PI / 180;
    const y = Math.sin(dLng) * Math.cos(lat2r);
    const x = Math.cos(lat1r) * Math.sin(lat2r) - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLng);
    if (Math.abs(x) < 1e-12 && Math.abs(y) < 1e-12) return null;
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function dash(v) {
    return (v != null && v !== '') ? v : '—';
  }

  function speedText(v) {
    if (v.speed_kmh == null) return '— kph';
    return Math.round(v.speed_kmh) + ' kph';
  }

  function liveGpsCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta && meta.content) return meta.content;
    const input = document.querySelector('[name=csrfmiddlewaretoken]');
    if (input && input.value) return input.value;
    const match = document.cookie.split('; ').find(function (row) {
      return row.startsWith('csrftoken=');
    });
    return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : '';
  }

  function liveGpsApiFetch(url, extra) {
    const baseHeaders = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-CSRFToken': liveGpsCsrfToken(),
    };
    const opts = Object.assign({ credentials: 'same-origin' }, extra || {});
    opts.headers = Object.assign(baseHeaders, (opts.headers || {}));
    return fetch(url, opts);
  }

  function poiEscape(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return {
    debounce: debounce,
    escHtml: escHtml,
    liveGpsIcon: liveGpsIcon,
    setLiveGpsButtonIcon: setLiveGpsButtonIcon,
    formatListTime: formatListTime,
    haversineKm: haversineKm,
    bearingDegrees: bearingDegrees,
    dash: dash,
    speedText: speedText,
    liveGpsCsrfToken: liveGpsCsrfToken,
    liveGpsApiFetch: liveGpsApiFetch,
    poiEscape: poiEscape,
  };
})();
