/**
 * DFMS Material Time Picker
 * Clock-face picker with AM/PM toggle. Replaces Django's limited shortcuts.
 */
(function () {
  'use strict';

  function pad(n) { return String(n).padStart(2, '0'); }

  let overlay, picker, currentInput;
  let selHour = 0, selMinute = 0, selAmPm = 'AM', mode = 'hour';

  // ── Build DOM ──────────────────────────────────────────────────────────────
  function buildPicker() {
    overlay = document.createElement('div');
    overlay.id = 'dfms-tp-overlay';
    overlay.addEventListener('click', closePicker);

    picker = document.createElement('div');
    picker.id = 'dfms-tp-picker';
    picker.addEventListener('click', function (e) { e.stopPropagation(); });

    picker.innerHTML = `
      <div class="dfms-tp-header">
        <span class="dfms-tp-label">Select Time</span>
        <div class="dfms-tp-header-row">
          <div class="dfms-tp-display">
            <span class="dfms-tp-hour active" id="dfms-tp-hour-display">12</span>
            <span class="dfms-tp-sep">:</span>
            <span class="dfms-tp-minute" id="dfms-tp-minute-display">00</span>
          </div>
          <div class="dfms-tp-ampm">
            <button class="dfms-tp-ampm-btn active" id="dfms-tp-am">AM</button>
            <button class="dfms-tp-ampm-btn" id="dfms-tp-pm">PM</button>
          </div>
        </div>
      </div>
      <div class="dfms-tp-clock">
        <div class="dfms-tp-face" id="dfms-tp-face">
          <div class="dfms-tp-center"></div>
          <div class="dfms-tp-hand" id="dfms-tp-hand"></div>
        </div>
      </div>
      <div class="dfms-tp-footer">
        <button class="dfms-tp-btn dfms-tp-cancel" id="dfms-tp-cancel">Cancel</button>
        <button class="dfms-tp-btn dfms-tp-ok" id="dfms-tp-ok">OK</button>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(picker);

    document.getElementById('dfms-tp-cancel').addEventListener('click', closePicker);
    document.getElementById('dfms-tp-ok').addEventListener('click', confirmPicker);
    document.getElementById('dfms-tp-hour-display').addEventListener('click', function () { setMode('hour'); });
    document.getElementById('dfms-tp-minute-display').addEventListener('click', function () { setMode('minute'); });
    document.getElementById('dfms-tp-am').addEventListener('click', function () { setAmPm('AM'); });
    document.getElementById('dfms-tp-pm').addEventListener('click', function () { setAmPm('PM'); });
    document.getElementById('dfms-tp-face').addEventListener('click', handleFaceClick);
  }

  function setAmPm(val) {
    selAmPm = val;
    document.getElementById('dfms-tp-am').classList.toggle('active', val === 'AM');
    document.getElementById('dfms-tp-pm').classList.toggle('active', val === 'PM');
  }

  function setMode(m) {
    mode = m;
    document.getElementById('dfms-tp-hour-display').classList.toggle('active', m === 'hour');
    document.getElementById('dfms-tp-minute-display').classList.toggle('active', m === 'minute');
    renderFace();
  }

  // ── Clock face ─────────────────────────────────────────────────────────────
  function renderFace() {
    const face = document.getElementById('dfms-tp-face');
    face.querySelectorAll('.dfms-tp-num').forEach(function (el) { el.remove(); });

    const r = 38;
    const count = 12;

    for (let i = 0; i < count; i++) {
      const val   = mode === 'hour' ? (i === 0 ? 12 : i) : i * 5;
      const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
      const x = 50 + r * Math.cos(angle);
      const y = 50 + r * Math.sin(angle);

      const num = document.createElement('div');
      num.className = 'dfms-tp-num';
      num.style.left = x + '%';
      num.style.top  = y + '%';
      num.textContent = mode === 'hour' ? String(val) : pad(val);
      num.dataset.val = val;

      const isSelected = mode === 'hour'
        ? selHour === (val === 12 ? 12 : val)
        : selMinute === val;

      if (isSelected) num.classList.add('selected');
      face.appendChild(num);
    }

    updateHand();
  }

  function updateHand() {
    const hand = document.getElementById('dfms-tp-hand');
    const face = document.getElementById('dfms-tp-face');
    const radius = face.offsetWidth / 2; // px radius of face
    const handLen = radius * 0.72;       // hand reaches ~72% toward edge

    let val, total;
    if (mode === 'hour') {
      val   = selHour % 12;
      total = 12;
    } else {
      val   = selMinute;
      total = 60;
    }

    // transform-origin is bottom-center; 0deg = hand points straight up = 12 o'clock
    // val=0 (12) → 0deg, val=3 → 90deg, val=6 → 180deg, val=9 → 270deg
    const angleDeg = (val / total) * 360;
    hand.style.height    = handLen + 'px';
    hand.style.transform = `rotate(${angleDeg}deg)`;
  }

  function handleFaceClick(e) {
    const face  = document.getElementById('dfms-tp-face');
    const rect  = face.getBoundingClientRect();
    const cx    = rect.left + rect.width  / 2;
    const cy    = rect.top  + rect.height / 2;
    const dx    = e.clientX - cx;
    const dy    = e.clientY - cy;
    const angle = Math.atan2(dy, dx);

    if (mode === 'hour') {
      let h = Math.round((angle + Math.PI / 2) / (2 * Math.PI / 12));
      if (h <= 0) h += 12;
      if (h > 12) h = h % 12 || 12;
      selHour = h;
      document.getElementById('dfms-tp-hour-display').textContent = pad(h);
      setMode('minute');
    } else {
      let m = Math.round((angle + Math.PI / 2) / (2 * Math.PI / 60));
      if (m < 0) m += 60;
      if (m >= 60) m = 0;
      m = Math.round(m / 5) * 5;
      if (m >= 60) m = 0;
      selMinute = m;
      document.getElementById('dfms-tp-minute-display').textContent = pad(m);
      renderFace();
    }
  }

  // ── Open / close ───────────────────────────────────────────────────────────
  function openPicker(inputEl) {
    currentInput = inputEl;

    const val   = inputEl.value || '';
    const parts = val.match(/^(\d{1,2}):(\d{2})/);
    let h24 = parts ? parseInt(parts[1], 10) : 0;
    selMinute = parts ? parseInt(parts[2], 10) : 0;

    // Convert 24h → 12h + AM/PM
    if (h24 === 0) {
      selHour = 12; selAmPm = 'AM';
    } else if (h24 < 12) {
      selHour = h24; selAmPm = 'AM';
    } else if (h24 === 12) {
      selHour = 12; selAmPm = 'PM';
    } else {
      selHour = h24 - 12; selAmPm = 'PM';
    }

    document.getElementById('dfms-tp-hour-display').textContent   = pad(selHour);
    document.getElementById('dfms-tp-minute-display').textContent = pad(selMinute);
    setAmPm(selAmPm);
    setMode('hour');

    const rect = inputEl.getBoundingClientRect();
    const top  = window.scrollY + rect.bottom + 6;
    const left = Math.min(rect.left, window.innerWidth - 290);
    picker.style.top  = top  + 'px';
    picker.style.left = left + 'px';

    overlay.style.display = 'block';
    picker.style.display  = 'block';

    // updateHand needs the face to be laid out (offsetWidth > 0)
    requestAnimationFrame(function () {
      requestAnimationFrame(updateHand);
    });
  }

  function closePicker() {
    if (overlay) overlay.style.display = 'none';
    if (picker)  picker.style.display  = 'none';
    currentInput = null;
  }

  function confirmPicker() {
    if (currentInput) {
      // Convert 12h + AM/PM → 24h
      let h24 = selHour;
      if (selAmPm === 'AM') {
        if (h24 === 12) h24 = 0;
      } else {
        if (h24 !== 12) h24 += 12;
      }
      currentInput.value = pad(h24) + ':' + pad(selMinute) + ':00';
      currentInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    closePicker();
  }

  // ── Style calendar popup: inject month label + replace arrow text with icons ──
  function getCaption(calBox) {
    const cap = calBox.querySelector('caption');
    return cap ? cap.textContent.trim() : '';
  }

  var WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  var CHEVRON_PREV =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="#6B7280" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/></svg>';
  var CHEVRON_NEXT =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="#6B7280" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/></svg>';

  function parseCaptionMonthYear(caption) {
    var match = caption && caption.match(/^(.+)\s+(\d{4})$/);
    if (!match) return null;
    var parsed = new Date(Date.parse(match[1] + ' 1, ' + match[2]));
    if (isNaN(parsed.getTime())) return null;
    return { month: parsed.getMonth(), year: parsed.getFullYear() };
  }

  function styleWeekdayHeaders(calBox) {
    var first =
      window.CalendarNamespace && typeof CalendarNamespace.firstDayOfWeek === 'number'
        ? CalendarNamespace.firstDayOfWeek
        : 0;
    calBox.querySelectorAll('.calendar th').forEach(function (th, i) {
      var label = WEEKDAY_LABELS[(first + i) % 7];
      if (th.textContent !== label) {
        th.textContent = label;
      }
    });
  }

  /** Fill blank cells with previous/next month day numbers (reference design). */
  function setOutdayCell(td, dayNum) {
    var existing = td.querySelector('.dfms-cal-outday');
    if (existing) {
      if (existing.textContent !== String(dayNum)) {
        existing.textContent = String(dayNum);
      }
      return;
    }
    td.textContent = '';
    var span = document.createElement('span');
    span.className = 'dfms-cal-outday';
    span.textContent = String(dayNum);
    td.appendChild(span);
  }

  function fillAdjacentMonthDays(calBox) {
    var info = parseCaptionMonthYear(getCaption(calBox));
    if (!info) return;
    var daysInPrev = new Date(info.year, info.month, 0).getDate();
    var bodyRows = Array.prototype.slice.call(
      calBox.querySelectorAll('.calendar tbody tr'),
      1
    );
    if (!bodyRows.length) return;

    var firstCells = Array.prototype.slice.call(bodyRows[0].querySelectorAll('td'));
    var leadCount = 0;
    for (var i = 0; i < firstCells.length; i++) {
      if (!firstCells[i].classList.contains('nonday')) break;
      leadCount++;
    }
    for (var li = 0; li < leadCount; li++) {
      setOutdayCell(firstCells[li], daysInPrev - leadCount + li + 1);
    }

    var lastCells = Array.prototype.slice.call(
      bodyRows[bodyRows.length - 1].querySelectorAll('td')
    );
    var nextDay = 1;
    lastCells.forEach(function (td) {
      if (!td.classList.contains('nonday')) return;
      setOutdayCell(td, nextDay++);
    });
  }

  /** Soft-circle past days so planners can tell them from today and future. */
  function markPastCalendarDays(calBox) {
    var info = parseCaptionMonthYear(getCaption(calBox));
    if (!info) return;
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    calBox.querySelectorAll('.calendar td a').forEach(function (link) {
      var day = parseInt(link.textContent, 10);
      if (!day) return;
      var cell = link.parentElement;
      if (!cell || cell.classList.contains('nonday')) return;
      var date = new Date(info.year, info.month, day);
      if (date < today) {
        cell.classList.add('past');
      } else {
        cell.classList.remove('past');
      }
    });
  }

  var stylingCalendar = false;

  /** Place the popup next to the calendar icon (sidebar margin breaks Django findPosX). */
  function repositionCalendarBox(calBox) {
    if (!calBox || calBox.style.display === 'none') return;
    if (typeof window.DateTimeShortcuts === 'undefined') return;
    var prefix = DateTimeShortcuts.calendarDivName1 || 'calendarbox';
    var linkPrefix = DateTimeShortcuts.calendarLinkName || 'calendarlink';
    if (!calBox.id || calBox.id.indexOf(prefix) !== 0) return;
    var num = calBox.id.slice(prefix.length);
    var link = document.getElementById(linkPrefix + num);
    if (!link) return;

    var rect = link.getBoundingClientRect();
    var width = calBox.offsetWidth || 336;
    var height = calBox.offsetHeight || 336;
    var left = rect.left + window.scrollX;
    var top = rect.bottom + window.scrollY + 8;
    var viewW = document.documentElement.clientWidth;
    var viewH = document.documentElement.clientHeight;

    if (left + width > window.scrollX + viewW - 8) {
      left = window.scrollX + viewW - width - 8;
    }
    if (left < window.scrollX + 8) {
      left = window.scrollX + 8;
    }
    if (top + height > window.scrollY + viewH - 8) {
      top = Math.max(window.scrollY + 8, rect.top + window.scrollY - height - 8);
    }

    calBox.style.position = 'absolute';
    calBox.style.left = Math.round(left) + 'px';
    calBox.style.top = Math.round(top) + 'px';
    calBox.style.zIndex = '10050';
  }

  function styleCalendarBox(calBox) {
    if (!calBox || stylingCalendar) return;
    var nav = calBox.querySelector('div:first-child');
    if (!nav) return;

    stylingCalendar = true;
    try {
      var label = nav.querySelector('.dfms-cal-month-label');
      if (!label) {
        label = document.createElement('span');
        label.className = 'dfms-cal-month-label';
        var anchors = nav.querySelectorAll('a');
        if (anchors.length >= 2) {
          nav.insertBefore(label, anchors[1]);
        } else {
          nav.appendChild(label);
        }
      }
      var caption = getCaption(calBox);
      if (label.textContent !== caption) {
        label.textContent = caption;
      }

      var prev = nav.querySelector('.calendarnav-previous');
      var next = nav.querySelector('.calendarnav-next');
      if (prev && !prev.querySelector('svg')) prev.innerHTML = CHEVRON_PREV;
      if (next && !next.querySelector('svg')) next.innerHTML = CHEVRON_NEXT;

      var cap = calBox.querySelector('caption');
      if (cap && cap.style.display !== 'none') {
        cap.style.display = 'none';
      }

      styleWeekdayHeaders(calBox);
      fillAdjacentMonthDays(calBox);
      markPastCalendarDays(calBox);
      repositionCalendarBox(calBox);
    } finally {
      stylingCalendar = false;
    }
  }

  function observeCalendarBoxes() {
    var mo = new MutationObserver(function (mutations) {
      var boxes = [];
      mutations.forEach(function (m) {
        if (m.type === 'attributes' && m.attributeName === 'style') {
          var t = m.target;
          if (
            t.classList &&
            t.classList.contains('calendarbox') &&
            t.style.display !== 'none'
          ) {
            boxes.push(t);
          }
          return;
        }
        m.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          if (node.classList && node.classList.contains('calendarbox')) {
            boxes.push(node);
            return;
          }
          // Django redraws the month by replacing .calendar / table contents.
          // Do not react to our own span/label inserts inside the box.
          if (
            node.classList &&
            (node.classList.contains('calendar') || node.tagName === 'TABLE')
          ) {
            var box = node.closest ? node.closest('.calendarbox') : null;
            if (box) boxes.push(box);
          }
        });
      });
      boxes.forEach(function (box, i) {
        if (boxes.indexOf(box) === i) styleCalendarBox(box);
      });
    });
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style'],
    });
  }

  // ── Intercept Django's clock link ──────────────────────────────────────────
  function interceptClockLinks() {
    document.addEventListener('click', function (e) {
      const link = e.target.closest('a[id^="clocklink"]');
      if (!link) return;
      e.preventDefault();
      e.stopImmediatePropagation();

      const shortcuts = link.closest('.datetimeshortcuts');
      if (!shortcuts) return;
      const row   = shortcuts.closest('p') || shortcuts.parentElement;
      const input = row ? row.querySelector('input.vTimeField') : null;
      if (input) openPicker(input);
    }, true);
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    buildPicker();
    interceptClockLinks();
    observeCalendarBoxes();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
