(function () {
  "use strict";
  // ---------------------------------------------------------------
  // Where booking requests go. (Form service address.)
  var FORM_ACTION = "https://formspree.io/f/moedjzqr";
  // Saved picks survive a refresh.
  var STORE_KEY = "ccc-booking-v1";
  // Calendar: how far ahead a date can be requested (days).
  var CAL_DAYS_AHEAD = 180;
  // The request ID shown before payment (CCC-YYMMDD-XXXX) is kept here so the
  // deposit-received page can show it again for the "Confirm receipt" step.
  var REQ_KEY = "ccc-request-id";
  var PHONE = "346-400-4656";
  var EMAIL = "ccc.htx.ownerop.lucy@gmail.com";
  // ---------------------------------------------------------------

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var behavior = reduceMotion ? "auto" : "smooth";

  var form = $("#booking-form");
  if (!form) return;
  form.setAttribute("action", FORM_ACTION);

  // ===== Catalog, read from the service rows in the page =====
  var items = {};
  var order = [];
  $$("li.rate[data-id]").forEach(function (li) {
    var id = li.getAttribute("data-id");
    var it = {
      id: id,
      code: li.getAttribute("data-code") || "",
      label: li.getAttribute("data-label"),
      price: li.getAttribute("data-price"),
      unit: li.getAttribute("data-unit") || "",
      group: li.getAttribute("data-group") || "",
      section: li.getAttribute("data-section") || "",
      deposit: li.getAttribute("data-deposit") ? Number(li.getAttribute("data-deposit")) : 0,
      pay: li.getAttribute("data-pay") || "",
      direct: li.getAttribute("data-direct") === "1" || !!li.getAttribute("data-pay"),
      li: li, btn: null, card: li.closest("details.service")
    };
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rate-add";
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", "Add " + it.label);
    btn.setAttribute("data-add", id);
    btn.textContent = "Add";
    li.appendChild(btn);
    it.btn = btn;
    items[id] = it;
    order.push(id);
  });

  function priceLine(it) { return it.price + (it.unit ? " " + it.unit : ""); }
  function itemText(it) { return it.label + " (" + priceLine(it) + ")"; }

  // ===== State =====
  var selected = [];          // service ids, in the order they were added
  var dateISO = "";           // requested date, YYYY-MM-DD
  var quizNote = "";          // what the quiz answers were, if the quiz was used

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ ids: selected, date: dateISO, win: $("#time-window").value, quiz: quizNote }));
    } catch (e) { /* storage blocked: fine */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  function clearSaved() { try { localStorage.removeItem(STORE_KEY); } catch (e) {} }

  function isSel(id) { return selected.indexOf(id) !== -1; }

  function say(msg) {
    var live = $("#live");
    live.textContent = "";
    setTimeout(function () { live.textContent = msg; }, 30);
  }

  // add / remove / toggle. Options in the same group are "choose one".
  function add(id, opts) {
    opts = opts || {};
    var it = items[id];
    if (!it || isSel(id)) return false;
    var swapped = null;
    if (it.group) {
      for (var i = selected.length - 1; i >= 0; i--) {
        if (items[selected[i]].group === it.group) { swapped = items[selected[i]]; selected.splice(i, 1); }
      }
    }
    selected.push(id);
    if (opts.openCard && it.card) it.card.open = true;
    afterChange();
    if (!opts.silent) {
      say((swapped ? "Changed " + swapped.label + " to " : "Added ") + it.label + ". " + selected.length + " selected.");
      celebrate(it.btn);
    }
    return true;
  }
  function remove(id, silent) {
    var i = selected.indexOf(id);
    if (i === -1) return;
    selected.splice(i, 1);
    afterChange();
    if (!silent) say("Removed " + items[id].label + ". " + selected.length + " selected.");
  }
  function toggle(id) { if (isSel(id)) remove(id); else add(id); }
  function clearAll() {
    selected = [];
    afterChange();
    say("Cleared your selections.");
  }
  function afterChange() { render(); save(); }

  // ===== A little celebration on Add =====
  function celebrate(btn) {
    if (reduceMotion || !btn) return;
    btn.classList.remove("pop");
    void btn.offsetWidth;
    btn.classList.add("pop");
    var host = btn.parentNode;
    var colors = ["#8d4a30", "#215544", "#d9a441", "#6fa58e"];
    var rect = btn.getBoundingClientRect();
    var hostRect = host.getBoundingClientRect();
    var cx = rect.left - hostRect.left + rect.width / 2;
    var cy = rect.top - hostRect.top + rect.height / 2;
    for (var i = 0; i < 10; i++) {
      var d = document.createElement("span");
      d.className = "confetti";
      var ang = (Math.PI * 2 * i) / 10 + Math.random() * 0.5;
      var dist = 26 + Math.random() * 26;
      d.style.left = cx + "px";
      d.style.top = cy + "px";
      d.style.background = colors[i % colors.length];
      d.style.setProperty("--dx", Math.cos(ang) * dist + "px");
      d.style.setProperty("--dy", Math.sin(ang) * dist + "px");
      host.appendChild(d);
      (function (el) { setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 750); })(d);
    }
  }

  // ===== Render everything that depends on the selection =====
  var selList = $("#sel-list");
  var formList = $("#form-sel-list");
  var bar = $("#sticky-bar");
  var barSel = $("#bar-sel");
  var barBook = $("#bar-book");
  var lastCount = 0;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function removeBtn(it) {
    var b = el("button", "rm-btn");
    b.type = "button";
    b.setAttribute("data-remove", it.id);
    b.setAttribute("aria-label", "Remove " + it.label);
    b.innerHTML = '<span aria-hidden="true">&times;</span>';
    return b;
  }

  function render() {
    var n = selected.length;
    // buttons on the service rows
    order.forEach(function (id) {
      var it = items[id], on = isSel(id);
      it.btn.setAttribute("aria-pressed", on ? "true" : "false");
      it.btn.textContent = on ? "Added \u2713" : "Add";
      it.li.classList.toggle("is-selected", on);
    });
    // per-card badges
    $$("details.service").forEach(function (card) {
      var c = 0;
      selected.forEach(function (id) { if (items[id].card === card) c++; });
      var badge = $(".svc-count", card);
      badge.hidden = c === 0;
      badge.textContent = c + " selected";
      card.classList.toggle("has-sel", c > 0);
    });

    // selections panel
    selList.innerHTML = "";
    selected.forEach(function (id) {
      var it = items[id];
      var li = el("li", "sel-item");
      var t = el("div", "sel-text");
      t.appendChild(el("span", "sel-name", it.label));
      t.appendChild(el("span", "sel-price", priceLine(it)));
      li.appendChild(t);
      li.appendChild(removeBtn(it));
      selList.appendChild(li);
    });
    $("#sel-count").textContent = n;
    $("#sel-empty").hidden = n > 0;
    $("#sel-note").hidden = n === 0;
    $(".sel-actions").hidden = n === 0;
    $("#sel-book").textContent = "Book " + (n === 1 ? "this" : "these");

    // form list
    formList.innerHTML = "";
    selected.forEach(function (id) {
      var it = items[id];
      var li = el("li", "form-sel-item");
      var t = el("div", "sel-text");
      t.appendChild(el("span", "sel-name", it.label));
      var p = el("span", "sel-price", priceLine(it));
      t.appendChild(p);
      if (it.pay) {
        t.appendChild(el("span", "tag tag-block", "Book directly: deposit $" + it.deposit + " after you send"));
      } else if (it.direct) {
        t.appendChild(el("span", "tag tag-block", "No walkthrough needed"));
      }
      li.appendChild(t);
      li.appendChild(removeBtn(it));
      formList.appendChild(li);
    });
    $("#form-sel-empty").hidden = n > 0;
    if (n > 0) $("#services-error").hidden = true;
    fillAddSelect();

    // sticky bar (phones and tablets)
    barSel.hidden = n === 0;
    $("#bar-count").textContent = n;
    barBook.textContent = n === 0 ? "Pick your services" : "Book now";
    barBook.setAttribute("href", n === 0 ? "#services" : "#request");
    if (n !== lastCount && !reduceMotion) {
      var bc = $("#bar-count");
      bc.classList.remove("bump"); void bc.offsetWidth; bc.classList.add("bump");
    }
    lastCount = n;
    if (n === 0) setSheet(false);

    // job-detail questions: only those that match the picks
    var any = false;
    $$("#service-details [data-for]").forEach(function (f) {
      var ids = f.getAttribute("data-for").split(/\s+/);
      var on = ids.some(isSel);
      f.hidden = !on;
      if (on) any = true;
    });
    $("#service-details").hidden = !any;

    syncHidden();
  }

  // The add-a-service dropdown lists everything not yet picked.
  function fillAddSelect() {
    var sel = $("#add-select");
    var keep = sel.value;
    sel.innerHTML = "";
    var first = document.createElement("option");
    first.value = ""; first.textContent = "Choose a service";
    sel.appendChild(first);
    var groupEl = null, lastTitle = "";
    order.forEach(function (id) {
      var it = items[id];
      if (isSel(id)) return;
      var title = $(".svc-title", it.card).textContent;
      if (title !== lastTitle) { groupEl = document.createElement("optgroup"); groupEl.label = title; sel.appendChild(groupEl); lastTitle = title; }
      var o = document.createElement("option");
      o.value = id; o.textContent = it.label + " (" + priceLine(it) + ")";
      groupEl.appendChild(o);
    });
    if (keep && items[keep] && !isSel(keep)) sel.value = keep;
  }

  // Readable list plus one hidden field per service, rebuilt on every change.
  function directList() {
    return selected.filter(function (id) { return !!items[id].direct; });
  }
  function requestType() {
    var d = directList().length;
    if (d === 0) return "Walkthrough and quote";
    if (d === selected.length) return "Direct booking (simple jobs)";
    return "Mixed: walkthrough and quote for most, direct booking for " + directList().map(function (id) { return items[id].label; }).join("; ");
  }
  function syncHidden() {
    var box = $("#synced-fields");
    box.innerHTML = "";
    function hid(name, value) {
      var i = document.createElement("input");
      i.type = "hidden"; i.name = name; i.value = value;
      box.appendChild(i);
    }
    var lines = selected.map(function (id, k) { return (k + 1) + ") " + itemText(items[id]); });
    hid("Services selected", lines.join("; "));
    hid("Number of services", String(selected.length));
    selected.forEach(function (id, k) {
      hid("Service " + (k + 1), itemText(items[id]));
      if (items[id].code) hid("Service " + (k + 1) + " code", items[id].code);   // hidden service code from the Smart Code catalog
    });
    hid("Request type", selected.length ? requestType() : "");
    if (dateISO) hid("Requested date (YYYY-MM-DD)", dateISO);
    if (quizNote) hid("Quiz answers", quizNote);
  }

  // ===== Click handling for add / remove =====
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t.closest) return;
    var addBtn = t.closest("[data-add]");
    if (addBtn) { toggle(addBtn.getAttribute("data-add")); return; }
    var rm = t.closest("[data-remove]");
    if (rm) {
      var inSheet = !!rm.closest("#sel-list");
      remove(rm.getAttribute("data-remove"));
      var f = $((inSheet ? "#sel-list" : "#form-sel-list") + " .rm-btn");
      if (f) f.focus(); else if (!inSheet) $("#add-select").focus();
      return;
    }
  });
  $("#sel-clear").addEventListener("click", clearAll);
  $("#add-select-btn").addEventListener("click", function () {
    var v = $("#add-select").value;
    if (!v) { say("Choose a service from the list first."); $("#add-select").focus(); return; }
    add(v, { openCard: true });
    $("#add-select").value = "";
    $("#add-select").focus();
  });

  // ===== Selections sheet on phones / tablets =====
  var panel = $("#selections");
  function setSheet(open) {
    panel.classList.toggle("open", open);
    barSel.setAttribute("aria-expanded", open ? "true" : "false");
  }
  barSel.addEventListener("click", function () { setSheet(!panel.classList.contains("open")); });
  $("#sel-close").addEventListener("click", function () { setSheet(false); barSel.focus(); });
  $("#sel-book").addEventListener("click", function () { setSheet(false); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && panel.classList.contains("open")) { setSheet(false); barSel.focus(); }
  });
  // Hide the bar while the form is on screen.
  var reqSection = $("#request");
  if (bar && reqSection && "IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      var on = entries[0].isIntersecting;
      bar.classList.toggle("is-hidden", on);
      if (on) setSheet(false);
    }, { threshold: 0.12 }).observe(reqSection);
  }

  function scrollToEl(node, focusNode) {
    node.scrollIntoView({ behavior: behavior, block: "start" });
    if (focusNode) setTimeout(function () { focusNode.focus({ preventScroll: true }); }, reduceMotion ? 0 : 450);
  }

  // ===== Calendar =====
  var DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parseISO(s) { var p = s.split("-"); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); }
  function longDate(d) { return DOW[d.getDay()] + ", " + MONTHS[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear(); }
  function startOfToday() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
  var today = startOfToday();
  var maxDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + CAL_DAYS_AHEAD);
  var viewY = today.getFullYear(), viewM = today.getMonth();
  function pickable(d) { return d >= today && d <= maxDate && d.getDay() !== 0; }

  var calBody = $("#cal-body");
  function renderCal(focusISO) {
    $("#cal-title").textContent = MONTHS[viewM] + " " + viewY;
    $("#cal-prev").disabled = viewY === today.getFullYear() && viewM === today.getMonth();
    $("#cal-next").disabled = viewY === maxDate.getFullYear() && viewM === maxDate.getMonth();
    calBody.innerHTML = "";
    var first = new Date(viewY, viewM, 1);
    var cursor = new Date(viewY, viewM, 1 - first.getDay());
    // which day holds the tab stop
    var tabISO = focusISO || (dateISO && inView(parseISO(dateISO)) ? dateISO : "");
    if (!tabISO) {
      var probe = new Date(viewY, viewM, 1);
      while (probe.getMonth() === viewM && !pickable(probe)) probe.setDate(probe.getDate() + 1);
      if (probe.getMonth() === viewM) tabISO = iso(probe);
    }
    for (var w = 0; w < 6; w++) {
      var tr = document.createElement("tr");
      for (var d = 0; d < 7; d++) {
        var td = document.createElement("td");
        if (cursor.getMonth() === viewM) {
          var b = document.createElement("button");
          b.type = "button";
          b.className = "cal-day";
          var key = iso(cursor);
          b.setAttribute("data-date", key);
          b.textContent = cursor.getDate();
          var ok = pickable(cursor);
          b.disabled = !ok;
          var lab = longDate(cursor);
          if (cursor.getDay() === 0) lab += ", not available";
          else if (cursor < today) lab += ", past";
          else if (!ok) lab += ", too far ahead";
          b.setAttribute("aria-label", lab);
          b.setAttribute("aria-pressed", key === dateISO ? "true" : "false");
          if (key === dateISO) b.classList.add("is-picked");
          if (cursor.getTime() === today.getTime()) b.classList.add("is-today");
          b.tabIndex = key === tabISO ? 0 : -1;
          td.appendChild(b);
        }
        tr.appendChild(td);
        cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
      }
      calBody.appendChild(tr);
    }
  }
  function inView(d) { return d.getFullYear() === viewY && d.getMonth() === viewM; }

  function setDate(key, opts) {
    dateISO = key || "";
    var inp = $("#req-date");
    inp.value = key ? longDate(parseISO(key)) : "";
    if (key) { $("#date-error").hidden = true; }
    var d = key ? parseISO(key) : null;
    if (d) { viewY = d.getFullYear(); viewM = d.getMonth(); }
    renderCal(key || "");
    syncHidden();
    save();
    if (key && !(opts && opts.silent)) say("Requested date: " + longDate(d));
  }
  function focusDay(key) {
    var b = $('.cal-day[data-date="' + key + '"]', calBody);
    if (b) b.focus();
  }
  function stepDate(fromISO, delta) {
    var d = parseISO(fromISO);
    for (var i = 0; i < 60; i++) {
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta);
      if (d > maxDate || d < today) return null;
      if (pickable(d)) return iso(d);
    }
    return null;
  }
  calBody.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest(".cal-day");
    if (!b || b.disabled) return;
    setDate(b.getAttribute("data-date"));
    focusDay(b.getAttribute("data-date"));
  });
  calBody.addEventListener("keydown", function (e) {
    var b = e.target.closest && e.target.closest(".cal-day");
    if (!b) return;
    var key = b.getAttribute("data-date");
    var delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    var next = null;
    if (delta) { e.preventDefault(); next = stepDate(key, delta); }
    else if (e.key === "PageDown" || e.key === "PageUp") {
      e.preventDefault();
      var d = parseISO(key);
      var m = new Date(d.getFullYear(), d.getMonth() + (e.key === "PageDown" ? 1 : -1), 1);
      var tm = m.getMonth();
      for (var c = 0; c < 31 && m.getMonth() === tm && !pickable(m); c++) m.setDate(m.getDate() + 1);
      if (m.getMonth() === tm && pickable(m)) next = iso(m);
    } else return;
    if (next) {
      var nd = parseISO(next);
      viewY = nd.getFullYear(); viewM = nd.getMonth();
      renderCal(next);
      focusDay(next);
    }
  });
  $("#cal-prev").addEventListener("click", function () { viewM--; if (viewM < 0) { viewM = 11; viewY--; } renderCal(); });
  $("#cal-next").addEventListener("click", function () { viewM++; if (viewM > 11) { viewM = 0; viewY++; } renderCal(); });
  $("#time-window").addEventListener("change", save);

  // ===== Quiz =====
  var QUIZ_PLACES = [
    { label: "My home", needs: ["clear", "deep", "repair", "wash", "lawn"] },
    { label: "An Airbnb or short-term rental", needs: ["turnover", "clear", "repair", "wash", "lawn"] },
    { label: "A vacant property, listing, or rental", needs: ["deep", "clear", "repair", "wash", "lawn"] },
    { label: "An office, salon, or clinic", needs: ["commercial", "repair", "wash"] },
    { label: "Just the yard", needs: ["lawn", "wash"] }
  ];
  var QUIZ_NEEDS = {
    clear: { label: "Clear stuff out", q: "How much needs to go?", opts: [
      { label: "A few items", ids: ["co-single"] }, { label: "About a quarter load", ids: ["co-quarter"] },
      { label: "About half a load", ids: ["co-half"] }, { label: "A full load or more", ids: ["co-full"] }] },
    deep: { label: "A deep clean of an empty place", q: "About how big is it?", opts: [
      { label: "Under 1,000 sq ft", ids: ["mr-clean"] }, { label: "1,000 to 2,500 sq ft", ids: ["mr-clean"] },
      { label: "Over 2,500 sq ft", ids: ["mr-clean"] }, { label: "Not sure", ids: ["mr-clean"] }] },
    turnover: { label: "Cleaning between guests", q: "How many bedrooms?", opts: [
      { label: "1 bedroom", ids: ["ab-1"] }, { label: "2 bedrooms", ids: ["ab-2"] }, { label: "3 or more", ids: ["ab-3"] }] },
    commercial: { label: "Regular after-hours cleaning", q: "What kind of space is it?", opts: [
      { label: "Office or salon", ids: ["cm-office"] }, { label: "Med spa or clinic", ids: ["cm-med"] }] },
    repair: { label: "Repairs or painting", q: "What kind of work?", opts: [
      { label: "Repairs", ids: ["hm-repair"] }, { label: "Painting walls", ids: ["hm-paint"] }, { label: "Both", ids: ["hm-repair", "hm-paint"] }] },
    wash: { label: "Power washing", q: "What needs washing?", opts: [
      { label: "Driveway, patio, or walkway", ids: ["pw-flat"] }, { label: "The outside of the house", ids: ["pw-house"] }, { label: "Both", ids: ["pw-flat", "pw-house"] }] },
    lawn: { label: "Lawn care", q: "How big is the lawn?", opts: [
      { label: "Up to 3,000 sq ft", ids: ["ln-base"] }, { label: "Bigger or overgrown", ids: ["ln-base", "ln-over"] }, { label: "Not sure", ids: ["ln-base"] }] }
  };

  var quizBody = $("#quiz-body");
  var quizStart = $("#quiz-start");
  var qa = [];   // answers so far: [{q, a}]
  var qState = { place: null, need: null };

  function qHead(step, total, question, backable) {
    var wrap = el("div", "q-step");
    var top = el("div", "q-top");
    top.appendChild(el("span", "q-prog", "Step " + step + " of " + total));
    if (backable) {
      var back = el("button", "link-btn", "Back"); back.type = "button"; back.setAttribute("data-q-back", "1");
      top.appendChild(back);
    }
    wrap.appendChild(top);
    var h = el("h3", "q-q", question);
    h.tabIndex = -1; h.id = "q-focus";
    wrap.appendChild(h);
    return wrap;
  }
  function qOptions(wrap, labels, handler) {
    var list = el("div", "q-opts");
    labels.forEach(function (l, i) {
      var b = el("button", "q-opt", l); b.type = "button";
      b.addEventListener("click", function () { handler(i); });
      list.appendChild(b);
    });
    wrap.appendChild(list);
  }
  function qShow(node) {
    quizBody.innerHTML = "";
    quizBody.appendChild(node);
    var f = $("#q-focus", quizBody);
    if (f) f.focus({ preventScroll: true });
  }
  function qStep1() {
    qa = []; qState = { place: null, need: null };
    var w = qHead(1, 3, "What kind of place is it?", false);
    qOptions(w, QUIZ_PLACES.map(function (p) { return p.label; }), function (i) {
      qState.place = QUIZ_PLACES[i];
      qa.push("Place: " + qState.place.label);
      if (qState.place.needs.length === 1) { qState.need = QUIZ_NEEDS[qState.place.needs[0]]; qa.push("Need: " + qState.need.label); qStep3(); }
      else qStep2();
    });
    qShow(w);
  }
  function qStep2() {
    var w = qHead(2, 3, "What do you need?", true);
    qOptions(w, qState.place.needs.map(function (k) { return QUIZ_NEEDS[k].label; }), function (i) {
      qState.need = QUIZ_NEEDS[qState.place.needs[i]];
      qa.push("Need: " + qState.need.label);
      qStep3();
    });
    qShow(w);
  }
  function qStep3() {
    var total = qState.place.needs.length === 1 ? 2 : 3;
    var w = qHead(total === 2 ? 2 : 3, total, qState.need.q, true);
    qOptions(w, qState.need.opts.map(function (o) { return o.label; }), function (i) {
      var o = qState.need.opts[i];
      qa.push("Size: " + o.label);
      qResult(o.ids);
    });
    qShow(w);
  }
  function qBack() {
    if (qState.need && qState.place.needs.length > 1) { qa.pop(); qState.need = null; return qStep2(); }
    qStep1();
  }
  function qResult(ids) {
    quizNote = qa.join("; ");
    ids.forEach(function (id) { add(id, { silent: true, openCard: true }); });
    var w = el("div", "q-step q-result");
    var h = el("h3", "q-q", "Here\u2019s what fits"); h.tabIndex = -1; h.id = "q-focus";
    w.appendChild(h);
    w.appendChild(el("p", "q-sub", "We added these to Your selections. You can change anything, or add more."));
    var ul = el("ul", "q-picks");
    ids.forEach(function (id) {
      var li = el("li", "", items[id].label);
      li.appendChild(el("span", "q-price", priceLine(items[id])));
      ul.appendChild(li);
    });
    w.appendChild(ul);
    var acts = el("div", "q-acts");
    var go = el("button", "btn", "Continue to the booking form"); go.type = "button"; go.id = "quiz-go";
    go.addEventListener("click", function () { scrollToEl($("#request"), $("#request-h")); });
    var again = el("button", "btn-secondary", "Start over"); again.type = "button"; again.id = "quiz-again";
    again.addEventListener("click", qStep1);
    acts.appendChild(go); acts.appendChild(again);
    w.appendChild(acts);
    qShow(w);
    say("Quiz done. Added " + ids.map(function (id) { return items[id].label; }).join(" and ") + ".");
  }
  quizStart.addEventListener("click", function () {
    var open = quizBody.hidden;
    quizBody.hidden = !open;
    quizStart.setAttribute("aria-expanded", open ? "true" : "false");
    quizStart.textContent = open ? "Close the quiz" : "Find my services";
    if (open) qStep1();
  });
  quizBody.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("[data-q-back]")) qBack();
  });

  // ===== Request ID (shown before payment, rides on the deposit) =====
  var reqId = "";             // made once per request; kept for a retry after a failed send
  function makeReqId() {
    var A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var n = new Uint8Array(4), s = "";
    try { (window.crypto || window.msCrypto).getRandomValues(n); } catch (e) { for (var i = 0; i < 4; i++) n[i] = Math.floor(Math.random() * 256); }
    for (var j = 0; j < 4; j++) s += A.charAt(n[j] % A.length);
    var d = new Date(), p2 = function (x) { return (x < 10 ? "0" : "") + x; };
    return "CCC-" + String(d.getFullYear()).slice(2) + p2(d.getMonth() + 1) + p2(d.getDate()) + "-" + s;
  }
  function keepReqId(id, labels) {
    var v = JSON.stringify({ id: id, at: new Date().toISOString(), services: labels || [] });
    try { localStorage.setItem(REQ_KEY, v); } catch (e) {}
    try { sessionStorage.setItem(REQ_KEY, v); } catch (e) {}
  }
  function payHref(base, id) { return base + (base.indexOf("?") === -1 ? "?" : "&") + "client_reference_id=" + encodeURIComponent(id); }
  function confirmHref(id) { return "deposit-received.html?id=" + encodeURIComponent(id); }

  // "Use the simple form" links open the fallback form.
  var fbForm = $("#fallback-form");
  function openFallback() { if (fbForm) fbForm.open = true; }
  $$('a[href="#fallback-form"]').forEach(function (a) { a.addEventListener("click", openFallback); });
  if (location.hash === "#fallback-form") openFallback();

  // ===== Submit =====
  function showAlert(id, msg) { var a = $(id); a.textContent = msg; a.hidden = false; }
  function hideAlerts() { $$(".form-alert").forEach(function (a) { a.hidden = true; }); }

  var doneBox = $("#form-done");
  var submitBtn = $("#submit-btn");

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    hideAlerts();
    if (!selected.length) {
      showAlert("#services-error", "Please pick at least one service first. Tap Add on anything in the list, or take the quick quiz.");
      scrollToEl($("#f-services"));
      return;
    }
    if (!dateISO) {
      showAlert("#date-error", "Please pick the date you\u2019d like on the calendar.");
      scrollToEl($("#f-date"), $('.cal-day[tabindex="0"]', calBody));
      return;
    }
    if (!form.checkValidity()) { form.reportValidity(); return; }
    syncHidden();
    submitBtn.disabled = true;
    var oldLabel = submitBtn.textContent;
    submitBtn.textContent = "Sending\u2026";
    var snapshot = selected.slice();
    // Leave out blank optional answers so the email stays short.
    var data = new FormData(form);
    Array.from(data.keys()).forEach(function (k) { if (k !== "_gotcha" && String(data.get(k)).trim() === "") data.delete(k); });
    if (!reqId) reqId = makeReqId();
    var sentId = reqId;
    data.set("Request ID", sentId);
    data.set("_subject", "New booking request - Custom Cleaning Concepts - " + sentId);
    fetch(form.getAttribute("action"), {
      method: "POST",
      body: data,
      headers: { "Accept": "application/json" }
    }).then(function (res) {
      if (!res.ok) throw new Error("bad status");
      keepReqId(sentId, snapshot.map(function (id) { return items[id].label; }));
      reqId = "";
      showDone(snapshot, $("#name").value.trim(), $("#req-date").value, sentId);
      form.reset();
      selected = []; dateISO = ""; quizNote = "";
      $("#req-date").value = "";
      renderCal();
      clearSaved();
      render();
      submitBtn.disabled = false; submitBtn.textContent = oldLabel;
    }).catch(function () {
      showAlert("#form-error", "Something went wrong sending your request, so nothing was sent. Your picks are still here. Please try again, or call or text 346-400-4656, or use the simple request form just below.");
      openFallback();
      submitBtn.disabled = false; submitBtn.textContent = oldLabel;
    });
  });

  // ===== Pinned "Pay deposit now" (phones only, after the request ID is shown) =====
  var payPin = null, pinIO = null, pinUpdate = null;
  var pinMQ = window.matchMedia ? window.matchMedia("(max-width: 640px)") : null;
  function removePayPin() {
    if (pinIO) { pinIO.disconnect(); pinIO = null; }
    if (pinMQ && pinUpdate) { if (pinMQ.removeEventListener) pinMQ.removeEventListener("change", pinUpdate); else if (pinMQ.removeListener) pinMQ.removeListener(pinUpdate); }
    pinUpdate = null;
    if (payPin && payPin.parentNode) payPin.parentNode.removeChild(payPin);
    payPin = null;
    doneBox.classList.remove("has-pay-pin");
  }
  function setupPayPin(direct, rid, list) {
    removePayPin();
    if (!direct.length || !list || !("IntersectionObserver" in window)) return;
    var btns = $$("a.btn", list);
    if (!btns.length) return;
    list.id = "pay-list";
    payPin = el("div", "pay-pin"); payPin.id = "pay-pin"; payPin.setAttribute("aria-hidden", "true");
    var a = el("a", "btn", "Pay deposit now"); a.id = "pay-pin-link";
    if (direct.length === 1) {
      a.href = payHref(items[direct[0]].pay, rid); a.rel = "noopener";
      a.appendChild(el("span", "sr-only", " for " + items[direct[0]].label));
    } else {
      // More than one deposit: take them to their deposit buttons.
      a.href = "#pay-list";
      a.appendChild(el("span", "sr-only", ": go to your deposit buttons"));
      a.addEventListener("click", function (e) {
        e.preventDefault();
        list.scrollIntoView({ behavior: behavior, block: "center" });
        setTimeout(function () { btns[0].focus({ preventScroll: true }); }, reduceMotion ? 0 : 450);
      });
    }
    payPin.appendChild(a);
    document.body.appendChild(payPin);
    doneBox.classList.add("has-pay-pin");
    var seen = btns.map(function () { return false; });
    pinUpdate = function () {
      var on = !!payPin && !doneBox.hidden && seen.indexOf(true) === -1 && (!pinMQ || pinMQ.matches);
      if (!payPin) return;
      payPin.classList.toggle("is-on", on);
      payPin.setAttribute("aria-hidden", on ? "false" : "true");
    };
    // The bottom 88px are where the pinned bar sits, so a button under it doesn't count as visible.
    pinIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { seen[btns.indexOf(en.target)] = en.isIntersecting; });
      pinUpdate();
    }, { rootMargin: "0px 0px -88px 0px", threshold: 0.6 });
    btns.forEach(function (b) { pinIO.observe(b); });
    if (pinMQ) { if (pinMQ.addEventListener) pinMQ.addEventListener("change", pinUpdate); else if (pinMQ.addListener) pinMQ.addListener(pinUpdate); }
  }

  function showDone(ids, name, dateText, rid) {
    removePayPin();
    doneBox.innerHTML = "";
    var check = el("p", "big-check", "\u2713"); check.setAttribute("aria-hidden", "true");
    doneBox.appendChild(check);
    var h = el("h3", "done-h", "Thank you" + (name ? ", " + name.split(" ")[0] : "") + ". Your request is in.");
    doneBox.appendChild(h);
    doneBox.appendChild(el("p", "", "We reply the same day to requests received by 5 PM. Later requests get a reply the following business day. The date you asked for is " + dateText + ". It\u2019s a request, and we\u2019ll confirm it with you."));
    var idBox = el("div", "req-id-box");
    idBox.appendChild(el("p", "req-id-label", "Your request ID"));
    var idP = el("p", "req-id", rid); idP.id = "req-id";
    idBox.appendChild(idP);
    var copy = el("button", "btn-secondary", "Copy ID"); copy.type = "button"; copy.id = "copy-req-id";
    copy.addEventListener("click", function () {
      var done = function () { copy.textContent = "Copied"; say("Request ID copied."); };
      var manual = function () {
        var ok = false;
        try { var r = document.createRange(); r.selectNodeContents(idP); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); ok = document.execCommand("copy"); } catch (e) {}
        if (ok) { done(); return; }
        copy.textContent = "Press and hold the ID to copy it";
        say("Couldn\u2019t copy automatically. The ID is selected: press and hold it to copy, or take a screenshot.");
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(rid).then(done, manual);
      else manual();
    });
    idBox.appendChild(copy);
    idBox.appendChild(el("p", "hint", "Save this ID (take a screenshot). Any deposit you pay must carry this exact ID: the card checkout attaches it for you, and with Venmo you type it in the note. Your date is not held until Lucille confirms your deposit receipt. Don\u2019t see an ID? Don\u2019t pay yet. Call or text " + PHONE + "."));
    doneBox.appendChild(idBox);
    var ul = el("ul", "q-picks");
    ids.forEach(function (id) { ul.appendChild(el("li", "", items[id].label)); });
    doneBox.appendChild(ul);
    var direct = ids.filter(function (id) { return !!items[id].pay; });
    var simple = ids.filter(function (id) { return !!items[id].direct; });
    if (simple.length < ids.length) {
      doneBox.appendChild(el("p", "", "For the rest, we\u2019ll call to set up your walkthrough: free by video, or in person (a mileage fee may apply depending on distance). Your written quote comes from that walkthrough."));
    }
    if (!direct.length && simple.length) {
      doneBox.appendChild(el("p", "", "For the simple jobs, Lucille will reply and send your booking confirmation with a secure card link for the 20% deposit, or you can pay with Venmo below. Your date is held once Lucille confirms your deposit receipt."));
    }
    if (direct.length) {
      var box = el("div", "pay-now");
      box.appendChild(el("h4", "", "Pay your deposit now"));
      box.appendChild(el("p", "hint", "These simple jobs don\u2019t need a walkthrough. The deposit is 20% of the posted price, non-refundable, and paid on a secure checkout page. Your request ID " + rid + " goes with the payment automatically. After you pay, you confirm your receipt, and once Lucille confirms it she sends you the link to pick your date and time."));
      var list = el("ul", "pay-list");
      direct.forEach(function (id) {
        var it = items[id];
        var li = el("li", "pay-item");
        var info = el("div", "pay-info");
        info.appendChild(el("strong", "", it.label));
        info.appendChild(el("span", "pay-price", priceLine(it) + " \u00b7 deposit $" + it.deposit));
        li.appendChild(info);
        var a = el("a", "btn", "Pay deposit now");
        a.href = payHref(it.pay, rid); a.rel = "noopener";
        var sr = el("span", "sr-only", " for " + it.label);
        a.appendChild(sr);
        li.appendChild(a);
        list.appendChild(li);
      });
      box.appendChild(list);
      doneBox.appendChild(box);
    }
    var payListForPin = direct.length ? list : null;
    var vbox = el("div", "pay-now venmo-now");
    vbox.appendChild(el("h4", "", "Prefer to pay with Venmo?"));
    vbox.appendChild(el("p", "hint", "Pay after Lucille sends your quote or booking confirmation, because the deposit amount comes from it. Put your request ID (" + rid + ") and your name or quote number in the Venmo note."));
    var va = el("a", "btn", "Pay deposit with Venmo");
    va.href = "https://www.venmo.com/u/ccc_htxowner_lucy"; va.target = "_blank"; va.rel = "noopener noreferrer";
    va.appendChild(el("span", "sr-only", " (opens in a new tab)"));
    vbox.appendChild(va);
    vbox.appendChild(el("p", "hint", "Venmo Business: @ccc_htxowner_lucy"));
    doneBox.appendChild(vbox);
    var cbox = el("div", "confirm-now");
    cbox.appendChild(el("h4", "", "After you pay: confirm your receipt"));
    cbox.appendChild(el("p", "hint", "This step is required. Send Lucille your request ID and your payment receipt (a screenshot or the receipt number). Your date is held only after she confirms it, then she texts or emails you the link to pick your date. The card checkout brings you to this step when you finish paying."));
    var ca = el("a", "btn-secondary", "Confirm my deposit receipt"); ca.href = confirmHref(rid); ca.id = "confirm-receipt-link";
    cbox.appendChild(ca);
    cbox.appendChild(el("p", "hint", "Paid but can\u2019t get through? Call or text " + PHONE + " or email " + EMAIL + " with your request ID."));
    doneBox.appendChild(cbox);
    var again = el("button", "btn-secondary", "Send another request"); again.type = "button";
    again.addEventListener("click", function () { removePayPin(); doneBox.hidden = true; form.hidden = false; scrollToEl($("#services")); });
    doneBox.appendChild(again);
    doneBox.hidden = false;
    form.hidden = true;
    setupPayPin(direct, rid, payListForPin);
    scrollToEl(doneBox, doneBox);
    say("Your request was sent.");
  }

  // ===== Service cards: closed on phones unless they hold a pick =====
  var phone = window.matchMedia && window.matchMedia("(max-width: 719px)").matches;

  // ===== Restore saved picks (after refresh) =====
  var saved = load();
  if (saved) {
    if (Array.isArray(saved.ids)) {
      saved.ids.forEach(function (id) { if (items[id]) add(id, { silent: true }); });
    }
    if (typeof saved.quiz === "string") quizNote = saved.quiz;
    if (saved.win) { var tw = $("#time-window"); for (var oi = 0; oi < tw.options.length; oi++) if (tw.options[oi].value === saved.win) tw.value = saved.win; }
    if (saved.date && /^\d{4}-\d{2}-\d{2}$/.test(saved.date) && pickable(parseISO(saved.date))) { setDate(saved.date, { silent: true }); }
  }
  if (!dateISO) renderCal();
  render();
  if (phone) {
    $$("details.service").forEach(function (c) { c.open = c.classList.contains("has-sel"); });
  }

  // ===== Reveal on scroll =====
  var reveals = $$(".reveal");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    reveals.forEach(function (r) { r.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.04 });
    reveals.forEach(function (r) { io.observe(r); });
    window.addEventListener("beforeprint", function () { reveals.forEach(function (r) { r.classList.add("in"); }); });
  }

@@REVIEWSCRIPT@@
})();
