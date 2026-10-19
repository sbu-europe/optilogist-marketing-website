// Live demo — Master Data and Users & Access (users, drivers) CRUD kept in the browser session.
//
// Data lives in sessionStorage (this tab, this demo session). It starts from DEMO_MASTER_SEED (the sanitised
// demo dataset), survives page navigation, and is wiped by "Exit demo" or by closing the tab. Nothing is sent
// to any server. The pages are the real QA screens; this script fills them from the store and handles saves.
//
//   Lists      admin_<app>_<model>.html     rows rendered from the store; bulk actions; brand inline edit
//   Add        md_<model>_add.html          real Add form; Save creates a record
//   Edit       md_<model>_change.html#<id>  real Edit form filled from the store; Save updates it
//   Delete     md_<model>_delete.html#<ids> real confirmation page; blocked like QA when the record is in use
//   Users      Add = md_user_add.html (real "Invite user" form); no delete (QA forbids it): Deactivate user ->
//              md_user_suspend.html#<ids>, Reactivate user -> md_user_change.html#<id>/activate
//   Drivers    Add also creates the driver's user account (status Invited); deactivate via "Is active"
//   Elsewhere  dropdowns that list master records, lookup APIs, Live GPS, dashboard counts, Vehicle Planning
(function () {
  "use strict";
  var SEED = window.DEMO_MASTER_SEED;
  if (!SEED) return;

  var KEY = "optilogist-demo-master-data", FLASH = "optilogist-demo-flash";

  // ---------- Entity rules (labels, uniqueness, delete dependencies) ----------
  function poiName(id) { var r = get("poi", id); return r ? (r.fields.name || r.label) : ""; }
  function poiLabel(id) { var r = get("poi", id); return r ? r.fields.name + " (" + r.fields.poi_code + ")" : ""; }
  function catLabel(id) { var r = get("productcategory", id); return r ? r.fields.category_name + " (" + r.fields.category_code + ")" : ""; }
  var E = {
    poi: { verbose: "poi", plural: "pois", title: "Pois", label: function (f) { return f.name + " (" + f.poi_code + ")"; },
      blockName: function (f) { return f.name; }, code: function (f) { return f.poi_code; }, unique: ["poi_code", "name"] },
    loadingunloadingpoint: { verbose: "Loading/Unloading Point", plural: "Loading/Unloading Points", title: "Loading/Unloading Points",
      label: function (f) { return f.short_code + " — " + f.name + " (" + poiName(f.poi) + ")"; }, code: function (f) { return f.short_code; }, unique: ["short_code"] },
    brand: { verbose: "brand", plural: "brands", title: "Vehicle Brands", label: function (f) { return f.brand_name; }, unique: ["brand_name"] },
    vehicle: { verbose: "vehicle", plural: "vehicles", title: "Vehicles", label: function (f) { return f.registration_number; },
      code: function (f) { return f.registration_number; }, unique: ["registration_number", "chassis_number"] },
    helper: { verbose: "helper", plural: "helpers", title: "Helpers", label: function (f) { return f.full_name + " (" + f.employee_id + ")"; },
      code: function (f) { return f.employee_id; }, unique: ["employee_id", "contact_number"] },
    dealer: { verbose: "dealer", plural: "dealers", title: "Dealers", label: function (f) { return f.dealer_name + " (" + f.dealer_code + ")"; },
      code: function (f) { return f.dealer_code; }, unique: ["dealer_code"] },
    supplier: { verbose: "supplier", plural: "suppliers", title: "Suppliers", label: function (f) { return f.supplier_name + " (" + f.supplier_code + ")"; },
      code: function (f) { return f.supplier_code; }, unique: ["supplier_code"] },
    productcategory: { verbose: "product category", plural: "product categories", title: "Product Categories",
      label: function (f) { return f.category_name + " (" + f.category_code + ")"; }, code: function (f) { return f.category_code; }, unique: ["category_code"] },
    productsubcategory: { verbose: "product sub category", plural: "product sub categories", title: "Product Sub-category",
      label: function (f) { return f.sub_category_name + " (" + f.sub_category_code + ")"; }, code: function (f) { return f.sub_category_code; }, unique: ["sub_category_code"] },
    product: { verbose: "product", plural: "products", title: "Products", label: function (f) { return "[" + f.product_item_code + "] " + f.product_name; },
      code: function (f) { return f.product_item_code; }, unique: ["product_sku_code", "product_item_code"] },
    // Users & Access. QA returns 403 for deleting users/drivers: users are deactivated (suspended) instead,
    // drivers via their "Is active" box. Users are created through the "Invite user" form.
    user: { verbose: "user", plural: "users", title: "Users", noDelete: true, addFormId: "invitationtoken_form",
      aliases: { invitee_first_name: "first_name", invitee_last_name: "last_name", otp_type: "two_fa_setting" },
      label: function (f) { return fullName(f) + " <" + (f.email || f.phone_number || "None") + ">"; }, code: function (f) { return f.employee_id; },
      unique: ["email", "phone_number", "employee_id"] },
    driver: { verbose: "driver", plural: "drivers", title: "Drivers", noDelete: true, noCheckbox: true, aliases: { user_email: "email" },
      label: function (f) { return fullName(f) + " (" + f.driving_license_number + ")"; }, code: function (f) { return f.employee_id; },
      unique: ["contact_number", "driving_license_number", "national_id_number", "employee_id"] }
  };
  function fullName(f) { return ((f.first_name || "") + " " + (f.last_name || "")).trim(); }
  // Records in other Master Data entities that point at a record (QA refuses to delete those).
  var DEPENDENTS = {
    poi: [["loadingunloadingpoint", "poi", "loading/unloading points"], ["dealer", "site_pois", "dealers"], ["supplier", "site_pois", "suppliers"]],
    brand: [["vehicle", "brand", "vehicles"]],
    productcategory: [["product", "category", "products"], ["productsubcategory", "category", "product sub categories"]],
    productsubcategory: [["product", "sub_category", "products"]]
  };

  // ---------- Store ----------
  var store;
  function load() {
    if (store) return store;
    try { store = JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch (e) { store = null; }
    if (!store || store.seedBuiltAt !== SEED.builtAt) {
      store = { seedBuiltAt: SEED.builtAt, entities: {} };
      Object.keys(SEED.entities).forEach(function (m) { store.entities[m] = SEED.entities[m].records.map(function (r) { return JSON.parse(JSON.stringify(r)); }); });
    }
    return store;
  }
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { toast("The demo couldn’t save this change (browser storage is full or blocked)."); } }
  function all(model) { return load().entities[model] || []; }
  function get(model, id) { return all(model).filter(function (r) { return r.id === id; })[0] || null; }
  function active(model) { return all(model).filter(function (r) { return r.fields.is_active !== false && r.status !== "Suspended"; }); }
  function uuid() { return (crypto.randomUUID && crypto.randomUUID()) || "d" + Date.now().toString(16) + Math.random().toString(16).slice(2); }

  // ---------- Small helpers ----------
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast(m) { if (window.demoToast) window.demoToast(m); }
  function icon(on) { return '<img src="static/admin/img/icon-' + (on ? "yes" : "no") + '.svg" alt="' + (on ? "True" : "False") + '">'; }
  function num(v, d) { var n = parseFloat(v); return isNaN(n) ? "-" : n.toFixed(d); }
  function meta() { var m = document.querySelector('meta[name="demo-md"]'); try { return m ? JSON.parse(m.content) : null; } catch (e) { return null; } }
  function listFile(model) { return SEED.entities[model].list; }
  function changeUrl(model, id) { return "md_" + model + "_change.html#" + id; }
  function flash(level, html) { try { sessionStorage.setItem(FLASH, JSON.stringify({ level: level, html: html })); } catch (e) {} }
  function showFlash() {
    var f; try { f = JSON.parse(sessionStorage.getItem(FLASH) || "null"); sessionStorage.removeItem(FLASH); } catch (e) {}
    if (!f) return;
    var content = document.getElementById("content");
    if (!content) return;
    var old = content.parentNode.querySelector(":scope > .messagelist"); if (old) old.remove();
    var ul = document.createElement("ul"); ul.className = "messagelist";
    ul.innerHTML = '<li class="' + f.level + '">' + f.html + "</li>";
    content.parentNode.insertBefore(ul, content);
  }
  function labelOf(model, rec) { try { var l = E[model].label(rec.fields); return /undefined/.test(l) ? rec.label : l; } catch (e) { return rec.label; } }

  // ---------- Reading a form into a record ----------
  // Fields the demo stores. Formset fields contain "-" (handled separately), except the per-role site pickers
  // (poi_role_<role id>). File uploads aren't kept.
  function skipField(el, reading) {
    return /^(csrfmiddlewaretoken|_save|_reinvite|next)$/.test(el.name) || (el.name.indexOf("-") >= 0 && !/^poi_role_/.test(el.name)) ||
      el.type === "hidden" || el.type === "submit" || el.type === "file" || (reading && el.disabled);
  }
  function isGroup(form, el) { return el.type === "checkbox" && form.querySelectorAll('input[type=checkbox][name="' + el.name + '"]').length > 1; }
  function readForm(form, rec, model) {
    var fields = rec.fields, labels = rec.labels = rec.labels || {}, groups = {};
    form.querySelectorAll("input[name], select[name], textarea[name]").forEach(function (el) {
      if (skipField(el, true)) return;
      if (isGroup(form, el)) { if (!groups[el.name]) { groups[el.name] = true; fields[el.name] = []; } if (el.checked) fields[el.name].push(el.value); }
      else if (el.type === "checkbox") fields[el.name] = el.checked;
      else if (el.type === "radio") { if (el.checked) fields[el.name] = el.value; }
      else if (el.tagName === "SELECT" && el.multiple) fields[el.name] = [].map.call(el.selectedOptions, function (o) { return o.value; });
      else fields[el.name] = el.value.trim();
      if (el.tagName === "SELECT" && !el.multiple) {
        if (el.value && el.selectedIndex >= 0) labels[el.name] = el.options[el.selectedIndex].textContent.trim(); else delete labels[el.name];
      }
    });
    // Add forms can name a field differently from the edit form (Invite: invitee_first_name -> first_name)
    var al = (E[model] || {}).aliases || {};
    Object.keys(al).forEach(function (from) {
      if (from in fields) { fields[al[from]] = fields[from]; delete fields[from]; }
      if (from in labels) { labels[al[from]] = labels[from]; delete labels[from]; }
    });
    // A phone box that still holds only the "+880" prefix is empty
    ["phone_number", "contact_number"].forEach(function (k) { if (fields[k] === "+880") fields[k] = ""; });
    return rec;
  }
  function fieldValue(rec, name, model) {
    var al = (E[model] || {}).aliases || {}, key = al[name] || name;
    return { has: Object.prototype.hasOwnProperty.call(rec.fields, key), v: rec.fields[key], key: key };
  }
  function fillForm(form, rec, model) {
    form.querySelectorAll("input[name], select[name], textarea[name]").forEach(function (el) {
      if (skipField(el)) return;
      var fv = fieldValue(rec, el.name, model), has = fv.has, v = fv.v;
      if (isGroup(form, el)) { el.checked = Array.isArray(v) && v.indexOf(el.value) >= 0; return; }
      if (el.type === "radio") { if (has && v) el.checked = el.value === v; return; }
      if (el.tagName === "SELECT" && el.multiple) {
        var want = Array.isArray(v) ? v : [];
        [].forEach.call(el.options, function (o) { o.selected = want.indexOf(o.value) >= 0; });
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      if (el.type === "checkbox") { el.checked = has ? !!v : false; return; }
      if (el.tagName === "SELECT") {
        var want = has ? String(v) : "", lbl = (rec.labels || {})[el.name];
        if (want && !el.querySelector('option[value="' + CSS.escape(want) + '"]') && lbl) {
          var byText = [].filter.call(el.options, function (o) { return o.textContent.trim() === lbl; })[0];
          if (byText) want = byText.value;
        }
        if (want && !el.querySelector('option[value="' + CSS.escape(want) + '"]') && lbl) el.add(new Option(lbl, want));
        el.value = want;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      el.value = has && v != null ? v : "";
    });
    // Read-only rows on the edit page (e.g. fields that are set only when a record is added)
    form.querySelectorAll(".form-row").forEach(function (row) {
      var col = (row.className.match(/field-([a-z0-9_]+)/) || [])[1], ro = row.querySelector(".readonly");
      if (!col || !ro) return;
      var v = (rec.labels || {})[col] || rec.fields[col];
      if (v == null || v === "") v = (rec.readonly || {})[col];
      if (typeof v === "boolean") ro.innerHTML = icon(v);
      else if (v != null) ro.textContent = v === "" ? "-" : v;
    });
  }

  // ---------- Validation (Django-style messages) ----------
  function fieldLabel(form, name) {
    var l = form.querySelector('label[for="id_' + name + '"]');
    return l ? l.textContent.replace(/[*:]/g, "").trim() : name.replace(/_/g, " ");
  }
  function clearErrors(form) {
    form.querySelectorAll(".errorlist, .errornote").forEach(function (e) { e.remove(); });
    form.querySelectorAll(".form-row.errors").forEach(function (r) { r.classList.remove("errors"); });
  }
  function showErrors(form, errors) {
    var note = document.createElement("p"); note.className = "errornote";
    note.textContent = errors.length === 1 ? "Please correct the error below." : "Please correct the errors below.";
    form.insertBefore(note, form.firstElementChild && form.firstElementChild.tagName === "INPUT" ? form.firstElementChild.nextSibling : form.firstElementChild);
    errors.forEach(function (err) {
      var el = form.querySelector('[name="' + err[0] + '"]'), row = el && el.closest(".form-row");
      var ul = document.createElement("ul"); ul.className = "errorlist"; ul.innerHTML = "<li>" + esc(err[1]) + "</li>";
      if (row) { row.classList.add("errors"); row.insertBefore(ul, row.firstChild); } else form.insertBefore(ul, note.nextSibling);
    });
    note.scrollIntoView({ block: "center" });
  }
  // The form's own name for a stored field (Invite form: first_name is "invitee_first_name")
  function formName(model, key) {
    var al = (E[model] || {}).aliases || {};
    for (var k in al) if (al[k] === key) return k;
    return key;
  }
  var BD_MOBILE = /^\+8801[3-9]\d{8}$/;
  function validate(model, form, rec, selfId) {
    var errors = [], seen = {};
    function err(name, msg) { if (!seen[name]) { seen[name] = 1; errors.push([name, msg]); } }
    form.querySelectorAll("[required]").forEach(function (el) {
      if (el.type === "hidden" || el.type === "checkbox" || el.type === "radio" || el.disabled) return;
      var v = String(el.value || "").trim();
      if (!v || ((el.name === "phone_number" || el.name === "contact_number") && v === "+880")) err(el.name, "This field is required.");
    });
    var uniq = function (m, f, own, name, valueKey) {
      var v = String(rec.fields[valueKey || f] || "").trim().toLowerCase();
      if (!v) return;
      var clash = all(m).some(function (r) { return r.id !== own && String(r.fields[f] || "").trim().toLowerCase() === v; });
      if (clash) err(name || formName(model, f), cap(E[m].verbose) + " with this " + fieldLabel(form, name || formName(model, f)) + " already exists.");
    };
    (E[model].unique || []).forEach(function (f) { uniq(model, f, selfId); });
    var F = rec.fields;
    if (model === "user") {
      if (F.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(F.email)) err("email", "Enter a valid email address.");
      if (F.phone_number && !BD_MOBILE.test(F.phone_number)) err("phone_number", "Enter a valid BD mobile number in E.164 format (e.g. +8801700100022).");
      var roleBox = form.querySelector('input[name="role"]'), roleRow = roleBox && roleBox.closest(".form-row"), needRole = roleRow && roleRow.querySelector("label.required");
      if (needRole && !(F.role || []).length) err("role", "This field is required.");
    }
    if (model === "driver") {
      if (F.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(F.email)) err(formName(model, "email"), "Enter a valid email address.");
      if (F.contact_number && !BD_MOBILE.test(F.contact_number)) err("contact_number", "Enter a valid BD mobile number in E.164 format (e.g. +8801700100022).");
      ["license_expiry_date", "license_renewal_date"].forEach(function (k) { if (F[k] && !validDate(F[k])) err(k, "Enter a valid date."); });
      // A new driver also creates their user account, so the account's email / employee id must be free too
      var own = F.user || null;
      uniq("user", "email", own, formName(model, "email")); uniq("user", "employee_id", own); uniq("user", "phone_number", own, "contact_number", "contact_number");
    }
    return errors;
  }
  function validDate(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s), d = m && new Date(+m[1], m[2] - 1, +m[3]); return !!(d && d.getMonth() === m[2] - 1 && d.getDate() === +m[3]); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---------- Users & Access display helpers (same markup / wording as the QA lists) ----------
  var ROLES = SEED.roles || [];
  function roleName(id) { var r = ROLES.filter(function (x) { return x[0] === id; })[0]; return r ? r[1] : ""; }
  // Users list "Role" column: the user's role names in the form's (alphabetical) order, plus roles the
  // Invite form doesn't offer (e.g. Driver) that came with the record
  function roleText(rec) {
    var ids = rec.fields.role || [];
    var names = ROLES.filter(function (r) { return ids.indexOf(r[0]) >= 0; }).map(function (r) { return r[1]; });
    (rec.extraRoles || []).forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); });
    if (!names.length && !ids.length && rec.roleText) return rec.roleText; // seed rows whose edit page wasn't captured
    return names.join(", ");
  }
  var BADGE = { Invited: ["trial", "bi-clock-fill"], Active: ["active", "bi-check-circle-fill"], Suspended: ["suspended", "bi-x-octagon-fill"] };
  function statusBadge(st) {
    var b = BADGE[st] || BADGE.Active;
    return '<span class="dfms-badge dfms-badge--' + b[0] + '"><i class="bi ' + b[1] + '" style="font-size:10px;"></i>' + esc(st) + "</span>";
  }
  // Django's default date format: "Aug. 24, 2056", "May 3, 2030", "Sept. 1, 2030"
  var MON = ["Jan.", "Feb.", "March", "April", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
  function djangoDate(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? MON[m[2] - 1] + " " + (+m[3]) + ", " + m[1] : s; }
  function djangoNow() {
    var d = new Date(), h = d.getHours(), mi = d.getMinutes(), ap = h < 12 ? "a.m." : "p.m.", h12 = h % 12 || 12;
    var t = mi ? h12 + ":" + (mi < 10 ? "0" : "") + mi : String(h12);
    if (h === 0 && !mi) t = "midnight"; else if (h === 12 && !mi) t = "noon"; else t += " " + ap;
    return MON[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear() + ", " + t;
  }
  // The signed-in demo account, as shown in the header
  function me() { var n = document.querySelector(".dfms-user-name"); return (n ? n.textContent.trim() : "Demo Admin") + " <admin@example.com>"; }
  function linkedDriver(userId) { return all("driver").filter(function (d) { return d.fields.user === userId; })[0] || null; }
  function contactOf(f) { return f.email || f.phone_number || ""; }

  // ---------- List cells for created/edited records ----------
  function cellHtml(model, rec, col) {
    var f = rec.fields, L = rec.labels || {};
    switch (model + "." + col) {
      case "poi.display_storage_capacity": return num(f.storage_capacity_mt, 2);
      case "poi.display_current_stock": return num(f.current_stock_mt != null && f.current_stock_mt !== "" ? f.current_stock_mt : (rec.readonly || {}).current_stock_mt || 0, 3);
      case "poi.display_free_capacity": return num((parseFloat(f.storage_capacity_mt) || 0) - (parseFloat(f.current_stock_mt) || 0), 3);
      case "loadingunloadingpoint.poi": return esc(poiLabel(f.poi) || L.poi || "-");
      case "loadingunloadingpoint.created_at": return esc(rec.createdAtText || "-");
      case "vehicle.display_capacity": return f.capacity ? num(f.capacity, 3) + " " + esc(L.capacity_unit || "MT") : "-";
      case "vehicle.display_wheels": return esc(f.number_of_wheels || "-");
      case "vehicle.assigned_poi": return "-";
      case "vehicle.operational_status": return f.is_active === false ? "Inactive" : esc(rec.operationalStatus || "No Active TO");
      case "dealer.active_status": case "supplier.active_status": return icon(f.is_active !== false);
      case "productcategory.sub_category_count": return String(all("productsubcategory").filter(function (s) { return s.fields.category === rec.id; }).length);
      case "productsubcategory.category": return esc(catLabel(f.category) || L.category || "-");
      case "product.category": return esc(catLabel(f.category) || L.category || "-");
      case "product.product_type": return esc(L.product_type || "-");
      case "brand.is_active": return null; // inline-editable checkbox, rendered by renderList
      case "user.name_col": case "driver.driver_full_name": return esc(fullName(f));
      case "user.employee_id_col": case "driver.employee_id_display": return esc(f.employee_id || "—");
      case "user.email_or_phone": return f.email ? "Email · " + esc(f.email) : f.phone_number ? "Phone · " + esc(f.phone_number) : "—";
      case "user.primary_role": return esc(roleText(rec) || "—");
      case "user.two_fa": return esc(L.two_fa_setting || "None");
      case "user.status": return statusBadge(rec.status || "Active");
      case "user.last_active_at": return esc(rec.lastActive || "-");
      case "driver.license_expiry_date": return esc(djangoDate(f.license_expiry_date) || "-");
      case "driver.current_state": return esc(rec.state || "Available");
      case "driver.is_active": return icon(f.is_active !== false);
    }
    if (typeof f[col] === "boolean") return icon(f[col]);
    var v = L[col] || f[col];
    return v == null || v === "" ? "-" : esc(v);
  }

  // ---------- Lists ----------
  function renderList(model) {
    var cfg = SEED.entities[model], tbody = document.querySelector("#result_list tbody");
    if (!tbody) return;
    var rows = all(model);
    tbody.innerHTML = rows.map(function (rec, i) {
      var label = labelOf(model, rec);
      var html = E[model].noCheckbox ? "<tr>" : '<tr><td class="action-checkbox"><input type="checkbox" name="_selected_action" value="' + esc(rec.id) + '" class="action-select" aria-label="Select this object for an action - ' + esc(label) + '"></td>';
      cfg.columns.forEach(function (c) {
        var inner;
        if (model === "brand" && c.col === "is_active") inner = '<input type="checkbox" name="form-' + i + '-is_active" id="id_form-' + i + '-is_active"' + (rec.fields.is_active !== false ? " checked" : "") + '><input type="hidden" name="form-' + i + '-id" value="' + esc(rec.id) + '">';
        else if (!rec.dirty && rec.cells && rec.cells[c.col] != null) inner = rec.cells[c.col];
        else { inner = cellHtml(model, rec, c.col); if (c.linked) inner = '<a href="' + changeUrl(model, rec.id) + '">' + inner + "</a>"; }
        html += "<" + c.tag + ' class="' + esc(c.cls) + '">' + inner + "</" + c.tag + ">";
      });
      return html + "</tr>";
    }).join("");
    // Counts: everything is on one page in the demo
    var n = rows.length, word = n === 1 ? E[model].verbose : E[model].plural;
    var pag = document.querySelector("p.paginator");
    if (pag) {
      var save = pag.querySelector('input[type="submit"]');
      pag.innerHTML = " " + n + " " + esc(word) + " ";
      if (save) pag.appendChild(save);
    }
    document.querySelectorAll(".small.quiet, #changelist-search span, .dfms-results-count").forEach(function (el) {
      el.childNodes.forEach(function (t) { if (t.nodeType === 3 && /\d+\s+results?/.test(t.textContent)) t.textContent = t.textContent.replace(/\d+\s+results?/, n + (n === 1 ? " result" : " results")); });
    });
    var counter = document.querySelector(".action-counter");
    if (counter) { counter.setAttribute("data-actions-icnt", n); counter.textContent = "0 of " + n + " selected"; }
  }

  function handleListSubmit(model, form, submitter) {
    var action = (form.querySelector('select[name="action"]') || {}).value || "";
    var ids = [].map.call(form.querySelectorAll("input.action-select:checked"), function (c) { return c.value; });
    // Brand list: inline "Active" checkboxes + Save
    if (!action && submitter && submitter.name === "_save" || (!action && form.querySelector('input[name^="form-"][name$="-is_active"]') && !ids.length)) {
      var changed = 0;
      form.querySelectorAll('input[name$="-id"][name^="form-"]').forEach(function (h) {
        var rec = get(model, h.value), cb = form.querySelector('[name="' + h.name.replace(/-id$/, "-is_active") + '"]');
        if (rec && cb && (rec.fields.is_active !== false) !== cb.checked) { rec.fields.is_active = cb.checked; rec.dirty = true; changed++; }
      });
      save();
      flash("success", changed ? changed + " " + (changed === 1 ? E[model].verbose + " was" : E[model].plural + " were") + " changed successfully." : "No fields were changed.");
      location.reload(); return true;
    }
    if (!action) return true;
    if (!ids.length) { flash("warning", "Items must be selected in order to perform actions on them. No items have been changed."); location.reload(); return true; }
    // Users: QA's account actions. Deactivation goes through its confirmation page (type, reason, remarks).
    if (model === "user") {
      var picked = ids.map(function (id) { return get("user", id); }).filter(Boolean);
      if (action === "deactivate_selected_accounts") { location.href = "md_user_suspend.html#" + ids.join(","); return true; }
      if (action === "reactivate_selected_accounts") {
        var back = picked.filter(function (r) { return r.status === "Suspended"; });
        back.forEach(reactivate); save();
        flash(back.length ? "success" : "warning", back.length ? "Reactivated " + back.length + " " + (back.length === 1 ? "user" : "users") + "." : "None of the selected users is deactivated.");
        location.reload(); return true;
      }
      if (action === "reinvite_selected_users") {
        var inv = picked.filter(function (r) { return r.status !== "Active"; });
        flash(inv.length ? "success" : "warning", inv.length ? "Invitation re-sent to " + inv.length + " " + (inv.length === 1 ? "user" : "users") + "." : "Only users who haven’t activated their account can be reinvited.");
        location.reload(); return true;
      }
    }
    if (action === "delete_permanently" || action === "delete_selected") { location.href = "md_" + model + "_delete.html#" + ids.join(","); return true; }
    var on = /(^|_)activate/.test(action) && !/deactivate/.test(action), off = /deactivate/.test(action);
    if (on || off) {
      ids.forEach(function (id) { var r = get(model, id); if (r) { r.fields.is_active = on; r.dirty = true; } });
      save(); flash("success", ids.length + " " + (ids.length === 1 ? E[model].verbose : E[model].plural) + " " + (on ? "activated" : "deactivated") + ".");
      location.reload(); return true;
    }
    if (action === "mark_under_maintenance") {
      ids.forEach(function (id) { var r = get(model, id); if (r) { r.operationalStatus = "Under Maintenance"; r.dirty = true; } });
      save(); flash("success", ids.length + " vehicle(s) marked as Under Maintenance.");
      location.reload(); return true;
    }
    toast("This action isn’t part of the live demo.");
    return true;
  }

  // ---------- Add / Edit ----------
  function setTitleBits(model, oldLabel, newLabel) {
    if (!oldLabel || !newLabel) return;
    document.title = document.title.split(oldLabel).join(newLabel);
    document.querySelectorAll(".breadcrumbs, .dfms-page-header, #content h1, #content h2").forEach(function (root) {
      var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) if (w.currentNode.textContent.indexOf(oldLabel) >= 0) w.currentNode.textContent = w.currentNode.textContent.split(oldLabel).join(newLabel);
    });
  }
  function pointLinksTo(model, fromId, toId) {
    document.querySelectorAll('a[href*="' + fromId + '"]').forEach(function (a) { a.setAttribute("href", a.getAttribute("href").split(fromId).join(toId)); });
  }

  function formOf(m) { return document.getElementById((m.mode === "add" && E[m.model].addFormId) || m.model + "_form"); }
  function initForm(m) {
    var model = m.model, form = formOf(m);
    if (!form) return;
    var hash = decodeURIComponent(location.hash.slice(1)), id = hash.replace(/\/(delete|activate)\/?$/, "");
    if (m.mode === "change") {
      if (/\/delete\/?$/.test(hash)) {
        if (E[model].noDelete) { location.replace(changeUrl(model, id)); return; }
        location.replace("md_" + model + "_delete.html#" + id); return;
      }
      var rec = get(model, id);
      if (!rec) { flash("warning", cap(E[model].verbose) + " with ID “" + esc(id) + "” doesn’t exist. Perhaps it was deleted?"); location.replace(listFile(model)); return; }
      // "Reactivate user" (QA: /admin/users/user/<id>/activate/) -> reactivate, then show the user
      if (model === "user" && /\/activate\/?$/.test(hash)) {
        if (rec.status === "Suspended") { reactivate(rec); save(); flash("success", "The user “" + esc(labelOf("user", rec)) + "” was reactivated."); }
        history.replaceState(null, "", "#" + id); location.reload(); return; // same page, new hash: reload to show it
      }
      var tpl = get(model, m.templateId);
      setTitleBits(model, tpl ? labelOf(model, tpl) : null, labelOf(model, rec));
      if (tpl && model === "poi") setTitleBits(model, tpl.fields.name, rec.fields.name);
      pointLinksTo(model, m.templateId, id);
      fillForm(form, rec, model);
      if (model === "productcategory") initSubcategoryInline(form, rec);
      if (model === "user") initUserControls(form, rec);
      if (model === "driver") initDriverReadonly(form, rec);
    }
    showFlash();
  }

  // ---------- Users & Access: account status ----------
  function suspend(rec, type, reason, remarks) {
    if (rec.status !== "Suspended") rec.statusBeforeSuspend = rec.status || "Active";
    rec.status = "Suspended"; rec.deactivation = { type: type, reason: reason, remarks: remarks }; rec.dirty = true;
  }
  // Back to what the account was before (an invited user who never signed in is still "Invited")
  function reactivate(rec) { rec.status = rec.statusBeforeSuspend || (rec.lastActive ? "Active" : "Invited"); delete rec.deactivation; rec.dirty = true; }

  // User edit page: the account buttons QA shows for the user's status
  //   Reinvite — not active yet; Deactivate user — not suspended; Reactivate user — suspended
  function initUserControls(form, rec) {
    var deact = form.querySelector('.submit-row a.deletelink'), bar = deact ? deact.parentNode : form.querySelector(".submit-row div div");
    if (!bar) return;
    var st = rec.status || "Active";
    if (deact) deact.style.display = st === "Suspended" ? "none" : "";
    if (st !== "Active" && !bar.querySelector('[name="_reinvite"]')) {
      var b = document.createElement("button"); b.type = "submit"; b.name = "_reinvite"; b.value = "1"; b.className = "dfms-btn-secondary"; b.textContent = " Reinvite ";
      bar.insertBefore(b, bar.firstChild);
    }
    if (st === "Suspended" && !bar.querySelector(".demo-reactivate")) {
      var a = document.createElement("a"); a.href = changeUrl("user", rec.id) + "/activate"; a.className = "dfms-btn-secondary demo-reactivate"; a.textContent = " Reactivate user ";
      a.addEventListener("click", function (e) { e.preventDefault(); history.replaceState(null, "", "#" + rec.id + "/activate"); location.reload(); });
      bar.insertBefore(a, deact ? deact.nextSibling : null);
    }
  }
  // Driver edit page: the linked user account and audit rows
  function initDriverReadonly(form, rec) {
    var ro = rec.readonly || {}, u = rec.fields.user && get("user", rec.fields.user);
    var cell = function (col) { var r = form.querySelector(".form-row.field-" + col + " .readonly"); return r; };
    var uc = cell("user");
    if (uc) uc.innerHTML = u ? '<a href="' + changeUrl("user", u.id) + '">' + esc(labelOf("user", u)) + "</a>" : esc(ro.user || "-");
    var c = cell("current_state"); if (c) c.textContent = rec.state || ro.current_state || "Available";
    c = cell("id"); if (c) c.textContent = rec.id;
    ["created_by", "updated_by"].forEach(function (k) {
      var el = cell(k); if (!el || !ro[k]) return;
      var who = ro[k + "_id"] && get("user", ro[k + "_id"]);
      el.innerHTML = ro[k + "_id"] ? '<a href="' + changeUrl("user", ro[k + "_id"]) + '">' + esc(who ? labelOf("user", who) : ro[k]) + "</a>" : esc(ro[k]);
    });
    ["created_at", "updated_at"].forEach(function (k) { var el = cell(k); if (el && ro[k]) el.textContent = ro[k]; });
    // "To deactivate this driver … go to the Users list": open the driver's own account when we have it
    var go = document.querySelector(".dfms-driver-account-hint a");
    if (go) { go.removeAttribute("data-demo-missing"); go.setAttribute("href", u ? changeUrl("user", u.id) : listFile("user")); }
  }

  // "Deactivate selected users" confirmation page (md_user_suspend.html#<id>[,<id>…])
  function initSuspend(m) {
    var ids = decodeURIComponent(location.hash.slice(1)).split(",").filter(Boolean);
    var recs = ids.map(function (id) { return get("user", id); }).filter(Boolean);
    if (!recs.length) { location.replace(listFile("user")); return; }
    var form = document.querySelector('#content form input[name="action"][value="deactivate_selected_accounts"]');
    form = form && form.form;
    if (!form) return;
    form.setAttribute("data-demo-ua-suspend", "1");
    form.querySelectorAll('input[name="_selected_action"]').forEach(function (h) { h.remove(); });
    var anchor = form.querySelector('input[type="submit"]').parentNode;
    recs.forEach(function (r) { var h = document.createElement("input"); h.type = "hidden"; h.name = "_selected_action"; h.value = r.id; form.insertBefore(h, anchor); });
    var ul = document.querySelector("#content form ~ div ul, #content .content > div ul");
    if (ul) ul.innerHTML = recs.map(function (r) { return "<li>" + esc(r.fields.employee_id || "None") + " — " + esc(fullName(r.fields)) + "</li>"; }).join("");
    showFlash();
  }
  function handleSuspendSubmit(form) {
    var ids = [].map.call(form.querySelectorAll('input[name="_selected_action"]'), function (h) { return h.value; });
    var type = form.querySelector('[name="deactivation_type"]'), reason = form.querySelector('[name="reason"]'), remarks = form.querySelector('[name="admin_remarks"]');
    var recs = ids.map(function (id) { return get("user", id); }).filter(Boolean);
    recs.forEach(function (r) { suspend(r, type ? type.value : "temporary", reason ? reason.value.trim() : "", remarks ? remarks.value.trim() : ""); });
    save();
    var how = type && type.value === "permanent" ? "permanently deactivated" : "suspended";
    flash("success", recs.length === 1 ? "The user “" + esc(labelOf("user", recs[0])) + "” was " + how + "." : recs.length + " users were " + how + ".");
    location.href = listFile("user");
    return true;
  }

  // Product category edit page lists its sub-categories inline (real formset markup)
  function initSubcategoryInline(form, cat) {
    var total = form.querySelector('[name="sub_categories-TOTAL_FORMS"]'), initial = form.querySelector('[name="sub_categories-INITIAL_FORMS"]');
    if (!total) return;
    var rows = [].slice.call(form.querySelectorAll('tr.form-row[id^="sub_categories-"]:not(.empty-form), .inline-related[id^="sub_categories-"]:not(.empty-form)'))
      .filter(function (r) { return /^sub_categories-\d+$/.test(r.id); });
    var tplRow = rows[0], subs = all("productsubcategory").filter(function (s) { return s.fields.category === cat.id; });
    if (!tplRow) return;
    rows.forEach(function (r) { r.remove(); });
    var anchor = form.querySelector('[id="sub_categories-empty"]') || null, parent = (anchor && anchor.parentNode) || tplRow.parentNode || form;
    subs.forEach(function (s, i) {
      var row = tplRow.cloneNode(true);
      row.id = "sub_categories-" + i;
      row.querySelectorAll("[name], [id], [for]").forEach(function (el) {
        ["name", "id", "for"].forEach(function (a) { var v = el.getAttribute(a); if (v) el.setAttribute(a, v.replace(/sub_categories-\d+-/, "sub_categories-" + i + "-")); });
      });
      var set = function (n, v) { var el = row.querySelector('[name="sub_categories-' + i + "-" + n + '"]'); if (!el) return; if (el.type === "checkbox") el.checked = !!v; else el.value = v; };
      set("id", s.id); set("category", cat.id); set("sub_category_code", s.fields.sub_category_code || ""); set("sub_category_name", s.fields.sub_category_name || "");
      set("is_active", s.fields.is_active !== false); set("DELETE", false);
      row.querySelectorAll(".original p, td.original p").forEach(function (p) { p.textContent = labelOf("productsubcategory", s); });
      parent.insertBefore(row, anchor);
    });
    total.value = subs.length; if (initial) initial.value = subs.length;
  }
  function saveSubcategoryInline(form, cat) {
    var total = +((form.querySelector('[name="sub_categories-TOTAL_FORMS"]') || {}).value || 0);
    for (var i = 0; i < total; i++) {
      var g = function (n) { return form.querySelector('[name="sub_categories-' + i + "-" + n + '"]'); };
      if (!g("sub_category_code")) continue;
      var sid = g("id") && g("id").value, code = g("sub_category_code").value.trim(), name = g("sub_category_name").value.trim();
      var del = g("DELETE") && g("DELETE").checked;
      if (sid && del) { if (!blockedBy("productsubcategory", get("productsubcategory", sid))) removeRecords("productsubcategory", [sid]); continue; }
      if (!code && !name) continue;
      var rec = sid && get("productsubcategory", sid);
      if (!rec) { rec = { id: uuid(), fields: {}, labels: {}, dirty: true }; all("productsubcategory").unshift(rec); }
      rec.fields.category = cat.id; rec.fields.sub_category_code = code; rec.fields.sub_category_name = name;
      rec.fields.is_active = g("is_active") ? g("is_active").checked : true; rec.labels.category = catLabel(cat.id); rec.dirty = true;
    }
  }

  function handleFormSubmit(m, form, submitter) {
    var model = m.model, isAdd = m.mode === "add";
    var id = isAdd ? uuid() : decodeURIComponent(location.hash.slice(1));
    var current = isAdd ? null : get(model, id);
    // "Reinvite" on a user's edit page resends the invitation; it doesn't save the form
    if (model === "user" && submitter && submitter.name === "_reinvite" && current) {
      flash("success", "Invitation re-sent to " + esc(contactOf(current.fields) || fullName(current.fields)) + ".");
      location.reload(); return true;
    }
    var rec = JSON.parse(JSON.stringify(current || { id: id, fields: {}, labels: {} }));
    readForm(form, rec, model);
    clearErrors(form);
    var errors = validate(model, form, rec, id);
    if (errors.length) { showErrors(form, errors); return true; }
    rec.dirty = true;
    if (model === "product" && rec.fields.category) rec.labels.category = catLabel(rec.fields.category) || rec.labels.category;
    if (model === "loadingunloadingpoint" && isAdd) rec.createdAtText = new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).replace(/(\w{3}) /, "$1. ").replace(" AM", " a.m.").replace(" PM", " p.m.");
    if (model === "user") saveUserExtras(rec, isAdd);
    if (model === "driver") saveDriverExtras(rec, isAdd);
    rec.label = labelOf(model, rec);
    var list = all(model);
    if (isAdd) list.unshift(rec); else list.splice(list.indexOf(current), 1, rec);
    if (model === "productcategory" && !isAdd) saveSubcategoryInline(form, rec);
    save();
    var link = "“<a href=\"" + changeUrl(model, rec.id) + "\">" + esc(rec.label) + "</a>”";
    if (model === "user" && isAdd) flash("success", "Invitation sent to " + esc(contactOf(rec.fields)) + ". The user " + link + " was added successfully.");
    else flash("success", "The " + esc(E[model].verbose) + " " + link + " was " + (isAdd ? "added" : "changed") + " successfully.");
    location.href = listFile(model);
    return true;
  }

  // Department follows the roles (as on QA): learnt from the sample users that have a single role
  function departmentFor(roleIds) {
    var map = {};
    SEED.entities.user.records.forEach(function (r) { var ids = r.fields.role || []; if (ids.length === 1 && r.fields.department) map[ids[0]] = r.fields.department; });
    var out = [];
    roleIds.forEach(function (id) { String(map[id] || "").split(", ").forEach(function (d) { if (d && out.indexOf(d) < 0) out.push(d); }); });
    return out.sort().join(", ");
  }
  function saveUserExtras(rec, isAdd) {
    var f = rec.fields;
    if (isAdd) {
      rec.status = "Invited"; rec.lastActive = "";
      if (f.invite_channel === "email") f.phone_number = f.phone_number || ""; else f.email = f.email || "";
      if (!f.two_fa_setting) { f.two_fa_setting = "none"; rec.labels.two_fa_setting = "None"; }
    }
    var dep = departmentFor(f.role || []); if (dep) f.department = dep;
    // A driver's name, employee id and contact live on their user account
    var d = linkedDriver(rec.id);
    if (d) {
      d.fields.first_name = f.first_name; d.fields.last_name = f.last_name; d.fields.employee_id = f.employee_id;
      d.fields.email = f.email; if (f.phone_number) d.fields.contact_number = f.phone_number;
      d.label = labelOf("driver", d); d.dirty = true;
    }
  }
  function saveDriverExtras(rec, isAdd) {
    var f = rec.fields, now = djangoNow(), ro = rec.readonly = rec.readonly || {};
    ro.updated_by = me(); ro.updated_by_id = ""; ro.updated_at = now;
    if (isAdd) {
      ro.created_by = ro.updated_by; ro.created_by_id = ""; ro.created_at = now; rec.state = "Available";
      // "Creates the tenant User with Driver role and Operations department" (Add driver form)
      var u = { id: uuid(), dirty: true, status: "Invited", lastActive: "", extraRoles: ["Driver"],
        fields: { first_name: f.first_name, last_name: f.last_name, employee_id: f.employee_id, email: f.email || "", phone_number: f.contact_number || "",
          role: [], department: "Operations", two_fa_setting: "none" }, labels: { two_fa_setting: "None" } };
      u.label = labelOf("user", u);
      all("user").unshift(u);
      f.user = u.id;
    } else {
      var lu = f.user && get("user", f.user);
      if (lu) { lu.fields.email = f.email; lu.fields.phone_number = f.contact_number; lu.label = labelOf("user", lu); lu.dirty = true; }
    }
  }

  // ---------- Delete ----------
  function blockedBy(model, rec) {
    if (!rec) return null;
    var hits = (DEPENDENTS[model] || []).map(function (d) {
      return [all(d[0]).filter(function (r) { return r.fields[d[1]] === rec.id; }).length, d[2]];
    }).filter(function (h) { return h[0] > 0; });
    if (rec.refs && rec.refs.count) hits.push([rec.refs.count, rec.refs.what]);
    if (!hits.length) return null;
    hits.sort(function (a, b) { return b[0] - a[0]; });
    var f = rec.fields, name = E[model].blockName ? E[model].blockName(f) : labelOf(model, rec), code = E[model].code ? E[model].code(f) : rec.id;
    return "Cannot delete '" + name + "' (" + code + ") — " + hits[0][0] + " " + hits[0][1] + " currently assigned. Deactivate it instead.";
  }
  function removeRecords(model, ids) {
    var list = all(model);
    ids.forEach(function (id) { var r = get(model, id); if (r) list.splice(list.indexOf(r), 1); });
  }
  function initDelete(m) {
    var model = m.model, ids = decodeURIComponent(location.hash.slice(1)).split(",").filter(Boolean);
    var recs = ids.map(function (id) { return get(model, id); }).filter(Boolean);
    if (!recs.length) { location.replace(listFile(model)); return; }
    // Same rule as QA: records in use can't be deleted -> back to the record with an error
    for (var i = 0; i < recs.length; i++) {
      var why = blockedBy(model, recs[i]);
      if (why) { flash("error", esc(why)); location.replace(recs.length === 1 ? changeUrl(model, recs[0].id) : listFile(model)); return; }
    }
    var V = E[model], content = document.getElementById("content-main") || document.getElementById("content");
    var labels = recs.map(function (r) { return labelOf(model, r); });
    // Breadcrumbs (the page may be borrowed from another entity)
    var bc = document.querySelector(".breadcrumbs");
    if (bc) bc.innerHTML = '<a href="admin.html">Home</a> › ' + (model === "helper" ? "Users" : "Master Data") + ' › <a href="' + listFile(model) + '">' + esc(V.title) + "</a> › " +
      (recs.length === 1 ? '<a href="' + changeUrl(model, recs[0].id) + '">' + esc(labels[0]) + "</a> › Delete" : "Delete multiple objects");
    document.title = (recs.length === 1 ? "Are you sure?" : "Delete multiple objects") + " | Demo Agro Ltd Admin";
    var p = content.querySelector("p");
    if (p) p.textContent = recs.length === 1 ? "Are you sure you want to permanently delete the " + V.verbose + " \"" + labels[0] + "\"?" : "Are you sure you want to permanently delete the selected " + V.plural + "?";
    content.querySelectorAll("h2").forEach(function (h) {
      var ul = h.nextElementSibling; if (!ul || ul.tagName !== "UL") return;
      if (/summary/i.test(h.textContent)) ul.innerHTML = "<li>" + esc(cap(V.plural)) + ": " + recs.length + "</li>";
      if (/objects/i.test(h.textContent)) ul.innerHTML = recs.map(function (r, i) { return "<li>" + esc(cap(V.verbose)) + ': <a href="' + changeUrl(model, r.id) + '">' + esc(labels[i]) + "</a></li>"; }).join("");
    });
    content.querySelectorAll("a.cancel-link, a.button.cancel-link, a[href*='_change.html']").forEach(function (a) {
      if (/take me back/i.test(a.textContent)) { a.setAttribute("href", recs.length === 1 ? changeUrl(model, recs[0].id) : listFile(model)); a.removeAttribute("data-demo-missing"); }
    });
    var form = content.querySelector("form");
    if (form) form.setAttribute("data-demo-md-delete", "1");
    showFlash();
  }
  function handleDeleteSubmit(m, form) {
    var model = m.model, ids = decodeURIComponent(location.hash.slice(1)).split(",").filter(Boolean);
    var reason = form.querySelector('[name="delete_reason"]');
    if (reason && !reason.value.trim()) { reason.reportValidity && reason.reportValidity(); return true; }
    var recs = ids.map(function (id) { return get(model, id); }).filter(Boolean);
    var labels = recs.map(function (r) { return labelOf(model, r); });
    removeRecords(model, ids);
    save();
    flash("success", recs.length === 1 ? "The " + esc(E[model].verbose) + " “" + esc(labels[0]) + "” was deleted successfully." : "Successfully deleted " + recs.length + " " + esc(E[model].plural) + ".");
    location.href = listFile(model);
    return true;
  }

  // ---------- Keep other screens in step with the session's master data ----------
  // Any dropdown whose options are master records (detected by their ids) is rebuilt from the store.
  function optionText(model, rec, sample) {
    var f = rec.fields, base;
    switch (model) {
      case "poi": base = f.name; return sample && /\([^)]*\)\s*$/.test(sample) ? base + " (" + f.poi_code + ")" : base;
      case "brand": return f.brand_name;
      case "vehicle": return f.registration_number;
      case "productcategory": return f.category_name + " (" + f.category_code + ")";
      case "productsubcategory": return f.sub_category_name + " (" + f.sub_category_code + ")";
      case "loadingunloadingpoint": return labelOf(model, rec);
      default: return labelOf(model, rec);
    }
  }
  function syncSelects() {
    var idToModel = {};
    Object.keys(SEED.entities).forEach(function (m) { SEED.entities[m].records.forEach(function (r) { idToModel[r.id] = m; }); all(m).forEach(function (r) { idToModel[r.id] = m; }); });
    document.querySelectorAll("select").forEach(function (sel) {
      if (sel.closest(".empty-form")) return;
      var opts = [].slice.call(sel.options), hit = opts.filter(function (o) { return idToModel[o.value]; })[0];
      if (!hit) return;
      // Autocomplete pickers (drivers on transport orders / leave) hold only the chosen option; their search is answered below
      if (sel.classList.contains("admin-autocomplete")) { opts.forEach(function (o) { var r = idToModel[o.value] && get(idToModel[o.value], o.value); if (r) o.textContent = labelOf(idToModel[o.value], r); }); return; }
      var model = idToModel[hit.value], sample = hit.textContent.trim(), keep = sel.multiple ? [].map.call(sel.selectedOptions, function (o) { return o.value; }) : [sel.value];
      var placeholders = opts.filter(function (o) { return !o.value; });
      var recs = all(model).filter(function (r) { return (r.fields.is_active !== false && r.status !== "Suspended") || keep.indexOf(r.id) >= 0; });
      if (model === "productsubcategory") { var catSel = document.querySelector('select[name="category"]'); if (catSel && catSel.value) recs = recs.filter(function (r) { return r.fields.category === catSel.value || keep.indexOf(r.id) >= 0; }); }
      sel.innerHTML = "";
      placeholders.forEach(function (o) { sel.add(o); });
      recs.forEach(function (r) { var o = new Option(optionText(model, r, sample), r.id); o.selected = keep.indexOf(r.id) >= 0; sel.add(o); });
      if (!sel.multiple) sel.value = keep[0] && get(model, keep[0]) ? keep[0] : (placeholders[0] ? "" : sel.value);
    });
    // Product dropdowns on requisition/transport forms use generated values; list the session's products instead.
    document.querySelectorAll('select[name$="-product"], select[name="product"]').forEach(function (sel) {
      if (sel.closest(".empty-form") && !/__prefix__/.test(sel.name)) return;
      var keepText = sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].textContent : "";
      var placeholders = [].filter.call(sel.options, function (o) { return !o.value; });
      sel.innerHTML = ""; placeholders.forEach(function (o) { sel.add(o); });
      active("product").forEach(function (p) {
        var o = new Option("[" + (p.fields.product_item_code || "") + "] " + p.fields.product_name + " — " + (catLabel(p.fields.category) || p.labels.category || "").replace(/ \([^)]*\)$/, "") + " — " + ((p.labels || {}).sub_category || "").replace(/ \([^)]*\)$/, ""), p.id);
        if (o.textContent === keepText) o.selected = true;
        sel.add(o);
      });
    });
  }

  // Lookup APIs used by forms (product category/sub-category dropdowns, product autofill, POI stock)
  var H = window.DEMO_API_HANDLERS = window.DEMO_API_HANDLERS || [];
  H.push({ match: /\/admin\/master_data\/product\/ajax\/categories\/$/, fn: function (u) {
    var t = u.searchParams.get("product_type");
    return active("productcategory").filter(function (c) { var pt = (c.labels || {}).product_type || c.fields.product_type; return !t || pt === t || String(pt).replace(/\s/g, "") === t; })
      .map(function (c) { return { id: c.id, label: catLabel(c.id) }; });
  } });
  H.push({ match: /\/admin\/master_data\/product\/ajax\/subcategories\/$/, fn: function (u) {
    var c = u.searchParams.get("category_id");
    return active("productsubcategory").filter(function (s) { return s.fields.category === c; }).map(function (s) { return { id: s.id, label: optionText("productsubcategory", s) }; });
  } });
  H.push({ match: /\/admin\/requisitions\/product-detail\/[0-9a-f-]+\/$/, fn: function (u, path) {
    var p = get("product", path.split("/")[4]); if (!p) return null;
    var f = p.fields;
    return { product_item_code: f.product_item_code || "", product_name: f.product_name, product_category: (catLabel(f.category) || "").replace(/ \([^)]*\)$/, ""),
      product_sub_category: ((p.labels || {}).sub_category || "").replace(/ \([^)]*\)$/, ""), type_of_packing: f.standard_pack_size || "", weight_per_unit: f.weight_per_unit || "", unit_of_measure: (p.labels || {}).unit_of_measure || f.unit_of_measure || "" };
  } });
  H.push({ match: /\/admin\/requisitions\/poi-stock\/[0-9a-f-]+\/$/, fn: function (u, path, fallback) {
    var r = get("poi", path.split("/")[4]); if (!r) return null;
    var cap = parseFloat(r.fields.storage_capacity_mt) || 0, cur = parseFloat(r.fields.current_stock_mt || (r.readonly || {}).current_stock_mt) || (fallback ? fallback.current_stock_mt : 0) || 0;
    return { poi_id: r.id, poi_name: r.fields.name, poi_type: r.fields.poi_type, storage_capacity_mt: cap, current_stock_mt: cur, free_capacity_mt: +(cap - cur).toFixed(3), last_updated: new Date().toISOString() };
  } });
  // ---------- Live GPS demo fleet: trucks driving real roads between sites ----------
  // Plan and roads come from api-data.js (__demo_fleet, built by build.js/routes.js). Positions are a pure function
  // of the clock, so every refresh moves each truck on along its road and every viewer sees the same scene.
  // Each truck loops: stop at the origin site -> drive -> stop at the destination -> drive back.
  var FLEET = (window.DEMO_API || {}).__demo_fleet;
  var fleetGeo = {};
  function haversine(a, b) {
    var r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 12742000 * Math.asin(Math.sqrt(h));
  }
  function routeGeo(id) { // cumulative distance along the road, computed once
    if (fleetGeo[id]) return fleetGeo[id];
    var pts = FLEET.routes[id].pts, cum = [0];
    for (var i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversine(pts[i - 1], pts[i]));
    return (fleetGeo[id] = { pts: pts, cum: cum, len: cum[cum.length - 1] });
  }
  function pointAt(g, d) { // position d metres along the road, and the index of the point just behind it
    d = Math.max(0, Math.min(g.len, d));
    var lo = 0, hi = g.cum.length - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (g.cum[mid] <= d) lo = mid; else hi = mid; }
    var seg = g.cum[hi] - g.cum[lo], t = seg ? (d - g.cum[lo]) / seg : 0, a = g.pts[lo], b = g.pts[hi];
    return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], i: lo };
  }
  function bearing(a, b) {
    var r = Math.PI / 180, y = Math.sin((b[1] - a[1]) * r) * Math.cos(b[0] * r);
    var x = Math.cos(a[0] * r) * Math.sin(b[0] * r) - Math.sin(a[0] * r) * Math.cos(b[0] * r) * Math.cos((b[1] - a[1]) * r);
    return (Math.atan2(y, x) / r + 360) % 360;
  }
  function durationLabel(s) { s = Math.round(s); var m = Math.floor(s / 60); return m ? m + "m " + (s % 60) + "s" : s + "s"; }
  function siteRef(id) { var p = get("poi", id); return p ? { id: p.id, name: p.fields.name, poi_code: p.fields.poi_code } : null; }
  function driveDemoFleet(data, now) {
    if (!FLEET) return;
    var byId = {}; data.vehicles.forEach(function (v) { byId[v.vehicle_id] = v; });
    // Drivers of this session, one per moving truck (more trucks than drivers -> "Unassigned", as on QA)
    var drivers = active("driver").map(function (d) { return fullName(d.fields); }), nextDriver = 0;
    var stamp = new Date(now).toISOString();
    FLEET.trucks.forEach(function (t) {
      var v = byId[t.vehicle], rec = get("vehicle", t.vehicle);
      if (!v || !rec || rec.fields.is_active === false) return; // removed or deactivated in this session: no signal
      var base = { has_position: true, connection_status: "online", staleness_minutes: 0, position_source: "gps", recorded_at: stamp, received_at: stamp, last_update_at: stamp,
        device_id: v.device_id || t.device || "", tail_color: "#22c55e" };
      var parkAt = t.park || (rec.operationalStatus === "Under Maintenance" && FLEET.routes[t.route].from);
      if (parkAt) { // parked inside its site (a truck marked Under Maintenance stays at its origin)
        var s = (data.pois || []).filter(function (x) { return x.id === parkAt; })[0] || siteRef(parkAt);
        var since = (now / 1000) % 5400; // parked for up to 90 minutes, then the clock starts again
        Object.assign(v, base, { latitude: +s.latitude || v.latitude, longitude: +s.longitude || v.longitude, speed_kmh: 0, speed: "0", heading_degrees: 0, movement_status: "parked",
          stop_duration_seconds: Math.round(since), stop_duration_label: durationLabel(since), inside_pois: [siteRef(parkAt)].filter(Boolean), inside_geofence: true,
          trail: [], tail: [], origin_poi: null, destination_poi: null, planned_route: null });
        return;
      }
      var g = routeGeo(t.route), cycle = 2 * (t.drive + t.dwell);
      var c = ((now / 1000) / cycle + t.offset) % 1 * cycle; // seconds into this truck's cycle
      var outbound = c < t.drive + t.dwell, leg = outbound ? c : c - t.drive - t.dwell; // stop first, then drive
      var from = outbound ? FLEET.routes[t.route].from : FLEET.routes[t.route].to, to = outbound ? FLEET.routes[t.route].to : FLEET.routes[t.route].from;
      var driver = nextDriver < drivers.length ? drivers[nextDriver++] : "";
      if (leg < t.dwell) { // stopped at the site it is about to leave: idle for a minute, then parked
        var here = pointAt(g, outbound ? 0 : g.len).p;
        Object.assign(v, base, { latitude: here[0], longitude: here[1], speed_kmh: 0, speed: "0", heading_degrees: v.heading_degrees || 0, movement_status: leg < 60 ? "idle" : "parked",
          stop_duration_seconds: Math.round(leg), stop_duration_label: durationLabel(leg), inside_pois: [siteRef(from)].filter(Boolean), inside_geofence: true,
          driver_name: driver, origin_poi: siteRef(from), destination_poi: siteRef(to), trail: [], tail: [], planned_route: null });
        return;
      }
      var f = (leg - t.dwell) / t.drive, d = outbound ? f * g.len : (1 - f) * g.len, at = pointAt(g, d);
      var ahead = pointAt(g, outbound ? d + 150 : d - 150).p;
      // trail: the last ~3 km of road behind the truck; planned route: the road still ahead
      var trail = [], k, i;
      if (outbound) { for (k = Math.max(0, at.i - 25); k <= at.i; k++) trail.push(g.pts[k]); }
      else { for (k = Math.min(g.pts.length - 1, at.i + 26); k > at.i; k--) trail.push(g.pts[k]); }
      trail.push(at.p);
      var plan = [at.p];
      if (outbound) { for (i = at.i + 1; i < g.pts.length; i += 3) plan.push(g.pts[i]); plan.push(g.pts[g.pts.length - 1]); }
      else { for (i = at.i; i >= 0; i -= 3) plan.push(g.pts[i]); plan.push(g.pts[0]); }
      var speed = Math.round(42 + 12 * Math.sin(now / 47000 + t.offset * 10)); // 30-54 kph, gently varying
      Object.assign(v, base, { latitude: +at.p[0].toFixed(6), longitude: +at.p[1].toFixed(6), speed_kmh: speed, speed: String(speed), heading_degrees: Math.round(bearing(at.p, ahead)), movement_status: "moving",
        stop_duration_seconds: 0, stop_duration_label: "0s", inside_pois: [], inside_geofence: false, driver_name: driver,
        origin_poi: siteRef(from), destination_poi: siteRef(to), trail: trail, tail: trail, planned_route: plan });
    });
    data.map_vehicle_count = data.vehicles.filter(function (v) { return v.has_position; }).length;
  }

  // Live GPS: sites and vehicles come from the session
  H.push({ match: /\/api\/v1\/tracking\/live-map\/$/, fn: function (u, path, base) {
    if (!base) return null;
    var data = JSON.parse(JSON.stringify(base)), byId = {};
    data.vehicles.forEach(function (v) { byId[v.vehicle_id] = v; });
    // QA's order for records it already had; ones added in this session go after them
    var inOrder = function (list, baseList, idKey, nameKey) {
      var pos = {}; baseList.forEach(function (x, i) { pos[x[idKey]] = i; });
      return list.sort(function (a, b) {
        var pa = a[idKey] in pos ? pos[a[idKey]] : 1e6, pb = b[idKey] in pos ? pos[b[idKey]] : 1e6;
        return pa - pb || String(a[nameKey]).localeCompare(String(b[nameKey]));
      });
    };
    // Like QA: every vehicle, inactive ones too (they count in "Fleet (n)")
    data.vehicles = all("vehicle").map(function (r) {
      var v = byId[r.id] || { vehicle_id: r.id, has_position: false, latitude: null, longitude: null, trail: [], connection_status: "signal_lost", movement_status: "offline", operational_status: "no_active_to", operational_status_label: "No Active TO", to_status: "no_to", to_status_label: "No active TO", driver_name: "", stop_duration_seconds: 0, is_active: true };
      v.registration_number = v.vehicle_plate = r.fields.registration_number;
      v.is_active = r.fields.is_active !== false;
      if (!v.is_active) { v.operational_status = "inactive"; v.operational_status_label = "Inactive"; }
      else if (r.operationalStatus === "Under Maintenance") { v.operational_status = "under_maintenance"; v.operational_status_label = "Under Maintenance"; }
      else if (v.operational_status === "inactive") { v.operational_status = "no_active_to"; v.operational_status_label = "No Active TO"; }
      return v;
    });
    inOrder(data.vehicles, base.vehicles, "vehicle_id", "registration_number");
    // Sites: from the session; coordinates/geofence fall back to QA's for sites whose edit page wasn't captured
    var basePoi = {}; (base.pois || []).forEach(function (x) { basePoi[x.id] = x; });
    data.pois = active("poi").map(function (p) {
      var f = p.fields, q = basePoi[p.id] || {}, has = f.latitude !== undefined && f.latitude !== "" && f.longitude !== undefined && f.longitude !== "";
      return { id: p.id, name: f.name, poi_code: f.poi_code, poi_type: f.poi_type || q.poi_type,
        latitude: has ? +f.latitude : q.latitude, longitude: has ? +f.longitude : q.longitude,
        geofence_radius_meters: +f.geofence_radius_meters || q.geofence_radius_meters || 200 };
    }).filter(function (x) { return x.latitude != null && x.longitude != null && !isNaN(x.latitude) && !isNaN(x.longitude); });
    inOrder(data.pois, base.pois || [], "id", "name");
    driveDemoFleet(data, Date.now());
    data.refreshed_at = new Date().toISOString(); // "Updated <time>": the moment of this refresh, as on QA
    data.vehicle_count = data.vehicles.length; data.map_vehicle_count = data.vehicles.filter(function (v) { return v.has_position; }).length;
    return data;
  } });

  // Django admin autocomplete (Select2) for driver fields elsewhere: active drivers of this session
  H.push({ match: /^\/admin\/autocomplete\/$/, fn: function (u) {
    if (u.searchParams.get("field_name") !== "driver") return null;
    var term = (u.searchParams.get("term") || "").toLowerCase();
    var res = active("driver").map(function (d) { return { id: d.id, text: labelOf("driver", d) }; }).filter(function (o) { return !term || o.text.toLowerCase().indexOf(term) >= 0; });
    return { results: res, pagination: { more: false } };
  } });

  function updateDashboard() {
    if (!document.body.classList.contains("dashboard")) return;
    var counts = { "Active POIs": active("poi").length, "Active Vehicles": active("vehicle").length, "Active Products": active("product").length };
    document.querySelectorAll("a, div").forEach(function (el) {
      if (el.children.length > 4) return;
      var t = el.textContent.replace(/\s+/g, " ").trim(), m = t.match(/^(\d+) (Active POIs|Active Vehicles|Active Products)$/);
      if (!m) return;
      var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) if (/^\s*\d+\s*$/.test(w.currentNode.textContent)) { w.currentNode.textContent = w.currentNode.textContent.replace(/\d+/, counts[m[2]]); break; }
    });
  }

  function updateVehiclePlanning() {
    if (!/admin_transport_vehicle_planning\.html$/.test(location.pathname)) return;
    var tbody = document.querySelector("#result_list tbody, table tbody");
    if (!tbody || !tbody.rows.length) return;
    var tpl = tbody.rows[0], badges = {};
    [].forEach.call(tbody.rows, function (r) { var b = r.querySelector(".dfms-badge"); if (b) badges[b.textContent.trim()] = b.className; });
    var vehicles = active("vehicle");
    tbody.innerHTML = "";
    vehicles.forEach(function (v, i) {
      var row = tpl.cloneNode(true), c = row.children, st = v.operationalStatus || ((SEED.entities.vehicle.records.filter(function (s) { return s.id === v.id; })[0] || {}).cells || {}).operational_status || "No Active TO";
      st = String(st).replace(/<[^>]+>/g, "").trim();
      row.className = i % 2 ? "row2" : "row1";
      var a = c[0].querySelector("a"); if (a) a.textContent = " " + v.fields.registration_number + " ";
      c[1].textContent = (v.labels || {}).vehicle_type || v.fields.vehicle_type || "-";
      c[2].textContent = v.fields.capacity ? num(v.fields.capacity, 3) + " " + String((v.labels || {}).capacity_unit || "mt").toLowerCase() : "-";
      var b = c[3].querySelector(".dfms-badge"); if (b) { b.textContent = st; b.className = badges[st] || b.className; }
      tbody.appendChild(row);
    });
    document.querySelectorAll("p, span, div").forEach(function (el) { if (el.children.length === 0 && /^\s*\d+ vehicles?\s*$/.test(el.textContent)) el.textContent = el.textContent.replace(/\d+ vehicles?/, vehicles.length + (vehicles.length === 1 ? " vehicle" : " vehicles")); });
  }

  // The sidebar highlights the menu item whose link the URL starts with (/admin/master_data/brand/add/ ->
  // Vehicle Brands). Demo CRUD pages have flat file names, so mark the entity's list link ourselves.
  function activateSidebar(model) {
    var a = [].filter.call(document.querySelectorAll("a.dfms-nav-link"), function (x) { return x.getAttribute("href") === listFile(model); })[0];
    if (!a) return;
    document.querySelectorAll(".dfms-nav-item--active").forEach(function (i) { i.classList.remove("dfms-nav-item--active"); });
    var item = a.closest(".dfms-nav-item"); if (item) item.classList.add("dfms-nav-item--active");
    a.setAttribute("aria-current", "page");
    var group = a.closest(".dfms-nav-group"), btn = group && group.querySelector(".dfms-nav-group-header");
    if (btn && btn.getAttribute("aria-expanded") !== "true") btn.click();
  }

  // ---------- Wiring ----------
  var M = meta();
  var listModel = null;
  Object.keys(SEED.entities).forEach(function (m) { if (location.pathname.split("/").pop() === SEED.entities[m].list) listModel = m; });

  // Old per-record master pages (linked from older bookmarks/logs) -> the CRUD edit page
  var legacy = location.pathname.split("/").pop().match(/^admin_(master_data|users)_([a-z]+)_([0-9a-f_]{36})_(change|delete)\.html$/);
  if (legacy && E[legacy[2]] && !M) { location.replace("md_" + legacy[2] + "_" + legacy[4] + ".html#" + legacy[3].replace(/_/g, "-")); return; }

  (window.DEMO_SUBMIT_HANDLERS = window.DEMO_SUBMIT_HANDLERS || []).push(function (form, submitter) {
    if (M && M.mode === "suspend" && form.getAttribute("data-demo-ua-suspend")) return handleSuspendSubmit(form);
    if (M && (M.mode === "add" || M.mode === "change") && form === formOf(M)) return handleFormSubmit(M, form, submitter);
    if (M && M.mode === "delete" && form.getAttribute("data-demo-md-delete")) return handleDeleteSubmit(M, form);
    if (listModel && form.id === "changelist-form") return handleListSubmit(listModel, form, submitter);
    return false;
  });

  document.addEventListener("DOMContentLoaded", function () {
    if (M && E[M.model]) { if (M.mode === "delete") initDelete(M); else if (M.mode === "suspend") initSuspend(M); else initForm(M); }
    if (listModel) { renderList(listModel); showFlash(); }
    syncSelects();
    updateDashboard();
    updateVehiclePlanning();
    // Category -> sub-category on the product form: re-filter after the user picks a category
    var cat = document.querySelector('select[name="category"]');
    if (cat && M && M.model === "product") cat.addEventListener("change", function () { setTimeout(syncSelects, 0); });
  });
  // After the app's own sidebar script has run (it initialises on DOMContentLoaded)
  window.addEventListener("load", function () { if (M && E[M.model]) activateSidebar(M.model); });
})();
