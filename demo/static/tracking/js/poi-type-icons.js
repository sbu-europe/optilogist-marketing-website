/**
 * Material Symbols glyphs for map POI pins — one icon per POIType (apps.master_data.models.POIType).
 * Loaded before live-gps-app.js; exposed as window.LiveGpsPoiIcons.
 */
window.LiveGpsPoiIcons = (function () {
  'use strict';

  function materialIcon(name) {
    return '<span class="material-symbols-outlined live-gps-poi-pin__mi"'
      + ' aria-hidden="true">' + name + '</span>';
  }

  /** DB value → Material Symbols ligature name (currentColor inherits pin bubble white). */
  const BY_TYPE = {
    aquaculture: materialIcon('set_meal'),
    breeder: materialIcon('egg'),
    breeder_farm: materialIcon('cottage'),
    broiler: materialIcon('egg_alt'),
    broiler_farm: materialIcon('agriculture'),
    depot: materialIcon('local_shipping'),
    depot_godown: materialIcon('warehouse'),
    feed_mill: materialIcon('factory'),
    farm: materialIcon('agriculture'),
    godown: materialIcon('store'),
    green_field: materialIcon('grass'),
    hatchery: materialIcon('egg'),
    office: materialIcon('apartment'),
    port: materialIcon('anchor'),
    poultry_lab: materialIcon('biotech'),
    production_unit: materialIcon('precision_manufacturing'),
    r_and_d: materialIcon('science'),
    supplier: materialIcon('local_shipping'),
    vendor: materialIcon('storefront'),
    warehouse: materialIcon('warehouse'),
    waste_mgmt: materialIcon('recycling'),
    other: materialIcon('location_on'),
  };

  const FALLBACK = BY_TYPE.other;

  /** Pin bubble color per POIType — distinct hues for at-a-glance recognition. */
  const PIN_COLORS = {
    aquaculture: '#06b6d4',
    breeder: '#f97316',
    breeder_farm: '#fb923c',
    broiler: '#ef4444',
    broiler_farm: '#dc2626',
    depot: '#3b82f6',
    depot_godown: '#ea580c',
    feed_mill: '#8b5cf6',
    farm: '#84cc16',
    godown: '#a16207',
    green_field: '#22c55e',
    hatchery: '#eab308',
    office: '#64748b',
    port: '#0891b2',
    poultry_lab: '#d946ef',
    production_unit: '#7c3aed',
    r_and_d: '#ec4899',
    supplier: '#14b8a6',
    vendor: '#e11d48',
    warehouse: '#b45309',
    waste_mgmt: '#78716c',
    other: '#94a3b8',
  };

  const DEFAULT_PIN_COLOR = PIN_COLORS.other;

  const TYPE_LABELS = {
    aquaculture: 'Aquaculture',
    breeder: 'Breeder',
    breeder_farm: 'Breeder Farm',
    broiler: 'Broiler',
    broiler_farm: 'Broiler Farm',
    depot: 'Depot',
    depot_godown: 'Depot, Godown',
    feed_mill: 'Feed Mill',
    farm: 'Farm',
    godown: 'Godown',
    green_field: 'Green Field',
    hatchery: 'Hatchery',
    office: 'Office',
    port: 'Port',
    poultry_lab: 'Poultry Lab',
    production_unit: 'Production Unit',
    r_and_d: 'R&D',
    supplier: 'Supplier Premises',
    vendor: 'Vendor Premises',
    warehouse: 'Warehouse',
    waste_mgmt: 'Waste Management',
    other: 'Other',
  };

  function iconHtml(poiType) {
    if (poiType && Object.prototype.hasOwnProperty.call(BY_TYPE, poiType)) {
      return BY_TYPE[poiType];
    }
    return FALLBACK;
  }

  function pinColor(poiType) {
    if (poiType && Object.prototype.hasOwnProperty.call(PIN_COLORS, poiType)) {
      return PIN_COLORS[poiType];
    }
    return DEFAULT_PIN_COLOR;
  }

  function typeLabel(poiType) {
    if (poiType && Object.prototype.hasOwnProperty.call(TYPE_LABELS, poiType)) {
      return TYPE_LABELS[poiType];
    }
    return TYPE_LABELS.other;
  }

  function types() {
    return Object.keys(BY_TYPE);
  }

  return {
    iconHtml: iconHtml,
    pinColor: pinColor,
    typeLabel: typeLabel,
    types: types,
  };
}());
