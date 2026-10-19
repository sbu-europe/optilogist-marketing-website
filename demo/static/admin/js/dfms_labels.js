/**
 * DFMS Label Capitalisation
 *
 * Django auto-generates field labels and column headers in sentence-case
 * (only the first word capitalised) and lowercases known acronyms.
 * This script post-processes the rendered page to apply Title Case and
 * restore known uppercase acronyms (POI, TR, TO, PR, UOM, ID, etc.).
 *
 * Targets:
 *  - Sidebar nav item labels
 *  - Changelist column headers (th)
 *  - Fieldset titles (h2)
 *  - Form field labels
 *  - Breadcrumb segments
 */
(function () {
  'use strict';

  // Words that should always be ALL CAPS
  const ACRONYMS = new Set([
    'poi', 'pois', 'tr', 'trs', 'to', 'tos', 'pr', 'prs', 'ps', 'fg', 'uom', 'id', 'ids',
    'kg', 'mt', 'sku', 'csv', 'otp', 'sms', 'dfs',
    'rm', 'lc', 'cf', 'qc', 'eta', 'gps', 'url',
  ]);

  // Words that should stay lowercase in title case (articles, prepositions)
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
        // Strip surrounding punctuation (parens, brackets) to test the inner token
        const inner = lower.replace(/^[^a-z0-9]+|[^a-z0-9s]+$/g, '');
        const prefix = lower.slice(0, lower.length - lower.replace(/^[^a-z0-9]+/, '').length);
        const suffix = lower.slice(lower.replace(/[^a-z0-9s]+$/, '').length);
        // Acronyms always caps — check both with and without surrounding punctuation
        if (ACRONYMS.has(lower)) return lower.toUpperCase();
        if (ACRONYMS.has(inner)) return prefix.toUpperCase() + inner.toUpperCase() + suffix.toUpperCase();
        if (idx > 0 && LOWERCASE_WORDS.has(lower)) return lower;
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join(' ');
  }

  function fixNode(node) {
    // Only process text nodes inside elements, not inputs or scripts
    if (!node) return;
    const original = node.textContent;
    if (!original || !original.trim()) return;
    // Skip if it looks like it's already been processed or contains HTML
    if (original.includes('<')) return;
    const fixed = toTitleCase(original);
    if (fixed !== original) {
      node.textContent = fixed;
    }
  }

  function fixTextOf(el) {
    if (!el) return;
    // Walk direct text node children only (avoid clobbering icons/badges)
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
    // 1. Sidebar nav labels
    document.querySelectorAll(
      '.dfms-nav-item-label, .dfms-nav-group-label'
    ).forEach(fixTextOf);

    // 2. Changelist column headers
    document.querySelectorAll('#result_list thead th .text').forEach(fixTextOf);
    document.querySelectorAll('#result_list thead th').forEach(function (th) {
      // Only fix the text node, not sort arrows
      for (const child of th.childNodes) {
        if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
          child.textContent = toTitleCase(child.textContent);
        }
      }
      // Also fix the inner <a> if present (sortable column)
      const a = th.querySelector('a');
      if (a) {
        for (const child of a.childNodes) {
          if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
            child.textContent = toTitleCase(child.textContent);
          }
        }
      }
    });

    // 3. Fieldset legend / heading (h2 inside fieldsets)
    document.querySelectorAll('fieldset h2, .module h2, .module caption').forEach(fixTextOf);

    // 4. Form field labels — only the text node, not the ":" suffix
    document.querySelectorAll('.form-row label, .field-box label').forEach(function (label) {
      for (const child of label.childNodes) {
        if (child.nodeType === Node.TEXT_NODE && child.textContent.trim().length > 1) {
          // Strip trailing colon, fix, re-add
          const raw = child.textContent.replace(/:$/, '').trim();
          if (raw) {
            const hasSuffix = child.textContent.trim().endsWith(':');
            child.textContent = toTitleCase(raw) + (hasSuffix ? ':' : '');
          }
        }
      }
    });

    // 5. Inline group headings
    document.querySelectorAll('.inline-group h2, .inline-related h3 b').forEach(fixTextOf);

    // 6. Page h1 title (object tools area)
    document.querySelectorAll('.dfms-page-title, #content h1').forEach(fixTextOf);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
