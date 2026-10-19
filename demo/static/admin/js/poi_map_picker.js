/**
 * DFMS Admin — POI form: merged Address & Location section, inline map preview,
 * map picker modal, geofence preview, and reverse geocoded address.
 */
(function () {
  'use strict';

  var DEFAULT_CENTER = [23.8103, 90.4125];
  var DEFAULT_ZOOM = 12;
  var SELECTED_ZOOM = 16;
  var PREVIEW_ZOOM = 15;
  var GEOCODE_DEBOUNCE_MS = 450;
  var PREVIEW_SYNC_MS = 250;
  var NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
  var NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
  /** Match Live GPS default POI geofence (`poiGeofenceCircleStyle`). */
  var GEOFENCE_COLOR = '#0a84ff';
  var GEOFENCE_FILL_OPACITY = 0.1;
  var GEOFENCE_WEIGHT = 1.5;

  var els = {};
  var map = null;
  var marker = null;
  var geofenceCircle = null;
  var mapReady = false;
  var previewMap = null;
  var previewMarker = null;
  var previewCircle = null;
  var previewMapReady = false;
  var geocodeTimer = null;
  var geocodeRequestId = 0;
  var searchTimer = null;
  var searchRequestId = 0;
  var searchHits = [];
  var formGeocodeRequestId = 0;
  var previewSyncTimer = null;
  var LOCATION_HINT = 'Click to open map picker · drag pin to set location';

  /** Draft state inside the modal (not written to the form until Apply). */
  var draft = {
    lat: null,
    lng: null,
    address: '',
    city: '',
  };

  function field(id) {
    return document.getElementById(id);
  }

  function parseCoord(value) {
    if (value == null || String(value).trim() === '') return null;
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function radiusInput() {
    return field('id_geofence_radius_meters') || field('id_geofence_radius');
  }

  function tracksAddress() {
    return !!field('id_address');
  }

  function readRadiusMeters() {
    var input = radiusInput();
    var n = input ? parseInt(input.value, 10) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
    return field('id_geofence_radius') ? 100 : 200;
  }

  function formatCoord(value) {
    return Number(value).toFixed(7);
  }

  function isFormReadOnly() {
    var lat = field('id_latitude');
    return !lat || lat.disabled || lat.readOnly;
  }

  function readFormSnapshot() {
    return {
      lat: parseCoord(field('id_latitude') && field('id_latitude').value),
      lng: parseCoord(field('id_longitude') && field('id_longitude').value),
      address: field('id_address') ? field('id_address').value : '',
      city: field('id_city') ? field('id_city').value : '',
    };
  }

  function poiMarkerIcon() {
    return L.divIcon({
      className: 'poi-map-poi-icon',
      html: '<div class="poi-map-poi-pin poi-map-poi-pin--poi">'
        + '<span class="poi-map-poi-pin__bubble"><i class="bi bi-house-fill" aria-hidden="true"></i></span>'
        + '<span class="poi-map-poi-pin__tip"></span>'
        + '</div>',
      iconSize: [34, 38],
      iconAnchor: [17, 36],
    });
  }

  function geofenceStyle() {
    return {
      radius: readRadiusMeters(),
      color: GEOFENCE_COLOR,
      fillColor: GEOFENCE_COLOR,
      fillOpacity: GEOFENCE_FILL_OPACITY,
      weight: GEOFENCE_WEIGHT,
      interactive: false,
      className: 'poi-map-geofence',
    };
  }

  function updateCoordPreview(lat, lng) {
    if (!els.coords) return;
    els.coords.textContent = formatCoord(lat) + ', ' + formatCoord(lng);
  }

  function updateLocationChrome() {
    if (!els.locationPreview) return;
    var snapshot = readFormSnapshot();
    var hasCoords = snapshot.lat != null && snapshot.lng != null;
    var coordsEl = els.locationPreview.querySelector('.poi-location-map-preview__coords');
    if (coordsEl) {
      coordsEl.hidden = !hasCoords;
      if (hasCoords) {
        coordsEl.textContent = formatCoord(snapshot.lat) + ', ' + formatCoord(snapshot.lng);
      }
    }
  }

  function syncGeofenceCircle(latlng) {
    if (!map) return;
    var style = geofenceStyle();
    if (!geofenceCircle) {
      geofenceCircle = L.circle(latlng, style).addTo(map);
      return;
    }
    geofenceCircle.setLatLng(latlng);
    geofenceCircle.setRadius(style.radius);
    geofenceCircle.setStyle({
      color: style.color,
      fillColor: style.fillColor,
      fillOpacity: style.fillOpacity,
      weight: style.weight,
    });
  }

  function setDraftPosition(lat, lng, options) {
    options = options || {};
    draft.lat = lat;
    draft.lng = lng;
    updateCoordPreview(lat, lng);
    if (!marker || !map) return;
    var latlng = L.latLng(lat, lng);
    marker.setLatLng(latlng);
    syncGeofenceCircle(latlng);
    if (options.pan) {
      map.panTo(latlng);
    }
    if (options.geocode !== false) {
      scheduleReverseGeocode(lat, lng);
    }
  }

  function cityFromNominatimAddress(addr) {
    if (!addr) return '';
    return (
      addr.city
      || addr.town
      || addr.village
      || addr.suburb
      || addr.municipality
      || addr.county
      || ''
    );
  }

  function setGeocodePreview(text, status) {
    if (els.preview) els.preview.textContent = text || '—';
    if (els.status) els.status.textContent = status || '';
  }

  function scheduleReverseGeocode(lat, lng) {
    if (!tracksAddress()) return;
    if (geocodeTimer) clearTimeout(geocodeTimer);
    geocodeTimer = setTimeout(function () {
      reverseGeocode(lat, lng);
    }, GEOCODE_DEBOUNCE_MS);
  }

  function setLocationChromeStatus(message) {
    if (!els.locationPreview) return;
    var label = els.locationPreview.querySelector('.poi-location-map-preview__label');
    if (label) label.textContent = message || LOCATION_HINT;
  }

  function reverseGeocodeToForm(lat, lng) {
    if (!tracksAddress()) return;
    var requestId = ++formGeocodeRequestId;
    setLocationChromeStatus('Looking up address…');
    var url = NOMINATIM_URL
      + '?format=json&lat=' + encodeURIComponent(lat)
      + '&lon=' + encodeURIComponent(lng)
      + '&zoom=18&addressdetails=1';
    fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en',
        'User-Agent': 'Nourish-DFMS-POI-Admin/1.0',
      },
    })
      .then(function (res) {
        if (!res.ok) throw new Error('geocode ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (requestId !== formGeocodeRequestId) return;
        var addressInput = field('id_address');
        var cityInput = field('id_city');
        var address = data.display_name || '';
        var city = cityFromNominatimAddress(data.address) || '';
        if (addressInput && address) addressInput.value = address;
        if (cityInput && city) cityInput.value = city;
        setLocationChromeStatus(LOCATION_HINT);
      })
      .catch(function () {
        if (requestId !== formGeocodeRequestId) return;
        setLocationChromeStatus('Location set. Could not look up address for this point.');
      });
  }

  function applyPositionToForm(lat, lng) {
    var latInput = field('id_latitude');
    var lngInput = field('id_longitude');
    if (latInput) latInput.value = formatCoord(lat);
    if (lngInput) lngInput.value = formatCoord(lng);
    syncPreviewMap();
    reverseGeocodeToForm(lat, lng);
  }

  function reverseGeocode(lat, lng) {
    var requestId = ++geocodeRequestId;
    setGeocodePreview(draft.address || '—', 'Looking up address…');
    var url = NOMINATIM_URL
      + '?format=json&lat=' + encodeURIComponent(lat)
      + '&lon=' + encodeURIComponent(lng)
      + '&zoom=18&addressdetails=1';
    fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en',
        'User-Agent': 'Nourish-DFMS-POI-Admin/1.0',
      },
    })
      .then(function (res) {
        if (!res.ok) throw new Error('geocode ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (requestId !== geocodeRequestId) return;
        draft.address = data.display_name || draft.address || '';
        draft.city = cityFromNominatimAddress(data.address) || draft.city || '';
        setGeocodePreview(draft.address, '');
      })
      .catch(function () {
        if (requestId !== geocodeRequestId) return;
        setGeocodePreview(draft.address || '—', 'Could not look up address for this point.');
      });
  }

  function setSearchStatus(message) {
    if (els.searchStatus) els.searchStatus.textContent = message || '';
  }

  function hideSearchResults() {
    searchHits = [];
    if (!els.searchResults) return;
    els.searchResults.hidden = true;
    els.searchResults.innerHTML = '';
  }

  function clearPlaceSearch() {
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
    searchRequestId += 1;
    if (els.search) els.search.value = '';
    hideSearchResults();
    setSearchStatus('');
  }

  function showSearchHit(hit) {
    var lat = Number(hit.lat);
    var lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !map) return;
    hideSearchResults();
    setSearchStatus(hit.display_name || '');
    setDraftPosition(lat, lng, { pan: false, geocode: tracksAddress() });
    var box = hit.boundingbox;
    if (box && box.length === 4) {
      var south = Number(box[0]);
      var north = Number(box[1]);
      var west = Number(box[2]);
      var east = Number(box[3]);
      if ([south, north, west, east].every(Number.isFinite)) {
        map.fitBounds([[south, west], [north, east]], { maxZoom: SELECTED_ZOOM, padding: [24, 24] });
        return;
      }
    }
    map.setView([lat, lng], 13);
  }

  function renderSearchResults(hits) {
    if (!els.searchResults) return;
    searchHits = hits;
    els.searchResults.innerHTML = '';
    if (!hits.length) {
      els.searchResults.hidden = true;
      setSearchStatus('No matching place in Bangladesh.');
      return;
    }
    hits.forEach(function (hit, index) {
      var item = document.createElement('li');
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'poi-map-modal__search-result';
      button.setAttribute('role', 'option');
      button.textContent = hit.display_name || (hit.lat + ', ' + hit.lon);
      button.addEventListener('click', function () {
        showSearchHit(hit);
      });
      item.appendChild(button);
      els.searchResults.appendChild(item);
      if (index === 0) button.dataset.first = '1';
    });
    els.searchResults.hidden = false;
    setSearchStatus('');
  }

  function searchPlaces(query, options) {
    options = options || {};
    var requestId = ++searchRequestId;
    setSearchStatus('Searching…');
    var url = NOMINATIM_SEARCH_URL
      + '?format=jsonv2&limit=5&countrycodes=bd&q=' + encodeURIComponent(query);
    fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en',
      },
    })
      .then(function (res) {
        if (!res.ok) throw new Error('search ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (requestId !== searchRequestId) return;
        var hits = Array.isArray(data) ? data : [];
        renderSearchResults(hits);
        if (options.selectFirst && hits.length) showSearchHit(hits[0]);
      })
      .catch(function () {
        if (requestId !== searchRequestId) return;
        hideSearchResults();
        setSearchStatus('Could not search for that place.');
      });
  }

  function schedulePlaceSearch() {
    if (searchTimer) clearTimeout(searchTimer);
    var query = els.search ? els.search.value.trim() : '';
    if (query.length < 2) {
      searchRequestId += 1;
      hideSearchResults();
      setSearchStatus('');
      return;
    }
    searchTimer = setTimeout(function () {
      searchPlaces(query);
    }, GEOCODE_DEBOUNCE_MS);
  }

  function ensureMap() {
    if (mapReady || !els.canvas || typeof L === 'undefined') return;
    map = L.map(els.canvas, { zoomControl: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer((location.protocol === 'file:' ? 'https://tile.openstreetmap.de/{z}/{x}/{y}.png' : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'), {
      maxZoom: 19,
      referrerPolicy: 'origin',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' + (location.protocol === 'file:' ? ' · Tiles: openstreetmap.de' : ''),
    }).addTo(map);

    marker = L.marker(DEFAULT_CENTER, {
      icon: poiMarkerIcon(),
      draggable: true,
      autoPan: true,
    }).addTo(map);

    marker.on('dragend', function () {
      var pos = marker.getLatLng();
      setDraftPosition(pos.lat, pos.lng);
    });

    map.on('click', function (e) {
      setDraftPosition(e.latlng.lat, e.latlng.lng, { pan: false });
    });

    mapReady = true;
  }

  function fitMapToDraft() {
    if (!map || draft.lat == null || draft.lng == null) return;
    var latlng = L.latLng(draft.lat, draft.lng);
    var radius = readRadiusMeters();
    var bounds = geofenceCircle
      ? geofenceCircle.getBounds()
      : latlng.toBounds(Math.max(radius * 2, 400));
    map.fitBounds(bounds.pad(0.25), { maxZoom: SELECTED_ZOOM, animate: false });
  }

  function openMapPickerFromPreview(event) {
    if (event) {
      if (event.target.closest('#poi-map-geo-btn')) return;
      if (event.target.closest('.leaflet-control-attribution')) return;
      event.preventDefault();
    }
    openModal(null, els.locationPreview);
  }

  function bindPreviewMapOpen() {
    if (!els.locationPreview || els.locationPreview.dataset.poiPreviewClickBound) return;
    els.locationPreview.dataset.poiPreviewClickBound = '1';
    els.locationPreview.addEventListener('click', openMapPickerFromPreview);
  }

  function ensurePreviewMap() {
    if (previewMapReady || !els.previewCanvas || typeof L === 'undefined') return;

    var snapshot = readFormSnapshot();
    var hasCoords = snapshot.lat != null && snapshot.lng != null;
    var center = hasCoords ? [snapshot.lat, snapshot.lng] : DEFAULT_CENTER;
    var zoom = hasCoords ? PREVIEW_ZOOM : DEFAULT_ZOOM;

    previewMap = L.map(els.previewCanvas, {
      zoomControl: false,
      attributionControl: true,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      tap: false,
    }).setView(center, zoom);

    L.tileLayer((location.protocol === 'file:' ? 'https://tile.openstreetmap.de/{z}/{x}/{y}.png' : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'), {
      maxZoom: 19,
      referrerPolicy: 'origin',
      attribution: '&copy; OSM',
    }).addTo(previewMap);

    previewMarker = L.marker(center, {
      icon: poiMarkerIcon(),
      interactive: false,
    }).addTo(previewMap);

    previewCircle = L.circle(L.latLng(center[0], center[1]), geofenceStyle()).addTo(previewMap);

    previewMapReady = true;

    function refreshPreviewSize() {
      if (!previewMap) return;
      previewMap.invalidateSize();
      fitPreviewMap();
    }

    requestAnimationFrame(function () {
      requestAnimationFrame(refreshPreviewSize);
    });
    setTimeout(refreshPreviewSize, 120);

    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(function () {
        if (previewMap) previewMap.invalidateSize();
      }).observe(els.previewCanvas);
    }
  }

  function fitPreviewMap() {
    if (!previewMap) return;
    var snapshot = readFormSnapshot();
    if (snapshot.lat == null || snapshot.lng == null) {
      previewMap.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }
    var latlng = L.latLng(snapshot.lat, snapshot.lng);
    var radius = readRadiusMeters();
    var bounds = previewCircle
      ? previewCircle.getBounds()
      : latlng.toBounds(Math.max(radius * 2, 400));
    previewMap.fitBounds(bounds.pad(0.18), { maxZoom: PREVIEW_ZOOM, animate: false });
  }

  function syncPreviewMap() {
    ensurePreviewMap();
    if (!previewMap || !previewMarker || !previewCircle) return;

    var snapshot = readFormSnapshot();
    var hasCoords = snapshot.lat != null && snapshot.lng != null;
    var lat = hasCoords ? snapshot.lat : DEFAULT_CENTER[0];
    var lng = hasCoords ? snapshot.lng : DEFAULT_CENTER[1];
    var latlng = L.latLng(lat, lng);

    previewMarker.setLatLng(latlng);
    previewCircle.setLatLng(latlng);
    previewCircle.setRadius(readRadiusMeters());
    fitPreviewMap();
    updateLocationChrome();
  }

  function schedulePreviewSync() {
    if (previewSyncTimer) clearTimeout(previewSyncTimer);
    previewSyncTimer = setTimeout(syncPreviewMap, PREVIEW_SYNC_MS);
  }

  function openModal(initialCoords, trigger) {
    if (!els.modal) return;
    els.lastMapTrigger = trigger || document.activeElement;
    var snapshot = readFormSnapshot();
    draft.lat = snapshot.lat;
    draft.lng = snapshot.lng;
    draft.address = snapshot.address;
    draft.city = snapshot.city;

    if (initialCoords) {
      draft.lat = initialCoords.lat;
      draft.lng = initialCoords.lng;
    }

    var hasCoords = draft.lat != null && draft.lng != null;
    if (!hasCoords) {
      draft.lat = DEFAULT_CENTER[0];
      draft.lng = DEFAULT_CENTER[1];
    }

    els.modal.hidden = false;
    els.modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('poi-map-modal-open');

    ensureMap();
    requestAnimationFrame(function () {
      if (!map) return;
      map.invalidateSize();
      setDraftPosition(draft.lat, draft.lng, { pan: false, geocode: hasCoords || !!initialCoords });
      if (hasCoords || initialCoords) {
        fitMapToDraft();
        if (tracksAddress()) {
          setGeocodePreview(draft.address || '—', draft.address ? '' : 'Looking up address…');
          if (!draft.address) scheduleReverseGeocode(draft.lat, draft.lng);
        }
      } else {
        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
        if (tracksAddress()) {
          setGeocodePreview('—', 'Move the marker to look up an address.');
          scheduleReverseGeocode(draft.lat, draft.lng);
        }
      }
    });
  }

  function closeModal() {
    if (!els.modal) return;
    var active = document.activeElement;
    if (active && els.modal.contains(active) && typeof active.blur === 'function') {
      active.blur();
    }
    els.modal.hidden = true;
    els.modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('poi-map-modal-open');
    if (geocodeTimer) {
      clearTimeout(geocodeTimer);
      geocodeTimer = null;
    }
    geocodeRequestId += 1;
    clearPlaceSearch();
    var returnTarget = els.lastMapTrigger
      || els.locationPreview?.querySelector('#poi-map-geo-btn')
      || document.getElementById('poi-map-open-btn');
    if (returnTarget && typeof returnTarget.focus === 'function') {
      returnTarget.focus();
    }
  }

  function applyDraft() {
    if (draft.lat == null || draft.lng == null) return;
    var latInput = field('id_latitude');
    var lngInput = field('id_longitude');
    var addressInput = field('id_address');
    var cityInput = field('id_city');
    if (latInput) latInput.value = formatCoord(draft.lat);
    if (lngInput) lngInput.value = formatCoord(draft.lng);
    if (addressInput && draft.address) addressInput.value = draft.address;
    if (cityInput && draft.city) cityInput.value = draft.city;
    syncPreviewMap();
    closeModal();
  }

  function onRadiusChange() {
    syncPreviewMap();
    if (!mapReady || els.modal.hidden || draft.lat == null || draft.lng == null) return;
    syncGeofenceCircle(L.latLng(draft.lat, draft.lng));
  }

  function localhostUrlHint() {
    var port = location.port || (location.protocol === 'https:' ? '443' : '80');
    return 'http://localhost:' + port + location.pathname + location.search;
  }

  function geolocationErrorMessage(err) {
    if (!err) return 'Could not get your location.';
    if (err.code === 1) {
      return 'Location permission denied. Allow access in your browser and try again.';
    }
    if (err.code === 2) return 'Location unavailable. Try again.';
    if (err.code === 3) return 'Location request timed out. Try again.';
    return 'Could not get your location.';
  }

  function fetchNetworkLocation() {
    return fetch('https://ipwho.is/', {
      headers: { Accept: 'application/json' },
    })
      .then(function (res) {
        if (!res.ok) throw new Error('network location ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data.success) throw new Error(data.message || 'network location failed');
        var lat = Number(data.latitude);
        var lng = Number(data.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          throw new Error('network location invalid');
        }
        return { lat: lat, lng: lng };
      });
  }

  function finishGeoButton(btn) {
    if (!btn) return;
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
  }

  function useMyLocation(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    var btn = (event && event.currentTarget)
      || els.locationPreview?.querySelector('#poi-map-geo-btn');

    if (btn) {
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
    }

    var inModal = !!(btn && btn.closest && btn.closest('#poi-map-modal'));

    function note(message) {
      if (inModal && els.status) els.status.textContent = message || '';
      setLocationChromeStatus(message);
    }

    function onLocated(lat, lng, options) {
      options = options || {};
      if (inModal) {
        setDraftPosition(lat, lng, { pan: false, geocode: tracksAddress() });
        if (map) map.setView([lat, lng], SELECTED_ZOOM);
      } else {
        applyPositionToForm(lat, lng);
      }
      finishGeoButton(btn);
      if (options.approximate) {
        note(
          'Approximate network location set.'
          + (options.insecure ? ' For precise GPS, open ' + localhostUrlHint() + ' or use HTTPS.'
            : ' Allow location access for GPS precision.')
        );
        window.setTimeout(function () {
          note(inModal ? '' : LOCATION_HINT);
        }, 8000);
      } else if (inModal) {
        note('');
      }
    }

    function tryNetworkFallback(statusPrefix) {
      note((statusPrefix ? statusPrefix + ' ' : '') + 'Trying network location…');
      fetchNetworkLocation()
        .then(function (loc) {
          onLocated(loc.lat, loc.lng, {
            approximate: true,
            insecure: !window.isSecureContext,
          });
        })
        .catch(function () {
          finishGeoButton(btn);
          if (!window.isSecureContext) {
            note(
              'GPS is blocked on http://' + location.host
              + '. Open ' + localhostUrlHint() + ' or use Pin on map.'
            );
            return;
          }
          note('Could not determine your location. Use Pin on map instead.');
        });
    }

    if (!navigator.geolocation || !window.isSecureContext) {
      tryNetworkFallback(
        !window.isSecureContext
          ? 'Precise GPS needs HTTPS or localhost.'
          : 'Geolocation is not supported.'
      );
      return;
    }

    note('Getting your location…');
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        onLocated(pos.coords.latitude, pos.coords.longitude, { approximate: false });
      },
      function (err) {
        tryNetworkFallback(geolocationErrorMessage(err));
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  function trimLabelColon(label) {
    if (!label) return;
    var text = label.textContent.replace(/:\s*$/, '');
    label.textContent = text;
  }

  /**
   * Rebuild Django aligned form-row markup into label-above-control stacks so
   * the address / city / country / geofence grid matches the design mockup.
   */
  function normalizeLocationFieldRow(row, options) {
    options = options || {};
    if (!row || row.dataset.poiFieldNormalized) return row;

    var source = row.querySelector(':scope > div') || row;
    var label = source.querySelector('label');
    var control = source.querySelector('input, select, textarea');
    if (!label || !control) return row;

    var extras = [];
    source.querySelectorAll('.help, .helptext, .errorlist').forEach(function (el) {
      extras.push(el);
    });

    trimLabelColon(label);
    control.classList.add('poi-location-control');
    if (control.tagName === 'TEXTAREA') {
      control.classList.add('poi-location-control--textarea');
    }

    row.classList.add('poi-location-field');
    row.dataset.poiFieldNormalized = '1';

    var stack = document.createElement('div');
    stack.className = 'poi-location-field__stack';
    stack.appendChild(label);
    stack.appendChild(control);
    extras.forEach(function (el) {
      stack.appendChild(el);
    });

    if (options.radiusHint) {
      var hint = document.createElement('div');
      hint.className = 'poi-location-radius-hint';
      hint.textContent = 'Default 200 m';
      stack.appendChild(hint);
    }

    row.textContent = '';
    row.appendChild(stack);
    return row;
  }

  function layoutAddressLocationSection() {
    var fieldset = document.querySelector('fieldset.poi-address-location');
    if (!fieldset || fieldset.dataset.poiLocationLayout) return;

    var addressRow = fieldset.querySelector('.form-row.field-address');
    var cityRow = fieldset.querySelector('.form-row.field-city');
    var countryRow = fieldset.querySelector('.form-row.field-country');
    var radiusRow = fieldset.querySelector('.form-row.field-geofence_radius_meters');
    var latRow = fieldset.querySelector('.form-row.field-latitude');
    var lngRow = fieldset.querySelector('.form-row.field-longitude');
    if (!addressRow || !cityRow || !countryRow || !radiusRow || !latRow || !lngRow) return;

    normalizeLocationFieldRow(addressRow);
    normalizeLocationFieldRow(cityRow);
    normalizeLocationFieldRow(countryRow);
    normalizeLocationFieldRow(radiusRow, { radiusHint: true });
    normalizeLocationFieldRow(latRow);
    normalizeLocationFieldRow(lngRow);

    fieldset.dataset.poiLocationLayout = '1';

    var h2 = fieldset.querySelector('h2');
    if (h2 && !h2.querySelector('.bi')) {
      h2.insertAdjacentHTML('afterbegin', '<i class="bi bi-map" aria-hidden="true"></i> ');
    }

    var body = document.createElement('div');
    body.className = 'poi-location-body';

    var addressWrap = document.createElement('div');
    addressWrap.className = 'poi-location-row poi-location-row--address';
    addressWrap.appendChild(addressRow);

    var metaWrap = document.createElement('div');
    metaWrap.className = 'poi-location-row poi-location-row--meta';
    metaWrap.appendChild(cityRow);
    metaWrap.appendChild(countryRow);
    metaWrap.appendChild(radiusRow);

    var orBadge = document.createElement('div');
    orBadge.className = 'poi-location-or';
    orBadge.textContent = 'pin on map or enter coordinates manually';

    var preview = document.createElement('div');
    preview.className = 'poi-location-map-preview';
    preview.setAttribute('aria-label', 'Map preview — click to open map picker');
    preview.innerHTML = ''
      + '<div id="poi-inline-map-canvas" class="poi-location-inline-map" role="application"></div>'
      + '<div class="poi-location-map-preview__chrome">'
      + '<span class="poi-location-map-preview__label">' + LOCATION_HINT + '</span>'
      + '<span class="poi-location-map-preview__coords" hidden></span>'
      + '</div>'
      + '<button type="button" class="poi-map-locate" id="poi-map-geo-btn" title="Use my location" aria-label="Use my location">'
      + '<i class="bi bi-crosshair" aria-hidden="true"></i>'
      + '</button>';

    var coordsWrap = document.createElement('div');
    coordsWrap.className = 'poi-location-row poi-location-row--coords';

    var pinCol = document.createElement('div');
    pinCol.className = 'poi-location-pin-col';
    pinCol.innerHTML = ''
      + '<span class="poi-location-pin-col__label" aria-hidden="true">&nbsp;</span>'
      + '<button type="button" class="poi-location-pin-btn" id="poi-map-open-btn">'
      + '<i class="bi bi-geo-alt" aria-hidden="true"></i>'
      + '<span>Pin on map</span>'
      + '</button>';

    coordsWrap.appendChild(latRow);
    coordsWrap.appendChild(lngRow);
    coordsWrap.appendChild(pinCol);

    body.appendChild(addressWrap);
    body.appendChild(metaWrap);
    body.appendChild(orBadge);
    body.appendChild(preview);
    body.appendChild(coordsWrap);

    var description = fieldset.querySelector('.description');
    if (description) {
      description.insertAdjacentElement('afterend', body);
    } else if (h2) {
      h2.insertAdjacentElement('afterend', body);
    } else {
      fieldset.appendChild(body);
    }

    els.locationPreview = preview;
    els.previewCanvas = preview.querySelector('#poi-inline-map-canvas');

    var readonly = isFormReadOnly();
    if (readonly) {
      preview.classList.add('poi-location-map-preview--readonly');
      preview.querySelector('#poi-map-geo-btn')?.remove();
      pinCol.querySelector('#poi-map-open-btn')?.remove();
      syncPreviewMap();
      return;
    }

    preview.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMapPickerFromPreview();
      }
    });
    preview.tabIndex = 0;
    bindPreviewMapOpen();

    preview.querySelector('#poi-map-geo-btn')?.addEventListener('click', useMyLocation);
    pinCol.querySelector('#poi-map-open-btn')?.addEventListener('click', function (e) {
      e.preventDefault();
      openModal(null, e.currentTarget);
    });

    field('id_latitude')?.addEventListener('input', schedulePreviewSync);
    field('id_latitude')?.addEventListener('change', syncPreviewMap);
    field('id_longitude')?.addEventListener('input', schedulePreviewSync);
    field('id_longitude')?.addEventListener('change', syncPreviewMap);

    syncPreviewMap();
  }

  function bindModal() {
    els.modal = document.getElementById('poi-map-modal');
    els.canvas = document.getElementById('poi-map-canvas');
    els.preview = document.getElementById('poi-map-geocode-preview');
    els.coords = document.getElementById('poi-map-coord-preview');
    els.status = document.getElementById('poi-map-geocode-status');
    els.search = document.getElementById('poi-map-search');
    els.searchResults = document.getElementById('poi-map-search-results');
    els.searchStatus = document.getElementById('poi-map-search-status');
  }

  function layoutPartyLocationSection() {
    var fieldset = document.querySelector('fieldset.party-location');
    if (!fieldset || fieldset.dataset.poiLocationLayout) return;

    var radiusRow = fieldset.querySelector('.form-row.field-geofence_radius');
    var latRow = fieldset.querySelector('.form-row.field-latitude');
    var lngRow = fieldset.querySelector('.form-row.field-longitude');
    if (!radiusRow || !latRow || !lngRow) return;

    normalizeLocationFieldRow(radiusRow);
    normalizeLocationFieldRow(latRow);
    normalizeLocationFieldRow(lngRow);
    fieldset.dataset.poiLocationLayout = '1';

    var h2 = fieldset.querySelector('h2');
    if (h2 && !h2.querySelector('.bi')) {
      h2.insertAdjacentHTML('afterbegin', '<i class="bi bi-map" aria-hidden="true"></i> ');
    }

    var body = document.createElement('div');
    body.className = 'poi-location-body';

    var metaWrap = document.createElement('div');
    metaWrap.className = 'poi-location-row poi-location-row--meta';
    metaWrap.appendChild(radiusRow);

    var orBadge = document.createElement('div');
    orBadge.className = 'poi-location-or';
    orBadge.textContent = 'pin on map or enter coordinates manually';

    var preview = document.createElement('div');
    preview.className = 'poi-location-map-preview';
    preview.setAttribute('aria-label', 'Map preview — click to open map picker');
    preview.innerHTML = ''
      + '<div id="poi-inline-map-canvas" class="poi-location-inline-map" role="application"></div>'
      + '<div class="poi-location-map-preview__chrome">'
      + '<span class="poi-location-map-preview__label">' + LOCATION_HINT + '</span>'
      + '<span class="poi-location-map-preview__coords" hidden></span>'
      + '</div>'
      + '<button type="button" class="poi-map-locate" id="poi-map-geo-btn" title="Use my location" aria-label="Use my location">'
      + '<i class="bi bi-crosshair" aria-hidden="true"></i>'
      + '</button>';

    var coordsWrap = document.createElement('div');
    coordsWrap.className = 'poi-location-row poi-location-row--coords';
    var pinCol = document.createElement('div');
    pinCol.className = 'poi-location-pin-col';
    pinCol.innerHTML = ''
      + '<span class="poi-location-pin-col__label" aria-hidden="true">&nbsp;</span>'
      + '<button type="button" class="poi-location-pin-btn" id="poi-map-open-btn">'
      + '<i class="bi bi-geo-alt" aria-hidden="true"></i>'
      + '<span>Pin on map</span>'
      + '</button>';
    coordsWrap.appendChild(latRow);
    coordsWrap.appendChild(lngRow);
    coordsWrap.appendChild(pinCol);

    body.appendChild(metaWrap);
    body.appendChild(orBadge);
    body.appendChild(preview);
    body.appendChild(coordsWrap);

    var description = fieldset.querySelector('.description');
    if (description) {
      description.insertAdjacentElement('afterend', body);
    } else if (h2) {
      h2.insertAdjacentElement('afterend', body);
    } else {
      fieldset.appendChild(body);
    }

    els.locationPreview = preview;
    els.previewCanvas = preview.querySelector('#poi-inline-map-canvas');

    var readonly = isFormReadOnly();
    if (readonly) {
      preview.classList.add('poi-location-map-preview--readonly');
      var geoBtn = preview.querySelector('#poi-map-geo-btn');
      if (geoBtn) geoBtn.remove();
      var openBtn = pinCol.querySelector('#poi-map-open-btn');
      if (openBtn) openBtn.remove();
      syncPreviewMap();
      return;
    }

    preview.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMapPickerFromPreview();
      }
    });
    preview.tabIndex = 0;
    bindPreviewMapOpen();
    var geoButton = preview.querySelector('#poi-map-geo-btn');
    if (geoButton) geoButton.addEventListener('click', useMyLocation);
    var pinButton = pinCol.querySelector('#poi-map-open-btn');
    if (pinButton) {
      pinButton.addEventListener('click', function (e) {
        e.preventDefault();
        openModal(null, e.currentTarget);
      });
    }
    field('id_latitude')?.addEventListener('input', schedulePreviewSync);
    field('id_latitude')?.addEventListener('change', syncPreviewMap);
    field('id_longitude')?.addEventListener('input', schedulePreviewSync);
    field('id_longitude')?.addEventListener('change', syncPreviewMap);
    syncPreviewMap();
  }

  function init() {
    if (!field('id_latitude') || !field('id_longitude')) return;
    bindModal();
    layoutAddressLocationSection();
    layoutPartyLocationSection();

    document.getElementById('poi-map-apply')?.addEventListener('click', applyDraft);
    var modalGeo = document.getElementById('poi-map-modal-geo-btn');
    if (modalGeo) {
      if (isFormReadOnly()) modalGeo.remove();
      else modalGeo.addEventListener('click', useMyLocation);
    }

    if (els.search) {
      els.search.addEventListener('input', schedulePlaceSearch);
      els.search.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (searchTimer) {
          clearTimeout(searchTimer);
          searchTimer = null;
        }
        var query = els.search.value.trim();
        if (searchHits.length) {
          showSearchHit(searchHits[0]);
          return;
        }
        if (query.length >= 2) searchPlaces(query, { selectFirst: true });
      });
    }

    document.querySelectorAll('[data-poi-map-dismiss]').forEach(function (btn) {
      btn.addEventListener('click', closeModal);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !els.modal || els.modal.hidden) return;
      if (els.searchResults && !els.searchResults.hidden) {
        e.preventDefault();
        hideSearchResults();
        return;
      }
      e.preventDefault();
      closeModal();
    });

    field('id_geofence_radius_meters')?.addEventListener('input', onRadiusChange);
    field('id_geofence_radius_meters')?.addEventListener('change', onRadiusChange);
    field('id_geofence_radius')?.addEventListener('input', onRadiusChange);
    field('id_geofence_radius')?.addEventListener('change', onRadiusChange);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
