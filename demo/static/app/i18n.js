
'use strict';
{
  const globals = this;
  const appCore = globals.appCore || (globals.appCore = {});

  appCore.pluralidx = function(count) { return (count == 1) ? 0 : 1; };

  appCore.catalog = appCore.catalog || {};

  if (!appCore.jsi18n_initialized) {
    appCore.gettext = function(msgid) {
      const value = appCore.catalog[msgid];
      if (typeof value === 'undefined') {
        return msgid;
      } else {
        return (typeof value === 'string') ? value : value[0];
      }
    };

    appCore.ngettext = function(singular, plural, count) {
      const value = appCore.catalog[singular];
      if (typeof value === 'undefined') {
        return (count == 1) ? singular : plural;
      } else {
        return value.constructor === Array ? value[appCore.pluralidx(count)] : value;
      }
    };

    appCore.gettext_noop = function(msgid) { return msgid; };

    appCore.pgettext = function(context, msgid) {
      let value = appCore.gettext(context + '\x04' + msgid);
      if (value.includes('\x04')) {
        value = msgid;
      }
      return value;
    };

    appCore.npgettext = function(context, singular, plural, count) {
      let value = appCore.ngettext(context + '\x04' + singular, context + '\x04' + plural, count);
      if (value.includes('\x04')) {
        value = appCore.ngettext(singular, plural, count);
      }
      return value;
    };

    appCore.interpolate = function(fmt, obj, named) {
      if (named) {
        return fmt.replace(/%\(\w+\)s/g, function(match){return String(obj[match.slice(2,-2)])});
      } else {
        return fmt.replace(/%s/g, function(match){return String(obj.shift())});
      }
    };

    appCore.formats = {
    "DATETIME_FORMAT": "N j, Y, P",
    "DATETIME_INPUT_FORMATS": [
      "%Y-%m-%d %H:%M:%S",
      "%Y-%m-%d %H:%M:%S.%f",
      "%Y-%m-%d %H:%M",
      "%m/%d/%Y %H:%M:%S",
      "%m/%d/%Y %H:%M:%S.%f",
      "%m/%d/%Y %H:%M",
      "%m/%d/%y %H:%M:%S",
      "%m/%d/%y %H:%M:%S.%f",
      "%m/%d/%y %H:%M",
      "%Y-%m-%d"
    ],
    "DATE_FORMAT": "N j, Y",
    "DATE_INPUT_FORMATS": [
      "%Y-%m-%d",
      "%m/%d/%Y",
      "%m/%d/%y",
      "%b %d %Y",
      "%b %d, %Y",
      "%d %b %Y",
      "%d %b, %Y",
      "%B %d %Y",
      "%B %d, %Y",
      "%d %B %Y",
      "%d %B, %Y"
    ],
    "DECIMAL_SEPARATOR": ".",
    "FIRST_DAY_OF_WEEK": 0,
    "MONTH_DAY_FORMAT": "F j",
    "NUMBER_GROUPING": 3,
    "SHORT_DATETIME_FORMAT": "m/d/Y P",
    "SHORT_DATE_FORMAT": "m/d/Y",
    "THOUSAND_SEPARATOR": ",",
    "TIME_FORMAT": "P",
    "TIME_INPUT_FORMATS": [
      "%H:%M:%S",
      "%H:%M:%S.%f",
      "%H:%M"
    ],
    "YEAR_MONTH_FORMAT": "F Y"
  };

    appCore.get_format = function(format_type) {
      const value = appCore.formats[format_type];
      if (typeof value === 'undefined') {
        return format_type;
      } else {
        return value;
      }
    };

    globals.pluralidx = appCore.pluralidx;
    globals.gettext = appCore.gettext;
    globals.ngettext = appCore.ngettext;
    globals.gettext_noop = appCore.gettext_noop;
    globals.pgettext = appCore.pgettext;
    globals.npgettext = appCore.npgettext;
    globals.interpolate = appCore.interpolate;
    globals.get_format = appCore.get_format;

    appCore.jsi18n_initialized = true;
  }
};

