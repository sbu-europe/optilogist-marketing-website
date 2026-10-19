window.LiveGpsApp = (function () {
  'use strict';

  const CONFIG = window.LIVE_GPS_CONFIG || {};
  const U = window.LiveGpsUtils;
  const poiTypeIconHtml = (window.LiveGpsPoiIcons && window.LiveGpsPoiIcons.iconHtml)
    || function () { return ''; };
  const poiTypePinColor = (window.LiveGpsPoiIcons && window.LiveGpsPoiIcons.pinColor)
    || function () { return '#0a84ff'; };
  const poiTypeLabel = (window.LiveGpsPoiIcons && window.LiveGpsPoiIcons.typeLabel)
    || function () { return 'POI'; };
  const liveGpsIcon = U.liveGpsIcon;
  const setLiveGpsButtonIcon = U.setLiveGpsButtonIcon;
  const formatListTime = U.formatListTime;
  const haversineKm = U.haversineKm;
  const bearingDegrees = U.bearingDegrees;
  const dash = U.dash;
  const speedText = U.speedText;
  const liveGpsCsrfToken = U.liveGpsCsrfToken;
  const liveGpsApiFetch = U.liveGpsApiFetch;
  const poiEscape = U.poiEscape;
  const escHtml = U.escHtml;
  const debounce = U.debounce;

  function resolveRefreshMs(seconds) {
    const sec = Number(seconds);
    if (Number.isFinite(sec) && sec > 0) return Math.round(sec * 1000);
    return 10000;
  }

  let refreshMs = resolveRefreshMs(CONFIG.refreshIntervalSeconds);
  const DEFAULT_CENTER = [23.8103, 90.4125];
  const DEFAULT_ZOOM = 12;
  const VEHICLE_ZOOM = 15;
  /** Screen distance (px) under which vehicle markers merge into a count circle. */
  const CLUSTER_RADIUS_PX = 60;
  const CLUSTER_ZOOM_SHRINK_START = 11;
  /** At this zoom and above, markers never cluster (popups always reachable). */
  const CLUSTER_ZOOM_FULL_SPLIT = 16;
  const CLUSTER_ICON_SIZE = 52;





  let map = null;
  let markers = {};
  let clusterMarkers = {};
  let trails = {};
  let plannedRoutes = {};
  let mapInitialFitDone = false;
  /** After Objects-list selection, block poll/resize from refitting the map. */
  let mapViewLocked = false;
  let markerLayoutTimer = null;
  let dockPanelsVisible = false;
  let suppressMarkerLayout = false;
  const markerGlides = {};
  function markerGlideMs() {
    return Math.max(refreshMs - 800, 200);
  }
  const lastHeadingByTrip = {};
  const lastPositionByTrip = {};
  let vehicles = [];
  let mapPois = [];
  /** @type {ReturnType<typeof createFleetStatusFilter>|null} */
  let toStatusFilter = null;
  /** @type {ReturnType<typeof createFleetStatusFilter>|null} */
  let vehicleStatusFilter = null;
  /** TO status filter values hidden from the dropdown (vehicles may still appear in the fleet list). */
  const TO_STATUS_FILTER_EXCLUDED = new Set(['under_maintenance', 'bill_disbursed']);
  /** Vehicle status values hidden from filter + fleet pills (none in V2). */
  const VEHICLE_STATUS_UI_HIDDEN = new Set([]);
  /** Vehicle statuses hidden only from the vehicle-status filter dropdown. */
  const VEHICLE_STATUS_FILTER_EXCLUDED = new Set(['inactive']);
  /**
   * Vehicle statuses hidden from the fleet list + map by default. They stay
   * selectable in the vehicle-status filter; picking one reveals its vehicles.
   */
  const VEHICLE_STATUS_HIDDEN_BY_DEFAULT = new Set(['inactive']);
  let objectsSearchQuery = '';
  let refreshTimer = null;
  let selectedVehicleId = null;
  let openPopupVehicleId = null;
  /** Which map surface owns the open popup: ``main`` or ``follow``. */
  let openPopupSurface = null;
  /** Suppress a second autoPan right after openPopup (dock/layout settle). */
  let vehiclePopupOpenedAt = 0;
  const addressCache = {};
  const addressPending = {};
  const lastAddressByTrip = {};
  let objMenuVehicleId = null;
  let historyTripId = null;
  /** Vehicle under history detail focus (TO or idle) — drives map isolation + playback marker. */
  let historyFocusVehicleId = null;
  let historyRange = null;
  let historyPoints = [];
  let historyOverspeedEvents = [];
  let historyOverspeedLimitKmh = null;
  /** Canvas hit targets for overspeed dots on the speed chart (rebuilt each draw). */
  let historyOverspeedHitTargets = [];
  /** Overspeed event id whose map popup was opened by chart-dot hover; cleared on leave. */
  let historyChartOverspeedHoverId = null;
  /** Debounces chart-hover-triggered overspeed popups so fast mouse movement over dense dots doesn't thrash. */
  let historyOverspeedHoverDebounceTimer = null;
  let historyPlayTimer = null;
  let historyPlaySpeed = 1;
  const HISTORY_PLAY_BASE_MS = 280;
  const HISTORY_PLAY_SPEEDS = [1, 2, 4, 6];
  let historyPlayIndex = 0;
  let historyCursorX = null;
  let historyChartLayout = null;
  /** Auto-pan map to playback marker while history plays. */
  let historyMapFollowActive = false;
  let historyMapFollowUserSuspended = false;
  let historyMapProgrammaticPan = false;
  let historyMapFollowControl = null;
  let historyMapFollowBtn = null;
  let historyMapProgrammaticPanTimer = null;
  /** EMA-smoothed heading used only for the follow look-ahead pan offset (null until established). */
  let historyFollowBearing = null;
  /** Screen-space distance the pan target is pushed ahead of the vehicle, in its direction of travel. */
  const HISTORY_FOLLOW_LOOKAHEAD_PX = 100;
  /** Weight given to each new bearing sample when smoothing (0-1, higher = snappier). */
  const HISTORY_FOLLOW_BEARING_SMOOTHING = 0.3;
  /** Chart wrap drag-to-pan state (Pointer Events). */
  let historyChartDragging = false;
  let historyChartDragPointerId = null;
  let historyChartDragStartX = 0;
  let historyChartDragLastX = 0;
  let historyChartDragStartScroll = 0;
  let historyChartDragDistance = 0;
  /** When true, playback auto-scroll follow is paused so manual pan is not overridden. */
  let historyChartFollowSuspended = false;
  let historyChartFollowResumeTimer = null;
  const HISTORY_CHART_DRAG_CLICK_THRESHOLD_PX = 5;
  const HISTORY_CHART_FOLLOW_RESUME_MS = 3000;
  /** Zoom 1.0 = readable baseline: this many CSS px between consecutive samples. */
  const HISTORY_CHART_TARGET_PX_PER_POINT = 8;
  /** Hard cap: never stretch consecutive samples farther apart than this. */
  const HISTORY_CHART_MAX_PX_PER_POINT = 48;
  const HISTORY_CHART_ZOOM_STEP = 1.5;
  const HISTORY_CHART_LABEL_MIN_PX = 90;
  let historyChartZoom = 1;
  let historyChartDefaultZoom = 1;
  let historySeekScrubbing = false;
  let historyPanelCollapsed = false;
  let historyPathLine = null;
  let historyPlayedLine = null;
  let historyArrowLayer = null;
  let historyRegistration = '';
  let historySummaryEvents = [];
  /** Activity types shown on left cards only — not as numbered map pins. */
  const HISTORY_ACTIVITY_CARD_ONLY_TYPES = new Set([
    'drive',
    'stopped',
    'parked',
    'geofence_entry',
    'geofence_exit',
  ]);
  let historyRenderedEventIds = [];
  let historyFromIso = null;
  let historyToIso = null;
  let historyCalMonth = null;
  let historyCalStart = null;
  let historyCalEnd = null;
  let historyRangeFromIso = null;
  let historyRangeToIso = null;
  let historyTimeFrom = '12:00 AM';
  let historyTimeTo = '11:59 PM';
  let historyDateModalOpen = false;
  let historyDateModalSnapshot = null;
  let historyToList = [];
  let historyTimelineList = [];
  let historyTimelineCounts = { trips: 0, idle_periods: 0 };
  let historySelectedTo = null;
  let historySelectedIdle = null;
  let historyView = 'idle';
  let historyToNumber = '';
  let historyMarkerLayer = null;
  let historyGeofenceCoordsByEventId = {};
  let historyLeafletMarkersByEventId = {};
  const HISTORY_EVENT_PIN_COLORS = {
    source: '#22c55e',
    destination: '#ef4444',
    trip_start: '#2563eb',
    trip_end: '#1e40af',
    drive: '#0284c7',
    stopped: '#ea580c',
    parked: '#7c3aed',
    geofence_entry: '#059669',
    geofence_exit: '#d97706',
    overspeed: '#dc2626',
  };
  const HISTORY_CAL_WEEKDAYS = [CONFIG.i18n.mo, CONFIG.i18n.tu, CONFIG.i18n.we, CONFIG.i18n.th, CONFIG.i18n.fr, CONFIG.i18n.sa, CONFIG.i18n.su];
  /** Target spacing between history path direction arrows (meters). */
  const HISTORY_ARROW_SPACING_M = 70;
  /** Hard cap so long trips do not flood Leaflet with markers. */
  const HISTORY_ARROW_MAX = 400;
  /** Match an overspeed event to a nearby arrow for popup/hover (meters). */
  const HISTORY_ARROW_OVERSPEED_MATCH_M = 90;
  /** Debounce delay before a chart-hover opens an overspeed popup (ms). */
  const HISTORY_OVERSPEED_HOVER_DEBOUNCE_MS = 70;
  /** History path stroke: thicker when zoomed out so region views stay readable. */
  const HISTORY_PATH_WEIGHT_MIN = 4;
  const HISTORY_PATH_WEIGHT_MAX = 12;
  /** @type {Record<string, {panel: HTMLElement, map: L.Map, marker: L.Marker|null, trailLine: L.Polyline|null, mapReady: boolean}>} */
  const followPanels = {};
  let followPanelZ = 611;
  const FOLLOW_ZOOM = 17;
  const FOLLOW_TRUCK_W = 80;
  const FOLLOW_TRUCK_H = 38;
  const FOLLOW_LABEL_H = 18;

  const TRUCK_MARKER_URL = CONFIG.truckMarkerUrl;
  /** truck_marker.png cab faces left; +90° aligns GPS heading 0 with north. */
  const TRUCK_HEADING_OFFSET = 90;
  const TRUCK_W = 140;
  const TRUCK_H = 66;
  const LABEL_H = 22;

  /** px between popup tip and truck roof; 0 = tip meets truck top. */
  const POPUP_TIP_GAP = 0;
  const POPUP_OFFSET_Y = -(TRUCK_H / 2 + POPUP_TIP_GAP);

  function vehicleKey(v) {
    return v ? String(v.vehicle_id) : '';
  }

  function hasMapPosition(v) {
    return !!(v && v.has_position && v.latitude != null && v.longitude != null);
  }

  function toStatusClass(status) {
    return 'live-gps-op-status--' + String(status || 'unknown').replace(/_/g, '-');
  }

  const TERMINAL_TO_STATUSES = new Set(['cancelled', 'completed', 'closed']);

  function hasActiveTo(v) {
    if (!v || !v.to_status || v.to_status === 'no_to') return false;
    return !TERMINAL_TO_STATUSES.has(String(v.to_status));
  }

  function vehicleToStatusKey(v) {
    if (!hasActiveTo(v)) return '';
    return String(v.to_status);
  }

  function vehicleOperationalStatusKey(v) {
    if (v && v.operational_status) {
      return String(v.operational_status);
    }
    return 'no_active_to';
  }

  function isVehicleStatusUiVisible(v) {
    return !VEHICLE_STATUS_UI_HIDDEN.has(vehicleOperationalStatusKey(v));
  }

  function operationalStatusLabel(v) {
    if (!isVehicleStatusUiVisible(v)) return '';
    if (v.operational_status_label) return v.operational_status_label;
    if (v.operational_status) return String(v.operational_status).replace(/_/g, ' ');
    return '—';
  }

  function toStatusLabel(v) {
    if (!hasActiveTo(v)) return '';
    if (v.to_status_label) return v.to_status_label;
    if (v.to_status) return v.to_status;
    return '';
  }

  function formatListTimeCompact(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    let h = d.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return pad(d.getDate()) + '-' + pad(d.getMonth() + 1) + '-' + d.getFullYear()
      + ' · ' + pad(h) + ':' + pad(d.getMinutes()) + ' ' + ampm;
  }

  function listRowTimeLabel(v) {
    const when = v.last_update_at || v.received_at || v.recorded_at;
    if (when) return formatListTimeCompact(when);
    if (v.connection_status === 'signal_lost' || v.connection_status === 'stale') {
      return CONFIG.i18n.no_recent_signal;
    }
    return '—';
  }

  const VEHICLE_OP_STATUS_HISTORY_TIER = {
    no_active_to: 'no-active-to',
    in_transit: 'in-transit',
    scheduled: 'scheduled',
    under_maintenance: 'under-maintenance',
  };

  const TO_STATUS_PILL_TIER = {
    no_to: 'idle',
    created: 'dispatch',
    under_planning: 'dispatch',
    assigned: 'dispatch',
    ready_for_dispatch: 'dispatch',
    driving_towards_source: 'progress',
    driving_towards_destination: 'progress',
    at_source: 'progress',
    loaded_pickup_completed: 'progress',
    at_destination: 'progress',
    delivered_unloaded: 'progress',
    in_progress: 'progress',
    completed: 'idle',
    closed: 'idle',
    cancelled: 'idle',
  };

  function toStatusTier(statusKey) {
    return TO_STATUS_PILL_TIER[statusKey] || 'dispatch';
  }

  function toStatusPillClass(v) {
    const key = vehicleToStatusKey(v);
    const tier = toStatusTier(key);
    return 'live-gps-to-pill live-gps-to-pill--' + tier;
  }

  function historyToStatusLineHtml(statusKey, label) {
    const tier = toStatusTier(statusKey);
    return '<span class="live-gps-history-status-line live-gps-history-status-line--' + tier + '">'
      + '<span class="live-gps-history-status-line__bullet" aria-hidden="true">•</span>'
      + '<span class="live-gps-history-status-line__text">' + escHtml(label) + '</span>'
      + '</span>';
  }

  function speedChipValue(v) {
    if (v && v.speed != null && v.speed !== '') return String(v.speed);
    if (v && v.speed_kmh != null) return String(Math.round(v.speed_kmh));
    return '—';
  }

  function speedChipDotClass(v) {
    const m = (v && v.movement_status) || 'offline';
    return 'live-gps-obj__speed-dot live-gps-obj__speed-dot--' + m;
  }

  function objectSpeedLineHtml(v) {
    return '<span class="live-gps-obj__speed-line">'
      + '<span class="' + speedChipDotClass(v) + '" aria-hidden="true"></span>'
      + '<span class="live-gps-obj__speed-val">' + escHtml(speedChipValue(v)) + '</span>'
      + '<span class="live-gps-obj__speed-unit">kph</span>'
      + '</span>';
  }

  function objectTripLineLabel(v) {
    if (!hasActiveTo(v)) return '';
    const toNumber = objectToNumberLabel(v);
    return toNumber || CONFIG.i18n.no_trip_order;
  }

  function shouldShowOperationalOnTripRow(v) {
    if (!isVehicleStatusUiVisible(v) || !hasActiveTo(v)) return false;
    const opKey = vehicleOperationalStatusKey(v);
    // Show vehicle operational badge alongside TO status when assigned (scheduled)
    // or executing (in_transit). Backend persists these; primary row shows TO status.
    return opKey === 'scheduled' || opKey === 'in_transit';
  }

  function objectTripRowOperationalHtml(v) {
    if (!shouldShowOperationalOnTripRow(v)) return '';
    const label = operationalStatusLabel(v);
    if (!label) return '';
    const cls = 'live-gps-op-status live-gps-obj__trip-op-status '
      + toStatusClass(vehicleOperationalStatusKey(v));
    return '<span class="' + cls + '" title="' + escHtml(label) + '">' + escHtml(label) + '</span>';
  }

  function objectPrimaryStatusHtml(v) {
    const toStatusText = toStatusLabel(v);
    if (toStatusText) {
      const pillClass = toStatusPillClass(v) + ' live-gps-obj__primary-status';
      return '<span class="' + pillClass + '" title="' + escHtml(toStatusText) + '">'
        + escHtml(toStatusText) + '</span>';
    }
    if (shouldShowOperationalOnTripRow(v)) return '';
    const vehicleLabel = operationalStatusLabel(v);
    if (!vehicleLabel) return '';
    const vehicleStatusClass = 'live-gps-op-status live-gps-obj__primary-status live-gps-obj__vehicle-status '
      + toStatusClass(vehicleOperationalStatusKey(v));
    return '<span class="' + vehicleStatusClass + '" title="' + escHtml(vehicleLabel) + '">'
      + escHtml(vehicleLabel) + '</span>';
  }

  function tripStatusLabel(v) {
    if (v.trip_status_label) return v.trip_status_label;
    if (v.trip_status) return v.trip_status;
    return CONFIG.i18n.no_trip;
  }

  function popupToStatusLabel(v) {
    const label = toStatusLabel(v);
    if (label) return label;
    if (v.to_status_label) return v.to_status_label;
    return CONFIG.i18n.no_active_to;
  }

  function popupToNumberHtml(v) {
    const toNumber = objectToNumberLabel(v) || (v.to_number ? String(v.to_number).trim() : '');
    const toUrl = adminTransportOrderUrl(v.transport_order_id);
    if (toNumber && toUrl) {
      return '<a href="' + escHtml(toUrl) + '" class="live-gps-popup__position-link">'
        + escHtml(toNumber) + '</a>';
    }
    if (toNumber) return escHtml(toNumber);
    return escHtml(CONFIG.i18n.no_active_to);
  }

  function tripReferenceLabel(v) {
    if (v.trip_number && v.to_number) return v.trip_number + ' · ' + v.to_number;
    if (v.trip_number) return v.trip_number;
    return CONFIG.i18n.no_trip;
  }

  /**
   * A vehicle is "in-flight" when it is still running a trip: it has a trackable
   * trip, or its transport order is in an in-progress (driving/at-site) status.
   */
  function isInFlightVehicle(v) {
    if (!v) return false;
    if (v.trip_id) return true;
    return TO_STATUS_PILL_TIER[v.to_status] === 'progress';
  }

  function vehiclesForList() {
    let list = vehiclesMatchingSearch(vehicles);
    if (toStatusFilter) list = toStatusFilter.applyMatching(list);
    if (vehicleStatusFilter) list = vehicleStatusFilter.applyMatching(list);
    // Hide default-hidden statuses (e.g. inactive) unless the user has explicitly
    // selected them in the vehicle-status filter, OR the vehicle is still in-flight
    // (a vehicle deactivated mid-trip stays visible until its trip ends).
    list = list.filter(function(v) {
      const key = vehicleOperationalStatusKey(v);
      if (!VEHICLE_STATUS_HIDDEN_BY_DEFAULT.has(key)) return true;
      if (vehicleStatusFilter && vehicleStatusFilter.explicitlyIncludes(key)) return true;
      return isInFlightVehicle(v);
    });
    return list;
  }

  function vehiclesForMap() {
    let list = vehiclesForList().filter(hasMapPosition);
    if (isHistoryDetailFocusActive()) {
      const focus = String(historyFocusVehicleId);
      list = list.filter((v) => vehicleKey(v) === focus);
    }
    return list;
  }

  function isHistoryDetailFocusActive() {
    return !!(
      historyFocusVehicleId
      && historyPoints.length
      && (historyView === 'to_detail' || historyView === 'idle_detail')
    );
  }

  function historyPlaybackVehicle() {
    if (historyFocusVehicleId) {
      const byId = findVehicle(historyFocusVehicleId);
      if (byId) return byId;
    }
    if (historyTripId) return findVehicleByTripId(historyTripId);
    return null;
  }

  function historyPlaybackMarkerKey() {
    const hv = historyPlaybackVehicle();
    if (hv) return vehicleKey(hv);
    return historyFocusVehicleId ? String(historyFocusVehicleId) : null;
  }

  const POPUP_OPTIONS = {
    className: 'live-gps-popup-wrap',
    maxWidth: 400,
    minWidth: 300,
    offset: [0, 0],
    autoPan: true,
    closeButton: false,
  };

  const FOLLOW_POPUP_OFFSET_Y = -(FOLLOW_TRUCK_H / 2 + POPUP_TIP_GAP);

  const FOLLOW_POPUP_OPTIONS = {
    className: 'live-gps-popup-wrap',
    maxWidth: 300,
    minWidth: 260,
    offset: [0, 0],
    autoPan: true,
    closeButton: false,
  };

  /** Visible map area — measure real overlay DOM rects for Leaflet autoPan padding. */
  function mapOverlayPadding() {
    const mapEl = document.getElementById('live-gps-map');
    const pad = { top: 16, right: 56, bottom: 16, left: 16 };
    if (!mapEl) return pad;

    const mapRect = mapEl.getBoundingClientRect();
    const margin = 12;
    const TOP_BANNER_MAX_HEIGHT = 160;

    const toolbar = document.getElementById('live-gps-status');
    if (toolbar) {
      const tr = toolbar.getBoundingClientRect();
      if (tr.bottom > mapRect.top && tr.top < mapRect.bottom) {
        pad.top = Math.max(pad.top, tr.bottom - mapRect.top + margin);
      }
    }

    const objects = document.getElementById('live-gps-objects');
    if (objects && !objects.classList.contains('live-gps-objects--collapsed')
      && !objects.classList.contains('live-gps-objects--view-hidden')) {
      const or = objects.getBoundingClientRect();
      if (or.right > mapRect.left && or.left < mapRect.right) {
        if (or.left < mapRect.left + mapRect.width * 0.55) {
          pad.left = Math.max(pad.left, or.right - mapRect.left + margin);
        }
        if (or.right > mapRect.left + mapRect.width * 0.45) {
          pad.right = Math.max(pad.right, mapRect.right - or.left + margin);
        }
      }
      if (or.bottom > mapRect.top && or.top < mapRect.top + 140) {
        const orHeight = or.bottom - or.top;
        if (orHeight <= TOP_BANNER_MAX_HEIGHT) {
          pad.top = Math.max(pad.top, or.bottom - mapRect.top + margin);
        }
      }
    }

    const dockWrap = document.getElementById('live-gps-dock-wrap');
    if (dockWrap && dockWrap.classList.contains('is-visible')) {
      const dr = dockWrap.getBoundingClientRect();
      if (dr.top < mapRect.bottom && dr.right > mapRect.left) {
        pad.bottom = Math.max(pad.bottom, mapRect.bottom - dr.top + margin);
      }
    }

    const history = document.getElementById('live-gps-history');
    if (history && !history.classList.contains('is-hidden')) {
      const hr = history.getBoundingClientRect();
      if (hr.top < mapRect.bottom) {
        pad.bottom = Math.max(pad.bottom, mapRect.bottom - hr.top + margin);
      }
    }

    const historyModal = document.getElementById('live-gps-history-modal');
    if (historyModal && !historyModal.classList.contains('is-hidden')) {
      const mr = historyModal.getBoundingClientRect();
      if (mr.bottom > mapRect.top && mr.top < mapRect.bottom) {
        if (mr.left < mapRect.left + mapRect.width * 0.55) {
          pad.left = Math.max(pad.left, mr.right - mapRect.left + margin);
        }
        if (mr.right > mapRect.left + mapRect.width * 0.45) {
          pad.right = Math.max(pad.right, mapRect.right - mr.left + margin);
        }
      }
      if (mr.bottom > mapRect.top && mr.top < mapRect.top + 140) {
        const mrHeight = mr.bottom - mr.top;
        if (mrHeight <= TOP_BANNER_MAX_HEIGHT) {
          pad.top = Math.max(pad.top, mr.bottom - mapRect.top + margin);
        }
      }
    }

    return pad;
  }

  function popupMapElement(marker) {
    return marker?._map?.getContainer?.() || null;
  }

  function isFollowMapEl(mapEl) {
    return !!(mapEl && mapEl.classList && mapEl.classList.contains('live-gps-follow__map'));
  }

  function getFollowPanel(tripId) {
    return followPanels[String(tripId)] || null;
  }

  function followMarkerForTrip(tripId) {
    return getFollowPanel(tripId)?.marker || null;
  }

  function markersForTrip(tripId) {
    const id = String(tripId);
    const list = [];
    if (markers[id]) list.push(markers[id]);
    const followMarker = followMarkerForTrip(id);
    if (followMarker) list.push(followMarker);
    return list;
  }

  /** Leaflet autoPan only — padding from real overlays; no custom offset (avoids conflict). */
  function applyVehiclePopupAutoPan(marker) {
    const popup = marker?.getPopup();
    if (!popup) return;
    const mapEl = popupMapElement(marker);
    let padTopLeft;
    let padBottomRight;
    if (isFollowMapEl(mapEl)) {
      padTopLeft = L.point(12, 12);
      padBottomRight = L.point(12, 12);
    } else {
      const pad = mapOverlayPadding();
      padTopLeft = L.point(pad.left, pad.top);
      padBottomRight = L.point(pad.right, pad.bottom);
    }
    popup.options.autoPan = true;
    popup.options.autoPanPaddingTopLeft = padTopLeft;
    popup.options.autoPanPaddingBottomRight = padBottomRight;
  }

  /**
   * History popups (overspeed arrows, event markers) are ~280px tall
   * (title + rows + scrollable body), so most of the map's vertical space
   * doesn't have room above a marker to fit one without panning. Panning
   * on every passive hover feels like the map is constantly jumping, so
   * autoPan is only enabled for a deliberate click/focus (`enabled=true`);
   * hover just opens in place, same overlay-aware padding as vehicle
   * popups when it is enabled. Recomputed right before each open since
   * panel visibility can change between opens.
   */
  function setHistoryPopupAutoPan(marker, enabled) {
    const popup = marker?.getPopup();
    if (!popup) return;
    if (!enabled) {
      popup.options.autoPan = false;
      return;
    }
    const pad = mapOverlayPadding();
    popup.options.autoPan = true;
    popup.options.autoPanPaddingTopLeft = L.point(pad.left, pad.top);
    popup.options.autoPanPaddingBottomRight = L.point(pad.right, pad.bottom);
  }

  /** Resize / taller content — refresh padding then one Leaflet adjustPan. */
  function refitVehiclePopup(marker, options) {
    if (!marker?._liveGpsVehicleId || !marker.isPopupOpen()) return;
    const force = !!(options && options.force);
    if (!force && performance.now() - vehiclePopupOpenedAt < 380) return;
    applyVehiclePopupAutoPan(marker);
    const popup = marker.getPopup();
    if (!popup) return;
    if (typeof popup._updatePosition === 'function') popup._updatePosition();
    if (typeof popup._adjustPan === 'function') popup._adjustPan();
  }

  function resetPopupViewportScroll(marker) {
    const viewport = marker?.getPopup()?.getElement()?.querySelector('.live-gps-popup__viewport');
    if (viewport) viewport.scrollTop = 0;
  }

  function updatePopupFields(box, v) {
    if (!box || !v) return;
    const when = v.last_update_at || v.received_at || v.recorded_at;
    const setField = (name, text) => {
      const el = box.querySelector('[data-field="' + name + '"]');
      if (el) el.textContent = text;
    };
    setField('time', formatListTime(when));
    setField('stop', dash(v.stop_duration_label));
    const angle = resolveMarkerHeading(v);
    setField('angle', angle != null ? Math.round(angle) + '°' : '—');
    setField('source', formatPoiLabel(v.origin_poi));
    setField('destination', formatPoiLabel(v.destination_poi));
    setField('to_status', popupToStatusLabel(v));
    const toNumberEl = box.querySelector('[data-field="to_number"]');
    if (toNumberEl) toNumberEl.innerHTML = popupToNumberHtml(v);
    setField('geofence', insidePoisLabel(v));
    const addrEl = box.querySelector('[data-field="address"]');
    if (addrEl) addrEl.textContent = resolveAddressText(v);
  }

  function closePopupOnMarker(marker) {
    if (!marker) return;
    resetPopupViewportScroll(marker);
    if (marker.isPopupOpen()) marker.closePopup();
  }

  function closeAnyVehiclePopup() {
    if (!openPopupVehicleId) return;
    markersForTrip(openPopupVehicleId).forEach(closePopupOnMarker);
    openPopupVehicleId = null;
    openPopupSurface = null;
  }

  function closePopupOnOtherSurface(tripId, activeSurface) {
    const id = String(tripId);
    if (activeSurface === 'follow') {
      const main = markers[id];
      if (main) closePopupOnMarker(main);
      return;
    }
    const followMarker = followMarkerForTrip(id);
    if (followMarker) closePopupOnMarker(followMarker);
  }

  function activePopupMarker(tripId) {
    const id = String(tripId);
    if (openPopupSurface === 'follow') {
      const followMarker = followMarkerForTrip(id);
      if (followMarker) return followMarker;
    }
    return markers[id] || null;
  }

  function openPopupOnMarker(marker, v) {
    if (!marker || !v) return;
    ensureMarkerPopup(marker);
    applyVehiclePopupAutoPan(marker);
    if (marker.isPopupOpen()) {
      patchOpenPopup(marker, v);
    } else {
      setMarkerPopupContent(marker, v);
      marker.openPopup();
      vehiclePopupOpenedAt = performance.now();
    }
  }

  function syncOpenPopupsForTrip(tripId) {
    const v = findVehicle(tripId);
    const marker = activePopupMarker(tripId);
    if (v && marker && marker.isPopupOpen()) patchOpenPopup(marker, v);
  }



  function movementDotClass(v) {
    const m = v.movement_status || 'offline';
    return 'live-gps-obj__dot--' + m;
  }

  function markerStatusClass(v) {
    const m = v.movement_status || 'offline';
    return 'live-gps-marker__truck-wrap--' + m;
  }

  /** GPS heading 0° = north; truck PNG faces left until offset applied. */
  function truckRotation(heading) {
    const h = heading == null || heading === '' ? 0 : Number(heading);
    return (h + TRUCK_HEADING_OFFSET) % 360;
  }



  function headingFromTrail(trail) {
    if (!trail || trail.length < 2) return null;
    const a = trail[trail.length - 2];
    const b = trail[trail.length - 1];
    return bearingDegrees(a[0], a[1], b[0], b[1]);
  }

  /** Prefer direction of recent movement over raw GT06 course (often wrong above 255°). */
  function resolveMarkerHeading(v) {
    const fromTrail = headingFromTrail(v.trail);
    if (fromTrail != null) {
      lastHeadingByTrip[vehicleKey(v)] = fromTrail;
      lastPositionByTrip[vehicleKey(v)] = { lat: v.latitude, lng: v.longitude };
      return fromTrail;
    }
    const prev = lastPositionByTrip[vehicleKey(v)];
    if (prev) {
      const moved = Math.abs(prev.lat - v.latitude) > 1e-6 || Math.abs(prev.lng - v.longitude) > 1e-6;
      if (moved) {
        const h = bearingDegrees(prev.lat, prev.lng, v.latitude, v.longitude);
        if (h != null) {
          lastHeadingByTrip[vehicleKey(v)] = h;
          lastPositionByTrip[vehicleKey(v)] = { lat: v.latitude, lng: v.longitude };
          return h;
        }
      }
    }
    lastPositionByTrip[vehicleKey(v)] = { lat: v.latitude, lng: v.longitude };
    if (lastHeadingByTrip[vehicleKey(v)] != null) {
      return lastHeadingByTrip[vehicleKey(v)];
    }
    return v.heading_degrees;
  }



  function connectionHint(v) {
    if (v.connection_status === 'stale') return ' (' + CONFIG.i18n.stale_feed + ')';
    if (v.connection_status === 'signal_lost') return ' (' + CONFIG.i18n.no_signal + ')';
    return '';
  }



  function positionText(v) {
    if (!hasMapPosition(v)) return CONFIG.i18n.no_map_position;
    return v.latitude.toFixed(6) + '°, ' + v.longitude.toFixed(6) + '°';
  }

  function addressCacheKey(v) {
    return vehicleKey(v) + ':' + (hasMapPosition(v) ? v.latitude.toFixed(5) + ':' + v.longitude.toFixed(5) : 'none');
  }

  function isCoordinateAddress(text) {
    return /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(String(text == null ? '' : text).trim());
  }

  function rememberResolvedAddress(v, text) {
    if (!text || isCoordinateAddress(text) || text === CONFIG.i18n.loading_address) return;
    lastAddressByTrip[String(vehicleKey(v))] = text;
  }

  function resolveAddressText(v, opts) {
    const preferLast = !!(opts && opts.preferLastResolved);
    const cached = addressCache[addressCacheKey(v)];
    if (cached) return cached;
    if (preferLast) {
      const last = lastAddressByTrip[String(vehicleKey(v))];
      if (last) return last;
    }
    if (!hasMapPosition(v)) return CONFIG.i18n.no_map_position;
    return v.latitude.toFixed(5) + ', ' + v.longitude.toFixed(5);
  }

  function popupAddressEls(tripId) {
    return document.querySelectorAll(
      '.live-gps-popup[data-vehicle-id="' + tripId + '"] [data-field="address"]'
    );
  }

  function applyAddressToUi(v, text) {
    rememberResolvedAddress(v, text);
    popupAddressEls(vehicleKey(v)).forEach(el => { el.textContent = text; });
    if (selectedVehicleId === vehicleKey(v)) {
      document.getElementById('detail-address').textContent = text;
    }
    const popupMarker = activePopupMarker(vehicleKey(v));
    if (popupMarker && popupMarker.isPopupOpen()) refitVehiclePopup(popupMarker, { force: true });
  }

  function formatPoiLabel(poi) {
    if (!poi) return '—';
    const name = poi.name != null && poi.name !== '' ? String(poi.name) : '';
    const code = poi.poi_code != null && poi.poi_code !== '' ? String(poi.poi_code) : '';
    if (name && code) return name + ' · ' + code;
    return name || code || '—';
  }

  function insidePoisLabel(v) {
    const list = v && v.inside_pois;
    if (!list || !list.length) return CONFIG.i18n.outside_geofence;
    return list.map(function (poi) { return poi.name || poi.poi_code; }).join(', ');
  }

  function dockGeofenceValue(v) {
    const list = v && v.inside_pois;
    if (!list || !list.length) return '';
    const names = list.map(function (poi) { return poi.name || poi.poi_code; }).join(', ');
    return CONFIG.i18n.geofence_inside + ' (' + names + ')';
  }

  function buildPoiOccupancyMap() {
    const occ = new Map();
    vehicles.forEach(function (v) {
      const inside = v.inside_pois || [];
      const isSel = selectedVehicleId && vehicleKey(v) === String(selectedVehicleId);
      inside.forEach(function (poi) {
        const id = String(poi.id);
        const cur = occ.get(id) || { count: 0, selected: false };
        cur.count += 1;
        if (isSel) cur.selected = true;
        occ.set(id, cur);
      });
    });
    return occ;
  }

  function poiGeofenceCircleStyle(poiId, occupancy) {
    const occ = occupancy.get(String(poiId));
    if (!occ) {
      return { color: '#0a84ff', fillColor: '#0a84ff', fillOpacity: 0.1, weight: 1.5 };
    }
    if (occ.selected) {
      return { color: '#15803d', fillColor: '#22c55e', fillOpacity: 0.28, weight: 3 };
    }
    return { color: '#16a34a', fillColor: '#16a34a', fillOpacity: 0.18, weight: 2 };
  }

  function buildPopupHtml(v) {
    const when = v.last_update_at || v.received_at || v.recorded_at;
    const addrKey = addressCacheKey(v);
    const angle = resolveMarkerHeading(v);
    const angleText = angle != null ? Math.round(angle) + '°' : '—';
    return '<div class="live-gps-popup" data-vehicle-id="' + vehicleKey(v) + '" data-addr-key="' + addrKey + '">'
      + '<div class="live-gps-popup__head">'
      + '<div class="live-gps-popup__title">'
      + '<span class="live-gps-popup__nav-icon">' + liveGpsIcon('box-arrow-up-right', 'sm') + '</span>'
      + '<span>' + v.registration_number + '</span>'
      + '</div>'
      + '<div class="live-gps-popup__actions">'
      + '<span class="live-gps-popup__tab live-gps-popup__tab--active" title="' + escHtml(CONFIG.i18n.details) + '">' + liveGpsIcon('list-ul', 'sm') + '</span>'
      + '<button type="button" class="live-gps-popup__close" data-action="close" aria-label="' + escHtml(CONFIG.i18n.close) + '">' + liveGpsIcon('x-lg', 'sm') + '</button>'
      + '</div></div>'
      + '<div class="live-gps-popup__viewport">'
      + '<div class="live-gps-popup__body">'
      + '<div class="live-gps-popup__row"><strong>' + CONFIG.i18n.address + '</strong>'
      + '<div class="live-gps-popup__address-wrap">'
      + '<span data-field="address">' + resolveAddressText(v) + '</span>'
      + '<button type="button" class="live-gps-popup__eye" data-action="maps" title="' + escHtml(CONFIG.i18n.open_in_maps) + '">' + liveGpsIcon('eye-fill', 'sm') + '</button>'
      + '</div></div>'
      + '<div class="live-gps-popup__row"><strong>' + CONFIG.i18n.time + '</strong><span data-field="time">' + formatListTime(when) + '</span></div>'
      + '<div class="live-gps-popup__row"><strong>' + CONFIG.i18n.stop_duration + '</strong><span data-field="stop">' + dash(v.stop_duration_label) + '</span></div>'
      + '<div class="live-gps-popup__row"><strong>' + CONFIG.i18n.geofence + '</strong><span data-field="geofence">' + escHtml(insidePoisLabel(v)) + '</span></div>'
      + '<div class="live-gps-popup__row"><strong>' + CONFIG.i18n.position + '</strong>'
      + '<a href="#" class="live-gps-popup__position-link" data-action="position">' + positionText(v) + '</a></div>'
      + '<div class="live-gps-popup__row"><strong>' + CONFIG.i18n.angle + '</strong><span data-field="angle">' + angleText + '</span></div>'
      + '<div class="live-gps-popup__row"><strong>' + CONFIG.i18n.driver + '</strong><span>' + dash(v.driver_name) + '</span></div>'
      + '<div class="live-gps-popup__row"><strong>' + CONFIG.i18n.to_status + '</strong><span data-field="to_status">' + escHtml(popupToStatusLabel(v)) + '</span></div>'
      + '<div class="live-gps-popup__row"><strong>' + CONFIG.i18n.to_number + '</strong><span data-field="to_number">' + popupToNumberHtml(v) + '</span></div>'
      + '<div class="live-gps-popup__row"><strong>' + CONFIG.i18n.source + '</strong><span data-field="source">' + escHtml(formatPoiLabel(v.origin_poi)) + '</span></div>'
      + '<div class="live-gps-popup__row"><strong>' + CONFIG.i18n.destination + '</strong><span data-field="destination">' + escHtml(formatPoiLabel(v.destination_poi)) + '</span></div>'
      + '<div class="live-gps-popup__row"><strong>' + CONFIG.i18n.model + '</strong><span>' + dash(v.vehicle_model) + '</span></div>'
      + '<div class="live-gps-popup__row"><strong>' + CONFIG.i18n.plate + '</strong><span>' + dash(v.vehicle_plate) + '</span></div>'
      + '<div class="live-gps-popup__row"><strong>' + CONFIG.i18n.protocol + '</strong><span>' + dash(v.protocol) + '</span></div>'
      + '</div></div></div>';
  }

  function fetchReverseAddress(v) {
    if (!hasMapPosition(v)) return;
    const key = addressCacheKey(v);
    if (addressCache[key] || addressPending[key]) {
      if (addressCache[key]) applyAddressToUi(v, addressCache[key]);
      return;
    }
    addressPending[key] = true;
    if (!addressCache[key]) {
      popupAddressEls(vehicleKey(v)).forEach(el => {
        el.textContent = CONFIG.i18n.loading_address;
      });
    }
    const url = 'https://nominatim.openstreetmap.org/reverse?format=json&lat='
      + v.latitude + '&lon=' + v.longitude + '&zoom=16&addressdetails=1';
    fetch(url, {
      headers: {
        'Accept-Language': 'en',
        'Accept': 'application/json',
      },
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        delete addressPending[key];
        if (!data.display_name) return;
        addressCache[key] = data.display_name;
        applyAddressToUi(v, data.display_name);
      })
      .catch(() => {
        delete addressPending[key];
        applyAddressToUi(v, resolveAddressText(v));
      });
  }

  /** Same reverse-geocoding cache as the vehicle popup, keyed by lat/lng — History popups have no vehicle id. */
  function historyAddressCacheKey(lat, lng) {
    return 'hist:' + Number(lat).toFixed(5) + ':' + Number(lng).toFixed(5);
  }

  function resolveHistoryAddressText(lat, lng) {
    const cached = addressCache[historyAddressCacheKey(lat, lng)];
    if (cached) return cached;
    return Number(lat).toFixed(5) + ', ' + Number(lng).toFixed(5);
  }

  function historyPopupAddressEls(addrKey) {
    return document.querySelectorAll(
      '.live-gps-popup--history[data-addr-key="' + addrKey + '"] [data-field="address"]'
    );
  }

  function fetchHistoryReverseAddress(lat, lng) {
    if (lat == null || lng == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return;
    const key = historyAddressCacheKey(lat, lng);
    if (addressCache[key] || addressPending[key]) {
      if (addressCache[key]) historyPopupAddressEls(key).forEach(el => { el.textContent = addressCache[key]; });
      return;
    }
    addressPending[key] = true;
    historyPopupAddressEls(key).forEach(el => {
      el.textContent = CONFIG.i18n.loading_address;
    });
    const url = 'https://nominatim.openstreetmap.org/reverse?format=json&lat='
      + lat + '&lon=' + lng + '&zoom=16&addressdetails=1';
    fetch(url, {
      headers: {
        'Accept-Language': 'en',
        'Accept': 'application/json',
      },
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        delete addressPending[key];
        if (!data.display_name) return;
        addressCache[key] = data.display_name;
        historyPopupAddressEls(key).forEach(el => { el.textContent = data.display_name; });
      })
      .catch(() => {
        delete addressPending[key];
        historyPopupAddressEls(key).forEach(el => { el.textContent = resolveHistoryAddressText(lat, lng); });
      });
  }

  /** Capture-phase delegation — works even when Leaflet blocks bubbling on the popup. */
  function initPopupActionDelegation() {
    document.addEventListener('click', (e) => {
      const target = e.target instanceof Element ? e.target : e.target?.parentElement;
      if (!target) return;

      const closeBtn = target.closest('.live-gps-popup__close[data-action="close"]');
      if (closeBtn) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const box = closeBtn.closest('.live-gps-popup');
        const tripId = box && box.dataset.vehicleId;
        const id = tripId ? String(tripId) : null;
        openPopupVehicleId = null;
        openPopupSurface = null;
        if (id) {
          markersForTrip(id).forEach(closePopupOnMarker);
        } else if (map) {
          map.closePopup();
        }
        Object.values(followPanels).forEach((state) => {
          if (state.map) state.map.closePopup();
        });
        return;
      }

      const linkBtn = target.closest('.live-gps-popup [data-action="maps"], .live-gps-popup [data-action="position"]');
      if (linkBtn) {
        e.preventDefault();
        e.stopPropagation();
        const box = linkBtn.closest('.live-gps-popup');
        const tripId = box && box.dataset.vehicleId;
        const v = tripId && findVehicle(tripId);
        if (v) {
          window.open('https://www.google.com/maps?q=' + v.latitude + ',' + v.longitude, '_blank');
        } else if (box && box.dataset.lat && box.dataset.lng) {
          window.open('https://www.google.com/maps?q=' + box.dataset.lat + ',' + box.dataset.lng, '_blank');
        }
      }
    }, true);
  }

  /** Block map from receiving popup clicks (close popup / steal focus). */
  function bindPopupInteractions(marker) {
    const popup = marker.getPopup();
    const el = popup?.getElement();
    if (!el) return;
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
    const content = el.querySelector('.leaflet-popup-content');
    if (content) {
      L.DomEvent.disableClickPropagation(content);
      L.DomEvent.disableScrollPropagation(content);
    }
    const box = el.querySelector('.live-gps-popup');
    if (box) {
      L.DomEvent.disableClickPropagation(box);
      L.DomEvent.disableScrollPropagation(box);
    }
    const viewport = el.querySelector('.live-gps-popup__viewport');
    if (viewport) {
      L.DomEvent.disableClickPropagation(viewport);
    }
  }

  function ensureMarkerPopup(marker, options) {
    const opts = options || marker._liveGpsPopupOptions || POPUP_OPTIONS;
    if (marker._liveGpsPopupBound) return;
    marker._liveGpsPopupOptions = opts;
    marker.bindPopup('', opts);
    marker.on('popupopen', () => {
      bindPopupInteractions(marker);
      const v = findVehicle(marker._liveGpsVehicleId);
      if (v) fetchReverseAddress(v);
    });
    marker.on('popupclose', () => {
      const id = marker._liveGpsVehicleId ? String(marker._liveGpsVehicleId) : null;
      if (!id || openPopupVehicleId !== id) return;
      const isFollow = Object.values(followPanels).some((state) => state.marker === marker);
      if (openPopupSurface === 'follow' && isFollow) {
        openPopupVehicleId = null;
        openPopupSurface = null;
        return;
      }
      if (openPopupSurface === 'main' && !isFollow) {
        openPopupVehicleId = null;
        openPopupSurface = null;
      }
    });
    marker._liveGpsPopupBound = true;
  }

  function setMarkerPopupContent(marker, v) {
    marker.setPopupContent(buildPopupHtml(v));
    setTimeout(() => bindPopupInteractions(marker), 0);
  }

  function patchOpenPopup(marker, v) {
    if (!marker.isPopupOpen()) return;
    const el = marker.getPopup()?.getElement();
    const box = el?.querySelector('.live-gps-popup');
    if (box && box.dataset.vehicleId === vehicleKey(v)) {
      updatePopupFields(box, v);
    } else {
      setMarkerPopupContent(marker, v);
    }
    fetchReverseAddress(v);
  }

  function effectiveClusterRadiusPx() {
    if (!map) return CLUSTER_RADIUS_PX;
    const z = map.getZoom();
    if (z >= CLUSTER_ZOOM_FULL_SPLIT) return 0;
    if (z <= CLUSTER_ZOOM_SHRINK_START) return CLUSTER_RADIUS_PX;
    const t = (z - CLUSTER_ZOOM_SHRINK_START) / (CLUSTER_ZOOM_FULL_SPLIT - CLUSTER_ZOOM_SHRINK_START);
    return Math.max(0, CLUSTER_RADIUS_PX * (1 - t));
  }

  function findVehicle(vehicleId) {
    const id = String(vehicleId);
    return vehicles.find(x => vehicleKey(x) === id);
  }

  function findVehicleByTripId(tripId) {
    const id = String(tripId);
    return vehicles.find(v => v.trip_id && String(v.trip_id) === id);
  }

  function isVehicleMarkerOnMap(tripId) {
    const m = markers[String(tripId)];
    return !!(m && map && map.hasLayer(m));
  }

  /** Fleet list: fly to vehicle. Marker popup: keep vehicle on screen, only pan if clipped. */
  function ensureMapViewForVehiclePopup(v, done) {
    if (!v || !map || !hasMapPosition(v)) {
      if (done) done();
      return;
    }
    mapViewLocked = true;
    const latlng = [v.latitude, v.longitude];
    const targetZoom = Math.max(map.getZoom(), VEHICLE_ZOOM);
    const needsZoom = map.getZoom() < VEHICLE_ZOOM;
    suppressMarkerLayout = true;
    const finish = () => {
      suppressMarkerLayout = false;
      map.invalidateSize({ animate: false });
      if (done) done();
    };
    if (needsZoom) {
      map.flyTo(latlng, targetZoom, { animate: true, duration: 0.28, easeLinearity: 0.35 });
    } else {
      map.panTo(latlng, { animate: true, duration: 0.22, easeLinearity: 0.35 });
    }
    map.once('moveend', finish);
  }

  function focusVehicleFromList(tripId, done) {
    const v = findVehicle(tripId);
    if (!v || !map) {
      if (done) done();
      return;
    }
    ensureMapViewForVehiclePopup(v, () => {
      syncMapMarkers();
      if (done) done();
    });
  }

  function openVehiclePopup(vehicleId, opts) {
    const options = opts || {};
    const surface = options.surface === 'follow' ? 'follow' : 'main';
    const id = String(vehicleId);
    const v = findVehicle(id);
    if (!v || !hasMapPosition(v)) return;

    if (openPopupVehicleId && openPopupVehicleId !== id) {
      closeAnyVehiclePopup();
    } else {
      closePopupOnOtherSurface(id, surface);
    }

    openPopupVehicleId = id;
    openPopupSurface = surface;

    if (surface === 'main' && map) {
      syncMapMarkers();
      const marker = markers[id];
      if (marker && map.hasLayer(marker)) {
        openPopupOnMarker(marker, v);
      }
    } else if (surface === 'follow') {
      const followState = getFollowPanel(id);
      if (followState?.marker) openPopupOnMarker(followState.marker, v);
    }
    fetchReverseAddress(v);
  }

  function selectVehicleFromList(tripId) {
    const id = String(tripId);
    closeAnyVehiclePopup();
    selectedVehicleId = id;
    renderList();
    renderDetail();
    focusVehicleFromList(id);
  }

  function markerIcon(v) {
    const label = v.registration_number + ' (' + speedText(v) + ')';
    const statusCls = markerStatusClass(v);
    const rot = truckRotation(resolveMarkerHeading(v));
    return L.divIcon({
      className: 'live-gps-marker',
      html: '<div class="live-gps-marker__pin">'
        + '<div class="' + statusCls + '">'
        + '<img class="live-gps-marker__truck" src="' + TRUCK_MARKER_URL + '" alt=""'
        + ' width="' + TRUCK_W + '" height="' + TRUCK_H + '"'
        + ' style="transform:rotate(' + rot + 'deg)" />'
        + '</div>'
        + '<div class="live-gps-marker__label">' + label + '</div>'
        + '</div>',
      iconSize: [168, TRUCK_H + LABEL_H + 8],
      iconAnchor: [84, TRUCK_H / 2],
      popupAnchor: [0, POPUP_OFFSET_Y],
    });
  }

  function clusterIcon(count) {
    return L.divIcon({
      className: 'live-gps-cluster-icon',
      html: '<div class="live-gps-cluster" role="img" aria-label="' + count + ' vehicles">'
        + '<span class="live-gps-cluster__ring live-gps-cluster__ring--1"></span>'
        + '<span class="live-gps-cluster__ring live-gps-cluster__ring--2"></span>'
        + '<span class="live-gps-cluster__ring live-gps-cluster__ring--3"></span>'
        + '<span class="live-gps-cluster__core">' + count + '</span>'
        + '</div>',
      iconSize: [CLUSTER_ICON_SIZE, CLUSTER_ICON_SIZE],
      iconAnchor: [CLUSTER_ICON_SIZE / 2, CLUSTER_ICON_SIZE / 2],
    });
  }

  function clusterGroupKey(group) {
    return group.map(vehicleKey).sort().join('|');
  }

  function colocatedVehiclePeers(v) {
    const latKey = Number(v.latitude).toFixed(5);
    const lngKey = Number(v.longitude).toFixed(5);
    return vehiclesForMap().filter(x =>
      Number(x.latitude).toFixed(5) === latKey &&
      Number(x.longitude).toFixed(5) === lngKey
    );
  }

  /** Spread markers that share identical GPS so clusters can split and popups stay reachable. */
  function markerDisplayLatLng(v) {
    const peers = colocatedVehiclePeers(v);
    if (!map || peers.length <= 1) return [v.latitude, v.longitude];
    const sorted = peers.slice().sort((a, b) => vehicleKey(a).localeCompare(vehicleKey(b)));
    const idx = sorted.findIndex(x => vehicleKey(x) === vehicleKey(v));
    const ring = Math.floor(idx / 8);
    const pos = idx % 8;
    const baseRadius = 28 + ring * 22;
    const angle = (pos / 8) * Math.PI * 2 - Math.PI / 2;
    const pt = map.latLngToContainerPoint([v.latitude, v.longitude]);
    const disp = map.containerPointToLatLng([
      pt.x + Math.cos(angle) * baseRadius,
      pt.y + Math.sin(angle) * baseRadius,
    ]);
    return [disp.lat, disp.lng];
  }

  function clusterUnionFind(list) {
    const n = list.length;
    const parent = Array.from({ length: n }, (_, i) => i);

    function find(i) {
      let p = i;
      while (parent[p] !== p) p = parent[p];
      return p;
    }

    function union(a, b) {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    }

    const points = list.map(v => map.latLngToContainerPoint(markerDisplayLatLng(v)));
    const r = effectiveClusterRadiusPx();
    const r2 = r * r;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = points[i].x - points[j].x;
        const dy = points[i].y - points[j].y;
        if (dx * dx + dy * dy <= r2) union(i, j);
      }
    }

    const buckets = new Map();
    list.forEach((v, i) => {
      const root = find(i);
      if (!buckets.has(root)) buckets.set(root, []);
      buckets.get(root).push(v);
    });
    return Array.from(buckets.values());
  }

  function buildVehicleClusters(list) {
    if (!map || !list.length) return [];
    if (effectiveClusterRadiusPx() <= 0) {
      return list.map(v => [v]);
    }
    return clusterUnionFind(list);
  }

  function clusterCentroid(group) {
    const lat = group.reduce((s, v) => s + v.latitude, 0) / group.length;
    const lng = group.reduce((s, v) => s + v.longitude, 0) / group.length;
    return [lat, lng];
  }

  function zoomToVehicleGroup(group) {
    if (!map || !group.length) return;
    mapViewLocked = true;
    if (group.length === 1) {
      const v = group[0];
      selectedVehicleId = vehicleKey(v);
      renderList();
      renderDetail();
      map.setView([v.latitude, v.longitude], VEHICLE_ZOOM, { animate: true });
      map.once('moveend', () => syncMapMarkers());
      return;
    }
    const bounds = L.latLngBounds(group.map(v => [v.latitude, v.longitude]));
    map.fitBounds(bounds.pad(0.35), {
      animate: true,
      maxZoom: VEHICLE_ZOOM,
    });
    map.once('moveend', () => syncMapMarkers());
  }

  function hideVehicleMarker(tripId) {
    const id = String(tripId);
    const m = markers[id];
    if (!m || !map) return;
    if (m.isPopupOpen()) {
      m.closePopup();
      if (openPopupVehicleId === id && openPopupSurface === 'main') {
        openPopupVehicleId = null;
        openPopupSurface = null;
      }
    }
    if (map.hasLayer(m)) map.removeLayer(m);
  }

  function attachVehicleMarkerHandlers(marker, v) {
    marker._liveGpsVehicleId = vehicleKey(v);
    ensureMarkerPopup(marker, POPUP_OPTIONS);
    marker.off('click');
    marker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      const id = vehicleKey(v);
      selectedVehicleId = id;
      renderList();
      renderDetail();
      if (openPopupVehicleId === id && openPopupSurface === 'main') {
        closeAnyVehiclePopup();
        return;
      }
      openVehiclePopup(id, { surface: 'main' });
    });
  }

  function attachFollowMarkerHandlers(marker, v) {
    marker._liveGpsVehicleId = vehicleKey(v);
    ensureMarkerPopup(marker, FOLLOW_POPUP_OPTIONS);
    marker.off('click');
    marker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      const id = vehicleKey(v);
      selectedVehicleId = id;
      renderList();
      renderDetail();
      openVehiclePopup(id, { surface: 'follow' });
    });
  }

  /**
   * Pen effect: the truck drives first and the trail is painted behind it.
   * trailRoutes holds each vehicle's latest trail from the API (it ends at the
   * newest GPS point); the polyline only shows the part the marker has already
   * driven, so the line never runs ahead of the truck.
   */
  const trailRoutes = {};
  /** Latest planned route per vehicle; it starts at the newest GPS point. */
  const plannedAhead = {};
  /** Marker further than this from its trail is treated as off the road. */
  const TRAIL_SNAP_M = 60;

  function routeWithDistances(trail) {
    const pts = trail.map(p => L.latLng(p[0], p[1]));
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i - 1].distanceTo(pts[i]));
    return { pts, cum, len: cum[cum.length - 1] };
  }

  /** Distance (m) along the route of the point nearest to latlng, and how far latlng is from the route. */
  function projectOnRoute(route, latlng) {
    let best = { s: 0, off: Infinity };
    for (let i = 1; i < route.pts.length; i++) {
      const a = route.pts[i - 1];
      const b = route.pts[i];
      const kx = 111320 * Math.cos(a.lat * Math.PI / 180);
      const ky = 110540;
      const bx = (b.lng - a.lng) * kx;
      const by = (b.lat - a.lat) * ky;
      const px = (latlng.lng - a.lng) * kx;
      const py = (latlng.lat - a.lat) * ky;
      const len2 = bx * bx + by * by;
      const t = len2 ? Math.max(0, Math.min(1, (px * bx + py * by) / len2)) : 0;
      const off = Math.hypot(px - bx * t, py - by * t);
      if (off < best.off) best = { s: route.cum[i - 1] + (route.cum[i] - route.cum[i - 1]) * t, off };
    }
    return best;
  }

  /** Position s metres along the route, and the index of the last route point behind it. */
  function pointOnRoute(route, s) {
    const d = Math.max(0, Math.min(route.len, s));
    let i = 0;
    while (i < route.cum.length - 2 && route.cum[i + 1] <= d) i++;
    const seg = route.cum[i + 1] - route.cum[i];
    const t = seg ? (d - route.cum[i]) / seg : 0;
    const a = route.pts[i];
    const b = route.pts[Math.min(i + 1, route.pts.length - 1)];
    return { pos: L.latLng(a.lat + (b.lat - a.lat) * t, a.lng + (b.lng - a.lng) * t), i };
  }

  /** Draw the trail up to s metres along the route (ending exactly at pos); the planned route picks up from there. */
  function drawTrailTo(tripId, s, pos) {
    const line = trails[tripId];
    const route = trailRoutes[tripId];
    if (!line || !route) return;
    const at = pointOnRoute(route, s);
    const tip = pos ? L.latLng(pos) : at.pos;
    line.setLatLngs(route.pts.slice(0, at.i + 1).concat([tip]));
    const plan = plannedRoutes[tripId];
    const ahead = plannedAhead[tripId];
    if (plan && ahead && ahead.length > 1) {
      plan.setLatLngs([tip].concat(route.pts.slice(at.i + 1), ahead.slice(1).map(p => L.latLng(p))));
    }
  }

  /** Cut the trail at the marker's position so nothing is drawn ahead of it. */
  function syncTrailTipToMarker(tripId, latlng) {
    const line = trails[tripId];
    if (!line) return;
    const route = trailRoutes[tripId];
    const cur = L.latLng(latlng);
    if (route && route.pts.length > 1) {
      const proj = projectOnRoute(route, cur);
      if (proj.off < TRAIL_SNAP_M) {
        drawTrailTo(tripId, proj.s, cur);
        return;
      }
    }
    const pts = line.getLatLngs();
    if (!pts || pts.length < 2) return;
    pts[pts.length - 1] = cur;
    line.setLatLngs(pts);
  }

  function glideMarkerTo(marker, latlng, ms) {
    if (!marker || !map) return;
    const tripId = marker._liveGpsVehicleId;
    const key = tripId != null ? String(tripId) : null;
    if (key && markerGlides[key]) cancelAnimationFrame(markerGlides[key]);
    const from = marker.getLatLng();
    const to = L.latLng(latlng);
    if (from.distanceTo(to) < 0.5) {
      marker.setLatLng(to);
      if (key) syncTrailTipToMarker(key, to);
      return;
    }
    // Drive along the road: when the new point ends the trail and the marker is on it,
    // move by distance along the trail and paint the line behind the truck as it goes.
    const route = key ? trailRoutes[key] : null;
    if (route && route.len > 0 && to.distanceTo(route.pts[route.pts.length - 1]) < 1) {
      const proj = projectOnRoute(route, from);
      if (proj.off < TRAIL_SNAP_M) {
        const s0 = proj.s;
        const s1 = route.len;
        const roadStart = performance.now();
        const drive = (now) => {
          const t = Math.min(1, (now - roadStart) / ms);
          const s = s0 + (s1 - s0) * t * (2 - t);
          const at = pointOnRoute(route, s);
          marker.setLatLng(at.pos);
          drawTrailTo(key, s, at.pos);
          if (t < 1) {
            markerGlides[key] = requestAnimationFrame(drive);
          } else {
            delete markerGlides[key];
          }
        };
        markerGlides[key] = requestAnimationFrame(drive);
        return;
      }
    }
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / ms);
      const ease = t * (2 - t);
      const pos = L.latLng(
        from.lat + (to.lat - from.lat) * ease,
        from.lng + (to.lng - from.lng) * ease,
      );
      marker.setLatLng(pos);
      if (key) syncTrailTipToMarker(key, pos);
      if (t < 1) {
        if (key) markerGlides[key] = requestAnimationFrame(tick);
      } else if (key) {
        delete markerGlides[key];
      }
    }
    if (key) markerGlides[key] = requestAnimationFrame(tick);
  }

  function ensureVehicleMarker(v) {
    const id = vehicleKey(v);
    if (
      isHistoryDetailFocusActive()
      && historyFocusVehicleId
      && id === String(historyFocusVehicleId)
    ) {
      updateHistoryMapPlayback(historyPlayIndex);
      return markers[id] || null;
    }

    let m = markers[id];
    const latlng = markerDisplayLatLng(v);
    const icon = markerIcon(v);
    if (!m) {
      m = L.marker(latlng, { icon });
      attachVehicleMarkerHandlers(m, v);
      markers[id] = m;
    } else {
      attachVehicleMarkerHandlers(m, v);
      if (map.hasLayer(m)) {
        const dist = m.getLatLng().distanceTo(L.latLng(latlng));
        if (dist > 2 && dist < 2000) {
          glideMarkerTo(m, latlng, markerGlideMs());
        } else {
          m.setLatLng(latlng);
          syncTrailTipToMarker(id, m.getLatLng());
        }
      } else {
        m.setLatLng(latlng);
      }
      m.setIcon(icon);
    }
    if (!map.hasLayer(m)) m.addTo(map);

    if (openPopupVehicleId === id && openPopupSurface === 'main' && m.isPopupOpen()) {
      patchOpenPopup(m, v);
    }
    return m;
  }

  function syncMapMarkers() {
    if (!map) return;

    if (isHistoryDetailFocusActive()) {
      Object.keys(clusterMarkers).forEach((key) => {
        map.removeLayer(clusterMarkers[key]);
        delete clusterMarkers[key];
      });
      updateHistoryMapPlayback(historyPlayIndex);
      const focusKey = historyPlaybackMarkerKey();
      Object.keys(markers).forEach((vehicleId) => {
        if (vehicleId !== focusKey) hideVehicleMarker(vehicleId);
      });
      return;
    }

    const groups = buildVehicleClusters(vehiclesForMap());
    const activeClusterKeys = new Set();
    const visibleTrips = new Set();

    groups.forEach(group => {
      if (group.length >= 2) {
        const key = clusterGroupKey(group);
        activeClusterKeys.add(key);
        group.forEach(v => {
          hideVehicleMarker(vehicleKey(v));
        });

        const latlng = clusterCentroid(group);
        const icon = clusterIcon(group.length);
        if (!clusterMarkers[key]) {
          const cm = L.marker(latlng, { icon, zIndexOffset: 800 });
          cm.on('click', () => zoomToVehicleGroup(group));
          cm.addTo(map);
          clusterMarkers[key] = cm;
        } else {
          clusterMarkers[key].setLatLng(latlng);
          clusterMarkers[key].setIcon(icon);
          if (!map.hasLayer(clusterMarkers[key])) clusterMarkers[key].addTo(map);
        }
      } else {
        const v = group[0];
        visibleTrips.add(vehicleKey(v));
        ensureVehicleMarker(v);
      }
    });

    Object.keys(clusterMarkers).forEach(key => {
      if (!activeClusterKeys.has(key)) {
        map.removeLayer(clusterMarkers[key]);
        delete clusterMarkers[key];
      }
    });

    Object.keys(markers).forEach(tripId => {
      if (!visibleTrips.has(tripId)) hideVehicleMarker(tripId);
    });
  }

  function scheduleMarkerLayout() {
    if (suppressMarkerLayout) return;
    if (markerLayoutTimer) clearTimeout(markerLayoutTimer);
    markerLayoutTimer = setTimeout(() => {
      markerLayoutTimer = null;
      syncMapMarkers();
    }, 40);
  }

  function sanitizeTrail(trail, anchor, opts) {
    if (!trail || trail.length < 2) return [];
    const options = opts || {};
    const maxSegmentKm = options.maxSegmentKm != null ? options.maxSegmentKm : 25;
    const maxFromAnchorKm = options.maxFromAnchorKm != null ? options.maxFromAnchorKm : 80;
    const out = [];
    trail.forEach((pt) => {
      if (anchor && haversineKm(anchor, pt) > maxFromAnchorKm) return;
      if (out.length && haversineKm(out[out.length - 1], pt) > maxSegmentKm) return;
      out.push(pt);
    });
    return out.length >= 2 ? out : [];
  }

  function buildDisplayTrail(v) {
    const anchor = [v.latitude, v.longitude];
    return sanitizeTrail(v.trail, anchor, { maxFromAnchorKm: 120 });
  }

  function updateTrailLayers() {
    if (!map) return;
    const seen = new Set();
    vehiclesForMap().forEach(v => {
      seen.add(vehicleKey(v));
      const isHistoryFocus = isHistoryDetailFocusActive()
        && historyFocusVehicleId
        && vehicleKey(v) === String(historyFocusVehicleId);
      if (isHistoryFocus || (historyTripId && String(v.trip_id) === historyTripId)) {
        if (trails[vehicleKey(v)]) {
          map.removeLayer(trails[vehicleKey(v)]);
          delete trails[vehicleKey(v)];
        }
        return;
      }
      const trail = buildDisplayTrail(v);
      if (trail.length > 1) {
        trailRoutes[vehicleKey(v)] = routeWithDistances(trail);
        const trailColor = v.tail_color || '#22c55e';
        if (trails[vehicleKey(v)]) {
          trails[vehicleKey(v)].setLatLngs(trail);
          trails[vehicleKey(v)].setStyle({ color: trailColor, weight: 5, opacity: 0.82 });
        } else {
          trails[vehicleKey(v)] = L.polyline(trail, {
            color: trailColor,
            weight: 5,
            opacity: 0.82,
            lineCap: 'round',
            lineJoin: 'round',
          }).addTo(map);
        }
        trails[vehicleKey(v)].bringToBack();
        // The new trail already reaches the newest GPS point; show only the part
        // behind the marker; the marker's drive paints the rest.
        const m = markers[vehicleKey(v)];
        if (m && map.hasLayer(m)) syncTrailTipToMarker(vehicleKey(v), m.getLatLng());
      } else if (trails[vehicleKey(v)]) {
        map.removeLayer(trails[vehicleKey(v)]);
        delete trails[vehicleKey(v)];
      }
      if (!trails[vehicleKey(v)]) delete trailRoutes[vehicleKey(v)];
    });
    Object.keys(trails).forEach(id => {
      if (!seen.has(id)) {
        map.removeLayer(trails[id]);
        delete trails[id];
        delete trailRoutes[id];
      }
    });
  }



  const OSM_TILE_URL = (location.protocol === 'file:' ? 'https://tile.openstreetmap.de/{z}/{x}/{y}.png' : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
  const OSM_TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' + (location.protocol === 'file:' ? ' · Tiles: openstreetmap.de' : '');

  let themeObserver = null;

  function createLightTileLayer() {
    return L.tileLayer(OSM_TILE_URL, {
      maxZoom: 19,
      subdomains: 'abc',
      attribution: OSM_TILE_ATTR,
    });
  }

  function setMapBasemap(mapInstance) {
    if (!mapInstance) return;
    if (mapInstance._lgBaseLayer) {
      mapInstance.removeLayer(mapInstance._lgBaseLayer);
      mapInstance._lgBaseLayer = null;
    }
    // Always use light OSM tiles — dark theme applies to UI chrome only, not the basemap.
    const layer = createLightTileLayer();
    layer.addTo(mapInstance);
    if (typeof layer.bringToBack === 'function') layer.bringToBack();
    mapInstance._lgBaseLayer = layer;
  }

  function lgCssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function historyChartTheme() {
    return {
      accent: lgCssVar('--lg-accent', '#0a84ff'),
      accentSoft: lgCssVar('--lg-accent-soft', 'rgba(10, 132, 255, 0.16)'),
      plotBg: lgCssVar('--lg-chart-bg', '#ffffff'),
      grid: lgCssVar('--lg-chart-grid', '#f1f5f9'),
      label: lgCssVar('--lg-chart-label', '#94a3b8'),
      fillFade: lgCssVar('--lg-chart-fill-fade', 'rgba(255, 255, 255, 0)'),
      dotStroke: lgCssVar('--lg-chart-dot-stroke', '#ffffff'),
      overspeed: lgCssVar('--lg-red', '#ef4444'),
    };
  }

  function onAdminThemeChange() {
    // Basemap stays light OSM; only canvas chart needs an explicit redraw.
    if (historyPoints.length || document.getElementById('live-gps-history-canvas')) {
      drawHistoryChart(historyCursorX);
    }
  }

  function watchAdminTheme() {
    if (themeObserver) return;
    themeObserver = new MutationObserver((mutations) => {
      for (let i = 0; i < mutations.length; i++) {
        if (mutations[i].attributeName === 'data-theme') {
          onAdminThemeChange();
          break;
        }
      }
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }

  function initMap() {
    const el = document.getElementById('live-gps-map');
    // Zoom control top-right (under the status chip) — top-left is occupied by the fleet list.
    map = L.map(el, { zoomControl: false, preferCanvas: false });
    L.control.zoom({ position: 'topright' }).addTo(map);
    setMapBasemap(map);
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    map.on('popupclose', () => {
      if (openPopupSurface !== 'main') return;
      openPopupVehicleId = null;
      openPopupSurface = null;
    });
    map.on('zoomend moveend', scheduleMarkerLayout);
    map.on('zoomend', syncHistoryPathLineWeights);
    map.on('dragstart', () => {
      if (historyMapProgrammaticPan) return;
      if (!historyPoints.length) return;
      if (historyPlayTimer || historyMapFollowActive) {
        suspendHistoryMapFollow();
      }
    });
    ensureHistoryMapFollowControl();
    watchAdminTheme();
  }

  const PANEL_LAYOUT_GAP = 12;
  const PANEL_LAYOUT_MS = 340;

  function isHistoryChartExpanded() {
    const panel = document.getElementById('live-gps-history');
    return !!panel
      && !panel.classList.contains('is-hidden')
      && !panel.classList.contains('is-collapsed');
  }

  function shouldShowVehicleDock() {
    return !!selectedVehicle() && !isHistoryChartExpanded();
  }

  /* Lift the vehicle dock above the bottom history chart/seekbar (12px gap). */
  function applyDockClearance() {
    const dockWrap = document.getElementById('live-gps-dock-wrap');
    if (!dockWrap || !dockWrap.classList.contains('is-visible')) {
      if (dockWrap) dockWrap.style.bottom = '';
      return;
    }
    const history = document.getElementById('live-gps-history');
    if (!history || history.classList.contains('is-hidden')) {
      dockWrap.style.bottom = '';
      return;
    }
    const shell = objectsPanelShell();
    const shellRect = shell
      ? shell.getBoundingClientRect()
      : { bottom: window.innerHeight };
    const historyTop = history.getBoundingClientRect().top;
    dockWrap.style.bottom = Math.max(
      PANEL_LAYOUT_GAP,
      shellRect.bottom - historyTop + PANEL_LAYOUT_GAP,
    ) + 'px';
  }

  /* Keeps the Fleet/History panel clear of the bottom chart and vehicle dock;
     the panel body scrolls instead of being covered. */
  function applyObjectsPanelClearance() {
    const objects = document.getElementById('live-gps-objects');
    if (!objects || objects.classList.contains('live-gps-objects--view-hidden')) return;
    if (!objectsPanelShell()) return;

    const panelRect = objects.getBoundingClientRect();
    let limitBottom = null;

    const chart = document.getElementById('live-gps-history');
    if (chart && !chart.classList.contains('is-hidden')) {
      limitBottom = chart.getBoundingClientRect().top - PANEL_LAYOUT_GAP;
    }

    const dockWrap = document.getElementById('live-gps-dock-wrap');
    if (dockWrap && dockWrap.classList.contains('is-visible')) {
      const dockRect = dockWrap.getBoundingClientRect();
      if (panelRect.right > dockRect.left + 2 && panelRect.left < dockRect.right - 2) {
        const dockLimit = dockRect.top - PANEL_LAYOUT_GAP;
        limitBottom = limitBottom == null ? dockLimit : Math.min(limitBottom, dockLimit);
      }
    }

    if (limitBottom == null) {
      objects.style.removeProperty('--lg-objects-max-h');
      return;
    }

    const available = limitBottom - panelRect.top;
    objects.style.setProperty('--lg-objects-max-h', Math.max(160, available) + 'px');
  }

  function applyPanelClearance() {
    applyDockClearance();
    applyObjectsPanelClearance();
  }

  let objectsClearanceRaf = null;
  let objectsClearanceUntil = 0;

  function setPanelLayoutSyncing(active) {
    const shell = objectsPanelShell();
    if (shell) shell.classList.toggle('live-gps-shell--layout-sync', active);
  }

  function runPanelClearanceLoop(untilMs) {
    objectsClearanceUntil = performance.now() + untilMs;
    setPanelLayoutSyncing(true);
    if (objectsClearanceRaf) return;
    const step = () => {
      applyPanelClearance();
      if (performance.now() < objectsClearanceUntil) {
        objectsClearanceRaf = requestAnimationFrame(step);
      } else {
        objectsClearanceRaf = null;
        setPanelLayoutSyncing(false);
      }
    };
    objectsClearanceRaf = requestAnimationFrame(step);
  }

  /* Smooth mode tracks the history panel as it animates; sync mode follows
     resize/entry animations without easing the fleet panel behind. */
  function updateObjectsPanelMaxHeight(opts) {
    const smooth = !!(opts && opts.smooth);
    applyPanelClearance();
    runPanelClearanceLoop(smooth ? PANEL_LAYOUT_MS : 700);
  }

  function refreshMapSize(opts) {
    const options = opts || {};
    updateObjectsPanelMaxHeight({ smooth: options.smoothLayout === true });
    if (!map) return;
    map.invalidateSize({ animate: false });
    Object.values(followPanels).forEach((state) => {
      if (state.map) state.map.invalidateSize({ animate: false });
    });
    if (openPopupVehicleId && options.alignViewport === true) {
      const m = activePopupMarker(openPopupVehicleId);
      if (m && m.isPopupOpen()) refitVehiclePopup(m);
    }
    if (historyPoints.length && (historyTripId || historyFocusVehicleId)) {
      requestAnimationFrame(() => drawHistoryChart(historyCursorX));
    }
  }

  function selectedVehicle() {
    if (!selectedVehicleId) return null;
    return findVehicle(selectedVehicleId);
  }

  function updateDockVisibility() {
    const wrap = document.getElementById('live-gps-dock-wrap');
    if (!wrap) return;
    const show = shouldShowVehicleDock();
    wrap.classList.toggle('is-visible', show);
    applyPanelClearance();
    if (show === dockPanelsVisible) return;
    dockPanelsVisible = show;
    requestAnimationFrame(() => refreshMapSize({ alignViewport: false, smoothLayout: true }));
    setTimeout(() => refreshMapSize({ alignViewport: true }), 220);
  }

  function renderDetail() {
    const v = selectedVehicle();
    if (!v) {
      updateDockVisibility();
      return;
    }
    document.getElementById('detail-reg').textContent = v.registration_number;
    const dot = document.getElementById('detail-movement-dot');
    dot.className = 'live-gps-obj__dot ' + movementDotClass(v);
    document.getElementById('detail-address').textContent = resolveAddressText(v, { preferLastResolved: true });
    fetchReverseAddress(v);
    const when = v.last_update_at || v.received_at || v.recorded_at;
    document.getElementById('detail-time').textContent = formatListTime(when) + connectionHint(v);
    document.getElementById('detail-stop').textContent = v.stop_duration_label || '0s';
    const geofenceRow = document.getElementById('live-gps-dock-geofence-row');
    const geofenceEl = document.getElementById('detail-geofence');
    const inside = !!(v.inside_pois && v.inside_pois.length);
    if (geofenceRow) {
      geofenceRow.hidden = !inside;
      geofenceRow.classList.toggle('is-inside', inside);
    }
    if (geofenceEl) geofenceEl.textContent = inside ? dockGeofenceValue(v) : '';
    const driverName = (v.driver_name && String(v.driver_name).trim()) ? String(v.driver_name).trim() : CONFIG.i18n.unassigned;
    document.getElementById('detail-driver').textContent = driverName;
    const speedHead = document.getElementById('detail-speed-head');
    if (speedHead) speedHead.textContent = speedText(v);
    document.getElementById('detail-trip').textContent = tripReferenceLabel(v);
    updateDockVisibility();
    if (map) updatePoiMarkers();
  }

  function vehiclesMatchingSearch(list) {
    const q = objectsSearchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((v) => {
      const reg = (v.registration_number || '').toLowerCase();
      const to = (v.to_number || '').toLowerCase();
      return reg.includes(q) || to.includes(q);
    });
  }

  function objectToNumberLabel(v) {
    if (!hasActiveTo(v)) return '';
    const to = (v && v.to_number) ? String(v.to_number).trim() : '';
    return to;
  }

  function objectListRowHtml(v, active) {
    const tripLabel = objectTripLineLabel(v);
    const hasTo = !!objectToNumberLabel(v);
    const primaryStatusHtml = objectPrimaryStatusHtml(v);
    const tripRowOpHtml = objectTripRowOperationalHtml(v);
    const tripRowHtml = (tripLabel || tripRowOpHtml)
      ? '<div class="live-gps-obj__row live-gps-obj__row--trip">'
        + '<span class="live-gps-obj__to' + (hasTo ? '' : ' live-gps-obj__to--empty') + '"'
        + (hasTo ? ' title="' + escHtml(tripLabel) + '"' : '')
        + '>' + escHtml(tripLabel) + '</span>'
        + tripRowOpHtml
        + '</div>'
      : '';
    return '<div class="live-gps-obj' + (active ? ' active' : '') + '" data-vehicle-id="' + vehicleKey(v) + '">'
      + '<div class="live-gps-obj__main">'
      + '<div class="live-gps-obj__row live-gps-obj__row--head">'
      + '<div class="live-gps-obj__head-left">'
      + '<span class="live-gps-obj__truck" aria-hidden="true">' + liveGpsIcon('truck-front-fill', 'sm') + '</span>'
      + '<span class="live-gps-obj__reg" title="' + escHtml(v.registration_number || '') + '">' + escHtml(v.registration_number) + '</span>'
      + '</div>'
      + objectSpeedLineHtml(v)
      + '</div>'
      + tripRowHtml
      + (primaryStatusHtml
        ? '<div class="live-gps-obj__row live-gps-obj__row--status">' + primaryStatusHtml + '</div>'
        : '')
      + '</div>'
      + '<div class="live-gps-obj__aside">'
      + '<button type="button" class="live-gps-obj__menu-btn" data-vehicle-id="' + vehicleKey(v) + '"'
      + ' aria-label="' + escHtml(CONFIG.i18n.actions) + '" aria-haspopup="menu" aria-expanded="false">'
      + liveGpsIcon('three-dots-vertical', 'sm')
      + '</button>'
      + '</div></div>';
  }

  function triggerObjChangeAnimation(el) {
    if (!el) return;
    el.classList.remove('is-changing');
    void el.offsetWidth;
    el.classList.add('is-changing');
    const done = () => {
      el.classList.remove('is-changing');
      el.removeEventListener('animationend', done);
    };
    el.addEventListener('animationend', done);
  }

  function updateObjectRowSpeedChip(el, v) {
    const valEl = el.querySelector('.live-gps-obj__speed-val');
    const dotEl = el.querySelector('.live-gps-obj__speed-dot');
    const nextVal = speedChipValue(v);
    const nextDotClass = speedChipDotClass(v);
    if (valEl && valEl.textContent !== nextVal) {
      valEl.textContent = nextVal;
      triggerObjChangeAnimation(valEl);
    }
    if (dotEl && dotEl.className !== nextDotClass) {
      dotEl.className = nextDotClass;
      dotEl.setAttribute('aria-hidden', 'true');
      triggerObjChangeAnimation(dotEl);
    }
  }

  function patchObjectListRows(filtered) {
    const list = document.getElementById('live-gps-list');
    filtered.forEach(v => {
      const id = vehicleKey(v);
      const el = list.querySelector('.live-gps-obj[data-vehicle-id="' + id + '"]');
      if (!el) return;
      el.classList.toggle('active', selectedVehicleId === id);
      const toEl = el.querySelector('.live-gps-obj__to');
      const tripLabel = objectTripLineLabel(v);
      const hasTo = !!objectToNumberLabel(v);
      if (toEl) {
        if (toEl.textContent !== tripLabel) toEl.textContent = tripLabel;
        toEl.title = hasTo ? tripLabel : '';
        toEl.classList.toggle('live-gps-obj__to--empty', !hasTo);
      }
      const tripOpEl = el.querySelector('.live-gps-obj__trip-op-status');
      const tripOpHtml = objectTripRowOperationalHtml(v);
      if (tripOpHtml) {
        if (tripOpEl) {
          const label = operationalStatusLabel(v);
          tripOpEl.textContent = label;
          tripOpEl.title = label;
          tripOpEl.className = 'live-gps-op-status live-gps-obj__trip-op-status '
            + toStatusClass(vehicleOperationalStatusKey(v));
        } else {
          const tripRow = el.querySelector('.live-gps-obj__row--trip');
          if (tripRow) tripRow.insertAdjacentHTML('beforeend', tripOpHtml);
        }
      } else if (tripOpEl) {
        tripOpEl.remove();
      }
      let statusRow = el.querySelector('.live-gps-obj__row--status');
      const primaryHtml = objectPrimaryStatusHtml(v);
      if (primaryHtml) {
        if (statusRow) {
          statusRow.innerHTML = primaryHtml;
        } else {
          const main = el.querySelector('.live-gps-obj__main');
          if (main) {
            main.insertAdjacentHTML('beforeend', '<div class="live-gps-obj__row live-gps-obj__row--status">' + primaryHtml + '</div>');
          }
        }
      } else if (statusRow) {
        statusRow.remove();
      }
      updateObjectRowSpeedChip(el, v);
    });
  }

  const OBJ_MENU_ICONS = {
    clock: 'clock-history',
    command: 'terminal-fill',
    follow: 'crosshair',
    link: 'box-arrow-up-right',
  };

  function adminChangeUrl(pattern, recordId) {
    if (!pattern || !recordId) return '';
    return pattern.replace('{id}', encodeURIComponent(String(recordId)));
  }

  function adminTransportOrderUrl(transportOrderId) {
    return adminChangeUrl(CONFIG.urls.adminTransportOrderChange, transportOrderId);
  }

  function adminVehicleUrl(vehicleId) {
    return adminChangeUrl(CONFIG.urls.adminVehicleChange, vehicleId);
  }

  function adminVehiclePlanningUrl(vehicleId) {
    return adminChangeUrl(CONFIG.urls.adminVehiclePlanning, vehicleId);
  }

  function ensureObjectMenuPortal() {
    const menu = document.getElementById('live-gps-obj-menu');
    if (menu && menu.parentElement !== document.body) {
      document.body.appendChild(menu);
    }
  }

  function objectMenuBounds() {
    const margin = 8;
    const shell = document.querySelector('.live-gps-shell');
    if (!shell) {
      return {
        top: margin,
        bottom: window.innerHeight - margin,
        left: margin,
        right: window.innerWidth - margin,
      };
    }
    const r = shell.getBoundingClientRect();
    return {
      top: r.top + margin,
      bottom: r.bottom - margin,
      left: r.left + margin,
      right: r.right - margin,
    };
  }

  function positionObjectMenu(menu, anchorBtn) {
    const panelGap = 6;
    const bounds = objectMenuBounds();
    const row = anchorBtn.closest('.live-gps-obj');
    const rowRect = row ? row.getBoundingClientRect() : anchorBtn.getBoundingClientRect();
    const objectsPanel = document.getElementById('live-gps-objects');
    const panelRect = objectsPanel && !objectsPanel.classList.contains('live-gps-objects--collapsed')
      ? objectsPanel.getBoundingClientRect()
      : null;

    menu.style.left = '-9999px';
    menu.style.top = '0';
    menu.hidden = false;

    const menuW = menu.offsetWidth;
    const menuH = menu.offsetHeight;
    const spaceBelow = bounds.bottom - rowRect.top;
    const spaceAbove = rowRect.bottom - bounds.top;
    const fitsBelow = menuH <= spaceBelow;
    const fitsAbove = menuH <= spaceAbove;

    let top;
    if (fitsBelow || (!fitsAbove && spaceBelow >= spaceAbove)) {
      top = rowRect.top;
      if (top + menuH > bounds.bottom) top = bounds.bottom - menuH;
    } else {
      top = rowRect.bottom - menuH;
      if (top < bounds.top) top = bounds.top;
    }
    top = Math.max(bounds.top, Math.min(top, bounds.bottom - menuH));

    let left = panelRect ? panelRect.right + panelGap : rowRect.right + panelGap;
    if (left + menuW > bounds.right) left = bounds.right - menuW;

    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  }

  function closeObjectMenu() {
    const menu = document.getElementById('live-gps-obj-menu');
    if (!menu) return;
    menu.hidden = true;
    menu.innerHTML = '';
    menu.style.left = '';
    menu.style.top = '';
    if (objMenuVehicleId) {
      const row = document.querySelector('.live-gps-obj[data-vehicle-id="' + objMenuVehicleId + '"]');
      if (row) {
        row.classList.remove('menu-open');
        const btn = row.querySelector('.live-gps-obj__menu-btn');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }
    }
    objMenuVehicleId = null;
  }

  function objectMenuItem(label, action, iconKey, disabled) {
    const dis = disabled ? ' disabled class="live-gps-obj-menu__item live-gps-obj-menu__item--disabled"' : ' class="live-gps-obj-menu__item"';
    return '<button type="button" role="menuitem"' + dis + ' data-action="' + action + '">'
      + '<span class="live-gps-obj-menu__ico">' + liveGpsIcon(OBJ_MENU_ICONS[iconKey] || 'circle-fill', 'sm') + '</span>'
      + '<span>' + label + '</span></button>';
  }

  function objectMenuLinkItem(label, href, iconKey, disabled) {
    if (disabled || !href) {
      return '<span class="live-gps-obj-menu__item live-gps-obj-menu__item--link live-gps-obj-menu__item--disabled" role="menuitem" aria-disabled="true">'
        + '<span class="live-gps-obj-menu__ico">' + liveGpsIcon(OBJ_MENU_ICONS[iconKey] || 'link', 'sm') + '</span>'
        + '<span>' + escHtml(label) + '</span></span>';
    }
    return '<a class="live-gps-obj-menu__item live-gps-obj-menu__item--link" role="menuitem" href="' + escHtml(href) + '">'
      + '<span class="live-gps-obj-menu__ico">' + liveGpsIcon(OBJ_MENU_ICONS[iconKey] || 'link', 'sm') + '</span>'
      + '<span>' + escHtml(label) + '</span></a>';
  }

  function openObjectMenu(tripId, anchorBtn) {
    const id = String(tripId);
    const v = findVehicle(id);
    if (!v || !anchorBtn) return;

    if (objMenuVehicleId === id && !document.getElementById('live-gps-obj-menu').hidden) {
      closeObjectMenu();
      return;
    }
    closeObjectMenu();

    const menu = document.getElementById('live-gps-obj-menu');
    const vehicleId = v.vehicle_id || id;
    const toUrl = adminTransportOrderUrl(v.transport_order_id);
    const vehicleUrl = adminVehicleUrl(vehicleId);
    const vehiclePlanningUrl = adminVehiclePlanningUrl(vehicleId);
    menu.innerHTML = ''
      + objectMenuItem(CONFIG.i18n.show_history_last_hour, 'history-last-hour', 'clock', false)
      + objectMenuItem(CONFIG.i18n.show_history_today, 'history-today', 'clock', false)
      + objectMenuItem(CONFIG.i18n.show_history_yesterday, 'history-yesterday', 'clock', false)
      + '<div class="live-gps-obj-menu__sep"></div>'
      + objectMenuLinkItem(CONFIG.i18n.show_to, toUrl, 'link', !toUrl)
      + objectMenuLinkItem(CONFIG.i18n.show_vehicle, vehicleUrl, 'link', !vehicleUrl)
      + objectMenuLinkItem(CONFIG.i18n.vehicle_planning, vehiclePlanningUrl, 'link', !vehiclePlanningUrl)
      + '<div class="live-gps-obj-menu__sep"></div>'
      + objectMenuItem(CONFIG.i18n.send_command, 'send-command', 'command', false)
      + objectMenuItem(CONFIG.i18n.follow, 'follow', 'follow', false);

    objMenuVehicleId = id;
    const row = anchorBtn.closest('.live-gps-obj');
    if (row) row.classList.add('menu-open');
    anchorBtn.setAttribute('aria-expanded', 'true');

    ensureObjectMenuPortal();
    positionObjectMenu(menu, anchorBtn);
  }

  function handleObjectMenuAction(action, tripId) {
    closeObjectMenu();
    const id = String(tripId);
    if (action === 'history-last-hour') {
      return openHistoryModal(id, 'last_hour', { autoLoad: true });
    }
    if (action === 'history-today') {
      return openHistoryModal(id, 'today', { autoLoad: true });
    }
    if (action === 'history-yesterday') {
      return openHistoryModal(id, 'yesterday', { autoLoad: true });
    }
    if (action === 'follow') return openFollowPanel(id);
    if (action === 'send-command') return openCommandModal(id);
  }

  let commandModalTripId = null;
  let commandModalBusy = false;





  function commandableVehicles() {
    return vehicles.filter(function(v) {
      return v.protocol === 'GT06' && v.device_id;
    });
  }

  function getCommandConnection() {
    const checked = document.querySelector('input[name="live-gps-command-connection"]:checked');
    return checked ? checked.value : 'gprs';
  }

  function getCommandType() {
    const el = document.getElementById('live-gps-command-type');
    return el ? el.value : '';
  }

  function getCommandFleetTripId() {
    const el = document.getElementById('live-gps-command-fleet');
    return el && el.value ? String(el.value) : '';
  }

  function setCommandModalStatus(message, tone) {
    const el = document.getElementById('live-gps-command-modal-status');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'live-gps-command-modal__status' + (message ? ' is-visible' : '');
    if (message && tone) el.classList.add('live-gps-command-modal__status--' + tone);
  }

  function syncCommandCustomPanel() {
    const custom = document.getElementById('live-gps-command-custom');
    if (!custom) return;
    custom.classList.toggle('is-visible', getCommandType() === 'custom');
  }

  function isCommandSpeedTooFast(v, type) {
    const relayCommand = type === 'engine_stop' || type === 'engine_resume';
    if (!relayCommand || !v || v.speed_kmh == null) return false;
    const speed = Number(v.speed_kmh);
    return !Number.isNaN(speed) && speed >= 20;
  }

  function isSpeedRelatedCommandError(message) {
    if (!message) return false;
    const lower = String(message).toLowerCase();
    return lower.indexOf('km/h') !== -1 || lower.indexOf('speed') !== -1;
  }

  function syncCommandModalForm() {
    const tripId = getCommandFleetTripId();
    const v = tripId ? findVehicle(tripId) : null;
    const type = getCommandType();
    const connection = getCommandConnection();
    const isSms = connection === 'sms';
    const tooFast = isCommandSpeedTooFast(v, type);
    const warn = document.getElementById('live-gps-command-modal-warn');
    const sendBtn = document.getElementById('live-gps-command-send');
    const smsNotice = document.getElementById('live-gps-command-sms-notice');
    const gprsPanel = document.getElementById('live-gps-command-gprs-panel');
    const message = (document.getElementById('live-gps-command-message')?.value || '').trim();

    if (smsNotice) smsNotice.hidden = !isSms;
    if (gprsPanel) gprsPanel.hidden = isSms;

    if (isSms) {
      setCommandModalStatus('', '');
      if (sendBtn) sendBtn.disabled = true;
      return;
    }

    if (warn) warn.hidden = !tooFast;
    if (tooFast) setCommandModalStatus('', '');
    syncCommandCustomPanel();

    let canSend = Boolean(v && type && !commandModalBusy);
    if (tooFast) canSend = false;
    if (type === 'custom' && !message) canSend = false;

    if (sendBtn) sendBtn.disabled = !canSend;
  }

  function populateCommandFleetSelect(preferredVehicleId) {
    const select = document.getElementById('live-gps-command-fleet');
    if (!select) return;
    const fleet = commandableVehicles();
    select.innerHTML = fleet.map(function(v) {
      const label = v.registration_number || v.trip_number || vehicleKey(v);
      return '<option value="' + vehicleKey(v) + '">' + escHtml(label) + '</option>';
    }).join('');
    if (!fleet.length) {
      select.innerHTML = '<option value="">' + CONFIG.i18n.no_gt06_devices_available + '</option>';
      return;
    }
    const preferred = preferredVehicleId ? String(preferredVehicleId) : '';
    const match = fleet.find(function(v) { return vehicleKey(v) === preferred; });
    select.value = match ? preferred : vehicleKey(fleet[0]);
  }

  function resetCommandModalForm(preferredVehicleId) {
    commandModalBusy = false;
    const gprs = document.querySelector('input[name="live-gps-command-connection"][value="gprs"]');
    if (gprs) gprs.checked = true;
    const autoSend = document.getElementById('live-gps-command-auto-send');
    if (autoSend) autoSend.checked = false;
    const type = document.getElementById('live-gps-command-type');
    if (type) type.value = '';
    const message = document.getElementById('live-gps-command-message');
    if (message) message.value = '';
    populateCommandFleetSelect(preferredVehicleId);
    setCommandModalStatus('', '');
    syncCommandModalForm();
  }

  function openCommandModal(tripId) {
    const id = tripId ? String(tripId) : '';
    commandModalTripId = id || null;
    const modal = document.getElementById('live-gps-command-modal');
    resetCommandModalForm(id);
    if (!modal) return;
    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(function() { modal.classList.add('is-open'); });
  }

  function closeCommandModal() {
    const modal = document.getElementById('live-gps-command-modal');
    if (!modal || modal.classList.contains('is-hidden')) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    window.setTimeout(function() {
      modal.classList.add('is-hidden');
      commandModalTripId = null;
      commandModalBusy = false;
    }, 180);
  }

  async function submitCommandModal() {
    const vehicleId = getCommandFleetTripId();
    const type = getCommandType();
    const connection = getCommandConnection();
    const autoSend = document.getElementById('live-gps-command-auto-send')?.checked;
    const message = (document.getElementById('live-gps-command-message')?.value || '').trim();
    if (!vehicleId || !type || commandModalBusy) return;

    if (connection === 'sms') return;

    const v = findVehicle(vehicleId);
    if (!v || !v.trip_id) return;
    if (isCommandSpeedTooFast(v, type)) return;

    commandModalBusy = true;
    syncCommandModalForm();
    setCommandModalStatus(CONFIG.i18n.sending_command_to_device, 'info');

    const payload = {
      trip_id: v.trip_id,
      connection: connection,
      command_type: type,
      auto_send_when_online: Boolean(autoSend),
    };
    if (type === 'custom') payload.command_text = message;

    try {
      const res = await liveGpsApiFetch(CONFIG.urls.deviceCommand, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(function() { return {}; });
      if (!res.ok || !data.success) {
        const err = data.error || CONFIG.i18n.command_failed;
        if (!isSpeedRelatedCommandError(err)) {
          setCommandModalStatus(err, 'error');
        }
        return;
      }
      const reply = data.reply ? (' (' + data.reply + ')') : '';
      const labels = {
        engine_stop: CONFIG.i18n.engine_stop_command_sent,
        engine_resume: CONFIG.i18n.engine_resume_command_sent,
        custom: CONFIG.i18n.custom_command_sent,
      };
      setCommandModalStatus((labels[type] || CONFIG.i18n.command_sent) + reply, 'ok');
    } catch (err) {
      setCommandModalStatus(CONFIG.i18n.network_error_while_sending_command, 'error');
    } finally {
      commandModalBusy = false;
      syncCommandModalForm();
    }
  }

  function initCommandModal() {
    const modal = document.getElementById('live-gps-command-modal');
    if (!modal || modal.dataset.bound) return;
    modal.dataset.bound = '1';
    document.getElementById('live-gps-command-modal-close')?.addEventListener('click', closeCommandModal);
    document.getElementById('live-gps-command-modal-backdrop')?.addEventListener('click', closeCommandModal);
    document.getElementById('live-gps-command-cancel')?.addEventListener('click', closeCommandModal);
    document.getElementById('live-gps-command-send')?.addEventListener('click', submitCommandModal);
    document.getElementById('live-gps-command-fleet')?.addEventListener('change', syncCommandModalForm);
    document.getElementById('live-gps-command-type')?.addEventListener('change', syncCommandModalForm);
    document.getElementById('live-gps-command-message')?.addEventListener('input', syncCommandModalForm);
    document.getElementById('live-gps-command-auto-send')?.addEventListener('change', syncCommandModalForm);
    document.querySelectorAll('input[name="live-gps-command-connection"]').forEach(function(input) {
      input.addEventListener('change', syncCommandModalForm);
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && !modal.classList.contains('is-hidden')) closeCommandModal();
    });
  }

  function initObjectListDelegation() {
    const list = document.getElementById('live-gps-list');
    if (!list || list.dataset.delegationBound) return;
    list.dataset.delegationBound = '1';

    list.addEventListener('click', (e) => {
      const menuBtn = e.target.closest('.live-gps-obj__menu-btn');
      if (menuBtn) {
        e.stopPropagation();
        openObjectMenu(menuBtn.dataset.vehicleId, menuBtn);
        return;
      }
      const row = e.target.closest('.live-gps-obj');
      if (row) selectVehicleFromList(row.dataset.vehicleId);
    });

    const menu = document.getElementById('live-gps-obj-menu');
    menu.addEventListener('click', (e) => {
      const link = e.target.closest('a.live-gps-obj-menu__item--link');
      if (link) {
        e.stopPropagation();
        closeObjectMenu();
        return;
      }
      const item = e.target.closest('[data-action]');
      if (!item || item.disabled || !objMenuVehicleId) return;
      e.stopPropagation();
      handleObjectMenuAction(item.dataset.action, objMenuVehicleId);
    });

    document.addEventListener('click', (e) => {
      if (document.getElementById('live-gps-obj-menu').hidden) return;
      if (e.target.closest('#live-gps-obj-menu, .live-gps-obj__menu-btn')) return;
      closeObjectMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeObjectMenu();
    });
    list.addEventListener('scroll', () => closeObjectMenu(), { passive: true });
    window.addEventListener('resize', () => {
      const menu = document.getElementById('live-gps-obj-menu');
      if (!menu || menu.hidden || !objMenuVehicleId) return;
      const btn = document.querySelector(
        '.live-gps-obj[data-vehicle-id="' + objMenuVehicleId + '"] .live-gps-obj__menu-btn'
      );
      if (btn) positionObjectMenu(menu, btn);
    });
  }

  function positionFleetFilterMenu(menu, anchorBtn) {
    const panelGap = 8;
    const bounds = objectMenuBounds();
    const objectsPanel = document.getElementById('live-gps-objects');
    const panelRect = objectsPanel && !objectsPanel.classList.contains('live-gps-objects--collapsed')
      ? objectsPanel.getBoundingClientRect()
      : anchorBtn.getBoundingClientRect();

    menu.style.left = '-9999px';
    menu.style.top = '0';
    menu.hidden = false;

    const menuW = menu.offsetWidth;
    const menuH = menu.offsetHeight;
    const toolbar = document.querySelector('.live-gps-objects__toolbar');
    const anchorRect = toolbar ? toolbar.getBoundingClientRect() : panelRect;

    let left = panelRect.right + panelGap;
    if (left + menuW > bounds.right) {
      left = panelRect.left - menuW - panelGap;
    }
    left = Math.max(bounds.left, Math.min(left, bounds.right - menuW));

    let top = anchorRect.top;
    if (top + menuH > bounds.bottom) {
      top = bounds.bottom - menuH;
    }
    top = Math.max(bounds.top, Math.min(top, bounds.bottom - menuH));

    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  }

  function positionHistoryDeviceMenu(menu, anchorBtn) {
    const panelGap = 8;
    const bounds = objectMenuBounds();
    const objectsPanel = document.getElementById('live-gps-objects');
    const panelRect = objectsPanel && !objectsPanel.classList.contains('live-gps-objects--collapsed')
      ? objectsPanel.getBoundingClientRect()
      : anchorBtn.getBoundingClientRect();

    menu.style.width = anchorBtn.getBoundingClientRect().width + 'px';
    menu.style.left = '-9999px';
    menu.style.top = '0';
    menu.hidden = false;

    const menuW = menu.offsetWidth;
    const menuH = menu.offsetHeight;
    const anchorRect = anchorBtn.getBoundingClientRect();

    let left = panelRect.right + panelGap;
    if (left + menuW > bounds.right) {
      left = panelRect.left - menuW - panelGap;
    }
    left = Math.max(bounds.left, Math.min(left, bounds.right - menuW));

    let top = anchorRect.top;
    if (top + menuH > bounds.bottom) {
      top = bounds.bottom - menuH;
    }
    top = Math.max(bounds.top, Math.min(top, bounds.bottom - menuH));

    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  }

  function createFleetStatusFilter(config) {
    let options = [];
    /** @type {Set<string>|null} */
    let active = null;
    const excluded = config.excluded || new Set();
    const checkboxAttr = config.checkboxAttr;
    const checkboxSelector = 'input[type="checkbox"][' + checkboxAttr + ']';

    function btnEl() {
      return document.getElementById(config.btnId);
    }

    function menuEl() {
      return document.getElementById(config.menuId);
    }

    function visibleOptions() {
      return options.filter(function(opt) {
        return !excluded.has(String(opt.value));
      });
    }

    function ensureMenuPortal() {
      const menu = menuEl();
      if (menu && menu.parentElement !== document.body) {
        document.body.appendChild(menu);
      }
    }

    function syncButton() {
      const btn = btnEl();
      if (!btn) return;
      const visible = visibleOptions();
      const allSelected = !active || active.size === visible.length;
      btn.classList.toggle('is-active', !allSelected);
    }

    function renderMenu() {
      const menu = menuEl();
      if (!menu) return;
      const visible = visibleOptions();
      const allChecked = !active;
      menu.innerHTML = ''
        + '<div class="live-gps-objects__filter-head">'
        + '<span>' + escHtml(config.headLabel) + '</span>'
        + '<button type="button" class="live-gps-objects__filter-clear" id="' + config.clearId + '">'
        + escHtml(CONFIG.i18n.clear_filters) + '</button>'
        + '</div>'
        + '<label class="live-gps-objects__filter-item live-gps-objects__filter-item--all">'
        + '<input type="checkbox" data-status-all="1"' + (allChecked ? ' checked' : '') + ' />'
        + '<span class="live-gps-objects__filter-all-label">' + escHtml(CONFIG.i18n.filter_all) + '</span>'
        + '</label>'
        + '<div class="live-gps-objects__filter-sep" aria-hidden="true"></div>'
        + visible.map(function(opt) {
          const checked = !active || active.has(String(opt.value));
          return '<label class="live-gps-objects__filter-item">'
            + '<input type="checkbox" ' + checkboxAttr + '="' + escHtml(opt.value) + '"' + (checked ? ' checked' : '') + ' />'
            + '<span class="live-gps-op-status ' + toStatusClass(opt.value) + '">' + escHtml(opt.label) + '</span>'
            + '</label>';
        }).join('');
    }

    function closeMenu() {
      const menu = menuEl();
      const btn = btnEl();
      if (menu) {
        menu.hidden = true;
        menu.style.left = '';
        menu.style.top = '';
      }
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }

    function openMenu() {
      if (config.onBeforeOpen) config.onBeforeOpen();
      renderMenu();
      ensureMenuPortal();
      const menu = menuEl();
      const btn = btnEl();
      if (!menu || !btn) return;
      positionFleetFilterMenu(menu, btn);
      btn.setAttribute('aria-expanded', 'true');
    }

    function refreshMenuPosition() {
      const menu = menuEl();
      const btn = btnEl();
      if (!menu || menu.hidden || !btn) return;
      positionFleetFilterMenu(menu, btn);
    }

    function readCheckboxValue(box) {
      if (checkboxAttr === 'data-status') return String(box.dataset.status || '');
      if (checkboxAttr === 'data-vehicle-status') return String(box.dataset.vehicleStatus || '');
      return String(box.getAttribute(checkboxAttr) || '');
    }

    function applyFromMenu() {
      const menu = menuEl();
      if (!menu) return;
      const visible = visibleOptions();
      const total = visible.length;
      const boxes = menu.querySelectorAll(checkboxSelector);
      const selected = new Set();
      boxes.forEach(function(box) {
        if (box.checked) selected.add(readCheckboxValue(box));
      });
      const allBox = menu.querySelector('input[data-status-all="1"]');

      if (selected.size === 0) {
        active = new Set();
        if (allBox) allBox.checked = false;
      } else if (selected.size >= total) {
        active = null;
        if (allBox) allBox.checked = true;
      } else {
        active = selected;
        if (allBox) allBox.checked = false;
      }
      syncButton();
      if (config.onApply) config.onApply();
      refreshMenuPosition();
    }

    function applyAll(checked) {
      active = checked ? null : new Set();
      renderMenu();
      syncButton();
      if (config.onApply) config.onApply();
      refreshMenuPosition();
    }

    function setOptionsFromApi(raw) {
      options = raw || options;
      if (active) {
        excluded.forEach(function(value) {
          active.delete(value);
        });
        if (!active.size) {
          active = null;
        } else if (active.size >= visibleOptions().length) {
          active = null;
        }
      }
    }

    function applyMatching(list) {
      if (!active) return list;
      return list.filter(function(v) {
        return active.has(config.vehicleKey(v));
      });
    }

    function explicitlyIncludes(value) {
      return !!active && active.has(String(value));
    }

    function init() {
      const btn = btnEl();
      const menu = menuEl();
      if (!btn || !menu) return;

      ensureMenuPortal();

      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (menu.hidden) openMenu();
        else closeMenu();
      });

      menu.addEventListener('change', function(e) {
        const target = e.target;
        if (!target || target.type !== 'checkbox') return;
        if (target.matches('input[data-status-all="1"]')) {
          applyAll(target.checked);
          return;
        }
        if (target.matches(checkboxSelector)) {
          applyFromMenu();
        }
      });

      menu.addEventListener('click', function(e) {
        const clear = e.target.closest('#' + config.clearId);
        if (!clear) return;
        e.preventDefault();
        applyAll(true);
      });

      document.addEventListener('click', function(e) {
        if (menu.hidden) return;
        if (e.target.closest('#' + config.menuId) || e.target.closest('#' + config.btnId)) return;
        closeMenu();
      });

      window.addEventListener('resize', function() {
        if (menu.hidden) return;
        refreshMenuPosition();
      });
    }

    return {
      setOptionsFromApi: setOptionsFromApi,
      applyMatching: applyMatching,
      explicitlyIncludes: explicitlyIncludes,
      init: init,
      closeMenu: closeMenu,
      syncButton: syncButton,
    };
  }

  function initFleetFilters() {
    function closeOtherFilters(exceptId) {
      if (exceptId !== 'to' && toStatusFilter) toStatusFilter.closeMenu();
      if (exceptId !== 'vehicle' && vehicleStatusFilter) vehicleStatusFilter.closeMenu();
    }

    function onFilterApply() {
      renderList();
      updateMap();
    }

    toStatusFilter = createFleetStatusFilter({
      btnId: 'live-gps-status-filter-btn',
      menuId: 'live-gps-status-filter-menu',
      clearId: 'live-gps-status-filter-clear',
      checkboxAttr: 'data-status',
      headLabel: CONFIG.i18n.filter_status,
      excluded: TO_STATUS_FILTER_EXCLUDED,
      vehicleKey: vehicleToStatusKey,
      onBeforeOpen: function() { closeOtherFilters('to'); },
      onApply: onFilterApply,
    });

    vehicleStatusFilter = createFleetStatusFilter({
      btnId: 'live-gps-vehicle-status-filter-btn',
      menuId: 'live-gps-vehicle-status-filter-menu',
      clearId: 'live-gps-vehicle-status-filter-clear',
      checkboxAttr: 'data-vehicle-status',
      headLabel: CONFIG.i18n.filter_vehicle_status,
      excluded: VEHICLE_STATUS_FILTER_EXCLUDED,
      vehicleKey: vehicleOperationalStatusKey,
      onBeforeOpen: function() { closeOtherFilters('vehicle'); },
      onApply: onFilterApply,
    });

    toStatusFilter.init();
    vehicleStatusFilter.init();
  }

  function updateObjectsCount(shown, total) {
    const el = document.getElementById('live-gps-count');
    if (!el) return;
    const q = objectsSearchQuery.trim();
    if (!q || shown === total) {
      el.textContent = '(' + total + ')';
    } else {
      el.textContent = '(' + shown + '/' + total + ')';
    }
  }

  function renderList() {
    const list = document.getElementById('live-gps-list');
    const total = vehicles.length;
    const filtered = vehiclesForList();
    updateObjectsCount(filtered.length, total);
    if (toStatusFilter) toStatusFilter.syncButton();
    if (vehicleStatusFilter) vehicleStatusFilter.syncButton();

    if (!total) {
      list.innerHTML = '<div class="live-gps-empty">' + CONFIG.i18n.no_fleet_vehicles + '</div>';
      updateDockVisibility();
      return;
    }

    if (!filtered.length) {
      list.innerHTML = '<div class="live-gps-empty">' + CONFIG.i18n.no_vehicles_match_your_search + '</div>';
      return;
    }

    const sig = filtered.map(vehicleKey).join('|');
    const canPatch = list.dataset.listSig === sig && list.querySelector('.live-gps-obj');

    if (canPatch) {
      patchObjectListRows(filtered);
    } else {
      list.dataset.listSig = sig;
      list.innerHTML = filtered.map(v => {
        return objectListRowHtml(v, selectedVehicleId === vehicleKey(v));
      }).join('');
    }

    if (!selectedVehicleId && vehicles.length) {
      selectedVehicleId = vehicleKey(vehicles[0]);
      renderDetail();
    }
    renderDetail();
  }

  function focusVehicle(tripId) {
    focusVehicleFromList(tripId);
  }

  function fitAllVehicles() {
    const mapVehicles = vehiclesForMap();
    if (!mapVehicles.length) return;
    if (mapVehicles.length === 1) {
      const v = mapVehicles[0];
      map.setView([v.latitude, v.longitude], VEHICLE_ZOOM);
      return;
    }
    const bounds = L.latLngBounds(mapVehicles.map(v => [v.latitude, v.longitude]));
    map.fitBounds(bounds.pad(0.15), { maxZoom: 14 });
  }

  /* ---------- map POI markers: type-specific Material icon pins ---------- */
  const poiMarkers = {};
  const poiGeofenceCircles = {};
  let poiPinZoomHooked = false;
  const POI_PIN_ICON_W = 54;
  const POI_PIN_ICON_H = 58;
  const POI_PIN_ANCHOR_X = 27;
  const POI_PIN_ANCHOR_Y = 58;

  function poiPinScaleForZoom(z) {
    if (z <= 10) return 0.9;
    if (z <= 12) return 1;
    if (z <= 14) return 1.16;
    if (z <= 16) return 1.32;
    return 1.48;
  }

  function currentPoiPinScale() {
    if (!map) return 1;
    return poiPinScaleForZoom(map.getZoom());
  }

  function poiTooltipOffsetY() {
    return -Math.round(38 * currentPoiPinScale());
  }

  function syncPoiPinScale() {
    if (!map) return;
    const el = document.getElementById('live-gps-map');
    if (!el) return;
    const scale = poiPinScaleForZoom(map.getZoom());
    el.style.setProperty('--lg-poi-pin-scale', String(scale));
    const offY = poiTooltipOffsetY();
    Object.keys(poiMarkers).forEach((id) => {
      const marker = poiMarkers[id];
      if (!marker || !marker.getTooltip) return;
      const tooltip = marker.getTooltip();
      if (tooltip && tooltip.options) tooltip.options.offset = [0, offY];
    });
  }

  function ensurePoiPinZoomHook() {
    if (!map || poiPinZoomHooked) return;
    poiPinZoomHooked = true;
    map.on('zoomend', syncPoiPinScale);
    syncPoiPinScale();
  }

  function poiMarkerIcon(poiType) {
    const glyph = poiTypeIconHtml(poiType) || liveGpsIcon('geo-alt-fill', 'sm');
    const color = poiTypePinColor(poiType);
    return L.divIcon({
      className: 'live-gps-poi-icon',
      html: '<div class="live-gps-poi-marker">'
        + '<div class="live-gps-poi-pin live-gps-poi-pin--typed"'
        + ' style="--lg-poi-pin-color:' + color + '">'
        + '<span class="live-gps-poi-pin__bubble">' + glyph + '</span>'
        + '<span class="live-gps-poi-pin__tip"></span>'
        + '</div></div>',
      iconSize: [POI_PIN_ICON_W, POI_PIN_ICON_H],
      iconAnchor: [POI_PIN_ANCHOR_X, POI_PIN_ANCHOR_Y],
    });
  }

  function poiTooltipHtml(poi) {
    const kind = poiEscape(poiTypeLabel(poi.poi_type || 'other'));
    return '<span class="live-gps-poi-tooltip">'
      + '<span class="live-gps-poi-tooltip__kind">' + kind + '</span>'
      + poiEscape(poi.name) + (poi.poi_code ? ' · ' + poiEscape(poi.poi_code) : '')
      + '</span>';
  }

  function updatePoiMarkers() {
    if (!map) return;
    ensurePoiPinZoomHook();
    const occupancy = buildPoiOccupancyMap();
    const seenMarkers = new Set();
    const seenCircles = new Set();
    mapPois.forEach((poi) => {
      const id = String(poi.id || poi.poi_code);
      seenMarkers.add(id);
      const lat = Number(poi.latitude);
      const lng = Number(poi.longitude);
      const radius = Number(poi.geofence_radius_meters);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        if (poiMarkers[id]) {
          map.removeLayer(poiMarkers[id]);
          delete poiMarkers[id];
        }
        if (poiGeofenceCircles[id]) {
          map.removeLayer(poiGeofenceCircles[id]);
          delete poiGeofenceCircles[id];
        }
        return;
      }
      if (Number.isFinite(radius) && radius > 0) {
        seenCircles.add(id);
        const circleStyle = poiGeofenceCircleStyle(id, occupancy);
        if (poiGeofenceCircles[id]) {
          poiGeofenceCircles[id].setLatLng([lat, lng]);
          poiGeofenceCircles[id].setRadius(radius);
          poiGeofenceCircles[id].setStyle(circleStyle);
        } else {
          poiGeofenceCircles[id] = L.circle([lat, lng], Object.assign({
            radius: radius,
            interactive: false,
            className: 'live-gps-poi-geofence',
          }, circleStyle)).addTo(map);
        }
      } else if (poiGeofenceCircles[id]) {
        map.removeLayer(poiGeofenceCircles[id]);
        delete poiGeofenceCircles[id];
      }
      const poiType = poi.poi_type || 'other';
      if (poiMarkers[id]) {
        poiMarkers[id].setLatLng([lat, lng]);
        poiMarkers[id].setTooltipContent(poiTooltipHtml(poi));
        if (poiMarkers[id]._lgPoiType !== poiType) {
          poiMarkers[id].setIcon(poiMarkerIcon(poiType));
          poiMarkers[id]._lgPoiType = poiType;
        }
      } else {
        poiMarkers[id] = L.marker([lat, lng], {
          icon: poiMarkerIcon(poiType),
          zIndexOffset: 400,
          keyboard: false,
        }).addTo(map);
        poiMarkers[id]._lgPoiType = poiType;
        poiMarkers[id].bindTooltip(poiTooltipHtml(poi), {
          direction: 'top',
          offset: [0, poiTooltipOffsetY()],
        });
      }
    });
    Object.keys(poiMarkers).forEach((id) => {
      if (!seenMarkers.has(id)) {
        map.removeLayer(poiMarkers[id]);
        delete poiMarkers[id];
      }
    });
    Object.keys(poiGeofenceCircles).forEach((id) => {
      if (!seenCircles.has(id)) {
        map.removeLayer(poiGeofenceCircles[id]);
        delete poiGeofenceCircles[id];
      }
    });
  }

  function updateMap() {
    const seen = new Set();
    vehiclesForMap().forEach(v => {
      seen.add(vehicleKey(v));

      const planned = v.planned_route;
      if (planned && planned.length > 1) plannedAhead[vehicleKey(v)] = planned;
      else delete plannedAhead[vehicleKey(v)];
      if (planned && planned.length > 1) {
        if (plannedRoutes[vehicleKey(v)]) {
          plannedRoutes[vehicleKey(v)].setLatLngs(planned);
        } else {
          plannedRoutes[vehicleKey(v)] = L.polyline(planned, {
            color: '#64748b',
            weight: 3,
            opacity: 0.5,
            dashArray: '10 8',
          }).addTo(map);
        }
      } else if (plannedRoutes[vehicleKey(v)]) {
        map.removeLayer(plannedRoutes[vehicleKey(v)]);
        delete plannedRoutes[vehicleKey(v)];
      }
    });

    updateTrailLayers();

    Object.keys(markers).forEach(id => {
      if (!seen.has(id)) {
        if (markers[id].isPopupOpen()) markers[id].closePopup();
        map.removeLayer(markers[id]);
        delete markers[id];
      }
      if (plannedRoutes[id] && !seen.has(id)) {
        map.removeLayer(plannedRoutes[id]);
        delete plannedRoutes[id];
      }
    });

    Object.keys(clusterMarkers).forEach(key => {
      const stillActive = key.split('|').every(tid => seen.has(tid));
      if (!stillActive) {
        map.removeLayer(clusterMarkers[key]);
        delete clusterMarkers[key];
      }
    });

    syncMapMarkers();
    updatePoiMarkers();

    if (!mapViewLocked && !openPopupVehicleId && !mapInitialFitDone && vehiclesForMap().length) {
      fitAllVehicles();
      mapInitialFitDone = true;
      scheduleMarkerLayout();
    } else if (openPopupVehicleId) {
      syncOpenPopupsForTrip(openPopupVehicleId);
    }
    updateFollowMaps();
  }

  function setStatusChip(state, text) {
    const status = document.getElementById('live-gps-status');
    if (!status) return;
    status.innerHTML = '<span class="live-gps-toolbar__dot live-gps-toolbar__dot--' + state + '" aria-hidden="true"></span>'
      + '<span class="live-gps-toolbar__text"></span>';
    status.querySelector('.live-gps-toolbar__text').textContent = text;
  }

  function scheduleRefresh(intervalSeconds) {
    const nextMs = resolveRefreshMs(
      intervalSeconds != null ? intervalSeconds : (refreshMs / 1000)
    );
    if (refreshTimer && nextMs === refreshMs) return;
    refreshMs = nextMs;
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(loadData, refreshMs);
  }

  async function loadData() {
    try {
      const res = await fetch(CONFIG.urls.liveMap, { credentials: 'same-origin' });
      if (!res.ok) {
        setStatusChip('error', CONFIG.i18n.failed_to_load + ' (' + res.status + ')');
        return;
      }
      const data = await res.json();
      vehicles = data.vehicles || [];
      mapPois = data.pois || [];
      if (toStatusFilter && data.to_status_filters) {
        toStatusFilter.setOptionsFromApi(data.to_status_filters);
      }
      if (vehicleStatusFilter && data.vehicle_status_filters) {
        vehicleStatusFilter.setOptionsFromApi(data.vehicle_status_filters);
      }
      renderList();
      populateHistoryDeviceSelect(selectedVehicleId);
      updateMap();
      const intervalSec = data.refresh_interval_seconds || Math.round(refreshMs / 1000);
      scheduleRefresh(intervalSec);
      const refreshed = data.refreshed_at ? new Date(data.refreshed_at).toLocaleTimeString() : '';
      setStatusChip('live', CONFIG.i18n.updated + ' ' + refreshed + ' · ' + intervalSec + 's');
    } catch (e) {
      setStatusChip('error', CONFIG.i18n.network_error);
      console.error(e);
    }
  }

  function historyRangeLabel(rangeKey) {
    if (rangeKey === 'last_hour') return CONFIG.i18n.last_hour;
    if (rangeKey === 'today') return CONFIG.i18n.today;
    if (rangeKey === 'yesterday') return CONFIG.i18n.yesterday;
    return rangeKey;
  }

  function historyPointHasCoords(point) {
    if (!point || point.latitude == null || point.longitude == null) return false;
    const lat = Number(point.latitude);
    const lng = Number(point.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    // Null Island only — no hemisphere assumption (AU / BR / ZA / AR are valid).
    if (Math.abs(lat) < 1e-5 && Math.abs(lng) < 1e-5) return false;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
    return true;
  }

  function historyPathLatLngs() {
    return historyPoints
      .filter(historyPointHasCoords)
      .map(p => [Number(p.latitude), Number(p.longitude)]);
  }

  function historyPathLatLngsThrough(index) {
    const out = [];
    const limit = Math.max(0, Math.min(index, historyPoints.length - 1));
    for (let i = 0; i <= limit; i++) {
      const p = historyPoints[i];
      if (historyPointHasCoords(p)) out.push([Number(p.latitude), Number(p.longitude)]);
    }
    return out;
  }

  function historyHeadingAt(index) {
    const limit = Math.max(0, Math.min(index, historyPoints.length - 1));
    for (let i = limit; i > 0; i--) {
      const a = historyPoints[i - 1];
      const b = historyPoints[i];
      if (!historyPointHasCoords(a) || !historyPointHasCoords(b)) continue;
      const heading = bearingDegrees(
        Number(a.latitude), Number(a.longitude),
        Number(b.latitude), Number(b.longitude),
      );
      if (heading != null) return heading;
    }
    const v = historyPlaybackVehicle();
    return v ? resolveMarkerHeading(v) : 0;
  }

  function historyOverspeedLimitValue() {
    if (historyOverspeedLimitKmh == null) return null;
    const n = Number(historyOverspeedLimitKmh);
    return Number.isFinite(n) ? n : null;
  }

  function historyArrowIcon(bearing, overspeed) {
    const tone = overspeed ? 'overspeed' : 'normal';
    return L.divIcon({
      className: 'live-gps-history-arrow live-gps-history-arrow--' + tone,
      html: '<span class="live-gps-history-arrow__glyph" style="transform:rotate('
        + Math.round(bearing || 0) + 'deg)">' + liveGpsIcon('caret-up-fill', 'xs') + '</span>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      popupAnchor: [0, -8],
    });
  }

  function historyOverspeedPopupMarkerData(ev, lat, lng, speedKmh) {
    return {
      type: 'overspeed',
      event_type: 'overspeed',
      event_id: 'overspeed-' + ev.id,
      title: CONFIG.i18n.overspeed,
      recorded_at: ev.recorded_at,
      event_at: ev.recorded_at,
      speed_kmh: speedKmh != null ? speedKmh : ev.speed_kmh,
      speed_limit_kmh: ev.speed_limit_kmh != null ? ev.speed_limit_kmh : historyOverspeedLimitValue(),
      latitude: lat,
      longitude: lng,
    };
  }

  function bindHistoryOverspeedArrowPopup(marker, popupData) {
    marker.bindPopup(historyMarkerPopupHtml(popupData), {
      className: 'live-gps-popup-wrap',
      maxWidth: 320,
      autoPan: false,
    });
    marker.on('popupopen', () => fetchHistoryReverseAddress(popupData.latitude, popupData.longitude));
    const rawId = String(popupData.event_id || '').replace(/^overspeed-/, '');
    marker.on('mouseover', () => {
      if (historyOverspeedHoverDebounceTimer) {
        clearTimeout(historyOverspeedHoverDebounceTimer);
        historyOverspeedHoverDebounceTimer = null;
      }
      if (historyChartOverspeedHoverId != null && String(historyChartOverspeedHoverId) !== rawId) {
        closeHistoryChartOverspeedHoverPopup();
      }
      if (rawId) historyChartOverspeedHoverId = rawId;
      setHistoryPopupAutoPan(marker, false);
      marker.openPopup();
    });
    marker.on('mouseout', () => {
      if (marker.isPopupOpen()) marker.closePopup();
      if (rawId && String(historyChartOverspeedHoverId) === rawId) {
        historyChartOverspeedHoverId = null;
      }
    });
  }

  function buildHistoryArrowLayer() {
    const layer = L.layerGroup();
    const pts = [];
    historyPoints.forEach((p) => {
      if (!historyPointHasCoords(p)) return;
      pts.push({
        lat: Number(p.latitude),
        lng: Number(p.longitude),
        speed: Number(p.speed_kmh) || 0,
        recorded_at: p.recorded_at,
      });
    });
    if (pts.length < 2) return layer;

    let totalM = 0;
    for (let i = 1; i < pts.length; i++) {
      totalM += haversineKm(
        [pts[i - 1].lat, pts[i - 1].lng],
        [pts[i].lat, pts[i].lng],
      ) * 1000;
    }
    let spacing = HISTORY_ARROW_SPACING_M;
    if (totalM > 0 && totalM / spacing > HISTORY_ARROW_MAX) {
      spacing = totalM / HISTORY_ARROW_MAX;
    }

    const limit = historyOverspeedLimitValue();
    const arrowSamples = [];
    let traveled = 0;
    let nextAt = spacing;

    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const segM = haversineKm([a.lat, a.lng], [b.lat, b.lng]) * 1000;
      if (segM <= 0.01) continue;
      const bearing = bearingDegrees(a.lat, a.lng, b.lat, b.lng);
      if (bearing == null) {
        traveled += segM;
        continue;
      }
      while (nextAt <= traveled + segM) {
        const t = (nextAt - traveled) / segM;
        const lat = a.lat + (b.lat - a.lat) * t;
        const lng = a.lng + (b.lng - a.lng) * t;
        const speed = a.speed + (b.speed - a.speed) * t;
        const overspeed = limit != null && speed > limit;
        arrowSamples.push({
          lat: lat,
          lng: lng,
          bearing: bearing,
          speed: speed,
          overspeed: overspeed,
          recorded_at: t < 0.5 ? a.recorded_at : b.recorded_at,
          event: null,
          marker: null,
        });
        nextAt += spacing;
      }
      traveled += segM;
    }

    const unmatchedEvents = [];
    (historyOverspeedEvents || []).forEach((ev) => {
      if (!overspeedEventHasCoords(ev)) return;
      const evLat = Number(ev.latitude);
      const evLng = Number(ev.longitude);
      let best = null;
      let bestDist = HISTORY_ARROW_OVERSPEED_MATCH_M;
      arrowSamples.forEach((sample) => {
        if (sample.event) return;
        const d = haversineKm([sample.lat, sample.lng], [evLat, evLng]) * 1000;
        if (d < bestDist) {
          bestDist = d;
          best = sample;
        }
      });
      if (best) {
        best.overspeed = true;
        best.event = ev;
        if (ev.speed_kmh != null) best.speed = Number(ev.speed_kmh);
      } else {
        unmatchedEvents.push(ev);
      }
    });

    arrowSamples.forEach((sample) => {
      const marker = L.marker([sample.lat, sample.lng], {
        icon: historyArrowIcon(sample.bearing, sample.overspeed),
        interactive: !!sample.overspeed,
        keyboard: false,
        zIndexOffset: sample.overspeed ? -40 : -120,
      });
      sample.marker = marker;
      if (sample.event) {
        const popupData = historyOverspeedPopupMarkerData(
          sample.event, sample.lat, sample.lng, sample.speed,
        );
        bindHistoryOverspeedArrowPopup(marker, popupData);
        historyLeafletMarkersByEventId[String(popupData.event_id)] = marker;
      } else if (sample.overspeed) {
        const popupData = {
          type: 'overspeed',
          event_type: 'overspeed',
          event_id: '',
          title: CONFIG.i18n.overspeed,
          recorded_at: sample.recorded_at,
          speed_kmh: sample.speed,
          speed_limit_kmh: limit,
          latitude: sample.lat,
          longitude: sample.lng,
        };
        bindHistoryOverspeedArrowPopup(marker, popupData);
      }
      marker.addTo(layer);
    });

    unmatchedEvents.forEach((ev) => {
      const lat = Number(ev.latitude);
      const lng = Number(ev.longitude);
      let bearing = 0;
      if (arrowSamples.length) {
        let nearest = arrowSamples[0];
        let best = Infinity;
        arrowSamples.forEach((sample) => {
          const d = haversineKm([sample.lat, sample.lng], [lat, lng]) * 1000;
          if (d < best) {
            best = d;
            nearest = sample;
          }
        });
        bearing = nearest.bearing || 0;
      }
      const marker = L.marker([lat, lng], {
        icon: historyArrowIcon(bearing, true),
        interactive: true,
        keyboard: false,
        zIndexOffset: -40,
      });
      const popupData = historyOverspeedPopupMarkerData(ev, lat, lng, ev.speed_kmh);
      bindHistoryOverspeedArrowPopup(marker, popupData);
      historyLeafletMarkersByEventId[String(popupData.event_id)] = marker;
      marker.addTo(layer);
    });

    return layer;
  }

  function historyPlaybackIcon(point, heading) {
    const label = historyRegistration + ' (' + Math.round(point.speed_kmh || 0) + ' kph)';
    const rot = truckRotation(heading);
    const speed = point.speed_kmh || 0;
    const statusCls = speed > 3
      ? 'live-gps-marker__truck-wrap--moving'
      : 'live-gps-marker__truck-wrap--idle';
    return L.divIcon({
      className: 'live-gps-marker live-gps-marker--history',
      html: '<div class="live-gps-marker__pin">'
        + '<div class="' + statusCls + '">'
        + '<img class="live-gps-marker__truck" src="' + TRUCK_MARKER_URL + '" alt=""'
        + ' width="' + TRUCK_W + '" height="' + TRUCK_H + '"'
        + ' style="transform:rotate(' + rot + 'deg)" />'
        + '</div>'
        + '<div class="live-gps-marker__label">' + label + '</div>'
        + '</div>',
      iconSize: [168, TRUCK_H + LABEL_H + 8],
      iconAnchor: [84, TRUCK_H / 2],
      popupAnchor: [0, POPUP_OFFSET_Y],
    });
  }

  function clearHistoryMapLayers() {
    if (!map) return;
    historyChartOverspeedHoverId = null;
    historyLeafletMarkersByEventId = {};
    resetHistoryMapFollowState();
    if (historyPathLine) {
      map.removeLayer(historyPathLine);
      historyPathLine = null;
    }
    if (historyPlayedLine) {
      map.removeLayer(historyPlayedLine);
      historyPlayedLine = null;
    }
    if (historyArrowLayer) {
      map.removeLayer(historyArrowLayer);
      historyArrowLayer = null;
    }
    if (historyMarkerLayer) {
      map.removeLayer(historyMarkerLayer);
      historyMarkerLayer = null;
    }
  }

  function historyMilestoneIcon(type) {
    const cls = 'live-gps-history-milestone live-gps-history-milestone--' + String(type || 'trip-start').replace(/_/g, '-');
    return L.divIcon({
      className: '',
      html: '<span class="' + cls + '"></span>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
  }

  function historyActivityPinGlyph(type) {
    if (type === 'source') return liveGpsIcon('geo-alt-fill', 'sm');
    if (type === 'destination') return liveGpsIcon('flag-fill', 'sm');
    if (type === 'trip_start') return liveGpsIcon('play-fill', 'sm');
    if (type === 'trip_end') return liveGpsIcon('flag-fill', 'sm');
    if (type === 'drive') return liveGpsIcon('car-front-fill', 'sm');
    if (type === 'stopped') return liveGpsIcon('sign-stop-fill', 'sm');
    if (type === 'parked') return liveGpsIcon('pause-circle-fill', 'sm');
    if (type === 'geofence_entry') return liveGpsIcon('house-fill', 'sm');
    if (type === 'geofence_exit') return liveGpsIcon('box-arrow-right', 'sm');
    if (type === 'overspeed') return liveGpsIcon('speedometer2', 'sm');
    return liveGpsIcon('circle-fill', 'xs');
  }

  function historyEventPinColor(type) {
    return HISTORY_EVENT_PIN_COLORS[type] || '#2563eb';
  }

  /** Per-type sequence for drive / stopped / parked activity cards (left panel). */
  function historyActivitySeqByEventId(events) {
    const seq = { drive: 0, stopped: 0, parked: 0 };
    const byId = {};
    (events || []).forEach((event) => {
      const type = event.type;
      if (type === 'drive' || type === 'stopped' || type === 'parked') {
        seq[type] += 1;
        if (event.id != null) byId[String(event.id)] = seq[type];
      }
    });
    return byId;
  }

  const HISTORY_PIN_ICON_W = 26;
  const HISTORY_PIN_ICON_H = 34;
  const HISTORY_ACTIVITY_PIN_COLOR = '#20b4c4';

  function historyEventPinIcon(type, seqNum) {
    const numbered = seqNum != null && seqNum > 0;
    const color = numbered ? HISTORY_ACTIVITY_PIN_COLOR : historyEventPinColor(type);
    const head = numbered
      ? '<span class="live-gps-history-pin__num">' + seqNum + '</span>'
      : historyActivityPinGlyph(type);
    const pinCls = numbered
      ? 'live-gps-history-pin live-gps-history-pin--numbered'
      : 'live-gps-history-pin';
    return L.divIcon({
      className: 'live-gps-history-pin-icon',
      html: '<div class="' + pinCls + '" style="--lg-history-pin-color:' + color + '">'
        + '<span class="live-gps-history-pin__bubble">' + head + '</span>'
        + '<span class="live-gps-history-pin__tip"></span>'
        + '</div>',
      iconSize: [HISTORY_PIN_ICON_W, HISTORY_PIN_ICON_H],
      iconAnchor: [HISTORY_PIN_ICON_W / 2, HISTORY_PIN_ICON_H],
    });
  }

  function historyPointAtIso(iso) {
    if (!iso || !historyPoints.length) return null;
    const targetTs = new Date(iso).getTime();
    if (!isFinite(targetTs)) return null;
    let best = null;
    let bestDiff = Infinity;
    for (let i = 0; i < historyPoints.length; i++) {
      const point = historyPoints[i];
      if (!historyPointHasCoords(point)) continue;
      const diff = Math.abs(new Date(point.recorded_at).getTime() - targetTs);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = point;
      }
    }
    return best;
  }

  function historyEventPosition(event) {
    if (!event) return null;
    if (event.type === 'geofence_entry' || event.type === 'geofence_exit') {
      const geo = historyGeofenceCoordsByEventId[event.id];
      if (!geo || geo.latitude == null || geo.longitude == null) return null;
      return {
        latitude: geo.latitude,
        longitude: geo.longitude,
        recorded_at: event.event_at,
      };
    }
    if (event.latitude != null && event.longitude != null) {
      return {
        latitude: event.latitude,
        longitude: event.longitude,
        recorded_at: event.started_at || event.ended_at,
        speed_kmh: event.top_speed_kmh,
      };
    }
    const iso = event.started_at || event.ended_at || event.event_at;
    const point = historyPointAtIso(iso);
    if (!point) return null;
    return {
      latitude: point.latitude,
      longitude: point.longitude,
      recorded_at: point.recorded_at,
      speed_kmh: point.speed_kmh,
    };
  }

  function historyPopupRow(label, value) {
    return '<div class="live-gps-popup__row"><strong>' + escHtml(label) + '</strong><span>' + value + '</span></div>';
  }

  function historyMarkerPopupHtml(marker) {
    const eventType = marker.event_type || marker.type;
    const title = historyActivityTitle(eventType, marker.title);
    const to = historySelectedTo || {};
    const lat = marker.latitude;
    const lng = marker.longitude;
    const posText = lat != null && lng != null
      ? escHtml(Number(lat).toFixed(6) + ', ' + Number(lng).toFixed(6))
      : '—';
    const when = marker.event_at || marker.started_at || marker.ended_at || marker.recorded_at;

    let rows = '';
    rows += historyPopupRow(CONFIG.i18n.to_number, escHtml(to.to_number || historyToNumber || '—'));
    rows += historyPopupRow(
      CONFIG.i18n.to_status,
      escHtml(to.to_status_label || to.to_status || '—'),
    );
    rows += historyPopupRow(CONFIG.i18n.source, escHtml(formatPoiLabel(to.origin_poi)));
    rows += historyPopupRow(CONFIG.i18n.destination, escHtml(formatPoiLabel(to.destination_poi)));
    if (when) {
      rows += historyPopupRow(CONFIG.i18n.time, escHtml(formatHistoryHoverTime(when)));
    }
    if (marker.started_at && marker.ended_at && marker.type === 'drive') {
      rows += historyPopupRow(CONFIG.i18n.drive_start, escHtml(formatListTime(marker.started_at)));
      rows += historyPopupRow(CONFIG.i18n.drive_end, escHtml(formatListTime(marker.ended_at)));
    } else if (marker.started_at && marker.ended_at && (marker.type === 'stopped' || marker.type === 'parked')) {
      rows += historyPopupRow(
        marker.type === 'parked' ? CONFIG.i18n.parking_start : CONFIG.i18n.stop_start,
        escHtml(formatListTime(marker.started_at)),
      );
      rows += historyPopupRow(
        marker.type === 'parked' ? CONFIG.i18n.parking_end : CONFIG.i18n.stop_end,
        escHtml(formatListTime(marker.ended_at)),
      );
    }
    if (marker.duration_seconds != null) {
      rows += historyPopupRow(CONFIG.i18n.duration, escHtml(formatDurationSeconds(marker.duration_seconds)));
    }
    if (marker.top_speed_kmh != null) {
      rows += historyPopupRow(CONFIG.i18n.top_speed, escHtml(Math.round(marker.top_speed_kmh) + ' kph'));
    }
    if (marker.route_length_km != null) {
      rows += historyPopupRow(CONFIG.i18n.route_length, escHtml(marker.route_length_km + ' Km'));
    }
    if (marker.poi_name) {
      rows += historyPopupRow(CONFIG.i18n.geofence, escHtml(marker.poi_name));
    }
    if (marker.dwell_minutes != null) {
      rows += historyPopupRow(CONFIG.i18n.duration, escHtml(String(marker.dwell_minutes) + ' min'));
    }
    if (marker.driver_name) {
      rows += historyPopupRow(CONFIG.i18n.driver, escHtml(marker.driver_name));
    }
    if (marker.speed_kmh != null) {
      rows += historyPopupRow(CONFIG.i18n.speed, escHtml(Math.round(marker.speed_kmh) + ' kph'));
    }
    if (marker.speed_limit_kmh != null) {
      rows += historyPopupRow(CONFIG.i18n.speed_limit, escHtml(Math.round(marker.speed_limit_kmh) + ' kph'));
    }
    let addrRow = '';
    if (lat != null && lng != null) {
      addrRow = '<div class="live-gps-popup__row"><strong>' + escHtml(CONFIG.i18n.address) + '</strong>'
        + '<div class="live-gps-popup__address-wrap">'
        + '<span data-field="address">' + escHtml(resolveHistoryAddressText(lat, lng)) + '</span>'
        + '<button type="button" class="live-gps-popup__eye" data-action="maps" title="' + escHtml(CONFIG.i18n.open_in_maps) + '">' + liveGpsIcon('eye-fill', 'sm') + '</button>'
        + '</div></div>';
    }
    rows += historyPopupRow(CONFIG.i18n.position, posText);

    return '<div class="live-gps-popup live-gps-popup--history" data-history-event-id="' + escHtml(String(marker.event_id || '')) + '"'
      + (lat != null && lng != null ? ' data-addr-key="' + historyAddressCacheKey(lat, lng) + '" data-lat="' + lat + '" data-lng="' + lng + '"' : '')
      + '>'
      + '<div class="live-gps-popup__head">'
      + '<div class="live-gps-popup__title">'
      + '<span class="live-gps-popup__nav-icon">' + historyActivityBadgeHtml(eventType) + '</span>'
      + '<span>' + escHtml(title) + '</span>'
      + '</div></div>'
      + '<div class="live-gps-popup__viewport"><div class="live-gps-popup__body">'
      + addrRow
      + rows
      + '</div></div></div>';
  }

  function renderHistoryMarkers() {
    if (!map) return;
    if (historyMarkerLayer) {
      map.removeLayer(historyMarkerLayer);
      historyMarkerLayer = null;
    }
    const isToDetail = historyView === 'to_detail' && historySelectedTo;
    const isIdleDetail = historyView === 'idle_detail' && historySelectedIdle;
    if (!isToDetail && !isIdleDetail) return;

    const layer = L.layerGroup();
    const toLabel = isToDetail
      ? (historySelectedTo.to_number || historyToNumber || '')
      : (CONFIG.i18n.idle || 'Idle');
    const markers = [];
    historyLeafletMarkersByEventId = {};
    const placedMarkerKeys = new Set();

    function addMarker(type, lat, lng, extra) {
      if (lat == null || lng == null) return;
      if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return;
      const extraObj = extra || {};
      const key = extraObj.event_id
        ? type + ':' + String(extraObj.event_id)
        : type + ':' + Number(lat).toFixed(5) + ':' + Number(lng).toFixed(5);
      if (placedMarkerKeys.has(key)) return;
      placedMarkerKeys.add(key);
      markers.push(Object.assign({
        type: type,
        event_type: type,
        latitude: Number(lat),
        longitude: Number(lng),
        label: toLabel,
      }, extraObj));
    }

    if (isToDetail) {
      addMarker('source', historySelectedTo.origin_poi?.latitude, historySelectedTo.origin_poi?.longitude, {
        event_id: 'history-source',
        poi_name: formatPoiLabel(historySelectedTo.origin_poi),
        title: CONFIG.i18n.source,
      });
      addMarker('destination', historySelectedTo.destination_poi?.latitude, historySelectedTo.destination_poi?.longitude, {
        event_id: 'history-destination',
        poi_name: formatPoiLabel(historySelectedTo.destination_poi),
        title: CONFIG.i18n.destination,
      });
    }

    (historySummaryEvents || []).forEach((event) => {
      if (HISTORY_ACTIVITY_CARD_ONLY_TYPES.has(event.type)) return;
      const pos = historyEventPosition(event);
      if (!pos) return;
      addMarker(event.type, pos.latitude, pos.longitude, {
        event_id: event.id,
        title: event.title,
        started_at: event.started_at,
        ended_at: event.ended_at,
        event_at: event.event_at || pos.recorded_at,
        recorded_at: pos.recorded_at,
        speed_kmh: pos.speed_kmh,
        duration_seconds: event.duration_seconds,
        top_speed_kmh: event.top_speed_kmh,
        route_length_km: event.route_length_km,
        driver_name: event.driver_name,
        poi_name: event.poi_name || event.title,
        dwell_minutes: event.dwell_minutes,
      });
    });

    // Idle windows have no lifecycle trip_start/trip_end events — bookend the
    // path with first/last GPS. TO detail already gets those from the summary
    // (lifecycle boundary); a second GPS fallback used a different event_id and
    // often landed further along the route when the true start point was
    // excluded by the effective_from window.
    if (isIdleDetail && historyPoints.length) {
      const first = historyPoints.find(historyPointHasCoords);
      const last = [...historyPoints].reverse().find(historyPointHasCoords);
      if (first) {
        addMarker('trip_start', first.latitude, first.longitude, {
          event_id: 'history-trip-start-gps',
          title: CONFIG.i18n.idle_start || CONFIG.i18n.trip_start,
          recorded_at: first.recorded_at,
          speed_kmh: first.speed_kmh,
        });
      }
      if (last) {
        addMarker('trip_end', last.latitude, last.longitude, {
          event_id: 'history-trip-end-gps',
          title: CONFIG.i18n.idle_end || CONFIG.i18n.trip_end,
          recorded_at: last.recorded_at,
          speed_kmh: last.speed_kmh,
        });
      }
    }

    markers.forEach((marker) => {
      const m = L.marker([marker.latitude, marker.longitude], {
        icon: historyEventPinIcon(marker.type),
        zIndexOffset: 900,
      });
      m.bindPopup(historyMarkerPopupHtml(marker), {
        className: 'live-gps-popup-wrap',
        maxWidth: 320,
        autoPan: false,
      });
      m.on('popupopen', () => fetchHistoryReverseAddress(marker.latitude, marker.longitude));
      m.addTo(layer);
      if (marker.event_id) {
        historyLeafletMarkersByEventId[String(marker.event_id)] = m;
      }
    });

    if (markers.length) {
      historyMarkerLayer = layer.addTo(map);
    }
  }

  function historyPathWeightsForZoom(zoom) {
    const z = Number.isFinite(zoom) ? zoom : (map ? map.getZoom() : 12);
    // Zoomed out (low z) → thicker screen-pixel stroke; street zoom → thinner.
    // Anchor: ~z8 → ~11px, z12 → ~7px, z16 → ~4px.
    const path = Math.max(
      HISTORY_PATH_WEIGHT_MIN,
      Math.min(HISTORY_PATH_WEIGHT_MAX, Math.round(19 - z)),
    );
    return { path: path, played: path + 1 };
  }

  function syncHistoryPathLineWeights() {
    if (!historyPathLine && !historyPlayedLine) return;
    const weights = historyPathWeightsForZoom(map ? map.getZoom() : 12);
    if (historyPathLine) {
      historyPathLine.setStyle({ weight: weights.path });
    }
    if (historyPlayedLine) {
      historyPlayedLine.setStyle({ weight: weights.played });
    }
  }

  function renderHistoryMapLayers() {
    if (!map) return;
    clearHistoryMapLayers();
    const latlngs = historyPathLatLngs();
    if (latlngs.length >= 2) {
      const weights = historyPathWeightsForZoom(map.getZoom());
      historyPathLine = L.polyline(latlngs, {
        color: '#93c5fd',
        weight: weights.path,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);
      historyPathLine.bringToBack();

      historyPlayedLine = L.polyline(latlngs, {
        color: '#2563eb',
        weight: weights.played,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);

      mapViewLocked = true;
      const bounds = L.latLngBounds(latlngs);
      map.fitBounds(bounds.pad(0.1), { maxZoom: 16, animate: false });
      // fitBounds may change zoom — re-sync weights to the final level.
      syncHistoryPathLineWeights();
    }
    renderHistoryMarkers();
    // Arrows after pins so overspeed popup anchors register into historyLeafletMarkersByEventId.
    if (latlngs.length >= 2) {
      historyArrowLayer = buildHistoryArrowLayer().addTo(map);
    }
    if (historyPoints.length) {
      updateHistoryMapPlayback(historyPlayIndex);
    }
    syncHistoryMapFollowButton();
  }

  function updateHistoryMapPlayback(index) {
    if (!map || !historyPoints.length) return;
    const point = historyPoints[Math.max(0, Math.min(index, historyPoints.length - 1))];
    if (!historyPointHasCoords(point)) return;

    const markerKey = historyPlaybackMarkerKey();
    if (!markerKey) return;

    // Legacy markers were keyed by trip_id before fleet-wide vehicle_id keys.
    if (historyTripId && historyTripId !== markerKey && markers[historyTripId]) {
      hideVehicleMarker(historyTripId);
      delete markers[historyTripId];
    }

    const latlng = [Number(point.latitude), Number(point.longitude)];
    const heading = historyHeadingAt(index);
    let marker = markers[markerKey];

    if (!marker) {
      marker = L.marker(latlng, { icon: historyPlaybackIcon(point, heading) });
      marker._liveGpsVehicleId = markerKey;
      markers[markerKey] = marker;
    } else {
      marker.setLatLng(latlng);
      marker.setIcon(historyPlaybackIcon(point, heading));
      marker._liveGpsVehicleId = markerKey;
    }
    marker.setZIndexOffset(1200);
    if (!map.hasLayer(marker)) marker.addTo(map);

    if (historyPlayedLine) {
      const played = historyPathLatLngsThrough(index);
      historyPlayedLine.setLatLngs(played.length >= 2 ? played : [latlng, latlng]);
    }

    const followBearing = updateHistoryFollowBearing(index);
    if (historyMapFollowActive && historyPlayTimer) {
      panHistoryMapToPlayback(latlng, followBearing);
    }
  }

  function historyPlaybackLatLng() {
    if (!historyPoints.length) return null;
    const point = historyPoints[Math.max(0, Math.min(historyPlayIndex, historyPoints.length - 1))];
    if (!historyPointHasCoords(point)) return null;
    return [Number(point.latitude), Number(point.longitude)];
  }

  function historyMapFollowBottomOcclusionPx() {
    const panel = document.getElementById('live-gps-history');
    const mapEl = map && map.getContainer();
    if (!panel || !mapEl || panel.classList.contains('is-hidden')) return 0;
    const mapRect = mapEl.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const overlap = Math.min(mapRect.bottom, panelRect.bottom) - Math.max(mapRect.top, panelRect.top);
    return Math.max(0, Math.round(overlap));
  }

  /** Bearing strictly between the previous and current playback point (null if no previous point, or stationary/identical). */
  function historyImmediateBearingAt(index) {
    if (index <= 0) return null;
    const a = historyPoints[index - 1];
    const b = historyPoints[index];
    if (!historyPointHasCoords(a) || !historyPointHasCoords(b)) return null;
    return bearingDegrees(Number(a.latitude), Number(a.longitude), Number(b.latitude), Number(b.longitude));
  }

  /** Blends a new bearing sample into a previous one via unit-vector averaging (wraps correctly through 0/360). */
  function smoothBearing(prevBearing, rawBearing, weight) {
    const prevRad = prevBearing * Math.PI / 180;
    const rawRad = rawBearing * Math.PI / 180;
    const x = (1 - weight) * Math.cos(prevRad) + weight * Math.cos(rawRad);
    const y = (1 - weight) * Math.sin(prevRad) + weight * Math.sin(rawRad);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  /**
   * Updates and returns the smoothed follow bearing for this tick. Called every tick
   * (even while follow is suspended) so smoothing stays continuous. Reuses the last
   * valid bearing when the vehicle is stationary, rather than snapping to a default.
   */
  function updateHistoryFollowBearing(index) {
    const raw = historyImmediateBearingAt(index);
    if (raw == null) return historyFollowBearing;
    historyFollowBearing = historyFollowBearing == null
      ? raw
      : smoothBearing(historyFollowBearing, raw, HISTORY_FOLLOW_BEARING_SMOOTHING);
    return historyFollowBearing;
  }

  /**
   * Shifts the pan target ahead of the vehicle in its direction of travel (screen space),
   * so the vehicle itself renders behind center with more upcoming path visible. Falls
   * back to the plain latlng (no offset) until a bearing has been established.
   */
  function historyFollowLookaheadLatLng(latlng, bearing) {
    if (!map || !latlng || bearing == null) return latlng;
    const point = map.latLngToContainerPoint(L.latLng(latlng));
    const rad = bearing * Math.PI / 180;
    const shifted = point.add(L.point(
      Math.sin(rad) * HISTORY_FOLLOW_LOOKAHEAD_PX,
      -Math.cos(rad) * HISTORY_FOLLOW_LOOKAHEAD_PX,
    ));
    return map.containerPointToLatLng(shifted);
  }

  /**
   * Pan so the vehicle sits in the upper portion of the *visible* map
   * (history chart covers the bottom). Positive Y shifts the follow target
   * south of the vehicle so it renders above screen center.
   */
  function historyMapFollowAnchorLatLng(latlng) {
    if (!map || !latlng) return latlng;
    const size = map.getSize();
    if (!size || !size.y) return latlng;
    const occlusion = historyMapFollowBottomOcclusionPx();
    const visibleH = Math.max(80, size.y - occlusion);
    // ~32% down the unobscured map — upper third, like the legacy provider.
    const desiredY = occlusion > 0 ? visibleH * 0.32 : size.y * 0.42;
    const centerY = size.y / 2;
    const offsetY = centerY - desiredY;
    if (Math.abs(offsetY) < 4) return latlng;
    const zoom = map.getZoom();
    const projected = map.project(L.latLng(latlng), zoom);
    return map.unproject(projected.add([0, offsetY]), zoom);
  }

  function panHistoryMapToPlayback(latlng, bearing) {
    if (!map || !latlng) return;
    const lookahead = historyFollowLookaheadLatLng(latlng, bearing);
    const target = historyMapFollowAnchorLatLng(lookahead);
    historyMapProgrammaticPan = true;
    if (historyMapProgrammaticPanTimer) clearTimeout(historyMapProgrammaticPanTimer);
    map.panTo(target, { animate: true, duration: 0.28, easeLinearity: 0.4 });
    const clearFlag = () => {
      historyMapProgrammaticPan = false;
      if (historyMapProgrammaticPanTimer) {
        clearTimeout(historyMapProgrammaticPanTimer);
        historyMapProgrammaticPanTimer = null;
      }
    };
    map.once('moveend', clearFlag);
    historyMapProgrammaticPanTimer = setTimeout(clearFlag, 450);
  }

  function syncHistoryMapFollowButton() {
    ensureHistoryMapFollowControl();
    if (!historyMapFollowControl || !historyMapFollowBtn) return;
    const visible = !!(historyPoints.length && (historyTripId || historyFocusVehicleId));
    historyMapFollowControl.getContainer()?.classList.toggle('is-hidden', !visible);
    const active = visible && historyMapFollowActive && !historyMapFollowUserSuspended;
    historyMapFollowBtn.classList.toggle('is-active', active);
    const label = active
      ? (CONFIG.i18n.follow_vehicle || 'Follow vehicle')
      : (CONFIG.i18n.recenter_follow || 'Recenter & follow');
    historyMapFollowBtn.title = label;
    historyMapFollowBtn.setAttribute('aria-label', label);
    historyMapFollowBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
  }

  function suspendHistoryMapFollow() {
    historyMapFollowActive = false;
    historyMapFollowUserSuspended = true;
    syncHistoryMapFollowButton();
  }

  function enableHistoryMapFollow(opts) {
    const options = opts || {};
    historyMapFollowUserSuspended = false;
    historyMapFollowActive = true;
    syncHistoryMapFollowButton();
    if (options.pan !== false) {
      const latlng = historyPlaybackLatLng();
      if (latlng) panHistoryMapToPlayback(latlng, historyFollowBearing);
    }
  }

  function resetHistoryMapFollowState() {
    historyMapFollowActive = false;
    historyMapFollowUserSuspended = false;
    historyMapProgrammaticPan = false;
    historyFollowBearing = null;
    if (historyMapProgrammaticPanTimer) {
      clearTimeout(historyMapProgrammaticPanTimer);
      historyMapProgrammaticPanTimer = null;
    }
    syncHistoryMapFollowButton();
  }

  function onHistoryMapFollowClick(e) {
    L.DomEvent.preventDefault(e);
    L.DomEvent.stopPropagation(e);
    if (!historyPoints.length) return;
    // Recenter + re-enable follow works while playing, paused, or stopped.
    enableHistoryMapFollow({ pan: true });
  }

  function ensureHistoryMapFollowControl() {
    if (!map || historyMapFollowControl) return;
    const Control = L.Control.extend({
      options: { position: 'topright' },
      onAdd() {
        const container = L.DomUtil.create('div', 'leaflet-bar live-gps-history-follow-control is-hidden');
        const btn = L.DomUtil.create('a', 'live-gps-history-follow-btn', container);
        btn.href = '#';
        btn.role = 'button';
        btn.innerHTML = liveGpsIcon('crosshair', 'sm');
        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);
        L.DomEvent.on(btn, 'click', onHistoryMapFollowClick);
        historyMapFollowBtn = btn;
        return container;
      },
    });
    historyMapFollowControl = new Control();
    historyMapFollowControl.addTo(map);
  }

  /* Play buttons show a pause glyph while the playback timer runs. */
  function syncHistoryPlayButtons() {
    const playing = !!historyPlayTimer;
    ['live-gps-history-play', 'live-gps-history-play-compact'].forEach((id) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      setLiveGpsButtonIcon(btn, playing ? 'pause-fill' : 'play-fill', 'sm');
      btn.title = playing ? CONFIG.i18n.pause : CONFIG.i18n.play;
      btn.setAttribute('aria-label', btn.title);
    });
  }

  function stopHistoryPlayback() {
    if (historyPlayTimer) {
      clearInterval(historyPlayTimer);
      historyPlayTimer = null;
    }
    syncHistoryPlayButtons();
  }

  function formatChartAxisTime(value, stepMs) {
    if (value == null) return '';
    const d = new Date(value);
    const padN = (n) => String(n).padStart(2, '0');
    let h = d.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    const base = h + ':' + padN(d.getMinutes());
    if (stepMs != null && stepMs < 60000) {
      return base + ':' + padN(d.getSeconds()) + ' ' + ampm;
    }
    return base + ' ' + ampm;
  }

  function formatHistoryHoverTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    const padN = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + padN(d.getMonth() + 1) + '-' + padN(d.getDate())
      + ' ' + padN(d.getHours()) + ':' + padN(d.getMinutes()) + ':' + padN(d.getSeconds());
  }

  /** Seek bar labels and collapsed readout — always includes seconds. */
  function formatHistorySeekTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    const padN = (n) => String(n).padStart(2, '0');
    let h = d.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + padN(d.getMinutes()) + ':' + padN(d.getSeconds()) + ' ' + ampm;
  }

  function historyReadoutText(point) {
    if (!point) return { val: '—', time: '—', timeCompact: '—' };
    return {
      val: Math.round(point.speed_kmh || 0) + ' kph',
      time: formatHistoryHoverTime(point.recorded_at),
      timeCompact: formatHistorySeekTime(point.recorded_at),
    };
  }

  function setHistoryReadout(point) {
    const text = historyReadoutText(point);
    const valEl = document.getElementById('live-gps-history-readout-val');
    const timeEl = document.getElementById('live-gps-history-readout-time');
    const valCompact = document.getElementById('live-gps-history-readout-val-compact');
    const timeCompact = document.getElementById('live-gps-history-readout-time-compact');
    if (valEl) valEl.textContent = text.val;
    if (timeEl) timeEl.textContent = text.time;
    if (valCompact) valCompact.textContent = text.val;
    if (timeCompact) timeCompact.textContent = text.timeCompact;
  }

  function isHistoryPanelCollapsed() {
    const panel = document.getElementById('live-gps-history');
    return !!panel && panel.classList.contains('is-collapsed');
  }

  function setHistoryPanelCollapsed(collapsed) {
    historyPanelCollapsed = collapsed;
    const panel = document.getElementById('live-gps-history');
    const btn = document.getElementById('live-gps-history-collapse');
    if (!panel) return;
    panel.classList.toggle('is-collapsed', collapsed);
    if (btn) {
      setLiveGpsButtonIcon(btn, collapsed ? 'chevron-up' : 'chevron-down', 'sm');
      btn.title = collapsed ? CONFIG.i18n.expand_chart : CONFIG.i18n.collapse_chart;
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }
    if (!collapsed) {
      requestAnimationFrame(() => drawHistoryChart(historyCursorX));
    } else {
      updateHistorySeekBar();
    }
    updateDockVisibility();
    requestAnimationFrame(() => refreshMapSize({ alignViewport: false, smoothLayout: true }));
  }

  function historySeekFraction(index) {
    if (!historyPoints.length) return 0;
    if (historyPoints.length === 1) return 0;
    const t0 = new Date(historyPoints[0].recorded_at).getTime();
    const t1 = new Date(historyPoints[historyPoints.length - 1].recorded_at).getTime();
    const t = new Date(historyPoints[index].recorded_at).getTime();
    const span = Math.max(t1 - t0, 1);
    return Math.max(0, Math.min(1, (t - t0) / span));
  }

  function historyIndexFromSeekFraction(fraction) {
    if (!historyPoints.length) return 0;
    if (historyPoints.length === 1) return 0;
    const t0 = new Date(historyPoints[0].recorded_at).getTime();
    const t1 = new Date(historyPoints[historyPoints.length - 1].recorded_at).getTime();
    const span = Math.max(t1 - t0, 1);
    const target = t0 + Math.max(0, Math.min(1, fraction)) * span;
    let best = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < historyPoints.length; i++) {
      const diff = Math.abs(new Date(historyPoints[i].recorded_at).getTime() - target);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    }
    return best;
  }

  function updateHistorySeekBar() {
    const fill = document.getElementById('live-gps-history-seek-fill');
    const thumb = document.getElementById('live-gps-history-seek-thumb');
    const startEl = document.getElementById('live-gps-history-seek-start');
    const endEl = document.getElementById('live-gps-history-seek-end');
    if (!historyPoints.length) {
      if (fill) fill.style.width = '0%';
      if (thumb) thumb.style.left = '0%';
      if (startEl) startEl.textContent = '—';
      if (endEl) endEl.textContent = '—';
      return;
    }
    const pct = historySeekFraction(historyPlayIndex) * 100;
    if (fill) fill.style.width = pct + '%';
    if (thumb) thumb.style.left = pct + '%';
    if (startEl) startEl.textContent = formatHistorySeekTime(historyPoints[0].recorded_at);
    if (endEl) endEl.textContent = formatHistorySeekTime(
      historyPoints[historyPoints.length - 1].recorded_at,
    );
  }

  /* Clicking a timeline card seeks the playback marker to that event, so
     the user sees exactly where the vehicle stopped/started on the map. */
  function jumpToHistoryEvent(card) {
    const eventId = card.dataset.eventId;
    if (!eventId || !historyPoints.length) return;
    const event = historySummaryEvents.find((ev) => String(ev.id || '') === String(eventId));
    if (!event) return;
    const targetTs = new Date(event.started_at || event.ended_at).getTime();
    if (!isFinite(targetTs)) return;

    let best = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < historyPoints.length; i++) {
      const diff = Math.abs(new Date(historyPoints[i].recorded_at).getTime() - targetTs);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    }

    stopHistoryPlayback();
    setHistoryPositionByIndex(best);
    const p = historyPoints[best];
    if (map && historyPointHasCoords(p)) {
      map.panTo([Number(p.latitude), Number(p.longitude)], { animate: true });
    }

    document.querySelectorAll('.live-gps-history-card.is-active').forEach((el) => {
      el.classList.remove('is-active');
    });
    card.classList.add('is-active');

    const mapMarker = historyLeafletMarkersByEventId[String(eventId)];
    if (mapMarker && map) {
      mapMarker.openPopup();
    }
  }

  function overspeedEventHasCoords(ev) {
    return ev
      && ev.latitude != null
      && ev.longitude != null
      && Number.isFinite(Number(ev.latitude))
      && Number.isFinite(Number(ev.longitude));
  }

  function closeHistoryChartOverspeedHoverPopup() {
    if (historyChartOverspeedHoverId == null) return;
    const mapMarker = historyLeafletMarkersByEventId['overspeed-' + historyChartOverspeedHoverId];
    if (mapMarker && mapMarker.isPopupOpen()) {
      mapMarker.closePopup();
    }
    historyChartOverspeedHoverId = null;
  }

  /**
   * Show the overspeed popup for a chart dot / arrow. Debounced by default so
   * fast mouse movement across dense dots doesn't thrash the map with
   * open/close/pan cycles; pass { immediate: true } for a real click.
   */
  function jumpToOverspeedEvent(ev, opts) {
    const options = opts || {};
    if (!ev) return;
    if (historyOverspeedHoverDebounceTimer) {
      clearTimeout(historyOverspeedHoverDebounceTimer);
      historyOverspeedHoverDebounceTimer = null;
    }

    const run = () => {
      stopHistoryPlayback();
      if (historyChartLayout && ev.recorded_at && !isHistoryPanelCollapsed()) {
        const cx = historyXAtTime(ev.recorded_at, historyChartLayout);
        historyCursorX = cx;
        drawHistoryChart(cx);
        ensureHistoryChartCursorVisible(historyChartLayout, cx);
      }
      setHistoryReadout({
        recorded_at: ev.recorded_at,
        speed_kmh: ev.speed_kmh,
        latitude: ev.latitude,
        longitude: ev.longitude,
      });
      if (historyChartOverspeedHoverId != null && String(historyChartOverspeedHoverId) !== String(ev.id)) {
        closeHistoryChartOverspeedHoverPopup();
      }
      const mapMarker = historyLeafletMarkersByEventId['overspeed-' + ev.id];
      if (mapMarker && map) {
        historyChartOverspeedHoverId = ev.id;
        setHistoryPopupAutoPan(mapMarker, !!options.immediate);
        mapMarker.openPopup();
      }
    };

    if (options.immediate) {
      run();
    } else {
      historyOverspeedHoverDebounceTimer = setTimeout(() => {
        historyOverspeedHoverDebounceTimer = null;
        run();
      }, HISTORY_OVERSPEED_HOVER_DEBOUNCE_MS);
    }
  }

  function setHistoryPositionByIndex(index, options) {
    const opts = options || {};
    if (!historyPoints.length) return;
    const i = Math.max(0, Math.min(historyPoints.length - 1, Math.round(index)));
    historyPlayIndex = i;
    setHistoryReadout(historyPoints[i]);
    updateHistorySeekBar();
    updateHistoryMapPlayback(i);
    if (!isHistoryPanelCollapsed()) {
      if (historyChartLayout) {
        const cx = historyXAt(i, historyChartLayout);
        historyCursorX = cx;
        if (opts.redrawChart !== false) drawHistoryChart(cx);
      } else if (opts.redrawChart !== false) {
        drawHistoryChart(null);
      }
    }
  }

  function historySeekFractionFromClientX(clientX) {
    const track = document.getElementById('live-gps-history-seek-track');
    if (!track) return null;
    const rect = track.getBoundingClientRect();
    if (!rect.width) return null;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }

  function historyNiceTimeStep(spanMs, targetTicks) {
    const ticks = Math.max(2, targetTicks || 8);
    const raw = spanMs / ticks;
    const steps = [
      1000, 2000, 5000, 10000, 15000, 30000,
      60000, 120000, 180000, 300000, 600000, 900000,
      1800000, 3600000, 7200000, 10800000, 21600000, 43200000, 86400000,
    ];
    for (let i = 0; i < steps.length; i++) {
      if (steps[i] >= raw) return steps[i];
    }
    return steps[steps.length - 1];
  }

  function historyChartBasePlotWidth(viewportPlotW) {
    const pointCount = historyPoints.length;
    if (pointCount < 2) return Math.max(0, viewportPlotW);
    return Math.max(0, pointCount - 1) * HISTORY_CHART_TARGET_PX_PER_POINT;
  }

  function historyChartZoomLimits(viewportWidth) {
    const padLeft = 40;
    const padRight = 12;
    const viewportPlotW = Math.max(0, (viewportWidth || 0) - padLeft - padRight);
    const basePlotW = historyChartBasePlotWidth(viewportPlotW);
    // Floor: content never narrower than the viewport (may be > 1 for short trips).
    const minZoom = basePlotW > 0 ? (viewportPlotW / basePlotW) : 1;
    // Cap: adjacent samples stretch at most MAX_PX_PER_POINT (zoom 1 = TARGET px/point).
    const maxZoom = Math.max(
      minZoom,
      Math.min(HISTORY_CHART_MAX_PX_PER_POINT / HISTORY_CHART_TARGET_PX_PER_POINT, 64)
    );
    return { minZoom, maxZoom, basePlotW, viewportPlotW };
  }

  function computeHistoryChartDefaultZoom(viewportWidth) {
    // Prefer zoom 1.0 (TARGET px/point); clamp into [min, max] for this trip/viewport.
    const { minZoom, maxZoom } = historyChartZoomLimits(viewportWidth);
    return Math.max(minZoom, Math.min(maxZoom, 1));
  }

  function syncHistoryChartZoomButtons() {
    const wrap = document.getElementById('live-gps-history-chart-wrap');
    const viewportWidth = wrap ? wrap.clientWidth : 0;
    const { minZoom, maxZoom } = historyChartZoomLimits(viewportWidth);
    const zoomIn = document.getElementById('live-gps-history-zoom-in');
    const zoomOut = document.getElementById('live-gps-history-zoom-out');
    const zoomReset = document.getElementById('live-gps-history-zoom-reset');
    if (zoomIn) zoomIn.disabled = !historyPoints.length || historyChartZoom >= maxZoom - 1e-6;
    if (zoomOut) zoomOut.disabled = !historyPoints.length || historyChartZoom <= minZoom + 1e-6;
    if (zoomReset) zoomReset.disabled = !historyPoints.length;
  }

  function initHistoryChartZoomForLoadedData() {
    const wrap = document.getElementById('live-gps-history-chart-wrap');
    const viewportWidth = wrap ? wrap.clientWidth : 0;
    historyChartDefaultZoom = computeHistoryChartDefaultZoom(viewportWidth);
    historyChartZoom = historyChartDefaultZoom;
    syncHistoryChartZoomButtons();
  }

  /**
   * @param {number} nextZoom
   * @param {{ anchorRatio?: number, anchorClientX?: number }} [opts]
   */
  function setHistoryChartZoom(nextZoom, opts) {
    const options = opts || {};
    const wrap = document.getElementById('live-gps-history-chart-wrap');
    if (!wrap || !historyPoints.length) return;

    const viewportWidth = wrap.clientWidth;
    const { minZoom, maxZoom } = historyChartZoomLimits(viewportWidth);
    const clamped = Math.max(minZoom, Math.min(maxZoom, nextZoom));
    if (Math.abs(clamped - historyChartZoom) < 1e-6) {
      syncHistoryChartZoomButtons();
      return;
    }

    const oldContentWidth = historyChartLayout
      ? historyChartLayout.contentWidth
      : Math.max(viewportWidth, 1);
    let anchorRatio;
    let anchorOffsetInView = viewportWidth / 2;
    if (options.anchorClientX != null) {
      const wrapRect = wrap.getBoundingClientRect();
      anchorOffsetInView = options.anchorClientX - wrapRect.left;
      const contentX = wrap.scrollLeft + anchorOffsetInView;
      anchorRatio = Math.max(0, Math.min(1, contentX / oldContentWidth));
    } else if (options.anchorRatio != null) {
      anchorRatio = options.anchorRatio;
    } else {
      anchorRatio = (wrap.scrollLeft + viewportWidth / 2) / oldContentWidth;
    }

    suspendHistoryChartFollow();
    historyChartZoom = clamped;
    drawHistoryChart(historyCursorX);
    const newWidth = historyChartLayout ? historyChartLayout.contentWidth : oldContentWidth;
    const maxScroll = Math.max(0, newWidth - viewportWidth);
    wrap.scrollLeft = Math.max(
      0,
      Math.min(maxScroll, anchorRatio * newWidth - anchorOffsetInView)
    );
    syncHistoryChartZoomButtons();
    scheduleHistoryChartFollowResume();
  }

  function historyChartZoomIn() {
    setHistoryChartZoom(historyChartZoom * HISTORY_CHART_ZOOM_STEP);
  }

  function historyChartZoomOut() {
    setHistoryChartZoom(historyChartZoom / HISTORY_CHART_ZOOM_STEP);
  }

  function historyChartZoomReset() {
    setHistoryChartZoom(historyChartDefaultZoom);
  }

  function buildHistoryChartLayout(viewportWidth, height) {
    // Room for time labels below the plot — HTML seekbar sits in its own row under the canvas.
    const pad = { top: 16, right: 12, bottom: 38, left: 40 };
    const pointCount = historyPoints.length;
    const viewportPlotW = Math.max(0, viewportWidth - pad.left - pad.right);
    const basePlotW = historyChartBasePlotWidth(viewportPlotW);
    const { minZoom, maxZoom } = historyChartZoomLimits(viewportWidth);
    const zoom = Math.max(minZoom, Math.min(maxZoom, historyChartZoom));
    if (zoom !== historyChartZoom) historyChartZoom = zoom;
    const plotW = Math.max(viewportPlotW, basePlotW * zoom);
    const contentWidth = pad.left + plotW + pad.right;
    const plotH = height - pad.top - pad.bottom;
    const values = historyPoints.map(p => (p.speed_kmh || 0));
    const rawMax = Math.max.apply(null, values.concat([0]));
    const yStep = 10;
    const yMax = Math.max(40, Math.ceil(rawMax / yStep) * yStep);
    const t0 = new Date(historyPoints[0].recorded_at).getTime();
    const t1 = new Date(historyPoints[historyPoints.length - 1].recorded_at).getTime();
    const tSpan = Math.max(t1 - t0, 1);
    const targetTicks = Math.max(4, Math.floor(plotW / HISTORY_CHART_LABEL_MIN_PX));
    const timeStep = historyNiceTimeStep(tSpan, targetTicks);
    const baseY = pad.top + plotH;
    return {
      pad,
      plotW,
      plotH,
      viewportWidth,
      contentWidth,
      height,
      values,
      yMax,
      yStep,
      t0,
      t1,
      tSpan,
      timeStep,
      baseY,
      zoom,
      scrollable: contentWidth > viewportWidth + 1,
    };
  }

  function suspendHistoryChartFollow() {
    historyChartFollowSuspended = true;
    if (historyChartFollowResumeTimer) {
      clearTimeout(historyChartFollowResumeTimer);
      historyChartFollowResumeTimer = null;
    }
  }

  function scheduleHistoryChartFollowResume() {
    if (historyChartFollowResumeTimer) clearTimeout(historyChartFollowResumeTimer);
    historyChartFollowResumeTimer = setTimeout(() => {
      historyChartFollowResumeTimer = null;
      historyChartFollowSuspended = false;
      if (historyChartLayout && historyCursorX != null && historyPlayTimer) {
        ensureHistoryChartCursorVisible(historyChartLayout, historyCursorX);
      }
    }, HISTORY_CHART_FOLLOW_RESUME_MS);
  }

  function ensureHistoryChartCursorVisible(layout, cursorX) {
    const wrap = document.getElementById('live-gps-history-chart-wrap');
    if (!wrap || !layout?.scrollable || cursorX == null) return;
    if (historyChartDragging || historyChartFollowSuspended) return;
    const margin = 56;
    const viewW = wrap.clientWidth;
    const scroll = wrap.scrollLeft;
    if (cursorX < scroll + margin) {
      wrap.scrollLeft = Math.max(0, cursorX - margin);
    } else if (cursorX > scroll + viewW - margin) {
      wrap.scrollLeft = Math.min(layout.contentWidth - viewW, cursorX - viewW + margin);
    }
  }

  function historyXAt(i, layout) {
    const t = new Date(historyPoints[i].recorded_at).getTime();
    return layout.pad.left + ((t - layout.t0) / layout.tSpan) * layout.plotW;
  }

  function historyXAtTime(iso, layout) {
    const t = new Date(iso).getTime();
    return layout.pad.left + ((t - layout.t0) / layout.tSpan) * layout.plotW;
  }

  function historyYAt(v, layout) {
    return layout.pad.top + layout.plotH - (v / layout.yMax) * layout.plotH;
  }

  function historyIndexAtX(cx, layout) {
    if (!layout || !historyPoints.length) return historyPoints.length - 1;
    const clamped = Math.max(layout.pad.left, Math.min(layout.pad.left + layout.plotW, cx));
    let nearest = 0;
    let best = Infinity;
    historyPoints.forEach((p, i) => {
      const dx = Math.abs(historyXAt(i, layout) - clamped);
      if (dx < best) { best = dx; nearest = i; }
    });
    return nearest;
  }

  function historyCursorXFromClient(clientX) {
    const canvas = document.getElementById('live-gps-history-canvas');
    if (!canvas || !historyChartLayout) return null;
    const rect = canvas.getBoundingClientRect();
    return clientX - rect.left;
  }

  function historyChartCoordsFromClient(clientX, clientY) {
    const canvas = document.getElementById('live-gps-history-canvas');
    if (!canvas || !historyChartLayout) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function historyOverspeedHitAt(clientX, clientY) {
    const coords = historyChartCoordsFromClient(clientX, clientY);
    if (!coords || !historyOverspeedHitTargets.length) return null;
    let best = null;
    let bestDist = Infinity;
    const hitPad = 4;
    historyOverspeedHitTargets.forEach((target) => {
      const dx = coords.x - target.x;
      const dy = coords.y - target.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const threshold = target.r + hitPad;
      if (dist <= threshold && dist < bestDist) {
        bestDist = dist;
        best = target;
      }
    });
    return best;
  }

  function drawHistoryChart(cursorX) {
    const wrap = document.getElementById('live-gps-history-chart-wrap');
    const canvas = document.getElementById('live-gps-history-canvas');
    const empty = document.getElementById('live-gps-history-empty');
    if (!wrap || !canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const viewportWidth = wrap.clientWidth;
    const height = Math.max(140, wrap.clientHeight);

    if (!historyPoints.length) {
      historyChartLayout = null;
      historyOverspeedHitTargets = [];
      wrap.scrollLeft = 0;
      canvas.width = Math.floor(viewportWidth * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = viewportWidth + 'px';
      canvas.style.height = height + 'px';
      const ctxEmpty = canvas.getContext('2d');
      if (ctxEmpty) {
        ctxEmpty.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctxEmpty.clearRect(0, 0, viewportWidth, height);
      }
      empty?.classList.remove('is-hidden');
      setHistoryReadout(null);
      syncHistoryChartZoomButtons();
      return;
    }
    empty?.classList.add('is-hidden');

    const layout = buildHistoryChartLayout(viewportWidth, height);
    historyChartLayout = layout;
    const width = layout.contentWidth;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const { pad, plotW, plotH, values, yMax, yStep, t0, tSpan, timeStep, baseY } = layout;
    const theme = historyChartTheme();
    const accent = theme.accent;
    const accentSoft = theme.accentSoft;
    // Sit labels clearly under the axis, inside pad.bottom (not against the seek row).
    const labelY = baseY + 8;

    ctx.fillStyle = theme.plotBg;
    ctx.fillRect(pad.left, pad.top, plotW, plotH);

    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = theme.label;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';

    for (let val = 0; val <= yMax; val += yStep) {
      const y = historyYAt(val, layout);
      ctx.setLineDash(val === 0 ? [] : [4, 5]);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      if (val > 0) {
        ctx.fillText(String(val), pad.left - 6, y + 3);
      }
    }

    const firstTick = Math.ceil(t0 / timeStep) * timeStep;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = theme.label;
    let lastLabelText = '';
    let lastLabelX = -Infinity;
    for (let tick = firstTick; tick <= layout.t1; tick += timeStep) {
      const x = pad.left + ((tick - t0) / tSpan) * plotW;
      const label = formatChartAxisTime(tick, timeStep);
      if (!label || label === lastLabelText) continue;
      if (x - lastLabelX < HISTORY_CHART_LABEL_MIN_PX * 0.55) continue;
      ctx.fillText(label, x, labelY);
      lastLabelText = label;
      lastLabelX = x;
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '10px system-ui, sans-serif';

    const grad = ctx.createLinearGradient(0, pad.top, 0, baseY);
    grad.addColorStop(0, accentSoft);
    grad.addColorStop(1, theme.fillFade);

    ctx.beginPath();
    historyPoints.forEach((p, i) => {
      const x = historyXAt(i, layout);
      const y = historyYAt(values[i], layout);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(historyXAt(historyPoints.length - 1, layout), baseY);
    ctx.lineTo(historyXAt(0, layout), baseY);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    historyPoints.forEach((p, i) => {
      const x = historyXAt(i, layout);
      const y = historyYAt(values[i], layout);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    historyOverspeedHitTargets = [];
    if (historyOverspeedEvents.length) {
      historyOverspeedEvents.forEach((ev) => {
        const speed = Number(ev.speed_kmh);
        if (!isFinite(speed)) return;
        const x = historyXAtTime(ev.recorded_at, layout);
        if (x < pad.left || x > pad.left + plotW) return;
        const y = historyYAt(speed, layout);
        const r = 5;
        ctx.fillStyle = theme.overspeed;
        ctx.strokeStyle = theme.dotStroke;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        historyOverspeedHitTargets.push({ x: x, y: y, r: r, event: ev });
      });
    }

    let cx = cursorX;
    if (cx == null) cx = historyXAt(historyPoints.length - 1, layout);
    const nearest = historyIndexAtX(cx, layout);
    historyPlayIndex = nearest;
    const nx = historyXAt(nearest, layout);
    const ny = historyYAt(values[nearest], layout);

    // Vertical playhead on the speed chart (HTML seekbar below is the scrub control).
    ctx.strokeStyle = theme.overspeed;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(nx, pad.top);
    ctx.lineTo(nx, baseY);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = accent;
    ctx.strokeStyle = theme.dotStroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(nx, ny, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    setHistoryReadout(historyPoints[nearest]);
    historyCursorX = nx;
    ensureHistoryChartCursorVisible(layout, nx);
    updateHistoryMapPlayback(nearest);
    updateHistorySeekBar();
    syncHistoryChartZoomButtons();
  }

  function armHistoryPlayTimer() {
    if (historyPlayTimer) clearInterval(historyPlayTimer);
    historyPlayTimer = setInterval(() => {
      if (!historyPoints.length) return stopHistoryPlayback();
      const next = historyPlayIndex + 1;
      if (next >= historyPoints.length) {
        setHistoryPositionByIndex(historyPoints.length - 1);
        return stopHistoryPlayback();
      }
      setHistoryPositionByIndex(next);
    }, HISTORY_PLAY_BASE_MS / historyPlaySpeed);
  }

  function startHistoryPlayback() {
    stopHistoryPlayback();
    if (!historyPoints.length) return;
    // Resume mid-track (e.g. after pausing or jumping to an event);
    // restart from the beginning once the end is reached.
    if (historyPlayIndex >= historyPoints.length - 1) {
      setHistoryPositionByIndex(0);
    }
    if (!historyMapFollowUserSuspended) {
      enableHistoryMapFollow({ pan: true });
    } else {
      syncHistoryMapFollowButton();
    }
    armHistoryPlayTimer();
    syncHistoryPlayButtons();
  }

  /* Play button doubles as pause while playback is running. */
  function toggleHistoryPlayback() {
    if (historyPlayTimer) {
      stopHistoryPlayback();
    } else {
      startHistoryPlayback();
    }
  }

  /* Stop = pause and rewind, so the next play starts from the beginning. */
  function resetHistoryPlayback() {
    stopHistoryPlayback();
    // Fresh Stop clears a user suspend so the next Play auto-follows again.
    historyMapFollowUserSuspended = false;
    historyMapFollowActive = false;
    historyFollowBearing = null;
    syncHistoryMapFollowButton();
    if (!historyPoints.length) return;
    setHistoryPositionByIndex(0, { redrawChart: !isHistoryPanelCollapsed() });
  }

  function cycleHistoryPlaySpeed() {
    const i = HISTORY_PLAY_SPEEDS.indexOf(historyPlaySpeed);
    historyPlaySpeed = HISTORY_PLAY_SPEEDS[(i + 1) % HISTORY_PLAY_SPEEDS.length];
    ['live-gps-history-speed', 'live-gps-history-speed-compact'].forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) btn.textContent = historyPlaySpeed + 'x';
    });
    if (historyPlayTimer) armHistoryPlayTimer();
  }

  function bindHistoryChartInteraction() {
    const wrap = document.getElementById('live-gps-history-chart-wrap');
    if (!wrap || wrap._historyChartBound) return;
    wrap._historyChartBound = true;

    function scrubTo(clientX, clientY, opts) {
      const hit = historyOverspeedHitAt(clientX, clientY);
      if (hit) {
        if (String(historyChartOverspeedHoverId) !== String(hit.event.id)) {
          jumpToOverspeedEvent(hit.event, opts);
        }
        return;
      }
      if (historyOverspeedHoverDebounceTimer) {
        clearTimeout(historyOverspeedHoverDebounceTimer);
        historyOverspeedHoverDebounceTimer = null;
      }
      closeHistoryChartOverspeedHoverPopup();
      const cx = historyCursorXFromClient(clientX);
      if (cx == null) return;
      drawHistoryChart(cx);
    }

    function endChartDrag(e) {
      if (!historyChartDragging) {
        if (e && e.type === 'pointerleave') closeHistoryChartOverspeedHoverPopup();
        return;
      }
      if (e && historyChartDragPointerId != null && e.pointerId !== historyChartDragPointerId) return;
      const wasDrag = historyChartDragDistance >= HISTORY_CHART_DRAG_CLICK_THRESHOLD_PX;
      const isClickEnd = e && e.type === 'pointerup';
      const clientX = e ? e.clientX : null;
      const clientY = e ? e.clientY : null;
      if (e && wrap.hasPointerCapture(e.pointerId)) wrap.releasePointerCapture(e.pointerId);
      historyChartDragging = false;
      historyChartDragPointerId = null;
      wrap.classList.remove('is-dragging');
      scheduleHistoryChartFollowResume();
      if (isClickEnd && !wasDrag && clientX != null && historyPoints.length) {
        stopHistoryPlayback();
        scrubTo(clientX, clientY, { immediate: true });
      }
      if (e && (e.type === 'pointerleave' || e.type === 'pointercancel')) {
        closeHistoryChartOverspeedHoverPopup();
      }
    }

    wrap.addEventListener('pointerdown', (e) => {
      if (!historyPoints.length || e.button > 0) return;
      suspendHistoryChartFollow();
      historyChartDragging = true;
      historyChartDragPointerId = e.pointerId;
      historyChartDragStartX = e.clientX;
      historyChartDragLastX = e.clientX;
      historyChartDragStartScroll = wrap.scrollLeft;
      historyChartDragDistance = 0;
      wrap.classList.add('is-dragging');
      wrap.setPointerCapture(e.pointerId);
    });

    wrap.addEventListener('pointermove', (e) => {
      if (!historyPoints.length) return;
      if (historyChartDragging) {
        if (historyChartDragPointerId != null && e.pointerId !== historyChartDragPointerId) return;
        const dx = historyChartDragStartX - e.clientX;
        historyChartDragDistance += Math.abs(e.clientX - historyChartDragLastX);
        historyChartDragLastX = e.clientX;
        wrap.scrollLeft = historyChartDragStartScroll + dx;
        if (historyChartDragDistance >= HISTORY_CHART_DRAG_CLICK_THRESHOLD_PX) {
          closeHistoryChartOverspeedHoverPopup();
        }
        return;
      }
      if (historyPlayTimer) return;
      scrubTo(e.clientX, e.clientY);
    });

    wrap.addEventListener('pointerleave', (e) => {
      endChartDrag(e);
    });

    wrap.addEventListener('pointerup', (e) => {
      endChartDrag(e);
    });

    wrap.addEventListener('pointercancel', (e) => {
      endChartDrag(e);
      closeHistoryChartOverspeedHoverPopup();
    });

    wrap.addEventListener('wheel', (e) => {
      if (!e.ctrlKey || !historyPoints.length) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? HISTORY_CHART_ZOOM_STEP : (1 / HISTORY_CHART_ZOOM_STEP);
      setHistoryChartZoom(historyChartZoom * factor, { anchorClientX: e.clientX });
    }, { passive: false });
  }

  function bindHistorySeekBar() {
    const track = document.getElementById('live-gps-history-seek-track');
    const thumb = document.getElementById('live-gps-history-seek-thumb');
    if (!track || track._historySeekBound) return;
    track._historySeekBound = true;
    let seekPointerId = null;

    function scrubSeek(clientX) {
      const fraction = historySeekFractionFromClientX(clientX);
      if (fraction == null) return;
      setHistoryPositionByIndex(historyIndexFromSeekFraction(fraction), {
        redrawChart: !isHistoryPanelCollapsed(),
      });
    }

    function startSeek(e) {
      if (!historyPoints.length || e.button > 0) return;
      e.preventDefault();
      e.stopPropagation();
      historySeekScrubbing = true;
      seekPointerId = e.pointerId;
      track.classList.add('is-scrubbing');
      try { track.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      stopHistoryPlayback();
      scrubSeek(e.clientX);
    }

    function moveSeek(e) {
      if (!historySeekScrubbing || !historyPoints.length) return;
      if (seekPointerId != null && e.pointerId !== seekPointerId) return;
      e.preventDefault();
      scrubSeek(e.clientX);
    }

    function endSeek(e) {
      if (!historySeekScrubbing) return;
      if (e && seekPointerId != null && e.pointerId !== seekPointerId) return;
      if (e && track.hasPointerCapture(e.pointerId)) {
        try { track.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      }
      historySeekScrubbing = false;
      seekPointerId = null;
      track.classList.remove('is-scrubbing');
    }

    track.addEventListener('pointerdown', startSeek);
    if (thumb) thumb.addEventListener('pointerdown', startSeek);
    track.addEventListener('pointermove', moveSeek);
    track.addEventListener('pointerup', endSeek);
    track.addEventListener('pointercancel', endSeek);
    window.addEventListener('pointerup', endSeek);
    window.addEventListener('pointercancel', endSeek);
  }

  function toDatetimeLocalValue(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
      + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function datetimeLocalToIso(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  function historyStartOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function historyEndOfDay(d) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  }

  function historyDateKey(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function historyParseDateKey(key) {
    const parts = key.split('-').map(Number);
    return historyStartOfDay(new Date(parts[0], parts[1] - 1, parts[2]));
  }

  function historySameDay(a, b) {
    return a && b && historyDateKey(a) === historyDateKey(b);
  }

  function historyMonthTitle(d) {
    return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  }

  function formatHistoryCalDay(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return pad(d.getDate()) + '-' + pad(d.getMonth() + 1) + '-' + d.getFullYear();
  }

  function historyPad2(n) {
    return String(n).padStart(2, '0');
  }

  function formatLegacyTimeDisplay(h, m) {
    const ampm = h >= 12 ? 'PM' : 'AM';
    let hour = h % 12;
    if (hour === 0) hour = 12;
    return hour + ':' + historyPad2(m) + ' ' + ampm;
  }

  function formatLegacyDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return formatHistoryCalDay(d) + ' ' + formatLegacyTimeDisplay(d.getHours(), d.getMinutes());
  }

  function formatLegacyDateRangeLabel(fromIso, toIso) {
    if (!fromIso || !toIso) return '';
    return formatLegacyDateTime(fromIso) + ' - ' + formatLegacyDateTime(toIso);
  }

  function updateHistoryRangeBoxes() {
    const placeholder = CONFIG.i18n.select_date;

    function fillBox(boxId, dateId, timeId, iso) {
      const box = document.getElementById(boxId);
      const dateEl = document.getElementById(dateId);
      const timeEl = document.getElementById(timeId);
      if (!box || !dateEl || !timeEl) return;
      if (!iso) {
        box.classList.add('is-placeholder');
        dateEl.textContent = placeholder;
        timeEl.textContent = '';
        return;
      }
      const d = new Date(iso);
      box.classList.remove('is-placeholder');
      dateEl.textContent = formatHistoryCalDay(d);
      timeEl.textContent = formatLegacyTimeDisplay(d.getHours(), d.getMinutes());
    }

    if (historyRangeFromIso && historyRangeToIso) {
      fillBox('live-gps-history-from-box', 'live-gps-history-from-date', 'live-gps-history-from-time', historyRangeFromIso);
      fillBox('live-gps-history-to-box', 'live-gps-history-to-date', 'live-gps-history-to-time', historyRangeToIso);
      return;
    }

    if (historyCalStart) {
      const endDay = historyCalEnd || historyCalStart;
      const from = combineHistoryDateAndTime(historyCalStart, historyTimeFrom, false);
      const to = combineHistoryDateAndTime(endDay, historyTimeTo, true);
      fillBox('live-gps-history-from-box', 'live-gps-history-from-date', 'live-gps-history-from-time', from.toISOString());
      fillBox('live-gps-history-to-box', 'live-gps-history-to-date', 'live-gps-history-to-time', to.toISOString());
      return;
    }

    fillBox('live-gps-history-from-box', 'live-gps-history-from-date', 'live-gps-history-from-time', null);
    fillBox('live-gps-history-to-box', 'live-gps-history-to-date', 'live-gps-history-to-time', null);
  }

  function parseLegacyTimeInput(str) {
    const m = String(str || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ap = m[3].toUpperCase();
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return { h, m: min };
  }

  function parseLegacyDateInput(str) {
    const m = String(str || '').trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (!m) return null;
    return historyStartOfDay(new Date(+m[3], +m[2] - 1, +m[1]));
  }

  function historyTimeParts(timeStr) {
    const legacy = parseLegacyTimeInput(timeStr);
    if (legacy) return legacy;
    const parts = (timeStr || '00:00').split(':').map(Number);
    return { h: parts[0] || 0, m: parts[1] || 0 };
  }

  function combineHistoryDateAndTime(day, timeStr, isEnd) {
    const { h, m } = historyTimeParts(timeStr);
    const d = new Date(day);
    d.setHours(h, m, isEnd ? 59 : 0, isEnd ? 999 : 0);
    return d;
  }

  function syncHistoryDateInputsFromState() {
    const fromDay = historyCalStart;
    const toDay = historyCalEnd || historyCalStart;
    const dateFrom = document.getElementById('live-gps-history-date-from');
    const dateTo = document.getElementById('live-gps-history-date-to');
    const timeFrom = document.getElementById('live-gps-history-time-from');
    const timeTo = document.getElementById('live-gps-history-time-to');
    if (dateFrom) dateFrom.value = fromDay ? formatHistoryCalDay(fromDay) : '';
    if (dateTo) dateTo.value = toDay ? formatHistoryCalDay(toDay) : '';
    const fromParts = historyTimeParts(historyTimeFrom || '12:00 AM');
    const toParts = historyTimeParts(historyTimeTo || '11:59 PM');
    if (timeFrom) timeFrom.value = formatLegacyTimeDisplay(fromParts.h, fromParts.m);
    if (timeTo) timeTo.value = formatLegacyTimeDisplay(toParts.h, toParts.m);
  }

  function readHistoryDateInputsFromDom() {
    const fromDay = parseLegacyDateInput(document.getElementById('live-gps-history-date-from')?.value);
    const toDay = parseLegacyDateInput(document.getElementById('live-gps-history-date-to')?.value);
    const fromTime = document.getElementById('live-gps-history-time-from')?.value;
    const toTime = document.getElementById('live-gps-history-time-to')?.value;
    if (fromDay) historyCalStart = fromDay;
    if (toDay) {
      historyCalEnd = toDay;
      if (historyCalStart && historySameDay(historyCalStart, historyCalEnd)) historyCalEnd = null;
    }
    if (fromTime) historyTimeFrom = fromTime;
    if (toTime) historyTimeTo = toTime;
  }

  function buildHistoryRangeFromDraft() {
    readHistoryDateInputsFromDom();
    if (!historyCalStart) return { fromIso: null, toIso: null };
    const endDay = historyCalEnd || historyCalStart;
    const now = new Date();
    let from = combineHistoryDateAndTime(historyCalStart, historyTimeFrom, false);
    let to = combineHistoryDateAndTime(endDay, historyTimeTo, true);
    if (from > now) from = now;
    if (to > now) to = now;
    if (from >= to) {
      if (historySameDay(historyCalStart, endDay)) {
        to = historySameDay(endDay, now) ? now : historyEndOfDay(endDay);
      } else {
        return { fromIso: null, toIso: null };
      }
    }
    return { fromIso: from.toISOString(), toIso: to.toISOString() };
  }

  function setHistoryDateTimeRange(fromIso, toIso) {
    if (!fromIso || !toIso) return;
    const from = new Date(fromIso);
    const to = new Date(toIso);
    historyRangeFromIso = from.toISOString();
    historyRangeToIso = to.toISOString();
    historyCalStart = historyStartOfDay(from);
    historyCalEnd = historySameDay(from, to) ? null : historyStartOfDay(to);
    historyTimeFrom = formatLegacyTimeDisplay(from.getHours(), from.getMinutes());
    historyTimeTo = formatLegacyTimeDisplay(to.getHours(), to.getMinutes());
    historyCalMonth = new Date(from.getFullYear(), from.getMonth(), 1);
    syncHistoryDateInputsFromState();
    renderHistoryDualCalendar();
    updateHistoryRangeBoxes();
  }

  /* Highlight the matching quick-range pill (null clears all, e.g. custom date). */
  function setHistoryPresetActive(rangeKey) {
    document.querySelectorAll('#live-gps-history-presets .live-gps-history-preset').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.range === rangeKey);
    });
  }

  function applyHistoryRangeFromPreset(rangeKey) {
    const now = new Date();
    if (rangeKey === 'last_hour') {
      const from = new Date(now.getTime() - 3600000);
      setHistoryDateTimeRange(from.toISOString(), now.toISOString());
      setHistoryPresetActive('last_hour');
      return;
    }
    if (rangeKey === 'today') {
      setHistoryDateTimeRange(historyStartOfDay(now).toISOString(), now.toISOString());
      setHistoryPresetActive('today');
      return;
    }
    if (rangeKey === 'yesterday') {
      const end = historyStartOfDay(now);
      const start = new Date(end);
      start.setDate(start.getDate() - 1);
      const yEnd = new Date(end.getTime() - 1);
      setHistoryDateTimeRange(start.toISOString(), yEnd.toISOString());
      setHistoryPresetActive('yesterday');
      return;
    }
    setHistoryDateTimeRange(historyStartOfDay(now).toISOString(), now.toISOString());
    setHistoryPresetActive('today');
  }

  function formatHistoryTripWindowCompact(fromIso, toIso) {
    if (!fromIso || !toIso) return '—';
    const from = new Date(fromIso);
    const to = new Date(toIso);
    const fromDay = from.toLocaleString(undefined, { day: 'numeric', month: 'short' });
    const fromTime = formatLegacyTimeDisplay(from.getHours(), from.getMinutes());
    const toTime = formatLegacyTimeDisplay(to.getHours(), to.getMinutes());
    if (historySameDay(from, to)) {
      return fromDay + ' ' + fromTime + ' – ' + toTime;
    }
    const toDay = to.toLocaleString(undefined, { day: 'numeric', month: 'short' });
    return fromDay + ' ' + fromTime + ' – ' + toDay + ' ' + toTime;
  }

  function snapshotHistoryDateState() {
    return {
      historyCalStart: historyCalStart ? new Date(historyCalStart) : null,
      historyCalEnd: historyCalEnd ? new Date(historyCalEnd) : null,
      historyTimeFrom,
      historyTimeTo,
      historyRangeFromIso,
      historyRangeToIso,
      historyCalMonth: historyCalMonth ? new Date(historyCalMonth) : null,
    };
  }

  function restoreHistoryDateSnapshot(snap) {
    if (!snap) return;
    historyCalStart = snap.historyCalStart ? new Date(snap.historyCalStart) : null;
    historyCalEnd = snap.historyCalEnd ? new Date(snap.historyCalEnd) : null;
    historyTimeFrom = snap.historyTimeFrom || '12:00 AM';
    historyTimeTo = snap.historyTimeTo || '11:59 PM';
    historyRangeFromIso = snap.historyRangeFromIso;
    historyRangeToIso = snap.historyRangeToIso;
    historyCalMonth = snap.historyCalMonth ? new Date(snap.historyCalMonth) : null;
    syncHistoryDateInputsFromState();
    renderHistoryDualCalendar();
    updateHistoryRangeBoxes();
  }

  function openHistoryDateModal() {
    const modal = document.getElementById('live-gps-date-modal');
    if (!modal) return;
    historyDateModalSnapshot = snapshotHistoryDateState();
    historyDateModalOpen = true;
    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
    if (!historyCalMonth) {
      const anchor = historyCalStart || new Date();
      historyCalMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    }
    if (!historyCalStart && historyRangeFromIso && historyRangeToIso) {
      const from = new Date(historyRangeFromIso);
      const to = new Date(historyRangeToIso);
      historyCalStart = historyStartOfDay(from);
      historyCalEnd = historySameDay(from, to) ? null : historyStartOfDay(to);
      historyTimeFrom = formatLegacyTimeDisplay(from.getHours(), from.getMinutes());
      historyTimeTo = formatLegacyTimeDisplay(to.getHours(), to.getMinutes());
    } else if (!historyCalStart) {
      const now = new Date();
      historyCalStart = historyStartOfDay(now);
      historyCalEnd = null;
      historyTimeFrom = '12:00 AM';
      historyTimeTo = formatLegacyTimeDisplay(now.getHours(), now.getMinutes());
    }
    syncHistoryDateInputsFromState();
    renderHistoryDualCalendar();
    requestAnimationFrame(() => modal.classList.add('is-open'));
  }

  function closeHistoryDateModal() {
    const modal = document.getElementById('live-gps-date-modal');
    if (!modal) return;
    historyDateModalOpen = false;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    setTimeout(() => {
      if (!historyDateModalOpen) modal.classList.add('is-hidden');
    }, 220);
  }

  function cancelHistoryDateModal() {
    restoreHistoryDateSnapshot(historyDateModalSnapshot);
    closeHistoryDateModal();
  }

  function clearHistoryDateField() {
    historyCalStart = null;
    historyCalEnd = null;
    historyRangeFromIso = null;
    historyRangeToIso = null;
    historyTimeFrom = '12:00 AM';
    historyTimeTo = '11:59 PM';
    updateHistoryRangeBoxes();
  }

  function applyHistoryDateModalPreset(presetKey) {
    const now = new Date();
    let from;
    let to;
    if (presetKey === 'today') {
      from = historyStartOfDay(now);
      to = now;
    } else if (presetKey === 'yesterday') {
      const end = historyStartOfDay(now);
      from = new Date(end);
      from.setDate(from.getDate() - 1);
      to = new Date(end.getTime() - 1);
    } else if (presetKey === 'before_2_days') {
      from = historyStartOfDay(now);
      from.setDate(from.getDate() - 2);
      to = historyEndOfDay(from);
    } else if (presetKey === 'before_3_days') {
      from = historyStartOfDay(now);
      from.setDate(from.getDate() - 3);
      to = historyEndOfDay(from);
    } else if (presetKey === 'this_week') {
      from = historyStartOfDay(now);
      const dow = (from.getDay() + 6) % 7;
      from.setDate(from.getDate() - dow);
      to = now;
    } else if (presetKey === 'last_week') {
      const end = historyStartOfDay(now);
      const dow = (end.getDay() + 6) % 7;
      end.setDate(end.getDate() - dow - 1);
      from = new Date(end);
      from.setDate(from.getDate() - 6);
      to = historyEndOfDay(end);
    } else if (presetKey === 'this_month') {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = now;
    } else if (presetKey === 'last_month') {
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else {
      return;
    }
    historyCalStart = historyStartOfDay(from);
    historyCalEnd = historySameDay(from, to) ? null : historyStartOfDay(to);
    historyTimeFrom = formatLegacyTimeDisplay(from.getHours(), from.getMinutes());
    historyTimeTo = formatLegacyTimeDisplay(to.getHours(), to.getMinutes());
    historyCalMonth = new Date(historyCalStart.getFullYear(), historyCalStart.getMonth(), 1);
    historyRangeFromIso = null;
    historyRangeToIso = null;
    syncHistoryDateInputsFromState();
    renderHistoryDualCalendar();
    document.querySelectorAll('.live-gps-date-modal__preset').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.preset === presetKey);
    });
  }

  function setHistoryDateFromModal() {
    const range = buildHistoryRangeFromDraft();
    if (!range.fromIso || !range.toIso) return false;
    historyRangeFromIso = range.fromIso;
    historyRangeToIso = range.toIso;
    setHistoryPresetActive(null);
    updateHistoryRangeBoxes();
    closeHistoryDateModal();
    return true;
  }

  function resolveHistorySearchRange() {
    if (historyRangeFromIso && historyRangeToIso) {
      return { fromIso: historyRangeFromIso, toIso: historyRangeToIso };
    }
    return buildHistoryRangeFromDraft();
  }

  function onHistoryCalDayClick(dayKey) {
    const day = historyParseDateKey(dayKey);
    const today = historyStartOfDay(new Date());
    if (day > today) return;

    if (!historyCalStart || (historyCalStart && historyCalEnd)) {
      historyCalStart = day;
      historyCalEnd = null;
    } else {
      historyCalEnd = day;
      if (historyCalEnd < historyCalStart) {
        const tmp = historyCalStart;
        historyCalStart = historyCalEnd;
        historyCalEnd = tmp;
      }
    }

    historyRangeFromIso = null;
    historyRangeToIso = null;
    syncHistoryDateInputsFromState();
    renderHistoryDualCalendar();
    updateHistoryRangeBoxes();
    document.querySelectorAll('.live-gps-date-modal__preset').forEach((btn) => {
      btn.classList.remove('is-active');
    });
  }

  function historyMonthShortTitle(d) {
    return d.toLocaleString(undefined, { month: 'short', year: 'numeric' });
  }

  function renderHistoryMonthGrid(year, month, rangeStart, rangeEnd) {
    const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = historyStartOfDay(new Date());
    let rangeLo = null;
    let rangeHi = null;
    if (rangeStart && rangeEnd) {
      rangeLo = rangeStart < rangeEnd ? rangeStart : rangeEnd;
      rangeHi = rangeStart > rangeEnd ? rangeStart : rangeEnd;
    }
    const weekdays = HISTORY_CAL_WEEKDAYS.map((d) => (
      '<span class="live-gps-date-modal__weekday">' + d + '</span>'
    )).join('');
    let days = '';
    for (let i = 0; i < firstDow; i++) {
      days += '<span class="live-gps-date-modal__day live-gps-date-modal__day--outside" aria-hidden="true"></span>';
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const date = historyStartOfDay(new Date(year, month, day));
      const key = historyDateKey(date);
      const isFuture = date > today;
      const isStart = rangeStart && historySameDay(date, rangeStart);
      const isEnd = rangeEnd && historySameDay(date, rangeEnd);
      const isSingle = isStart && !rangeEnd;
      const inRange = rangeLo && rangeHi && date > rangeLo && date < rangeHi;
      let cls = 'live-gps-date-modal__day';
      if (isFuture) cls += ' live-gps-date-modal__day--disabled';
      if (inRange) cls += ' live-gps-date-modal__day--in-range';
      if (isSingle) cls += ' live-gps-date-modal__day--selected';
      else if (isStart) cls += ' live-gps-date-modal__day--range-start';
      if (isEnd) cls += ' live-gps-date-modal__day--range-end';
      days += '<button type="button" class="' + cls + '" data-day="' + key + '"'
        + (isFuture ? ' disabled' : '') + '>' + day + '</button>';
    }
    return { weekdays, days };
  }

  function renderHistoryDualCalendar() {
    if (!historyCalMonth) {
      const now = new Date();
      historyCalMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    const leftMonth = new Date(historyCalMonth.getFullYear(), historyCalMonth.getMonth(), 1);
    const rightMonth = new Date(historyCalMonth.getFullYear(), historyCalMonth.getMonth() + 1, 1);
    const rangeStart = historyCalStart;
    const rangeEnd = historyCalEnd;

    const left = renderHistoryMonthGrid(leftMonth.getFullYear(), leftMonth.getMonth(), rangeStart, rangeEnd);
    const right = renderHistoryMonthGrid(rightMonth.getFullYear(), rightMonth.getMonth(), rangeStart, rangeEnd);

    const titleLeft = document.getElementById('live-gps-history-cal-title-left');
    const titleRight = document.getElementById('live-gps-history-cal-title-right');
    const wdLeft = document.getElementById('live-gps-history-cal-weekdays-left');
    const wdRight = document.getElementById('live-gps-history-cal-weekdays-right');
    const gridLeft = document.getElementById('live-gps-history-cal-grid-left');
    const gridRight = document.getElementById('live-gps-history-cal-grid-right');
    if (!titleLeft || !gridLeft) return;

    titleLeft.textContent = historyMonthShortTitle(leftMonth);
    titleRight.textContent = historyMonthShortTitle(rightMonth);
    wdLeft.innerHTML = left.weekdays;
    wdRight.innerHTML = right.weekdays;
    gridLeft.innerHTML = left.days;
    gridRight.innerHTML = right.days;
  }

  function shiftHistoryCalendarMonth(delta) {
    if (!historyCalMonth) {
      const now = new Date();
      historyCalMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    historyCalMonth = new Date(historyCalMonth.getFullYear(), historyCalMonth.getMonth() + delta, 1);
    renderHistoryDualCalendar();
  }

  function bindHistoryDateGrid(gridEl) {
    if (!gridEl || gridEl.dataset.bound) return;
    gridEl.dataset.bound = '1';
    gridEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-day]');
      if (!btn || btn.disabled) return;
      onHistoryCalDayClick(btn.dataset.day);
    });
  }

  /* Swaps the Fleet panel between its two tab views: 'fleet' and 'history'. */
  function setObjectsTab(view) {
    const showHistory = view === 'history';
    if (toStatusFilter) toStatusFilter.closeMenu();
    if (vehicleStatusFilter) vehicleStatusFilter.closeMenu();
    setHistoryDevicePickerOpen(false);
    const modal = document.getElementById('live-gps-history-modal');
    const toolbar = document.querySelector('.live-gps-objects__toolbar');
    const search = document.querySelector('.live-gps-objects__search');
    const list = document.getElementById('live-gps-list');
    const tabFleet = document.getElementById('live-gps-tab-fleet');
    const tabHistory = document.getElementById('live-gps-tab-history');
    if (!modal || !list) return;

    toolbar?.classList.toggle('is-hidden', showHistory);
    search?.classList.toggle('is-hidden', showHistory);
    list.classList.toggle('is-hidden', showHistory);
    modal.classList.toggle('is-hidden', !showHistory);
    modal.setAttribute('aria-hidden', showHistory ? 'false' : 'true');
    tabFleet?.classList.toggle('is-active', !showHistory);
    tabFleet?.setAttribute('aria-selected', showHistory ? 'false' : 'true');
    tabHistory?.classList.toggle('is-active', showHistory);
    tabHistory?.setAttribute('aria-selected', showHistory ? 'true' : 'false');

    const objects = document.getElementById('live-gps-objects');
    if (objects && objects.classList.contains('live-gps-objects--collapsed')) {
      objects.classList.remove('live-gps-objects--collapsed');
      syncObjectsPanelState();
    }
    requestAnimationFrame(() => refreshMapSize({ alignViewport: false }));
  }

  function showFleetTab() {
    closeHistoryDateModal();
    setObjectsTab('fleet');
  }

  function showHistoryTab() {
    const modal = document.getElementById('live-gps-history-modal');
    if (!modal) return;
    if (modal.classList.contains('is-hidden')) {
      populateHistoryDeviceSelect(selectedVehicleId);
      if (!historyRangeFromIso) applyHistoryRangeFromPreset('today');
    }
    setObjectsTab('history');
  }

  function formatDurationSeconds(total) {
    const secs = Math.max(0, Number(total) || 0);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h) return h + 'h ' + m + 'min ' + s + 's';
    if (m) return m + 'min ' + s + 's';
    return s + 's';
  }

  function formatHistoryRangeLabel(fromIso, toIso) {
    if (!fromIso || !toIso) return '—';
    return formatLegacyDateRangeLabel(fromIso, toIso);
  }

  function historyDeviceStatusHtml(v) {
    const key = vehicleOperationalStatusKey(v);
    const tier = VEHICLE_OP_STATUS_HISTORY_TIER[key] || 'no-active-to';
    const label = operationalStatusLabel(v) || CONFIG.i18n.no_active_to;
    return '<span class="live-gps-op-status live-gps-history-device-field__status live-gps-op-status--' + tier + '">'
      + escHtml(label)
      + '</span>';
  }

  function historyDeviceCardInnerHtml(v, showChevron) {
    const chev = showChevron
      ? '<span class="live-gps-history-device-field__chev-wrap" aria-hidden="true">'
        + '<i class="bi bi-chevron-down live-gps-bi live-gps-bi--sm live-gps-history-device-field__chev"></i>'
        + '</span>'
      : '<span class="live-gps-history-device-field__chev-wrap" aria-hidden="true"></span>';
    return '<span class="live-gps-history-device-field__icon" aria-hidden="true">' + liveGpsIcon('truck-front-fill', 'sm') + '</span>'
      + '<span class="live-gps-history-device-field__main">'
      + '<span class="live-gps-history-device-field__reg">' + escHtml(v.registration_number || '') + '</span>'
      + historyDeviceStatusHtml(v)
      + '</span>'
      + chev;
  }

  function historyRowToStatusLineHtml(row) {
    const label = row.to_status_label || row.trip_status_label || '—';
    return historyToStatusLineHtml(row.to_status || 'no_to', label);
  }

  function setHistoryDevicePickerOpen(open) {
    const menu = document.getElementById('live-gps-history-device-menu');
    const trigger = document.getElementById('live-gps-history-device-trigger');
    if (!menu || !trigger) return;
    if (open) {
      if (menu.parentElement !== document.body) document.body.appendChild(menu);
      positionHistoryDeviceMenu(menu, trigger);
      menu.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' });
    } else {
      menu.hidden = true;
      menu.style.left = '';
      menu.style.top = '';
    }
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function updateHistoryDevicePickerTrigger(vehicleId) {
    const v = vehicles.find((x) => vehicleKey(x) === String(vehicleId)) || vehiclesForList()[0];
    const trigger = document.getElementById('live-gps-history-device-trigger');
    if (!trigger) return;
    if (!v) {
      trigger.innerHTML = '';
      return;
    }
    trigger.innerHTML = historyDeviceCardInnerHtml(v, true);
  }

  function historyDevicePickerOptionHtml(v, selected) {
    const id = vehicleKey(v);
    return '<button type="button" class="live-gps-history-device-field__option'
      + (selected ? ' is-selected' : '')
      + '" role="option" data-vehicle-id="' + escHtml(id) + '" aria-selected="'
      + (selected ? 'true' : 'false') + '">'
      + historyDeviceCardInnerHtml(v, false)
      + '</button>';
  }

  function populateHistoryDeviceSelect(selectedVehicle) {
    const select = document.getElementById('live-gps-history-device');
    const menu = document.getElementById('live-gps-history-device-menu');
    if (!select) return;
    const list = vehiclesForList();
    const prev = selectedVehicle ? String(selectedVehicle) : select.value;
    select.innerHTML = list.map((v) => {
      const id = vehicleKey(v);
      return '<option value="' + escHtml(id) + '">' + escHtml(v.registration_number || '') + '</option>';
    }).join('');
    const current = prev && list.some((v) => vehicleKey(v) === prev)
      ? prev
      : (list[0] ? vehicleKey(list[0]) : '');
    if (menu) {
      menu.innerHTML = list.map((v) => historyDevicePickerOptionHtml(v, vehicleKey(v) === current)).join('');
    }
    if (current) select.value = current;
    updateHistoryDevicePickerTrigger(select.value);
  }

  function historyActivityBadgeHtml(type) {
    if (type === 'trip_start') return liveGpsIcon('play-fill', 'sm');
    if (type === 'trip_end') return liveGpsIcon('flag-fill', 'sm');
    if (type === 'drive') return liveGpsIcon('car-front-fill', 'sm');
    if (type === 'stopped') return liveGpsIcon('sign-stop-fill', 'sm');
    if (type === 'parked') return liveGpsIcon('pause-circle-fill', 'sm');
    if (type === 'geofence_entry') return liveGpsIcon('house-fill', 'sm');
    if (type === 'geofence_exit') return liveGpsIcon('box-arrow-right', 'sm');
    if (type === 'overspeed') return liveGpsIcon('speedometer2', 'sm');
    return liveGpsIcon('circle-fill', 'xs');
  }

  function historyActivityTitle(type, fallback) {
    if (type === 'stopped') return CONFIG.i18n.stopped;
    if (type === 'parked') return CONFIG.i18n.parked;
    if (type === 'drive') return CONFIG.i18n.drive;
    if (type === 'trip_start') return CONFIG.i18n.trip_start;
    if (type === 'trip_end') return CONFIG.i18n.trip_end;
    if (type === 'geofence_entry') return CONFIG.i18n.geofence_entered;
    if (type === 'geofence_exit') return CONFIG.i18n.geofence_exited;
    if (type === 'overspeed') return CONFIG.i18n.overspeed;
    return fallback || type;
  }

  function historyStatRow(label, value) {
    return '<div class="live-gps-history-card__stat">'
      + '<span class="live-gps-history-card__stat-label">' + label + '</span>'
      + '<span class="live-gps-history-card__stat-value">' + value + '</span>'
      + '</div>';
  }

  function historyMomentRow(label, iso) {
    return '<div class="live-gps-history-card__moment">'
      + '<strong>' + label + '</strong> '
      + '<span>' + formatListTime(iso) + '</span>'
      + '</div>';
  }

  function historyTimelineHtml(type, moments, seqNum) {
    const dual = moments.length > 1;
    const railLine = '<span class="live-gps-history-card__rail-line"></span>';
    const railDots = dual
      ? '<span class="live-gps-history-card__dot"></span>'
        + railLine
        + (seqNum ? '<span class="live-gps-history-card__seq">' + seqNum + '</span>' : '')
        + railLine
        + '<span class="live-gps-history-card__dot"></span>'
      : '<span class="live-gps-history-card__dot"></span>';
    const body = moments.map((m) => historyMomentRow(m.label, m.iso)).join('');
    const singleCls = dual ? '' : ' live-gps-history-card__timeline--single';
    return '<div class="live-gps-history-card__timeline' + singleCls + '">'
      + '<div class="live-gps-history-card__timeline-rail">' + railDots + '</div>'
      + '<div class="live-gps-history-card__timeline-body">' + body + '</div>'
      + '</div>';
  }

  function historyActivityCardHtml(event, seqNum, animIndex) {
    const type = event.type || 'drive';
    const title = historyActivityTitle(type, event.title);
    const driver = event.driver_name || '—';
    let timeline = '';
    let stats = '';
    let more = '';
    const enterCls = animIndex >= 0 ? ' live-gps-history-card--enter' : '';
    const enterStyle = animIndex >= 0 ? ' style="--card-i:' + animIndex + ';"' : '';

    if (type === 'trip_start') {
      timeline = historyTimelineHtml(type, [{
        label: CONFIG.i18n.time + ':',
        iso: event.started_at,
      }]);
      stats = historyStatRow(CONFIG.i18n.driver + ':', driver)
        + historyStatRow(CONFIG.i18n.route_length + ':',
          event.route_length_km != null ? event.route_length_km + ' Km' : '—');
    } else if (type === 'drive') {
      timeline = historyTimelineHtml(type, [
        { label: CONFIG.i18n.drive_start + ':', iso: event.started_at },
        { label: CONFIG.i18n.drive_end + ':', iso: event.ended_at },
      ], seqNum);
      const topSpeed = event.top_speed_kmh != null ? Math.round(event.top_speed_kmh) + ' kph' : '—';
      stats = historyStatRow(CONFIG.i18n.driver + ':', driver)
        + historyStatRow(CONFIG.i18n.top_speed + ':', topSpeed);
      more = historyStatRow(CONFIG.i18n.route_length + ':',
          event.route_length_km != null ? event.route_length_km + ' Km' : '—')
        + historyStatRow(CONFIG.i18n.duration + ':', formatDurationSeconds(event.duration_seconds));
    } else if (type === 'stopped') {
      timeline = historyTimelineHtml(type, [
        { label: CONFIG.i18n.stop_start + ':', iso: event.started_at },
        { label: CONFIG.i18n.stop_end + ':', iso: event.ended_at },
      ], seqNum);
      stats = historyStatRow(CONFIG.i18n.driver + ':', driver)
        + historyStatRow(CONFIG.i18n.speed + ':', '0 kph');
      if (event.duration_seconds != null) {
        more = historyStatRow(CONFIG.i18n.duration + ':', formatDurationSeconds(event.duration_seconds));
      }
    } else if (type === 'parked') {
      timeline = historyTimelineHtml(type, [
        { label: CONFIG.i18n.parking_start + ':', iso: event.started_at },
        { label: CONFIG.i18n.parking_end + ':', iso: event.ended_at },
      ], seqNum);
      stats = historyStatRow(CONFIG.i18n.driver + ':', driver)
        + historyStatRow(CONFIG.i18n.speed + ':', '0 kph');
      if (event.duration_seconds != null) {
        more = historyStatRow(CONFIG.i18n.duration + ':', formatDurationSeconds(event.duration_seconds));
      }
    } else if (type === 'trip_end') {
      timeline = historyTimelineHtml(type, [{
        label: CONFIG.i18n.time + ':',
        iso: event.ended_at,
      }]);
      stats = historyStatRow(CONFIG.i18n.driver + ':', driver);
    } else if (type === 'geofence_entry' || type === 'geofence_exit') {
      const poiLabel = event.poi_name || event.title || '—';
      timeline = historyTimelineHtml(type, [{
        label: CONFIG.i18n.time + ':',
        iso: event.event_at,
      }]);
      stats = historyStatRow(CONFIG.i18n.geofence + ':', poiLabel);
      if (type === 'geofence_exit' && event.dwell_minutes != null) {
        more = historyStatRow(CONFIG.i18n.duration + ':', event.dwell_minutes + ' min');
      }
    }

    const expandable = more ? (
      '<div class="live-gps-history-card__more">' + more + '</div>'
      + '<button type="button" class="live-gps-history-card__toggle" data-action="toggle-activity" aria-label="' + escHtml(CONFIG.i18n.see_more) + '">' + liveGpsIcon('three-dots', 'sm') + '</button>'
    ) : '';

    return '<article class="live-gps-history-card live-gps-history-card--' + type + enterCls + '" data-event-id="' + (event.id || '') + '"' + enterStyle + '>'
      + '<header class="live-gps-history-card__head">'
      + '<span class="live-gps-history-card__badge">' + historyActivityBadgeHtml(type) + '</span>'
      + '<span class="live-gps-history-card__title">' + title + '</span>'
      + '</header>'
      + timeline
      + '<div class="live-gps-history-card__stats">' + stats + '</div>'
      + expandable
      + '</article>';
  }

  function renderHistoryActivityList(events, source, options) {
    const opts = options || {};
    const list = document.getElementById('live-gps-history-activity-list');
    if (!list) return;
    if (!events || !events.length) {
      historyRenderedEventIds = [];
      list.innerHTML = '<div class="live-gps-history-modal__empty">' + CONFIG.i18n.no_history_for_this_period + '</div>';
      return;
    }
    const prevIds = new Set(historyRenderedEventIds);
    const animate = opts.animate !== false;
    const fullRefresh = prevIds.size === 0 || opts.fullRefresh === true;
    const seqByEventId = historyActivitySeqByEventId(events);
    let animIndex = 0;
    const cards = events.map((event) => {
      const badge = seqByEventId[String(event.id || '')] || 0;
      const eventId = event.id || '';
      const shouldAnimate = animate && (fullRefresh || !prevIds.has(eventId));
      const cardAnimIndex = shouldAnimate ? animIndex++ : -1;
      return historyActivityCardHtml(event, badge, cardAnimIndex);
    }).join('');
    list.innerHTML = cards;
    historyRenderedEventIds = events.map((event) => event.id || '');
  }

  function openHistoryModal(tripId, rangeKey, options) {
    const opts = options || {};
    const modal = document.getElementById('live-gps-history-modal');
    if (!modal) return;

    populateHistoryDeviceSelect(tripId);
    applyHistoryRangeFromPreset(rangeKey || 'today');
    selectVehicleFromList(tripId);
    if (!opts.preserveActivities) {
      historySummaryEvents = [];
      historyRenderedEventIds = [];
      historyToList = [];
      historyTimelineList = [];
      historyTimelineCounts = { trips: 0, idle_periods: 0 };
      historySelectedTo = null;
      historySelectedIdle = null;
      historyView = 'idle';
      historyGeofenceCoordsByEventId = {};
      const list = document.getElementById('live-gps-history-activity-list');
      if (list) {
        list.innerHTML = '<div class="live-gps-history-modal__empty">' + escHtml(CONFIG.i18n.select_to_for_history) + '</div>';
      }
      setHistoryView('idle');
    }
    setObjectsTab('history');

    if (opts.autoLoad && rangeKey) submitHistorySearch();
  }

  async function fetchGeofenceEvents(tripId) {
    const url = CONFIG.urls.geofenceEvents + '?trip_id=' + encodeURIComponent(tripId) + '&limit=100';
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('geofence events ' + res.status);
    const data = await res.json();
    return data.events || [];
  }

  async function fetchIdleGeofenceEvents(vehicleId) {
    const url = CONFIG.urls.geofenceEvents + '?vehicle_id=' + encodeURIComponent(vehicleId)
      + '&idle_only=true&limit=100';
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('idle geofence events ' + res.status);
    const data = await res.json();
    return data.events || [];
  }

  function geofenceEventsInRange(events, fromIso, toIso) {
    const fromMs = new Date(fromIso).getTime();
    const toMs = new Date(toIso).getTime();
    return (events || []).filter(function (e) {
      const t = new Date(e.event_at).getTime();
      return t >= fromMs && t <= toMs;
    });
  }

  function geofenceEventsToActivities(events) {
    return events.map(function (e) {
      return {
        id: 'geofence-' + e.id,
        type: e.event_type === 'entry' ? 'geofence_entry' : 'geofence_exit',
        title: e.poi_name,
        poi_name: e.poi_name,
        poi_code: e.poi_code,
        event_at: e.event_at,
        dwell_minutes: e.dwell_minutes,
      };
    });
  }

  function mergeHistoryActivities(geoActivities, summaryEvents) {
    const merged = geoActivities.concat(summaryEvents || []);
    // Oldest first so Drive #1 is the earliest activity in the window.
    merged.sort(function (a, b) {
      const ta = new Date(a.event_at || a.started_at || a.ended_at || 0).getTime();
      const tb = new Date(b.event_at || b.started_at || b.ended_at || 0).getTime();
      return ta - tb;
    });
    return merged;
  }

  async function fetchHistorySummary(tripId, fromIso, toIso) {
    const url = CONFIG.urls.historySummary + '?trip_id=' + encodeURIComponent(tripId)
      + '&from=' + encodeURIComponent(fromIso) + '&to=' + encodeURIComponent(toIso);
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('history summary ' + res.status);
    return res.json();
  }

  function historyToRouteLabel(row) {
    const src = formatPoiLabel(row.origin_poi);
    const dst = formatPoiLabel(row.destination_poi);
    return src + ' → ' + dst;
  }

  function formatPoiCodeCompact(poi) {
    if (!poi || poi.poi_code == null || poi.poi_code === '') return '';
    return String(poi.poi_code).replace(/[-_]+/g, ' · ');
  }

  function historyToCode(poi) {
    const code = formatPoiCodeCompact(poi);
    if (code) return code;
    if (poi && poi.name) return String(poi.name);
    return '—';
  }

  function setHistoryView(view) {
    historyView = view;
    const toolbar = document.getElementById('live-gps-history-to-toolbar');
    const eyebrow = document.getElementById('live-gps-history-to-toolbar-eyebrow');
    const toolbarTitle = document.getElementById('live-gps-history-to-toolbar-title');
    const toolbarSubtitle = document.getElementById('live-gps-history-to-toolbar-subtitle');
    const rail = document.getElementById('live-gps-history-to-toolbar-rail');
    const stats = document.getElementById('live-gps-history-to-toolbar-stats');
    const originName = document.getElementById('live-gps-history-to-origin-name');
    const destName = document.getElementById('live-gps-history-to-dest-name');
    const backBtn = document.getElementById('live-gps-history-to-back');
    const openToBtn = document.getElementById('live-gps-history-open-to');
    if (toolbar) toolbar.classList.toggle('is-hidden', view !== 'to_detail' && view !== 'idle_detail');
    if (backBtn) {
      backBtn.title = CONFIG.i18n.back_to_timeline;
      backBtn.setAttribute('aria-label', CONFIG.i18n.back_to_timeline);
    }

    const isToDetail = view === 'to_detail' && historySelectedTo;
    const isIdleDetail = view === 'idle_detail' && historySelectedIdle;

    if (eyebrow) {
      if (isToDetail) {
        eyebrow.textContent = CONFIG.i18n.transport_order || 'Transport order';
      } else if (isIdleDetail) {
        eyebrow.textContent = CONFIG.i18n.no_active_to_period || CONFIG.i18n.no_active_to || 'No active TO';
      } else {
        eyebrow.textContent = '';
      }
    }

    if (toolbarTitle) {
      if (isToDetail) {
        toolbarTitle.textContent = historySelectedTo.to_number || '';
      } else if (isIdleDetail) {
        toolbarTitle.textContent = formatHistoryTripWindowCompact(
          historySelectedIdle.effective_from || historySelectedIdle.window_from,
          historySelectedIdle.effective_to || historySelectedIdle.window_to,
        );
      } else {
        toolbarTitle.textContent = '';
      }
    }

    if (toolbarSubtitle) {
      if (isToDetail) {
        const label = historySelectedTo.to_status_label || historySelectedTo.to_status || '';
        if (label) {
          toolbarSubtitle.innerHTML = historyRowToStatusLineHtml(historySelectedTo);
          toolbarSubtitle.classList.remove('is-hidden');
        } else {
          toolbarSubtitle.textContent = '';
          toolbarSubtitle.classList.add('is-hidden');
        }
      } else {
        toolbarSubtitle.textContent = '';
        toolbarSubtitle.classList.add('is-hidden');
      }
    }

    if (rail) {
      if (isToDetail) {
        if (originName) originName.textContent = historyToCode(historySelectedTo.origin_poi);
        if (destName) destName.textContent = historyToCode(historySelectedTo.destination_poi);
        rail.classList.remove('is-hidden');
        rail.setAttribute('aria-hidden', 'false');
      } else {
        rail.classList.add('is-hidden');
        rail.setAttribute('aria-hidden', 'true');
      }
    }

    if (stats) {
      if (isToDetail) {
        stats.classList.remove('is-hidden');
        stats.setAttribute('aria-hidden', 'false');
        updateHistoryToCardStats();
      } else {
        stats.classList.add('is-hidden');
        stats.setAttribute('aria-hidden', 'true');
      }
    }

    if (openToBtn) {
      const toId = historySelectedTo && historySelectedTo.transport_order_id;
      const toUrl = isToDetail ? adminTransportOrderUrl(toId) : '';
      if (toUrl) {
        openToBtn.href = toUrl;
        openToBtn.classList.remove('is-hidden');
        const tip = CONFIG.i18n.open_to || CONFIG.i18n.open_transport_order || 'Open TO';
        openToBtn.setAttribute('aria-label', tip);
        openToBtn.removeAttribute('title');
      } else {
        openToBtn.removeAttribute('href');
        openToBtn.classList.add('is-hidden');
      }
    }
    updateHistoryResultsHead(historyTimelineList, historyTimelineCounts);
  }

  function showHistoryToListView() {
    setHistoryView('to_list');
    historySelectedTo = null;
    historySelectedIdle = null;
    historyTripId = null;
    historyFocusVehicleId = null;
    historyToNumber = '';
    historySummaryEvents = [];
    historyRenderedEventIds = [];
    historyGeofenceCoordsByEventId = {};
    historyLeafletMarkersByEventId = {};
    stopHistoryPlayback();
    clearHistoryMapLayers();
    historyPoints = [];
    historyOverspeedEvents = [];
    historyOverspeedLimitKmh = null;
    updateHistoryExportState();
    const panel = document.getElementById('live-gps-history');
    if (panel) {
      panel.classList.add('is-hidden');
      panel.setAttribute('aria-hidden', 'true');
    }
    drawHistoryChart(null);
    updateDockVisibility();
    renderHistoryTimeline(historyTimelineList);
    requestAnimationFrame(() => updateMap());
  }

  function formatHistoryDuration(seconds) {
    const total = Math.max(0, parseInt(seconds, 10) || 0);
    if (total < 60) return total + 's';
    if (total < 3600) return Math.floor(total / 60) + 'm';
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    return m > 0 ? h + 'h ' + m + 'm' : h + 'h';
  }

  function formatHistoryToStartLabel(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = d.getDate();
    const mon = months[d.getMonth()];
    const year = String(d.getFullYear()).slice(-2);
    const time = formatLegacyTimeDisplay(d.getHours(), d.getMinutes());
    return day + ' ' + mon + ' ' + year + ', ' + time;
  }

  function historyTrackDistanceKm(points) {
    if (!points || points.length < 2) return null;
    let total = 0;
    let prev = null;
    for (let i = 0; i < points.length; i++) {
      const lat = Number(points[i].latitude);
      const lng = Number(points[i].longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (prev) total += haversineKm(prev, [lat, lng]);
      prev = [lat, lng];
    }
    if (!prev || total <= 0) return null;
    return Math.round(total * 10) / 10;
  }

  function updateHistoryToCardStats() {
    const startEl = document.getElementById('live-gps-history-to-stat-start');
    const durEl = document.getElementById('live-gps-history-to-stat-duration');
    const distEl = document.getElementById('live-gps-history-to-stat-distance');
    if (!startEl || !durEl || !distEl) return;

    if (!(historyView === 'to_detail' && historySelectedTo)) {
      startEl.textContent = '—';
      durEl.textContent = '—';
      distEl.textContent = '—';
      return;
    }

    const fromIso = historySelectedTo.effective_from || historySelectedTo.window_from;
    const toIso = historySelectedTo.effective_to || historySelectedTo.window_to;
    startEl.textContent = formatHistoryToStartLabel(fromIso);

    const durationSec = historyTimelineRowDurationSeconds({
      duration_seconds: historySelectedTo.duration_seconds,
      effective_from: fromIso,
      effective_to: toIso,
      window_from: historySelectedTo.window_from,
      window_to: historySelectedTo.window_to,
    });
    durEl.textContent = durationSec === '' ? '—' : formatHistoryDuration(durationSec);

    const km = historyTrackDistanceKm(historyPoints);
    distEl.textContent = km == null ? '—' : (km + ' km');
  }

  function updateHistoryResultsHead(rows, counts) {
    const head = document.getElementById('live-gps-history-results-head');
    const countEl = document.getElementById('live-gps-history-results-count');
    if (!head || !countEl) return;
    if (historyView !== 'to_list') {
      head.hidden = true;
      head.classList.add('is-hidden');
      return;
    }
    head.hidden = false;
    head.classList.remove('is-hidden');
    const tripN = counts && typeof counts.trips === 'number'
      ? counts.trips
      : (rows || []).filter((r) => r.kind === 'trip' || r.trip_id).length;
    const idleN = counts && typeof counts.idle_periods === 'number'
      ? counts.idle_periods
      : (rows || []).filter((r) => r.kind === 'idle').length;
    if (tripN === 0 && idleN === 0) {
      countEl.textContent = '';
      return;
    }
    if (tripN > 0 && idleN > 0) {
      const tripLabel = tripN === 1
        ? CONFIG.i18n.trips_found_one
        : CONFIG.i18n.trips_found_many.replace('{n}', String(tripN));
      const idleLabel = idleN === 1
        ? CONFIG.i18n.no_active_to_periods_found_one
        : CONFIG.i18n.no_active_to_periods_found_many.replace('{n}', String(idleN));
      countEl.textContent = tripLabel + ', ' + idleLabel;
      return;
    }
    if (tripN > 0) {
      countEl.textContent = tripN === 1
        ? CONFIG.i18n.trips_found_one
        : CONFIG.i18n.trips_found_many.replace('{n}', String(tripN));
      return;
    }
    countEl.textContent = idleN === 1
      ? CONFIG.i18n.no_active_to_periods_found_one
      : CONFIG.i18n.no_active_to_periods_found_many.replace('{n}', String(idleN));
  }

  function renderHistoryTripRowHtml(row) {
    const selectedCls = historySelectedTo && String(historySelectedTo.trip_id) === String(row.trip_id)
      ? ' is-selected' : '';
    const windowLabel = formatHistoryTripWindowCompact(
      row.effective_from || row.window_from,
      row.effective_to || row.window_to,
    );
    const ptsLabel = String(row.point_count || 0) + ' ' + CONFIG.i18n.points_short;
    const srcLabel = formatPoiLabel(row.origin_poi);
    const dstLabel = formatPoiLabel(row.destination_poi);
    return '<button type="button" class="live-gps-history-to-row' + selectedCls + '" data-trip-id="' + escHtml(String(row.trip_id)) + '">'
      + '<div class="live-gps-history-to-row__head">'
      + '<span class="live-gps-history-to-row__number">' + escHtml(row.to_number || '—') + '</span>'
      + '<span class="live-gps-history-to-row__pts">' + escHtml(ptsLabel) + '</span>'
      + '</div>'
      + historyRowToStatusLineHtml(row)
      + '<div class="live-gps-history-to-row__timeline">'
      + '<span class="live-gps-history-to-row__dot live-gps-history-to-row__dot--source" aria-hidden="true"></span>'
      + '<span class="live-gps-history-to-row__stop">' + escHtml(srcLabel) + '</span>'
      + '<span class="live-gps-history-to-row__line" aria-hidden="true"></span><span></span>'
      + '<span class="live-gps-history-to-row__dot live-gps-history-to-row__dot--dest" aria-hidden="true"></span>'
      + '<span class="live-gps-history-to-row__stop">' + escHtml(dstLabel) + '</span>'
      + '</div>'
      + '<div class="live-gps-history-to-row__footer">'
      + '<span class="live-gps-history-to-row__footer-ico" aria-hidden="true">' + liveGpsIcon('clock', 'sm') + '</span>'
      + '<span>' + escHtml(windowLabel) + '</span>'
      + '</div>'
      + '</button>';
  }

  function renderHistoryIdleRowHtml(row) {
    const selectedCls = historySelectedIdle && String(historySelectedIdle.idle_id) === String(row.idle_id)
      ? ' is-selected' : '';
    const windowLabel = formatHistoryTripWindowCompact(
      row.effective_from || row.window_from,
      row.effective_to || row.window_to,
    );
    const durLabel = formatHistoryDuration(row.duration_seconds);
    const ptsLabel = String(row.point_count || 0) + ' ' + CONFIG.i18n.points_short;
    const label = CONFIG.i18n.no_active_to_period || CONFIG.i18n.no_active_to || 'No active TO';
    const gpsHint = row.has_gps ? '' : ' · ' + (CONFIG.i18n.no_gps_for_no_active_to || '');
    return '<button type="button" class="live-gps-history-no-to-row' + selectedCls + '" data-idle-id="' + escHtml(String(row.idle_id)) + '">'
      + '<div class="live-gps-history-no-to-row__head">'
      + '<span class="live-gps-op-status live-gps-op-status--no-active-to live-gps-history-no-to-row__pill">'
      + escHtml(label)
      + '</span>'
      + '<span class="live-gps-history-no-to-row__meta">'
      + '<span class="live-gps-history-no-to-row__pts">' + escHtml(ptsLabel) + '</span>'
      + '<span class="live-gps-history-no-to-row__dur">' + escHtml(durLabel) + '</span>'
      + '</span>'
      + '</div>'
      + '<div class="live-gps-history-no-to-row__footer">'
      + '<span class="live-gps-history-no-to-row__footer-ico" aria-hidden="true">' + liveGpsIcon('clock', 'sm') + '</span>'
      + '<span>' + escHtml(windowLabel + gpsHint) + '</span>'
      + '</div>'
      + '</button>';
  }

  function renderHistoryTimeline(rows) {
    const list = document.getElementById('live-gps-history-activity-list');
    if (!list) return;
    updateHistoryResultsHead(rows, historyTimelineCounts);
    if (!rows || !rows.length) {
      list.innerHTML = '<div class="live-gps-history-modal__empty">' + escHtml(CONFIG.i18n.no_history_in_period) + '</div>';
      return;
    }
    list.innerHTML = rows.map((row) => {
      if (row.kind === 'idle') return renderHistoryIdleRowHtml(row);
      return renderHistoryTripRowHtml(row);
    }).join('');
  }

  function renderHistoryToList(rows) {
    renderHistoryTimeline(rows);
  }

  async function fetchVehicleToHistory(vehicleId, fromIso, toIso) {
    const url = CONFIG.urls.vehicleToHistory + '?vehicle_id=' + encodeURIComponent(vehicleId)
      + '&from=' + encodeURIComponent(fromIso) + '&to=' + encodeURIComponent(toIso);
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('vehicle to history ' + res.status);
    return res.json();
  }

  async function fetchVehicleIdleSummary(vehicleId, fromIso, toIso) {
    const url = CONFIG.urls.vehicleIdleSummary + '?vehicle_id=' + encodeURIComponent(vehicleId)
      + '&from=' + encodeURIComponent(fromIso) + '&to=' + encodeURIComponent(toIso);
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('vehicle idle summary ' + res.status);
    return res.json();
  }

  function updateHistorySubtitle() {
    const subtitle = document.getElementById('live-gps-history-subtitle');
    if (!subtitle) return;
    const parts = [historyRegistration];
    if (historySelectedTo && historySelectedTo.to_number) parts.push(historySelectedTo.to_number);
    if (historySelectedTo) parts.push(historyToRouteLabel(historySelectedTo));
    parts.push(formatHistoryRangeLabel(historyFromIso, historyToIso));
    subtitle.textContent = parts.filter(Boolean).join(' · ');
  }

  function showHistoryChartPanel(registrationNumber) {
    const panel = document.getElementById('live-gps-history');
    if (!panel) return;
    panel.classList.remove('is-hidden');
    panel.setAttribute('aria-hidden', 'false');
    historyRegistration = registrationNumber || historyRegistration;
    updateHistorySubtitle();
    updateDockVisibility();
    requestAnimationFrame(() => refreshMapSize({ alignViewport: false, smoothLayout: true }));
  }

  function updateHistoryExportState() {
    const btn = document.getElementById('live-gps-history-download');
    if (btn) btn.disabled = !historyTimelineList.length;
  }

  function csvEscapeCell(v) {
    const s = v == null ? '' : String(v);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function historyTimelineRowDurationSeconds(row) {
    if (row.duration_seconds != null && row.duration_seconds !== '') {
      return Math.max(0, parseInt(row.duration_seconds, 10) || 0);
    }
    const fromIso = row.effective_from || row.window_from;
    const toIso = row.effective_to || row.window_to;
    if (!fromIso || !toIso) return '';
    const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
    if (!Number.isFinite(ms) || ms < 0) return '';
    return Math.round(ms / 1000);
  }

  function historyTimelineCsvDatePart(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  }

  function exportHistoryCsv() {
    if (!historyTimelineList.length) return;
    const headers = [
      'kind',
      'registration_number',
      'to_number',
      'to_status',
      'origin',
      'destination',
      'from',
      'to',
      'duration',
      'gps_points',
      'has_gps',
    ];
    const rows = [headers];
    historyTimelineList.forEach((row) => {
      const isIdle = row.kind === 'idle';
      const durationSec = historyTimelineRowDurationSeconds(row);
      const pointCount = row.point_count != null ? Number(row.point_count) || 0 : 0;
      const hasGps = row.has_gps != null ? !!row.has_gps : pointCount > 0;
      rows.push([
        isIdle ? 'idle' : 'trip',
        historyRegistration || '',
        isIdle ? '' : (row.to_number || ''),
        isIdle ? '' : (row.to_status_label || row.to_status || ''),
        isIdle ? '' : formatPoiLabel(row.origin_poi).replace(/^—$/, ''),
        isIdle ? '' : formatPoiLabel(row.destination_poi).replace(/^—$/, ''),
        row.effective_from || row.window_from || '',
        row.effective_to || row.window_to || '',
        durationSec === '' ? '' : formatHistoryDuration(durationSec),
        pointCount,
        hasGps ? 'yes' : 'no',
      ]);
    });
    const csv = rows.map((r) => r.map(csvEscapeCell).join(',')).join('\r\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const fromPart = historyTimelineCsvDatePart(historyRangeFromIso || historyFromIso);
    const toPart = historyTimelineCsvDatePart(historyRangeToIso || historyToIso);
    let dateStr = fromPart || historyTimelineCsvDatePart(new Date().toISOString()) || 'export';
    if (fromPart && toPart && fromPart !== toPart) dateStr = fromPart + '_' + toPart;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'history_timeline_' + (historyRegistration || 'vehicle').replace(/\s+/g, '-')
      + '_' + dateStr + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  async function loadHistoryTrack(tripId, fromIso, toIso, vehicleId, opts) {
    const idleScope = opts && opts.idleScope;
    const v = findVehicle(vehicleId);
    const empty = document.getElementById('live-gps-history-empty');
    stopHistoryPlayback();
    clearHistoryMapLayers();
    historyTripId = tripId || null;
    historyFocusVehicleId = vehicleId ? String(vehicleId) : null;
    if (!historyFocusVehicleId && tripId) {
      const hv = findVehicleByTripId(tripId);
      if (hv) historyFocusVehicleId = vehicleKey(hv);
    }
    historyRange = 'custom';
    historyFromIso = fromIso;
    historyToIso = toIso;
    historyCursorX = null;
    historyRegistration = v ? v.registration_number : historyRegistration;
    if (vehicleId) {
      selectedVehicleId = String(vehicleId);
      renderList();
    }
    historyPoints = [];
    historyOverspeedEvents = [];
    historyOverspeedLimitKmh = null;
    drawHistoryChart(null);
    empty?.classList.add('is-hidden');

    if (!tripId && !vehicleId) {
      historyPoints = [];
      updateHistoryExportState();
      empty?.classList.remove('is-hidden');
      if (empty) empty.textContent = CONFIG.i18n.no_trip;
      drawHistoryChart(null);
      return;
    }

    try {
      let url;
      if (tripId) {
        url = CONFIG.urls.vehicleHistory + '?trip_id=' + encodeURIComponent(tripId)
          + '&from=' + encodeURIComponent(fromIso) + '&to=' + encodeURIComponent(toIso);
      } else if (idleScope) {
        url = CONFIG.urls.vehicleIdleHistory + '?vehicle_id=' + encodeURIComponent(vehicleId)
          + '&from=' + encodeURIComponent(fromIso) + '&to=' + encodeURIComponent(toIso);
      } else {
        url = CONFIG.urls.vehicleHistory + '?vehicle_id=' + encodeURIComponent(vehicleId)
          + '&from=' + encodeURIComponent(fromIso) + '&to=' + encodeURIComponent(toIso);
      }
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('history ' + res.status);
      const data = await res.json();
      historyPoints = data.points || [];
      historyOverspeedEvents = data.overspeed_events || [];
      historyOverspeedLimitKmh = data.overspeed_limit_kmh != null ? Number(data.overspeed_limit_kmh) : null;
      historyRegistration = data.registration_number || historyRegistration;
      updateHistoryExportState();
      showHistoryChartPanel(historyRegistration);
      historyPlayIndex = historyPoints.length ? historyPoints.length - 1 : 0;
      renderHistoryMapLayers();
      requestAnimationFrame(() => {
        initHistoryChartZoomForLoadedData();
        drawHistoryChart(null);
        updateMap();
      });
      requestAnimationFrame(() => refreshMapSize({ alignViewport: false }));
      if (!historyPoints.length) {
        empty?.classList.remove('is-hidden');
        if (empty) {
          empty.textContent = tripId ? CONFIG.i18n.no_gps_for_to : CONFIG.i18n.no_gps_for_no_active_to;
        }
      }
    } catch (err) {
      console.error(err);
      historyPoints = [];
      historyOverspeedEvents = [];
      historyOverspeedLimitKmh = null;
      updateHistoryExportState();
      clearHistoryMapLayers();
      renderHistoryMarkers();
      empty?.classList.remove('is-hidden');
      drawHistoryChart(null);
    }
  }

  async function loadHistoryIdleDetail(idleRow, vehicleId) {
    if (!idleRow) return;
    historySelectedIdle = idleRow;
    historySelectedTo = null;
    historyToNumber = '';
    historyTripId = null;
    historyFocusVehicleId = vehicleId ? String(vehicleId) : null;
    setHistoryView('idle_detail');

    const fromIso = idleRow.effective_from || idleRow.window_from;
    const toIso = idleRow.effective_to || idleRow.window_to;
    if (!fromIso || !toIso) {
      renderHistoryActivityList([], null, { fullRefresh: true });
      return;
    }

    const list = document.getElementById('live-gps-history-activity-list');
    if (list) list.innerHTML = '<div class="live-gps-history-modal__empty">' + CONFIG.i18n.loading + '</div>';

    try {
      const [summary, geoRaw] = await Promise.all([
        fetchVehicleIdleSummary(vehicleId, fromIso, toIso),
        fetchIdleGeofenceEvents(vehicleId).catch(function () { return []; }),
      ]);
      historyGeofenceCoordsByEventId = {};
      geoRaw.forEach((e) => {
        historyGeofenceCoordsByEventId['geofence-' + e.id] = {
          latitude: e.latitude,
          longitude: e.longitude,
        };
      });
      const geoFiltered = geofenceEventsInRange(geoRaw, fromIso, toIso);
      const geoActivities = geofenceEventsToActivities(geoFiltered);
      historySummaryEvents = mergeHistoryActivities(geoActivities, summary.events || []);
      if (historySummaryEvents.length) {
        renderHistoryActivityList(historySummaryEvents, summary.source, { fullRefresh: true });
      } else {
        historyRenderedEventIds = [];
      }
      await loadHistoryTrack(null, fromIso, toIso, vehicleId, { idleScope: true });
      if (!historySummaryEvents.length && list) {
        if (!historyPoints.length) {
          list.innerHTML = '<div class="live-gps-history-modal__empty">'
            + escHtml(CONFIG.i18n.no_gps_for_no_active_to) + '</div>';
        } else {
          list.innerHTML = '<div class="live-gps-history-modal__empty live-gps-history-modal__empty--subtle">'
            + escHtml(CONFIG.i18n.no_active_to_movement_hint) + '</div>';
        }
      }
    } catch (err) {
      console.error(err);
      historySummaryEvents = [];
      historyGeofenceCoordsByEventId = {};
      renderHistoryActivityList([], null);
      if (list) {
        list.innerHTML = '<div class="live-gps-history-modal__empty">' + CONFIG.i18n.failed_to_load_history + '</div>';
      }
    }
  }

  function onHistoryIdleRowClick(idleId) {
    const row = historyTimelineList.find((item) => item.kind === 'idle' && String(item.idle_id) === String(idleId));
    if (!row) return;
    const vehicleId = document.getElementById('live-gps-history-device')?.value;
    loadHistoryIdleDetail(row, vehicleId);
  }

  async function loadHistoryToDetail(toRow, vehicleId) {
    if (!toRow) return;
    historySelectedTo = toRow;
    historySelectedIdle = null;
    historyToNumber = toRow.to_number || '';
    historyTripId = String(toRow.trip_id);
    historyFocusVehicleId = vehicleId ? String(vehicleId) : null;
    if (!historyFocusVehicleId && toRow.trip_id) {
      const hv = findVehicleByTripId(toRow.trip_id);
      if (hv) historyFocusVehicleId = vehicleKey(hv);
    }
    setHistoryView('to_detail');

    const fromIso = toRow.effective_from || toRow.window_from;
    const toIso = toRow.effective_to || toRow.window_to;
    if (!fromIso || !toIso) {
      renderHistoryActivityList([], null, { fullRefresh: true });
      return;
    }

    const list = document.getElementById('live-gps-history-activity-list');
    if (list) list.innerHTML = '<div class="live-gps-history-modal__empty">' + CONFIG.i18n.loading + '</div>';

    try {
      const [summary, geoRaw] = await Promise.all([
        fetchHistorySummary(historyTripId, fromIso, toIso),
        fetchGeofenceEvents(historyTripId).catch(function () { return []; }),
      ]);
      historyGeofenceCoordsByEventId = {};
      geoRaw.forEach((e) => {
        historyGeofenceCoordsByEventId['geofence-' + e.id] = {
          latitude: e.latitude,
          longitude: e.longitude,
        };
      });
      const geoFiltered = geofenceEventsInRange(geoRaw, fromIso, toIso);
      const geoActivities = geofenceEventsToActivities(geoFiltered);
      historySummaryEvents = mergeHistoryActivities(geoActivities, summary.events || []);
      renderHistoryActivityList(historySummaryEvents, summary.source, { fullRefresh: true });
      await loadHistoryTrack(historyTripId, fromIso, toIso, vehicleId);
      updateHistoryToCardStats();
    } catch (err) {
      console.error(err);
      historySummaryEvents = [];
      historyGeofenceCoordsByEventId = {};
      renderHistoryActivityList([], null);
      updateHistoryToCardStats();
      if (list) {
        list.innerHTML = '<div class="live-gps-history-modal__empty">' + CONFIG.i18n.failed_to_load_history + '</div>';
      }
    }
  }

  function onHistoryToRowClick(tripId) {
    const row = historyTimelineList.find((item) => item.kind === 'trip' && String(item.trip_id) === String(tripId))
      || historyToList.find((item) => String(item.trip_id) === String(tripId));
    if (!row) return;
    const vehicleId = document.getElementById('live-gps-history-device')?.value;
    loadHistoryToDetail(row, vehicleId);
  }

  function onHistoryDeviceChange() {
    const tripId = document.getElementById('live-gps-history-device')?.value;
    if (!tripId) return;
    selectVehicleFromList(tripId);
    const modal = document.getElementById('live-gps-history-modal');
    if (modal && !modal.classList.contains('is-hidden') && historyRangeFromIso && historyRangeToIso) {
      submitHistorySearch();
    }
  }

  async function submitHistorySearch() {
    if (!historyRangeFromIso || !historyRangeToIso) return;
    const vehicleId = document.getElementById('live-gps-history-device')?.value;
    const resolved = resolveHistorySearchRange();
    const fromIso = resolved.fromIso;
    const toIso = resolved.toIso;
    if (!vehicleId || !fromIso || !toIso) return;
    if (new Date(fromIso) >= new Date(toIso)) return;

    const list = document.getElementById('live-gps-history-activity-list');
    historyRenderedEventIds = [];
    historySelectedTo = null;
    historySelectedIdle = null;
    historyToList = [];
    historyTimelineList = [];
    historyTimelineCounts = { trips: 0, idle_periods: 0 };
    historyToNumber = '';
    historyGeofenceCoordsByEventId = {};
    historySummaryEvents = [];
    stopHistoryPlayback();
    clearHistoryMapLayers();
    historyPoints = [];
    historyTripId = null;
    historyFocusVehicleId = null;
    updateHistoryExportState();
    drawHistoryChart(null);
    const panel = document.getElementById('live-gps-history');
    if (panel) {
      panel.classList.add('is-hidden');
      panel.setAttribute('aria-hidden', 'true');
    }
    updateDockVisibility();

    if (list) list.innerHTML = '<div class="live-gps-history-modal__empty">' + CONFIG.i18n.loading + '</div>';

    try {
      const data = await fetchVehicleToHistory(vehicleId, fromIso, toIso);
      historyToList = data.transport_orders || [];
      historyTimelineList = data.timeline || historyToList.map((row) => ({ kind: 'trip', ...row }));
      historyTimelineCounts = data.counts || {
        trips: historyToList.length,
        idle_periods: historyTimelineList.filter((row) => row.kind === 'idle').length,
      };
      historyRegistration = data.registration_number || historyRegistration;
      setHistoryView('to_list');
      renderHistoryTimeline(historyTimelineList);
      updateHistoryExportState();
      requestAnimationFrame(() => updateMap());
    } catch (err) {
      console.error(err);
      historyToList = [];
      historyTimelineList = [];
      historyTimelineCounts = { trips: 0, idle_periods: 0 };
      updateHistoryExportState();
      setHistoryView('idle');
      if (list) {
        list.innerHTML = '<div class="live-gps-history-modal__empty">' + CONFIG.i18n.failed_to_load_history + '</div>';
      }
    }
  }

  function closeHistoryPanel() {
    stopHistoryPlayback();
    clearHistoryMapLayers();
    historyPanelCollapsed = false;
    const closedTripId = historyTripId;
    const closedFocusVehicleId = historyFocusVehicleId;
    historyTripId = null;
    historyFocusVehicleId = null;
    historyRange = null;
    historyFromIso = null;
    historyToIso = null;
    historyPoints = [];
    historyOverspeedEvents = [];
    historyOverspeedLimitKmh = null;
    historySummaryEvents = [];
    historyRenderedEventIds = [];
    historyCursorX = null;
    historyRegistration = '';
    historyToList = [];
    historyTimelineList = [];
    historyTimelineCounts = { trips: 0, idle_periods: 0 };
    historySelectedTo = null;
    historySelectedIdle = null;
    historyView = 'idle';
    historyToNumber = '';
    historyGeofenceCoordsByEventId = {};
    historyLeafletMarkersByEventId = {};
    updateHistoryExportState();
    historyCalStart = null;
    historyCalEnd = null;
    historyRangeFromIso = null;
    historyRangeToIso = null;
    historyTimeFrom = '12:00 AM';
    historyTimeTo = '11:59 PM';
    closeHistoryDateModal();
    const panel = document.getElementById('live-gps-history');
    if (panel) {
      panel.classList.add('is-hidden');
      panel.classList.remove('is-collapsed');
      panel.setAttribute('aria-hidden', 'true');
    }
    setObjectsTab('fleet');
    const panelCollapseBtn = document.getElementById('live-gps-history-collapse');
    if (panelCollapseBtn) {
      setLiveGpsButtonIcon(panelCollapseBtn, 'chevron-down', 'sm');
      panelCollapseBtn.setAttribute('aria-expanded', 'true');
    }
    const closedHv = closedFocusVehicleId
      ? findVehicle(closedFocusVehicleId)
      : (closedTripId ? findVehicleByTripId(closedTripId) : null);
    const closedMarkerKey = closedHv
      ? vehicleKey(closedHv)
      : (closedFocusVehicleId || closedTripId);
    if (closedMarkerKey && markers[closedMarkerKey]) {
      markers[closedMarkerKey].setZIndexOffset(0);
    }
    if (closedTripId && closedTripId !== closedMarkerKey && markers[closedTripId]) {
      hideVehicleMarker(closedTripId);
      delete markers[closedTripId];
    }
    updateDockVisibility();
    requestAnimationFrame(() => {
      updateMap();
      refreshMapSize({ alignViewport: false, smoothLayout: true });
    });
  }

  function followMarkerIcon(v) {
    const label = v.registration_number + ' (' + speedText(v) + ')';
    const statusCls = markerStatusClass(v);
    const rot = truckRotation(resolveMarkerHeading(v));
    return L.divIcon({
      className: 'live-gps-marker live-gps-marker--follow',
      html: '<div class="live-gps-marker__pin">'
        + '<div class="' + statusCls + '">'
        + '<img class="live-gps-marker__truck" src="' + TRUCK_MARKER_URL + '" alt=""'
        + ' width="' + FOLLOW_TRUCK_W + '" height="' + FOLLOW_TRUCK_H + '"'
        + ' style="transform:rotate(' + rot + 'deg)" />'
        + '</div>'
        + '<div class="live-gps-marker__label">' + label + '</div>'
        + '</div>',
      iconSize: [120, FOLLOW_TRUCK_H + FOLLOW_LABEL_H + 6],
      iconAnchor: [60, FOLLOW_TRUCK_H / 2],
      popupAnchor: [0, FOLLOW_POPUP_OFFSET_Y],
    });
  }

  function followPanelShell() {
    return document.querySelector('.live-gps-shell');
  }

  function followPanelStack() {
    return document.getElementById('live-gps-follow-stack');
  }

  function positionNewFollowPanel(panel, index) {
    const shell = followPanelShell();
    if (!shell || !panel) return;
    const margin = 12;
    const w = panel.offsetWidth || 420;
    const h = panel.offsetHeight || 340;
    const idx = Number.isFinite(index) ? index : 0;
    let left = (shell.clientWidth - w) / 2 + idx * 42;
    let top = 72 + idx * 34;
    left = Math.max(margin, Math.min(left, shell.clientWidth - w - margin));
    top = Math.max(margin, Math.min(top, shell.clientHeight - h - margin));
    panel.style.left = Math.round(left) + 'px';
    panel.style.top = Math.round(top) + 'px';
    panel.style.transform = 'none';
  }

  function bringFollowPanelToFront(panel) {
    followPanelZ += 1;
    panel.style.zIndex = String(followPanelZ);
  }

  function createFollowPanelElement(tripId, v) {
    const id = String(tripId);
    const stack = followPanelStack();
    if (!stack) return null;

    const panel = document.createElement('div');
    panel.className = 'live-gps-follow';
    panel.id = 'live-gps-follow-' + id;
    panel.dataset.vehicleId = id;

    const head = document.createElement('div');
    head.className = 'live-gps-follow__head';
    head.title = CONFIG.i18n.drag_to_move;
    head.innerHTML = '<span class="live-gps-panel__ico" aria-hidden="true">'
      + liveGpsIcon('crosshair', 'sm')
      + '</span>';

    const title = document.createElement('span');
    title.className = 'live-gps-follow__head-title';
    title.textContent = CONFIG.i18n.follow + ' ' + v.registration_number;
    head.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'live-gps-follow__head-actions';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'live-gps-follow__head-btn';
    closeBtn.setAttribute('aria-label', CONFIG.i18n.close_follow);
    setLiveGpsButtonIcon(closeBtn, 'x-lg', 'sm');
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeFollowPanel(id);
    });
    actions.appendChild(closeBtn);
    head.appendChild(actions);

    const mapEl = document.createElement('div');
    mapEl.className = 'live-gps-follow__map';
    mapEl.id = 'live-gps-follow-map-' + id;

    panel.appendChild(head);
    panel.appendChild(mapEl);
    stack.appendChild(panel);
    bindFollowPanelDrag(panel);
    return panel;
  }

  function destroyFollowPanel(tripId) {
    const id = String(tripId);
    const state = followPanels[id];
    if (!state) return;

    if (openPopupVehicleId === id && openPopupSurface === 'follow') {
      openPopupVehicleId = null;
      openPopupSurface = null;
    }
    if (state.map) state.map.remove();
    state.panel?.remove();
    delete followPanels[id];
  }

  function createFollowMapForPanel(tripId) {
    const state = getFollowPanel(tripId);
    if (!state || state.map) return state?.map || null;
    const mapEl = state.panel.querySelector('.live-gps-follow__map');
    if (!mapEl) return null;
    const followMap = L.map(mapEl, { zoomControl: true, preferCanvas: false });
    setMapBasemap(followMap);
    state.map = followMap;
    return followMap;
  }

  function refreshFollowPanelLayout(tripId, done) {
    const state = getFollowPanel(tripId);
    if (!state?.map) {
      if (done) done();
      return;
    }
    state.map.invalidateSize({ animate: false });
    if (done) {
      requestAnimationFrame(() => {
        state.map.invalidateSize({ animate: false });
        done();
      });
    }
  }

  function updateFollowPanel(tripId) {
    const id = String(tripId);
    const state = followPanels[id];
    const v = findVehicle(id);
    if (!state?.map || !v) return;

    const latlng = [v.latitude, v.longitude];
    const icon = followMarkerIcon(v);
    if (state.marker) {
      state.marker.setLatLng(latlng);
      state.marker.setIcon(icon);
    } else {
      state.marker = L.marker(latlng, { icon, zIndexOffset: 900 }).addTo(state.map);
    }
    attachFollowMarkerHandlers(state.marker, v);

    const trail = buildDisplayTrail(v);
    const trailColor = v.tail_color || '#22c55e';
    if (trail.length > 1) {
      if (state.trailLine) {
        state.trailLine.setLatLngs(trail);
        state.trailLine.setStyle({ color: trailColor, weight: 4, opacity: 0.85 });
      } else {
        state.trailLine = L.polyline(trail, { color: trailColor, weight: 4, opacity: 0.85 }).addTo(state.map);
      }
    } else if (state.trailLine) {
      state.map.removeLayer(state.trailLine);
      state.trailLine = null;
    }

    if (!state.mapReady) {
      if (trail.length > 1) {
        const bounds = L.latLngBounds(trail).extend(latlng);
        state.map.fitBounds(bounds.pad(0.18), { maxZoom: FOLLOW_ZOOM, animate: false });
      } else {
        state.map.setView(latlng, FOLLOW_ZOOM, { animate: false });
      }
      state.mapReady = true;
      if (openPopupVehicleId === id && openPopupSurface === 'follow' && state.marker) {
        openPopupOnMarker(state.marker, v);
      }
      return;
    }

    const zoom = state.map.getZoom();
    const safeZoom = Number.isFinite(zoom) ? Math.max(zoom, 15) : FOLLOW_ZOOM;
    state.map.setView(latlng, safeZoom, { animate: true });

    if (openPopupVehicleId === id && openPopupSurface === 'follow' && state.marker?.isPopupOpen()) {
      patchOpenPopup(state.marker, v);
    }
  }

  function updateFollowMaps() {
    Object.keys(followPanels).forEach((tripId) => updateFollowPanel(tripId));
  }

  function bootFollowPanel(tripId) {
    const id = String(tripId);
    const state = followPanels[id];
    if (!state?.panel) return;

    createFollowMapForPanel(id);
    refreshFollowPanelLayout(id, () => {
      updateFollowPanel(id);
      if (openPopupVehicleId === id && openPopupSurface === 'follow' && state.marker) {
        const v = findVehicle(id);
        if (v) openPopupOnMarker(state.marker, v);
      }
    });
  }

  function openFollowPanel(tripId) {
    const id = String(tripId);
    const v = findVehicle(id);
    if (!v) return;

    const existing = followPanels[id];
    if (existing?.panel) {
      bringFollowPanelToFront(existing.panel);
      refreshFollowPanelLayout(id, () => updateFollowPanel(id));
      return;
    }

    const panel = createFollowPanelElement(id, v);
    if (!panel) return;

    const index = Object.keys(followPanels).length;
    followPanels[id] = {
      panel,
      map: null,
      marker: null,
      trailLine: null,
      mapReady: false,
    };
    bringFollowPanelToFront(panel);
    positionNewFollowPanel(panel, index);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bootFollowPanel(id);
        setTimeout(() => bootFollowPanel(id), 200);
      });
    });
  }

  function closeFollowPanel(tripId) {
    if (tripId == null || tripId === '') {
      Object.keys(followPanels).slice().forEach((id) => destroyFollowPanel(id));
      return;
    }
    destroyFollowPanel(String(tripId));
  }

  function bindFollowPanelDrag(panel) {
    const head = panel?.querySelector('.live-gps-follow__head');
    if (!panel || !head || head.dataset.dragBound === '1') return;
    head.dataset.dragBound = '1';

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    head.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('button')) return;
      bringFollowPanelToFront(panel);
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const shell = followPanelShell();
      if (!shell) return;
      const shellRect = shell.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      startLeft = panelRect.left - shellRect.left;
      startTop = panelRect.top - shellRect.top;
      panel.style.left = startLeft + 'px';
      panel.style.top = startTop + 'px';
      panel.style.transform = 'none';
      panel.classList.add('live-gps-follow--dragging');
      head.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      panel.classList.remove('live-gps-follow--dragging');
      if (head.hasPointerCapture(e.pointerId)) head.releasePointerCapture(e.pointerId);
    }

    head.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const shell = followPanelShell();
      if (!shell) return;
      const margin = 8;
      let left = startLeft + (e.clientX - startX);
      let top = startTop + (e.clientY - startY);
      left = Math.max(margin, Math.min(left, shell.clientWidth - panel.offsetWidth - margin));
      top = Math.max(margin, Math.min(top, shell.clientHeight - panel.offsetHeight - margin));
      panel.style.left = left + 'px';
      panel.style.top = top + 'px';
    });
    head.addEventListener('pointerup', (e) => {
      endDrag(e);
      const tripId = panel.dataset.vehicleId;
      if (tripId) refreshFollowPanelLayout(tripId, () => updateFollowPanel(tripId));
    });
    head.addEventListener('pointercancel', endDrag);
  }

  function initFollowPanelDrag() {
    /* Panels bind drag on create — stack starts empty. */
  }

  function initHistoryPanel() {
    document.getElementById('live-gps-tab-fleet')?.addEventListener('click', showFleetTab);
    document.getElementById('live-gps-tab-history')?.addEventListener('click', showHistoryTab);
    document.getElementById('live-gps-history-show')?.addEventListener('click', submitHistorySearch);
    document.getElementById('live-gps-history-device')?.addEventListener('change', onHistoryDeviceChange);
    document.getElementById('live-gps-history-device-trigger')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = document.getElementById('live-gps-history-device-menu');
      setHistoryDevicePickerOpen(!!menu?.hidden);
    });
    document.getElementById('live-gps-history-device-menu')?.addEventListener('click', (e) => {
      const opt = e.target.closest('[data-vehicle-id]');
      if (!opt) return;
      const id = opt.dataset.vehicleId;
      const select = document.getElementById('live-gps-history-device');
      if (select) select.value = id;
      updateHistoryDevicePickerTrigger(id);
      document.querySelectorAll('#live-gps-history-device-menu .live-gps-history-device-field__option').forEach((el) => {
        const selected = el.dataset.vehicleId === id;
        el.classList.toggle('is-selected', selected);
        el.setAttribute('aria-selected', selected ? 'true' : 'false');
      });
      setHistoryDevicePickerOpen(false);
      onHistoryDeviceChange();
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#live-gps-history-device-field') && !e.target.closest('#live-gps-history-device-menu')) {
        setHistoryDevicePickerOpen(false);
      }
    });
    window.addEventListener('resize', () => {
      const menu = document.getElementById('live-gps-history-device-menu');
      const trigger = document.getElementById('live-gps-history-device-trigger');
      if (!menu || menu.hidden || !trigger) return;
      positionHistoryDeviceMenu(menu, trigger);
    });
    document.getElementById('live-gps-history-from-box')?.addEventListener('click', openHistoryDateModal);
    document.getElementById('live-gps-history-to-box')?.addEventListener('click', openHistoryDateModal);
    document.getElementById('live-gps-date-modal-close')?.addEventListener('click', cancelHistoryDateModal);
    document.getElementById('live-gps-date-modal-cancel')?.addEventListener('click', cancelHistoryDateModal);
    document.getElementById('live-gps-date-modal-backdrop')?.addEventListener('click', cancelHistoryDateModal);
    document.getElementById('live-gps-date-modal-set')?.addEventListener('click', setHistoryDateFromModal);
    document.getElementById('live-gps-history-cal-prev')?.addEventListener('click', () => shiftHistoryCalendarMonth(-1));
    document.getElementById('live-gps-history-cal-next')?.addEventListener('click', () => shiftHistoryCalendarMonth(1));
    bindHistoryDateGrid(document.getElementById('live-gps-history-cal-grid-left'));
    bindHistoryDateGrid(document.getElementById('live-gps-history-cal-grid-right'));
    document.getElementById('live-gps-date-modal-presets')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-preset]');
      if (!btn) return;
      applyHistoryDateModalPreset(btn.dataset.preset);
    });
    document.getElementById('live-gps-history-presets')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-range]');
      if (!btn) return;
      applyHistoryRangeFromPreset(btn.dataset.range);
      submitHistorySearch();
    });
    ['live-gps-history-date-from', 'live-gps-history-date-to',
      'live-gps-history-time-from', 'live-gps-history-time-to'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', () => {
        readHistoryDateInputsFromDom();
        historyRangeFromIso = null;
        historyRangeToIso = null;
        renderHistoryDualCalendar();
        updateHistoryRangeBoxes();
      });
    });
    document.getElementById('live-gps-history-to-back')?.addEventListener('click', showHistoryToListView);
    document.getElementById('live-gps-history-activity-list')?.addEventListener('click', (e) => {
      const toRow = e.target.closest('.live-gps-history-to-row');
      if (toRow && toRow.dataset.tripId) {
        onHistoryToRowClick(toRow.dataset.tripId);
        return;
      }
      const idleRow = e.target.closest('.live-gps-history-no-to-row');
      if (idleRow && idleRow.dataset.idleId) {
        onHistoryIdleRowClick(idleRow.dataset.idleId);
        return;
      }
      const btn = e.target.closest('[data-action="toggle-activity"]');
      if (btn) {
        const card = btn.closest('.live-gps-history-card');
        if (card) card.classList.toggle('is-expanded');
        return;
      }
      const card = e.target.closest('.live-gps-history-card');
      if (card) jumpToHistoryEvent(card);
    });
    document.getElementById('live-gps-history-close')?.addEventListener('click', closeHistoryPanel);
    document.getElementById('live-gps-history-collapse')?.addEventListener('click', () => {
      setHistoryPanelCollapsed(!isHistoryPanelCollapsed());
    });
    document.getElementById('live-gps-history-play')?.addEventListener('click', toggleHistoryPlayback);
    document.getElementById('live-gps-history-play-compact')?.addEventListener('click', toggleHistoryPlayback);
    document.getElementById('live-gps-history-stop')?.addEventListener('click', resetHistoryPlayback);
    document.getElementById('live-gps-history-stop-compact')?.addEventListener('click', resetHistoryPlayback);
    document.getElementById('live-gps-history-speed')?.addEventListener('click', cycleHistoryPlaySpeed);
    document.getElementById('live-gps-history-speed-compact')?.addEventListener('click', cycleHistoryPlaySpeed);
    document.getElementById('live-gps-history-zoom-in')?.addEventListener('click', historyChartZoomIn);
    document.getElementById('live-gps-history-zoom-out')?.addEventListener('click', historyChartZoomOut);
    document.getElementById('live-gps-history-zoom-reset')?.addEventListener('click', historyChartZoomReset);
    document.getElementById('live-gps-history-download')?.addEventListener('click', exportHistoryCsv);
    bindHistoryChartInteraction();
    bindHistorySeekBar();
  }

  function syncDockPanelState() {
    const panel = document.getElementById('live-gps-dock-panel');
    const collapseBtn = document.getElementById('dock-panel-collapse');
    if (!panel || !collapseBtn) return;

    const collapsed = panel.classList.contains('live-gps-panel--collapsed');
    collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    collapseBtn.title = collapsed ? CONFIG.i18n.show_details : CONFIG.i18n.hide_details;
    collapseBtn.setAttribute('aria-label', collapseBtn.title);
    requestAnimationFrame(() => refreshMapSize({ alignViewport: false, smoothLayout: true }));
    setTimeout(() => refreshMapSize({ alignViewport: true }), 220);
  }

  function toggleDockCollapsed() {
    const panel = document.getElementById('live-gps-dock-panel');
    if (!panel) return;
    panel.classList.toggle('live-gps-panel--collapsed');
    try {
      localStorage.setItem(
        'liveGpsDockCollapsed',
        panel.classList.contains('live-gps-panel--collapsed') ? '1' : '0'
      );
    } catch (e) { /* ignore */ }
    syncDockPanelState();
  }

  function objectsPanelShell() {
    return document.querySelector('.live-gps-shell');
  }

  function readObjectsPanelPosition() {
    try {
      const raw = localStorage.getItem('liveGpsObjectsPos');
      if (!raw) return null;
      const pos = JSON.parse(raw);
      if (!pos || typeof pos.left !== 'number' || typeof pos.top !== 'number') return null;
      return pos;
    } catch (e) {
      return null;
    }
  }

  function saveObjectsPanelPosition(left, top) {
    try {
      localStorage.setItem('liveGpsObjectsPos', JSON.stringify({ left, top }));
    } catch (e) { /* ignore */ }
  }

  function clampObjectsPanelPosition(left, top) {
    const shell = objectsPanelShell();
    const panel = document.getElementById('live-gps-objects');
    if (!shell || !panel) return { left, top };

    const margin = 8;
    const maxLeft = Math.max(margin, shell.clientWidth - panel.offsetWidth - margin);
    const maxTop = Math.max(margin, shell.clientHeight - panel.offsetHeight - margin);
    return {
      left: Math.min(Math.max(margin, left), maxLeft),
      top: Math.min(Math.max(margin, top), maxTop),
    };
  }

  function applyObjectsPanelPosition(left, top, persist) {
    const panel = document.getElementById('live-gps-objects');
    if (!panel) return;
    const clamped = clampObjectsPanelPosition(left, top);
    panel.style.left = clamped.left + 'px';
    panel.style.top = clamped.top + 'px';
    if (persist) saveObjectsPanelPosition(clamped.left, clamped.top);
  }

  function restoreObjectsPanelPosition() {
    const saved = readObjectsPanelPosition();
    if (!saved) return;
    applyObjectsPanelPosition(saved.left, saved.top, false);
  }

  function reClampObjectsPanelPosition() {
    const panel = document.getElementById('live-gps-objects');
    if (!panel || (!panel.style.left && !panel.style.top)) return;
    const left = parseFloat(panel.style.left) || 12;
    const top = parseFloat(panel.style.top) || 12;
    applyObjectsPanelPosition(left, top, true);
  }

  function initObjectsPanelDrag() {
    const panel = document.getElementById('live-gps-objects');
    const head = panel && panel.querySelector('.live-gps-objects__head');
    if (!panel || !head) return;

    let dragging = false;
    let dragMoved = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    head.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('button, a, input, label')) return;

      dragging = true;
      dragMoved = false;
      startX = e.clientX;
      startY = e.clientY;
      const left = parseFloat(panel.style.left) || panel.offsetLeft;
      const top = parseFloat(panel.style.top) || panel.offsetTop;
      startLeft = left;
      startTop = top;
      panel.classList.add('live-gps-objects--dragging');
      head.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    head.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragMoved && Math.hypot(dx, dy) < 4) return;
      dragMoved = true;
      applyObjectsPanelPosition(startLeft + dx, startTop + dy, false);
    });

    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      panel.classList.remove('live-gps-objects--dragging');
      if (head.hasPointerCapture(e.pointerId)) {
        head.releasePointerCapture(e.pointerId);
      }
      if (dragMoved) {
        const left = parseFloat(panel.style.left) || startLeft;
        const top = parseFloat(panel.style.top) || startTop;
        applyObjectsPanelPosition(left, top, true);
        requestAnimationFrame(() => refreshMapSize({ alignViewport: false }));
        if (toStatusFilter) {
          const toMenu = document.getElementById('live-gps-status-filter-menu');
          const toBtn = document.getElementById('live-gps-status-filter-btn');
          if (toMenu && !toMenu.hidden && toBtn) positionFleetFilterMenu(toMenu, toBtn);
        }
        if (vehicleStatusFilter) {
          const vehicleMenu = document.getElementById('live-gps-vehicle-status-filter-menu');
          const vehicleBtn = document.getElementById('live-gps-vehicle-status-filter-btn');
          if (vehicleMenu && !vehicleMenu.hidden && vehicleBtn) {
            positionFleetFilterMenu(vehicleMenu, vehicleBtn);
          }
        }
      }
    }

    head.addEventListener('pointerup', endDrag);
    head.addEventListener('pointercancel', endDrag);
  }

  function syncObjectsPanelState() {
    const panel = document.getElementById('live-gps-objects');
    const toggle = document.getElementById('objects-collapse');
    if (!panel || !toggle) return;
    const collapsed = panel.classList.contains('live-gps-objects--collapsed');
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    toggle.title = collapsed
      ? CONFIG.i18n.show_vehicle_list
      : CONFIG.i18n.hide_vehicle_list;
    toggle.setAttribute('aria-label', toggle.title);
    requestAnimationFrame(() => {
      reClampObjectsPanelPosition();
      refreshMapSize({ alignViewport: false });
    });
  }

  function initObjectsSearch() {
    const input = document.getElementById('live-gps-objects-search');
    if (!input) return;
    input.addEventListener('input', () => {
      objectsSearchQuery = input.value;
      renderList();
      updateMap();
    });
  }

  function initObjectsPanel() {
    const panel = document.getElementById('live-gps-objects');
    const toggle = document.getElementById('objects-collapse');
    if (!panel || !toggle) return;

    try {
      if (localStorage.getItem('liveGpsObjectsCollapsed') === '1') {
        panel.classList.add('live-gps-objects--collapsed');
      }
    } catch (e) { /* ignore */ }

    toggle.addEventListener('click', () => {
      panel.classList.toggle('live-gps-objects--collapsed');
      try {
        localStorage.setItem(
          'liveGpsObjectsCollapsed',
          panel.classList.contains('live-gps-objects--collapsed') ? '1' : '0'
        );
      } catch (e) { /* ignore */ }
      syncObjectsPanelState();
    });
    restoreObjectsPanelPosition();
    initObjectsPanelDrag();
    syncObjectsPanelState();
  }

  function initDetailDock() {
    const panel = document.getElementById('live-gps-dock-panel');
    const panelCollapseBtn = document.getElementById('dock-panel-collapse');
    const mapBtn = document.getElementById('detail-address-map');

    if (panel) {
      try {
        if (localStorage.getItem('liveGpsDockCollapsed') === '1') {
          panel.classList.add('live-gps-panel--collapsed');
        }
      } catch (e) { /* ignore */ }
    }

    if (panelCollapseBtn) {
      panelCollapseBtn.addEventListener('click', toggleDockCollapsed);
    }

    if (mapBtn) {
      mapBtn.addEventListener('click', () => {
        const v = selectedVehicle();
        if (!v) return;
        window.open('https://www.google.com/maps?q=' + v.latitude + ',' + v.longitude, '_blank');
      });
    }

    syncDockPanelState();
    updateDockVisibility();
  }

  function onDomReady() {
    initPopupActionDelegation();
    initCommandModal();
    initObjectListDelegation();
    initObjectsSearch();
    initFleetFilters();
    initObjectsPanel();
    initFollowPanelDrag();
    initHistoryPanel();
    // Chart panel height settles asynchronously (canvas redraws, collapse) —
    // track it so the Fleet/History panel keeps its 12px clearance.
    const chartPanel = document.getElementById('live-gps-history');
    if (chartPanel) {
      if (window.ResizeObserver) {
        new ResizeObserver(() => updateObjectsPanelMaxHeight()).observe(chartPanel);
      }
      // The panel animates in (lg-card-in transform) and transitions sizes —
      // rects measured mid-animation are off, so recompute once it settles.
      chartPanel.addEventListener('transitionend', () => updateObjectsPanelMaxHeight());
      chartPanel.addEventListener('animationend', () => updateObjectsPanelMaxHeight());
    }
    const dockWrap = document.getElementById('live-gps-dock-wrap');
    if (dockWrap && window.ResizeObserver) {
      new ResizeObserver(() => updateObjectsPanelMaxHeight()).observe(dockWrap);
    }
    initDetailDock();
    initMap();
    loadData();
    scheduleRefresh(CONFIG.refreshIntervalSeconds);
    requestAnimationFrame(() => {
      refreshMapSize({ alignViewport: false });
      setTimeout(() => refreshMapSize({ alignViewport: false }), 200);
      setTimeout(() => refreshMapSize({ alignViewport: false }), 800);
    });
    const sidebarToggle = document.getElementById('dfms-sidebar-toggle');
    if (sidebarToggle) {
      sidebarToggle.addEventListener('click', () => {
        setTimeout(() => refreshMapSize({ alignViewport: false }), 0);
        setTimeout(() => refreshMapSize({ alignViewport: true }), 300);
      });
    }
    window.addEventListener('resize', () => {
      reClampObjectsPanelPosition();
      refreshMapSize({ alignViewport: false });
      if (openPopupVehicleId) {
        setTimeout(() => refreshMapSize({ alignViewport: true }), 200);
      }
    });
  }

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onDomReady);
    } else {
      onDomReady();
    }
  }

  init();
  return { init: init };
})();
