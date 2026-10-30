

(function () {
  'use strict';

  const ACRONYMS = new Set([
    'poi', 'pois', 'tr', 'trs', 'to', 'tos', 'pr', 'prs', 'ps', 'fg', 'uom', 'id', 'ids',
    'kg', 'mt', 'sku', 'csv', 'otp', 'sms', 'dfs',
    'rm', 'lc', 'cf', 'qc', 'eta', 'gps', 'url',
  ]);

  const LOWERCASE_WORDS = new Set([
    'a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor',
    'on', 'at', 'to', 'by', 'in', 'of', 'up', 'as', 'vs',
  ]);

  function toTitleCase(text) {
    return text
      .trim()
      .split(/\s+/)
      .map(function (word, idx) {
        const lower = word.toLowerCase();

        const inner = lower.replace(/^[^a-z0-9]+|[^a-z0-9s]+$/g, '');
        const prefix = lower.slice(0, lower.length - lower.replace(/^[^a-z0-9]+/, '').length);
        const suffix = lower.slice(lower.replace(/[^a-z0-9s]+$/, '').length);

        if (ACRONYMS.has(lower)) return lower.toUpperCase();
        if (ACRONYMS.has(inner)) return prefix.toUpperCase() + inner.toUpperCase() + suffix.toUpperCase();
        if (idx > 0 && LOWERCASE_WORDS.has(lower)) return lower;
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join(' ');
  }

  function fixNode(node) {

    if (!node) return;
    const original = node.textContent;
    if (!original || !original.trim()) return;

    if (original.includes('<')) return;
    const fixed = toTitleCase(original);
    if (fixed !== original) {
      node.textContent = fixed;
    }
  }

  function fixTextOf(el) {
    if (!el) return;

    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = child.textContent.trim();
        if (t) {
          child.textContent = ' ' + toTitleCase(t) + ' ';
        }
      }
    }
  }

  function run() {

    document.querySelectorAll(
      '.ux-nav-item-label, .ux-nav-group-label'
    ).forEach(fixTextOf);

    document.querySelectorAll('#result_list thead th .text').forEach(fixTextOf);
    document.querySelectorAll('#result_list thead th').forEach(function (th) {

      for (const child of th.childNodes) {
        if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
          child.textContent = toTitleCase(child.textContent);
        }
      }

      const a = th.querySelector('a');
      if (a) {
        for (const child of a.childNodes) {
          if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
            child.textContent = toTitleCase(child.textContent);
          }
        }
      }
    });

    document.querySelectorAll('fieldset h2, .module h2, .module caption').forEach(fixTextOf);

    document.querySelectorAll('.form-row label, .field-box label').forEach(function (label) {
      for (const child of label.childNodes) {
        if (child.nodeType === Node.TEXT_NODE && child.textContent.trim().length > 1) {

          const raw = child.textContent.replace(/:$/, '').trim();
          if (raw) {
            const hasSuffix = child.textContent.trim().endsWith(':');
            child.textContent = toTitleCase(raw) + (hasSuffix ? ':' : '');
          }
        }
      }
    });

    document.querySelectorAll('.inline-group h2, .inline-related h3 b').forEach(fixTextOf);

    document.querySelectorAll('.ux-page-title, #content h1').forEach(fixTextOf);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
