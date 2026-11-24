/*
 * scanner.js
 * ---------------------------------------------------------------------------
 * This file does four jobs:
 *
 *   PART 1  Small helpers (turning colors and sizes into numbers).
 *   PART 2  The scanner. It looks at the sample UI and, for every spacing,
 *           color, and type value, decides if it is:
 *              - Exact Match : exactly a token value
 *              - Drifted     : close to a token value, but not exact
 *              - Unmapped    : not close to any token
 *   PART 3  Drawing: the sample UI, the overlay boxes and callouts,
 *           the hover card, the score, and the findings list.
 *   PART 4  Starting up and wiring the buttons.
 *
 * The tokens and sample values come from sample-data.js.
 * Everything is wrapped in one function so it can't clash with other scripts.
 */

(function () {
  'use strict';

  /* =========================================================================
   * PART 1: SMALL HELPERS
   * ======================================================================= */

  // When an item has several values, we show its "worst" result. Higher = worse.
  var STATUS_RANK = { exact: 0, drifted: 1, unmapped: 2 };

  // Little symbols shown next to each result: equal, almost equal, not equal.
  var STATUS_SYMBOL = { exact: '=', drifted: '\u2248', unmapped: '\u2260' };

  var KIND_LABEL = { spacing: 'Spacing', color: 'Color', type: 'Type', radius: 'Radius' };
  var KINDS = ['spacing', 'color', 'type', 'radius'];

  // Short names for the tolerance switch. The saved presets keep their
  // longer names in sample-data.js; Custom is not a saved preset.
  var PRESET_LABEL = { strict: 'Strict', standard: 'Standard', loose: 'Loose', custom: 'Custom' };

  // The drift field in each column header. min and max keep a typed
  // number inside the range the scanner understands.
  // Color is a distance between two colors, not pixels.
  var DRIFT_FIELD = {
    spacing: { min: 0, max: 12, sign: '\u00b1', unit: 'px' },
    color: {
      min: 0,
      max: 80,
      sign: '\u2264',
      unit: '',
      title: 'RGB color distance \u2014 0 is exact, ~24 catches near-match shades'
    },
    type: { min: 0, max: 6, sign: '\u00b1', unit: 'px' },
    radius: { min: 0, max: 12, sign: '\u00b1', unit: 'px' }
  };

  // Which style names we check, which kind of token each uses, and the
  // friendly name shown on screen. "css" lists the real browser style names.
  // To check another style, add a line here.
  var PROPERTY_MAP = {
    padding:         { label: 'padding',          kind: 'spacing', css: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'] },
    margin:          { label: 'margin',           kind: 'spacing', css: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'] },
    gap:             { label: 'gap',              kind: 'spacing', css: ['row-gap'] },
    color:           { label: 'text color',       kind: 'color',   css: ['color'] },
    backgroundColor: { label: 'background color', kind: 'color',   css: ['background-color'] },
    borderColor:     { label: 'border color',     kind: 'color',   css: ['border-top-color'], needsBorder: true },
    fontSize:        { label: 'font size',        kind: 'type',    css: ['font-size'] },
    borderRadius:    { label: 'corner radius',    kind: 'radius',  css: ['border-top-left-radius'] }
  };

  // True if the person has asked their computer for less animation.
  var REDUCE_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Round to two decimals so 16.0000001 is treated as 16.
  function round(n) {
    return Math.round(n * 100) / 100;
  }

  // 16 -> "16px"
  function px(n) {
    return round(n) + 'px';
  }

  // "#2563eb" or "#fff" -> { r: 37, g: 99, b: 235 }
  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) {
      h = h.split('').map(function (c) { return c + c; }).join('');
    }
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16)
    };
  }

  // The browser reports colors like "rgb(37, 99, 235)". Turn that into
  // { r, g, b }. Fully see-through colors return null and are skipped.
  function cssColorToRgb(text) {
    var match = /rgba?\(([^)]+)\)/.exec(text || '');
    if (!match) { return null; }
    var parts = match[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);
    if (parts.length >= 4 && parts[3] === 0) { return null; }
    return { r: parts[0], g: parts[1], b: parts[2] };
  }

  // { r: 37, g: 99, b: 235 } -> "#2563eb"
  function rgbToHex(c) {
    return '#' + [c.r, c.g, c.b].map(function (v) {
      var s = Math.round(v).toString(16);
      return s.length < 2 ? '0' + s : s;
    }).join('');
  }

  // How different are two colors? 0 means identical.
  function colorDistance(a, b) {
    var dr = a.r - b.r;
    var dg = a.g - b.g;
    var db = a.b - b.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  // Make an HTML element with an optional class and text.
  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined && text !== null) { node.textContent = text; }
    return node;
  }

  /* =========================================================================
   * PART 2: THE SCANNER
   * ======================================================================= */

  // Compare ONE number (a spacing or a font size) with the token list.
  function classifyNumber(kind, number, data) {
    var closest = null;
    var smallest = Infinity;
    data.tokens[kind].forEach(function (token) {
      var difference = Math.abs(number - token.value);
      if (difference < smallest) {
        smallest = difference;
        closest = token;
      }
    });

    var status = 'unmapped';
    if (smallest === 0) { status = 'exact'; }
    else if (smallest <= data.tolerance[kind]) { status = 'drifted'; }

    return {
      status: status,
      token: closest,
      tokenText: px(closest.value),
      tokenHex: null,
      distance: smallest,
      offBy: 'Off by ' + px(smallest)
    };
  }

  // Compare ONE color with the color token list.
  function classifyColor(rgb, data) {
    var closest = null;
    var smallest = Infinity;
    data.tokens.color.forEach(function (token) {
      var distance = colorDistance(rgb, hexToRgb(token.value));
      if (distance < smallest) {
        smallest = distance;
        closest = token;
      }
    });

    var status = 'unmapped';
    if (smallest < 0.5) { status = 'exact'; }
    else if (smallest <= data.tolerance.color) { status = 'drifted'; }

    return {
      status: status,
      token: closest,
      tokenText: closest.value,
      tokenHex: closest.value,
      distance: smallest,
      offBy: 'A slightly different shade'
    };
  }

  // Padding and margin can differ per side. To keep things short we combine
  // sides that match: all four the same -> one line; top = bottom and
  // left = right -> two lines; otherwise four lines.
  function combineSides(name, sides) {
    var top = sides[0], right = sides[1], bottom = sides[2], left = sides[3];
    if (top === right && right === bottom && bottom === left) {
      return [{ property: name, number: top }];
    }
    if (top === bottom && right === left) {
      return [
        { property: name + ' top & bottom', number: top },
        { property: name + ' left & right', number: right }
      ];
    }
    return [
      { property: name + ' top', number: top },
      { property: name + ' right', number: right },
      { property: name + ' bottom', number: bottom },
      { property: name + ' left', number: left }
    ];
  }

  // One plain-English sentence about a result.
  function explain(result) {
    if (result.status === 'exact') {
      return 'Uses ' + result.token.name + ' exactly.';
    }
    if (result.status === 'drifted') {
      return result.offBy + ' from ' + result.token.name + '. Likely meant to use it.';
    }
    return 'Not in the token list. Nearest is ' + result.token.name + '.';
  }

  // Bundle everything we know about one checked value (a "reading").
  function makeReading(element, property, kind, found, foundHex, result) {
    return {
      element: element,
      elementLabel: element.getAttribute('data-to-label') || 'Item',
      property: property,
      kind: kind,
      found: found,
      foundHex: foundHex,
      status: result.status,
      token: result.token,
      tokenText: result.tokenText,
      tokenHex: result.tokenHex,
      distance: result.distance,
      note: explain(result)
    };
  }

  // Check ONE element and return its list of readings.
  function scanElement(element, data) {
    var computed = window.getComputedStyle(element);
    var names = (element.getAttribute('data-to-props') || '').split(',');
    var readings = [];

    names.forEach(function (propName) {
      var rule = PROPERTY_MAP[propName];
      if (!rule) { return; }                       // not a style we check

      // Skip border colors when there is no visible border.
      if (rule.needsBorder && parseFloat(computed.getPropertyValue('border-top-width')) === 0) {
        return;
      }

      // The final values the browser is actually using.
      var values = rule.css.map(function (cssName) {
        return computed.getPropertyValue(cssName);
      });

      // Colors
      if (rule.kind === 'color') {
        var rgb = cssColorToRgb(values[0]);
        if (!rgb) { return; }
        var hex = rgbToHex(rgb);
        readings.push(makeReading(element, rule.label, 'color', hex, hex, classifyColor(rgb, data)));
        return;
      }

      // Spacing and font sizes
      var numbers = values.map(function (v) { return round(parseFloat(v)); });
      var parts = numbers.length === 4
        ? combineSides(rule.label, numbers)
        : [{ property: rule.label, number: numbers[0] }];

      parts.forEach(function (part) {
        if (isNaN(part.number)) { return; }                           // e.g. "normal"
        // Zero spacing or a square corner is always fine.
        if ((rule.kind === 'spacing' || rule.kind === 'radius') && part.number === 0) { return; }
        var result = classifyNumber(rule.kind, part.number, data);
        readings.push(makeReading(element, part.property, rule.kind, px(part.number), null, result));
      });
    });

    return readings;
  }

  // Check every item in the sample UI.
  // Returns every reading, plus one summary per item (used by the overlay).
  function scanAll(root, data) {
    var readings = [];
    var items = [];

    Array.prototype.forEach.call(root.querySelectorAll('[data-to-id]'), function (element) {
      var found = scanElement(element, data);
      if (!found.length) { return; }
      readings = readings.concat(found);

      var worst = 'exact';
      var issues = 0;
      found.forEach(function (reading) {
        if (STATUS_RANK[reading.status] > STATUS_RANK[worst]) { worst = reading.status; }
        if (reading.status !== 'exact') { issues += 1; }
      });

      element.setAttribute('data-to-status', worst);
      items.push({
        element: element,
        label: element.getAttribute('data-to-label'),
        readings: found,
        worst: worst,
        issues: issues,
        isContainer: element.hasAttribute('data-to-container')
      });
    });

    // Let each reading find its item (so a findings row can highlight it).
    items.forEach(function (item) {
      item.readings.forEach(function (reading) { reading.item = item; });
    });

    return { readings: readings, items: items };
  }

  /* =========================================================================
   * PART 3: DRAWING
   * ======================================================================= */

  // ---- 3a. The sample UI ----------------------------------------------------

  // Draw the sample UI from sample-data.js.
  function drawSample(parent, list) {
    list.forEach(function (item) {
      var node = document.createElement(item.tag);
      node.setAttribute('data-to-id', item.id);
      node.setAttribute('data-to-label', item.label);
      node.setAttribute('data-to-props', Object.keys(item.styles || {}).join(','));

      if (item.text) { node.textContent = item.text; }

      Object.keys(item.attrs || {}).forEach(function (name) {
        node.setAttribute(name, item.attrs[name]);
      });

      Object.keys(item.styles || {}).forEach(function (name) {
        node.style[name] = item.styles[name];
      });

      if (item.children && item.children.length) {
        node.setAttribute('data-to-container', 'true');
        drawSample(node, item.children);
      }

      parent.appendChild(node);
    });
  }

  // ---- 3b. The overlay: boxes and callouts ----------------------------------

  // Create one box per item, and a callout (pin dot + line + tag) for items
  // that have problems.
  function buildOverlay(layer, items) {
    layer.innerHTML = '';
    layer.classList.remove('has-focus');
    items.forEach(function (item) {
      var box = make('div', 'to-box' + (item.isContainer ? ' is-container' : ''));
      box.setAttribute('data-status', item.worst);
      layer.appendChild(box);
      item.box = box;

      if (item.worst === 'exact') { return; }

      var line = make('div', 'to-leader');
      line.setAttribute('data-status', item.worst);

      var dot = make('div', 'to-pin-dot');
      dot.setAttribute('data-status', item.worst);

      var note = make('div', 'to-note');
      note.setAttribute('data-status', item.worst);
      note.appendChild(make('span', 'to-note-dot'));
      note.appendChild(make('span', null, item.label));
      note.appendChild(make('span', 'to-note-count', String(item.issues)));

      layer.appendChild(line);
      layer.appendChild(dot);
      layer.appendChild(note);
      item.line = line;
      item.dot = dot;
      item.note = note;
    });
  }

  // Is anything else in the sample sitting to the right of this item, on the
  // same line? If so, a connector drawn from the item's edge would cross it.
  function blockedToTheRight(p, placed, y) {
    return placed.some(function (other) {
      if (other === p || other.item.isContainer) { return false; }
      if (p.item.element.contains(other.item.element)) { return false; }
      return other.rect.left >= p.rect.right - 1 &&
        other.rect.top - 4 <= y && other.rect.bottom + 4 >= y;
    });
  }

  // Put every box and callout in the right place. Runs again whenever the
  // window size changes.
  function positionOverlay(layer, sample, items) {
    var base = layer.getBoundingClientRect();
    var frame = (sample.firstElementChild || sample).getBoundingClientRect();
    var gutterX = frame.right - base.left + 24;      // callouts sit just right of the frame
    var roomy = gutterX + 188 <= base.width;        // is there space for them?

    // No room for a callout column: show outlines only (see styles.css),
    // so a callout never sits on top of the sample.
    layer.classList.toggle('is-compact', !roomy);

    var placed = items.map(function (item) {
      return { item: item, rect: item.element.getBoundingClientRect() };
    });

    // Outlines sit 2px outside the item and follow its corner radius,
    // so a pill is framed by a pill, not a square.
    var pad = 2;
    placed.forEach(function (p) {
      var s = p.item.box.style;
      s.left = (p.rect.left - base.left - pad) + 'px';
      s.top = (p.rect.top - base.top - pad) + 'px';
      s.width = (p.rect.width + pad * 2) + 'px';
      s.height = (p.rect.height + pad * 2) + 'px';
      s.borderRadius = outlineRadius(p.item.element);
    });

    if (!roomy) { return; }

    // Callouts: top to bottom in the column right of the card, nudged
    // down so they never overlap each other.
    var nextFreeY = -Infinity;
    placed
      .filter(function (p) { return p.item.note; })
      .sort(function (a, b) { return a.rect.top - b.rect.top; })
      .forEach(function (p) {
        var note = p.item.note;
        var line = p.item.line;
        var noteH = note.offsetHeight || 24;
        var centerY = p.rect.top - base.top + p.rect.height / 2;

        var y = Math.max(centerY - noteH / 2, nextFreeY);
        nextFreeY = y + noteH + 8;
        note.style.left = gutterX + 'px';
        note.style.top = y + 'px';

        // The pin dot sits on the item's own outline when the way to the
        // right is clear. Otherwise it sits on the frame's edge, level with
        // the item, so the line never crosses another part of the sample.
        var clear = !blockedToTheRight(p, placed, p.rect.top + p.rect.height / 2);
        var x1 = (clear ? p.rect.right + pad : Math.max(p.rect.right, frame.right) + 8) - base.left;
        var y1 = centerY;
        p.item.dot.style.left = x1 + 'px';
        p.item.dot.style.top = y1 + 'px';
        var x2 = gutterX;
        var y2 = y + noteH / 2;
        var length = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
        var angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
        line.style.left = x1 + 'px';
        line.style.top = y1 + 'px';
        line.style.width = length + 'px';
        line.style.transform = 'rotate(' + angle + 'deg)';
      });
  }

  // "8px" -> "10px". Each corner grows by the same 2px the outline is offset,
  // so the frame stays parallel to the element. Percentages are left alone.
  function outlineRadius(element) {
    var raw = getComputedStyle(element).borderRadius || '0px';
    return raw.split(/\s+/).map(function (part) {
      if (part.indexOf('%') !== -1) { return part; }
      return ((parseFloat(part) || 0) + 2) + 'px';
    }).join(' ');
  }

  // Highlight one item's box and callout (or clear all when item is null).
  // Everything else fades back so the active issue is easy to see.
  function setActive(items, item) {
    items.forEach(function (other) {
      var on = other === item;
      other.box.classList.toggle('is-active', on);
      if (other.note) {
        other.note.classList.toggle('is-active', on);
        other.line.classList.toggle('is-active', on);
        other.dot.classList.toggle('is-active', on);
      }
    });
    if (items[0] && items[0].box) {
      items[0].box.parentNode.classList.toggle('has-focus', !!item);
    }
  }

  // ---- 3c. The hover card ---------------------------------------------------

  // Short labels used only inside the popover. The findings list keeps the
  // longer names. Anything not listed here is shown as-is.
  var TIP_LABEL = {
    'padding': 'Padding',
    'padding top & bottom': 'Padding Y',
    'padding left & right': 'Padding X',
    'padding top': 'Padding Top',
    'padding right': 'Padding Right',
    'padding bottom': 'Padding Bottom',
    'padding left': 'Padding Left',
    'margin': 'Margin',
    'margin top & bottom': 'Margin Y',
    'margin left & right': 'Margin X',
    'margin top': 'Margin Top',
    'margin right': 'Margin Right',
    'margin bottom': 'Margin Bottom',
    'margin left': 'Margin Left',
    'gap': 'Gap',
    'background color': 'Fill',
    'text color': 'Text',
    'border color': 'Border',
    'font size': 'Type',
    'corner radius': 'Radius'
  };

  function tipLabel(property) {
    return TIP_LABEL[property] || property;
  }


  // "2 drifted", "1 unmapped · 2 drifted", or "All on token".
  function tipStatus(item) {
    var unmapped = 0;
    var drifted = 0;
    item.readings.forEach(function (reading) {
      if (reading.status === 'unmapped') { unmapped += 1; }
      else if (reading.status === 'drifted') { drifted += 1; }
    });
    var status = make('span', 'to-tip-status');
    if (!unmapped && !drifted) {
      status.textContent = 'All on token';
      return status;
    }
    function bit(count, word, kind) {
      var node = make('span', null, count + ' ' + word);
      node.setAttribute('data-status', kind);
      return node;
    }
    if (unmapped) { status.appendChild(bit(unmapped, 'unmapped', 'unmapped')); }
    if (unmapped && drifted) { status.appendChild(document.createTextNode(' \u00b7 ')); }
    if (drifted) { status.appendChild(bit(drifted, 'drifted', 'drifted')); }
    return status;
  }

  // One property line: label on the left, measured value and token on the right.
  function tipRow(reading) {
    var row = make('li', 'to-tip-row');
    row.setAttribute('data-status', reading.status);

    // A colored dot only for a real issue. Exact rows keep the slot so labels line up.
    var mark = make('span', 'to-tip-mark' + (reading.status === 'exact' ? '' : ' to-tip-dot'));
    row.appendChild(mark);
    row.appendChild(make('span', 'to-tip-prop', tipLabel(reading.property)));

    var value = make('span', 'to-tip-val');
    if (reading.kind === 'color' && reading.foundHex) {
      var swatch = make('span', 'to-tip-swatch');
      swatch.style.background = reading.foundHex;
      value.appendChild(swatch);
    }
    value.appendChild(make('span', 'to-tip-found', reading.found));
    // Exact matches use a quiet middot. Issues point at the nearest token with an arrow.
    var sep = reading.status === 'exact' ? '\u00b7' : '\u2192';
    value.appendChild(make('span', 'to-tip-sep', sep));
    value.appendChild(make('span', 'to-tip-token', reading.token.name));
    row.appendChild(value);
    return row;
  }

  // Fill the hover card with one item's results and place it beside "anchor".
  function showTip(tip, item, anchor) {
    tip.innerHTML = '';

    var head = make('div', 'to-tip-head');
    head.appendChild(make('span', 'to-tip-title', item.label));
    head.appendChild(tipStatus(item));
    tip.appendChild(head);

    var list = make('ul', 'to-tip-list');
    // Worst problems first, then the values that already match.
    var rows = item.readings.slice().sort(function (a, b) {
      return STATUS_RANK[b.status] - STATUS_RANK[a.status];
    });
    var sawIssue = false;
    var divided = false;
    rows.forEach(function (reading) {
      var issue = reading.status !== 'exact';
      if (sawIssue && !issue && !divided) {
        var rule = make('li', 'to-tip-rule');
        rule.setAttribute('aria-hidden', 'true');
        list.appendChild(rule);
        divided = true;
      }
      if (issue) { sawIssue = true; }
      list.appendChild(tipRow(reading));
    });
    tip.appendChild(list);

    // Place it to the right of the anchor, or to the left if there's no room.
    var r = anchor.getBoundingClientRect();
    var w = tip.offsetWidth;
    var h = tip.offsetHeight;
    var left = r.right + 14;
    if (left + w > window.innerWidth - 12) { left = r.left - w - 14; }
    if (left < 12) { left = 12; }
    var top = Math.min(Math.max(r.top, 76), window.innerHeight - h - 12);
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    tip.classList.add('is-visible');
  }

  function hideTip(tip) {
    tip.classList.remove('is-visible');
  }

  // ---- 3d. Score, totals, and bars ------------------------------------------

  // Count up from 0 to a number, for a little polish.
  function countUp(node, target) {
    if (REDUCE_MOTION) { node.textContent = String(target); return; }
    var start = null;
    function step(time) {
      if (start === null) { start = time; }
      var progress = Math.min((time - start) / 1100, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      node.textContent = String(Math.round(target * eased));
      if (progress < 1) { window.requestAnimationFrame(step); }
    }
    window.requestAnimationFrame(step);
  }

  function totalsByStatus(readings) {
    var totals = { exact: 0, drifted: 0, unmapped: 0 };
    readings.forEach(function (reading) { totals[reading.status] += 1; });
    return totals;
  }

  // The coverage ring in the Findings summary.
  // animate is false when a token was just edited, so the number updates
  // in place instead of counting up from zero again.
  var SCORE_LABEL = { exact: 'Exact', drifted: 'Drifted', unmapped: 'Unmapped' };

  function drawScore(readings, animate) {
    var totals = totalsByStatus(readings);
    var percent = readings.length ? Math.round((totals.exact / readings.length) * 100) : 0;
    var live = animate !== false && !REDUCE_MOTION;

    // Three arcs, one per status, with a small gap between them.
    // A single status fills the ring, since a gap would look like a cut.
    var segs = document.getElementById('to-ring-segs');
    segs.innerHTML = '';
    var radius = 52;
    var circ = 2 * Math.PI * radius;
    var order = ['exact', 'drifted', 'unmapped'];
    var present = order.filter(function (status) { return totals[status] > 0; });
    var gap = present.length > 1 ? 14 : 0;
    var usable = Math.max(circ - gap * present.length, 0);
    var cursor = 0;
    present.forEach(function (status) {
      var len = readings.length ? (totals[status] / readings.length) * usable : 0;
      var arc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      arc.setAttribute('class', 'to-ring-seg');
      arc.setAttribute('data-status', status);
      arc.setAttribute('cx', '60');
      arc.setAttribute('cy', '60');
      arc.setAttribute('r', String(radius));
      var dash = (present.length === 1 ? circ : len) + ' ' + circ;
      var shift = String(-cursor);
      if (live) {
        arc.style.strokeDasharray = '0 ' + circ;
        arc.style.strokeDashoffset = shift;
        window.setTimeout(function () { arc.style.strokeDasharray = dash; }, 40);
      } else {
        arc.style.strokeDasharray = dash;
        arc.style.strokeDashoffset = shift;
      }
      segs.appendChild(arc);
      cursor += len + gap;
    });

    if (live) {
      countUp(document.getElementById('to-score-number'), percent);
    } else {
      document.getElementById('to-score-number').textContent = String(percent);
    }
  }

  // One bar each for Spacing, Color, Type, and Radius.
  function drawBreakdown(container, readings) {
    container.innerHTML = '';
    KINDS.forEach(function (kind, index) {
      var ofKind = readings.filter(function (r) { return r.kind === kind; });
      if (!ofKind.length) { return; }
      var totals = totalsByStatus(ofKind);

      var row = make('div', 'to-break-row');
      row.appendChild(make('span', 'to-break-name', KIND_LABEL[kind]));

      var bar = make('div', 'to-break-bar');
      ['exact', 'drifted', 'unmapped'].forEach(function (status) {
        if (!totals[status]) { return; }
        var seg = make('span', 'to-break-seg');
        seg.setAttribute('data-status', status);
        seg.style.width = (totals[status] / ofKind.length * 100) + '%';
        seg.style.animationDelay = (index * 120) + 'ms';
        bar.appendChild(seg);
      });
      row.appendChild(bar);

      row.appendChild(make('span', 'to-break-value', totals.exact + '/' + ofKind.length));
      container.appendChild(row);
    });
  }

  // ---- 3e. The input panel: the token set -----------------------------------

  // "#abc" or "abc" or "#aabbcc" -> "#aabbcc". Anything else -> null.
  function parseHex(text) {
    var h = String(text).trim().replace(/^#/, '');
    if (!/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(h)) { return null; }
    if (h.length === 3) {
      h = h.split('').map(function (c) { return c + c; }).join('');
    }
    return '#' + h.toLowerCase();
  }

  // "16" -> 16. Empty or negative -> null, so a half-typed value is ignored.
  function parsePx(text) {
    if (text === '' || text === null) { return null; }
    var n = Number(text);
    if (!isFinite(n) || n < 0) { return null; }
    return round(n);
  }

  // A brand-new size has to be a positive number of pixels.
  function parseNewPx(text) {
    var raw = String(text).trim();
    if (!/^\d+(\.\d+)?$/.test(raw)) { return null; }
    var n = round(Number(raw));
    if (!isFinite(n) || n <= 0) { return null; }
    return n;
  }

  // A brand-new color has to be #rgb or #rrggbb.
  function parseNewHex(text) {
    var raw = String(text).trim();
    if (raw.charAt(0) !== '#') { return null; }
    return parseHex(raw);
  }

  // "space-5" is fine. Spaces and symbols are not.
  function tokenNameOk(name) {
    return /^[A-Za-z][A-Za-z0-9-]*$/.test(name);
  }

  // Placeholder text for the inline "add a token" row.
  var ADD_HINT = {
    spacing: { name: 'space-5', value: '20' },
    color: { name: 'color-accent', value: '#7c3aed' },
    type: { name: 'text-2xl', value: '32' },
    radius: { name: 'radius-xl', value: '16' }
  };

  // "8" -> 8, held inside spec.min and spec.max. Not a whole number -> null,
  // so "1." while typing does not jump the scan.
  function readDrift(text, spec) {
    if (!/^-?\d+$/.test(String(text).trim())) { return null; }
    var n = Math.round(Number(text));
    if (n < spec.min) { return spec.min; }
    if (n > spec.max) { return spec.max; }
    return n;
  }

  // Surfaces first, then the accent colors. Anything unnamed stays with the accents.
  var COLOR_NEUTRAL = ['color-background', 'color-surface', 'color-border', 'color-text', 'color-text-muted'];
  var COLOR_ACCENT = ['color-primary', 'color-success', 'color-danger'];

  function colorRows(tokens) {
    var byName = {};
    tokens.forEach(function (token, index) { byName[token.name] = index; });
    var rows = [];
    function take(names, group) {
      names.forEach(function (name) {
        if (byName[name] === undefined) { return; }
        rows.push({ token: tokens[byName[name]], index: byName[name], group: group });
        delete byName[name];
      });
    }
    take(COLOR_NEUTRAL, 'neutral');
    take(COLOR_ACCENT, 'accent');
    tokens.forEach(function (token, index) {
      if (byName[token.name] === undefined) { return; }
      rows.push({ token: token, index: index, group: 'accent' });
    });
    return rows;
  }

  // One column each for Spacing, Color, Type, and Radius. Every value is an
  // input. onEdit(token, value) runs once the typed value is valid.
  // onDrift(kind, value) runs when that column's drift allowance changes.
  // onRemove / onAdd change the list. onSpot highlights where a token is used.
  // "defaults" is the original token list, matched by name so added and
  // deleted tokens still compare correctly.
  function drawTokens(container, data, defaults, onEdit, onDrift, onRemove, onAdd, onSpot) {
    container.innerHTML = '';
    var openDraft = null;

    // null means this name was not in the original set.
    function savedValue(kind, name) {
      var list = defaults[kind];
      for (var i = 0; i < list.length; i += 1) {
        if (list[i].name === name) { return list[i].value; }
      }
      return null;
    }

    function nameTaken(kind, name) {
      var key = name.toLowerCase();
      return data.tokens[kind].some(function (token) {
        return token.name.toLowerCase() === key;
      });
    }

    function closeDraft() {
      if (openDraft && openDraft.parentNode) { openDraft.parentNode.removeChild(openDraft); }
      openDraft = null;
    }

    KINDS.forEach(function (kind) {
      var group = make('div', 'to-token-group');
      group.setAttribute('data-kind', kind);
      var spec = DRIFT_FIELD[kind];

      var head = make('div', 'to-token-group-head');
      head.appendChild(make('h3', 'to-token-group-name', KIND_LABEL[kind]));

      // "Drift ± [ 2 ] px" — the number is editable. Quiet until hovered.
      var drift = make('label', 'to-drift');
      drift.appendChild(document.createTextNode('Drift ' + spec.sign));
      var field = make('input', 'to-drift-input');
      field.type = 'number';
      field.min = String(spec.min);
      field.max = String(spec.max);
      field.step = '1';
      field.value = String(data.tolerance[kind]);
      field.setAttribute('data-kind', kind);
      field.setAttribute('aria-label', KIND_LABEL[kind] + ' drift');
      field.setAttribute('inputmode', 'numeric');
      field.setAttribute('autocomplete', 'off');
      if (spec.title) { field.title = spec.title; }

      field.addEventListener('input', function () {
        var raw = field.value.trim();
        var value = readDrift(raw, spec);
        // A minus sign or a trailing dot is someone still typing.
        if (value === null) {
          field.classList.toggle('is-invalid', raw !== '' && raw !== '-');
          return;
        }
        field.classList.remove('is-invalid');
        if (String(value) !== raw) { field.value = String(value); }
        if (data.tolerance[kind] === value) { return; }
        onDrift(kind, value);
      });
      field.addEventListener('blur', function () {
        field.value = String(data.tolerance[kind]);
        field.classList.remove('is-invalid');
      });

      drift.appendChild(field);
      if (spec.unit) { drift.appendChild(document.createTextNode(spec.unit)); }
      head.appendChild(drift);
      group.appendChild(head);

      var list = make('ul', 'to-token-list');
      var entries = kind === 'color'
        ? colorRows(data.tokens.color)
        : data.tokens[kind].map(function (token, index) {
          return { token: token, index: index, group: '' };
        });
      var splitAt = false;
      var sawNeutral = false;

      entries.forEach(function (entry) {
        if (kind === 'color' && entry.group === 'accent' && sawNeutral && !splitAt) {
          list.appendChild(make('li', 'to-token-split'));
          splitAt = true;
        }
        if (entry.group === 'neutral') { sawNeutral = true; }
        var token = entry.token;
        var row = make('li', 'to-token');
        row.setAttribute('data-kind', kind);
        row.setAttribute('data-token', token.name);
        var sole = data.tokens[kind].length <= 1;
        if (sole) { row.classList.add('is-sole'); }
        var field = make('input', 'to-token-input');
        field.setAttribute('aria-label', token.name + ' value');
        field.setAttribute('autocomplete', 'off');

        // Clicking the value selects it all, so the next keystroke replaces it.
        // The remove button stays hidden for as long as this field is focused.
        function selectField() {
          field.setSelectionRange(0, field.value.length);
        }
        field.addEventListener('focus', function () {
          row.classList.add('is-editing');
          selectField();
        });
        field.addEventListener('blur', function () {
          row.classList.remove('is-editing');
        });
        field.addEventListener('mouseup', function (event) {
          event.preventDefault();
        });

        // A small dot beside the name shows a value that is not the original.
        var original = savedValue(kind, token.name);
        function markChanged(value) {
          row.classList.toggle('is-changed', original === null || value !== original);
        }
        markChanged(token.value);

        function apply(value) {
          markChanged(value);
          onEdit(token, value);
        }

        if (kind === 'color') {
          var picker = make('input', 'to-token-picker');
          picker.type = 'color';
          picker.tabIndex = -1;
          picker.value = parseHex(token.value) || '#000000';
          picker.setAttribute('aria-hidden', 'true');

          var swatch = make('button', 'to-token-swatch');
          swatch.type = 'button';
          swatch.style.backgroundColor = picker.value;
          swatch.setAttribute('aria-label', token.name + ' color');
          swatch.addEventListener('click', function () { picker.click(); });
          row.appendChild(swatch);
          row.appendChild(picker);

          field.value = token.value;
          field.spellcheck = false;
          field.setAttribute('autocapitalize', 'off');

          function paintSwatch(hex) {
            picker.value = hex;
            swatch.style.backgroundColor = hex;
          }
          picker.addEventListener('input', function () {
            field.value = picker.value;
            field.classList.remove('is-invalid');
            paintSwatch(picker.value);
            apply(picker.value);
          });
          field.addEventListener('input', function () {
            var hex = parseHex(field.value);
            field.classList.toggle('is-invalid', !hex);
            if (!hex) { return; }
            paintSwatch(hex);
            apply(hex);
          });
        } else {
          field.type = 'text';
          field.setAttribute('inputmode', 'numeric');
          field.classList.add('to-token-num');
          field.value = String(token.value);
          field.addEventListener('input', function () {
            var n = parsePx(field.value);
            field.classList.toggle('is-invalid', n === null);
            if (n === null) { return; }
            apply(n);
          });
          // Arrow keys nudge the pixel value without moving the caret.
          field.addEventListener('keydown', function (event) {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') { return; }
            var current = parsePx(field.value);
            if (current === null) { return; }
            event.preventDefault();
            var step = event.shiftKey ? 4 : 1;
            var next = event.key === 'ArrowUp' ? current + step : current - step;
            if (next < 0) { next = 0; }
            if (next === current) { return; }
            field.value = String(next);
            field.classList.remove('is-invalid');
            apply(next);
            selectField();
          });
        }

        var name = make('button', 'to-token-name', token.name);
        name.type = 'button';
        name.title = (original === null
          ? 'Custom token'
          : 'Default: ' + (kind === 'color' ? original : original + 'px')) +
          '. Show where it is used.';
        name.setAttribute('aria-pressed', 'false');
        name.addEventListener('click', function () { onSpot(kind, token); });
        row.appendChild(name);
        row.appendChild(field);
        if (kind !== 'color') { row.appendChild(make('span', 'to-token-unit', 'px')); }

        // Hidden until the row is hovered. The last token in a column stays,
        // so the scanner always has something to compare.
        var remove = make('button', 'to-token-remove', '\u00d7');
        remove.type = 'button';
        remove.setAttribute('aria-label', 'Remove token');
        if (sole) {
          remove.disabled = true;
        } else {
          remove.addEventListener('click', function () { onRemove(kind, token); });
        }
        row.appendChild(remove);
        list.appendChild(row);
      });
      group.appendChild(list);

      // Quiet until the column is hovered. Opens one inline row.
      var addButton = make('button', 'to-token-add', '+ Add');
      addButton.type = 'button';
      addButton.setAttribute('aria-label', 'Add ' + KIND_LABEL[kind].toLowerCase() + ' token');
      addButton.addEventListener('click', function () {
        if (openDraft && openDraft.getAttribute('data-kind') === kind) {
          var existing = openDraft.querySelector('.to-draft-name');
          if (existing) { existing.focus(); }
          return;
        }
        closeDraft();
        var hint = ADD_HINT[kind];
        var draft = make('li', 'to-token to-token-draft');
        draft.setAttribute('data-kind', kind);

        var nameField = make('input', 'to-draft-name');
        nameField.type = 'text';
        nameField.placeholder = hint.name;
        nameField.setAttribute('aria-label', 'New ' + KIND_LABEL[kind] + ' token name');
        nameField.setAttribute('autocomplete', 'off');
        nameField.setAttribute('autocapitalize', 'off');
        nameField.spellcheck = false;

        var valueField = make('input', 'to-token-input to-draft-value');
        valueField.type = 'text';
        valueField.placeholder = hint.value;
        valueField.setAttribute('aria-label', 'New ' + KIND_LABEL[kind] + ' token value');
        valueField.setAttribute('autocomplete', 'off');
        valueField.setAttribute('inputmode', kind === 'color' ? 'text' : 'decimal');
        valueField.spellcheck = false;

        function commitDraft() {
          var nextName = nameField.value.trim();
          var nameOk = tokenNameOk(nextName) && !nameTaken(kind, nextName);
          var nextValue = kind === 'color' ? parseNewHex(valueField.value) : parseNewPx(valueField.value);
          nameField.classList.toggle('is-invalid', !nameOk);
          valueField.classList.toggle('is-invalid', nextValue === null);
          nameField.setAttribute('aria-invalid', nameOk ? 'false' : 'true');
          valueField.setAttribute('aria-invalid', nextValue === null ? 'true' : 'false');
          if (!nameOk || nextValue === null) { return; }
          onAdd(kind, { name: nextName, value: nextValue });
        }

        draft.addEventListener('keydown', function (event) {
          if (event.key === 'Escape') {
            event.preventDefault();
            closeDraft();
            addButton.focus();
          } else if (event.key === 'Enter') {
            event.preventDefault();
            commitDraft();
          }
        });
        nameField.addEventListener('input', function () { nameField.classList.remove('is-invalid'); });
        valueField.addEventListener('input', function () { valueField.classList.remove('is-invalid'); });

        draft.appendChild(nameField);
        draft.appendChild(valueField);
        if (kind !== 'color') { draft.appendChild(make('span', 'to-token-unit', 'px')); }
        list.appendChild(draft);
        openDraft = draft;
        nameField.focus();
      });
      group.appendChild(addButton);
      container.appendChild(group);
    });
  }

  // ---- 3f. The findings list ------------------------------------------------

  // "+4px" for a size, "Δ 14" for a near color, or "off palette" when it is not in the set.
  function findingDelta(reading) {
    if (reading.kind === 'color') {
      if (reading.status === 'unmapped') { return 'off palette'; }
      if (reading.status === 'drifted') { return '\u0394 ' + Math.round(reading.distance); }
      return '';
    }
    var found = parseFloat(reading.found);
    var target = parseFloat(reading.tokenText);
    if (!isFinite(found) || !isFinite(target)) { return ''; }
    var diff = round(found - target);
    if (diff === 0) { return ''; }
    return (diff > 0 ? '+' : '') + diff + 'px';
  }

  // "space-4 (16px)" for sizes. Colors name the token only.
  function findingTarget(reading) {
    if (reading.kind === 'color') { return reading.token.name; }
    return reading.token.name + ' (' + reading.tokenText + ')';
  }

  // The rule for this card, using the tolerance that is active right now.
  function statusTip(reading, tolerance) {
    if (reading.status === 'exact') { return 'Exact match to system token.'; }
    var spec = DRIFT_FIELD[reading.kind];
    var limit = tolerance[reading.kind];
    var within = reading.status === 'drifted' ? 'within' : 'exceeds';
    if (reading.kind === 'color') {
      return 'Color distance ' + Math.round(reading.distance) + ' \u2014 ' + within +
        ' your ' + spec.sign + limit + ' Color tolerance.';
    }
    return 'Off by ' + px(reading.distance) + ' \u2014 ' + within +
      ' your ' + spec.sign + limit + 'px ' + KIND_LABEL[reading.kind] + ' tolerance.';
  }

  // One finding card: who and what on the first line, the mapping on the second.
  function makeFinding(reading, handlers, tolerance) {
    var button = make('button', 'to-finding');
    button.type = 'button';
    button.setAttribute('data-status', reading.status);

    var top = make('span', 'to-finding-top');
    var id = make('span', 'to-finding-id');
    id.appendChild(make('span', 'to-finding-dot'));
    id.appendChild(make('span', 'to-finding-name', reading.elementLabel));
    id.appendChild(make('span', 'to-finding-prop', tipLabel(reading.property)));
    top.appendChild(id);
    var status = make('span', 'to-finding-status', SCORE_LABEL[reading.status]);
    status.title = statusTip(reading, tolerance);
    top.appendChild(status);
    button.appendChild(top);

    var map = make('span', 'to-finding-map');
    var eq = make('span', 'to-finding-eq');
    if (reading.kind === 'color' && reading.foundHex) {
      var swatch = make('span', 'to-finding-swatch');
      swatch.style.background = reading.foundHex;
      eq.appendChild(swatch);
    }
    eq.appendChild(make('span', 'to-finding-found', reading.found));
    eq.appendChild(make('span', 'to-finding-arrow', '\u2192'));
    eq.appendChild(make('span', 'to-finding-token', findingTarget(reading)));
    map.appendChild(eq);
    var delta = findingDelta(reading);
    if (delta) { map.appendChild(make('span', 'to-finding-delta', delta)); }
    button.appendChild(map);

    button.addEventListener('mouseenter', function () { handlers.enter(reading); });
    button.addEventListener('mouseleave', function () { handlers.leave(reading); });
    button.addEventListener('focus', function () { handlers.enter(reading); });
    button.addEventListener('blur', function () { handlers.leave(reading); });
    button.addEventListener('click', function () { handlers.pick(reading); });

    return button;
  }

  // The filter buttons above the list.
  var FILTERS = [
    { id: 'issues',   label: 'Issues',      test: function (r) { return r.status !== 'exact'; } },
    { id: 'drifted',  label: 'Drifted',     test: function (r) { return r.status === 'drifted'; } },
    { id: 'unmapped', label: 'Unmapped',    test: function (r) { return r.status === 'unmapped'; } },
    { id: 'exact',    label: 'Exact',       test: function (r) { return r.status === 'exact'; } }
  ];

  function drawTabs(container, readings, activeId, onPick) {
    container.innerHTML = '';
    FILTERS.forEach(function (filter) {
      var tab = make('button', 'to-tab' + (filter.id === activeId ? ' is-active' : ''));
      tab.type = 'button';
      tab.setAttribute('aria-pressed', String(filter.id === activeId));
      // The three status filters carry the color key. "Issues" mixes both.
      if (filter.id !== 'issues') {
        var dot = make('span', 'to-tab-dot');
        dot.setAttribute('data-status', filter.id);
        tab.appendChild(dot);
      }
      tab.appendChild(document.createTextNode(filter.label));
      tab.appendChild(make('span', 'to-tab-count', String(readings.filter(filter.test).length)));
      tab.addEventListener('click', function () { onPick(filter.id); });
      container.appendChild(tab);
    });
  }

  // One quiet sentence under the filter pills.
  var FILTER_NOTE = {
    issues: 'Drifted = close to a token (within tolerance) \u00b7 Unmapped = outside tolerance or off-palette.',
    drifted: 'Within your current tolerance \u2014 likely an eyeballed value near a system token.',
    unmapped: 'Outside tolerance \u2014 a hardcoded value or off-palette color not in the token set.',
    exact: 'Matches a named design token with zero drift.'
  };

  function drawFilterNote(activeId) {
    var note = document.getElementById('to-filter-note');
    if (note) { note.textContent = FILTER_NOTE[activeId] || ''; }
  }

  // The all-clear for v1.0 Clean. A check, then one sentence, so 100%
  // does not look like a missing list.
  function cleanEmpty(count) {
    var li = make('li', 'to-empty to-empty-clean');
    var mark = make('span', 'to-empty-mark');
    mark.setAttribute('aria-hidden', 'true');
    mark.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M3.2 8.2 6.3 11.2 12.8 4.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    li.appendChild(mark);
    var text = make('p');
    text.textContent = 'All ' + count + ' values match your token set. Switch to v1.4 Drift or v2.1 Hotfix to inspect regressions.';
    li.appendChild(text);
    return li;
  }

  function drawFindings(container, readings, activeId, handlers, tolerance, buildId, spot) {
    var filter = FILTERS.filter(function (f) { return f.id === activeId; })[0];
    var shown = readings.filter(filter.test);
    if (spot) {
      shown = shown.filter(function (reading) {
        return reading.kind === spot.kind && reading.token && reading.token.name === spot.name;
      });
    }

    // Worst problems first.
    shown.sort(function (a, b) { return STATUS_RANK[b.status] - STATUS_RANK[a.status]; });

    container.innerHTML = '';
    container.scrollTop = 0;
    shown.forEach(function (reading, index) {
      var li = make('li');
      li.style.animationDelay = Math.min(index * 35, 400) + 'ms';
      li.appendChild(makeFinding(reading, handlers, tolerance));
      container.appendChild(li);
    });

    if (!shown.length) {
      if (spot) {
        container.appendChild(make('li', 'to-empty', 'Nothing in this group references ' + spot.name + '.'));
      } else if (activeId === 'issues' && buildId === 'clean') {
        container.appendChild(cleanEmpty(readings.length));
      } else {
        container.appendChild(make('li', 'to-empty', 'Nothing here. Every value in this group is on token.'));
      }
    }
  }

  /* =========================================================================
   * PART 4: START UP AND WIRE THE BUTTONS
   * ======================================================================= */

  function start() {
    var data = window.DRIFT_CHECK_DATA;
    var app = document.getElementById('to-app');
    var stage = document.getElementById('to-stage');
    var sample = document.getElementById('to-sample');
    var layer = document.getElementById('to-layer');
    var tip = document.getElementById('to-tip');
    var toggle = document.getElementById('to-toggle');
    var tabs = document.getElementById('to-tabs');
    var findings = document.getElementById('to-findings');
    // If the data file did not load, say so instead of showing a blank page.
    if (!data) {
      sample.textContent = 'Could not find sample-data.js. Keep it in the same folder as index.html.';
      return;
    }

    // 1. Keep an untouched copy of the tokens from sample-data.js so
    //    "Reset defaults" can bring back deleted tokens, drop added ones,
    //    and restore every edited value. The sample is drawn in showFrame().
    function copy(value) { return JSON.parse(JSON.stringify(value)); }
    var defaultTokens = copy(data.tokens);
    var readings = [];
    var items = [];

    function reposition() { positionOverlay(layer, sample, items); }

    // 2. Findings list, filters, score, and bars.
    var activeFilter = 'issues';
    // Set when a finding is clicked. The card stays until a click outside it.
    var pinnedItem = null;

    function closeTip() {
      pinnedItem = null;
      hideTip(tip);
      setActive(items, null);
    }

    function anchorFor(item) {
      return (item && (item.note || item.element)) || null;
    }

    // Move an open pinned card so it stays beside its element.
    function placePinned() {
      var anchor = anchorFor(pinnedItem);
      if (!pinnedItem || !anchor || !anchor.isConnected) { return; }
      setActive(items, pinnedItem);
      showTip(tip, pinnedItem, anchor);
    }

    var findingHandlers = {
      enter: function (reading) {
        if (pinnedItem) { return; }
        setActive(items, reading.item);
      },
      leave: function () {
        if (pinnedItem) { return; }
        setActive(items, null);
      },
      pick: function (reading) {
        // Keep this card up until the person clicks somewhere else.
        // If the canvas is scrolled out of view, bring it back first.
        var box = stage.getBoundingClientRect();
        var offscreen = box.bottom < 64 || box.top > window.innerHeight - 64;
        if (offscreen) {
          stage.scrollIntoView({ behavior: 'auto', block: 'nearest' });
        }
        pinnedItem = reading.item;
        placePinned();
      }
    };

    // A click that is not on a finding closes the card. Clicks on a finding
    // are handled by pick(), which opens that item instead.
    document.addEventListener('pointerdown', function (event) {
      if (!tip.classList.contains('is-visible')) { return; }
      if (event.target.closest('.to-finding, #to-tip')) { return; }
      closeTip();
    });

    // A token name can spotlight every place that value is used.
    var spotlight = null;

    function spotlightAlive() {
      if (!spotlight) { return false; }
      return data.tokens[spotlight.kind].some(function (token) {
        return token.name === spotlight.name;
      });
    }

    function readingHits(reading) {
      return !!(spotlight && reading.kind === spotlight.kind &&
        reading.token && reading.token.name === spotlight.name);
    }

    function paintSpotChip() {
      var bar = document.getElementById('to-spot-bar');
      bar.innerHTML = '';
      if (!spotlight) {
        bar.hidden = true;
        return;
      }
      bar.hidden = false;
      var chip = make('span', 'to-spot-chip');
      chip.appendChild(document.createTextNode('Filtered by ' + spotlight.name));
      var clear = make('button', 'to-spot-clear', '\u00d7');
      clear.type = 'button';
      clear.setAttribute('aria-label', 'Clear token filter');
      clear.addEventListener('click', function () { toggleSpotlight(spotlight.kind, { name: spotlight.name }); });
      chip.appendChild(clear);
      bar.appendChild(chip);
    }

    // Highlight the token row, the elements that use it, and fade the rest.
    function paintSpotlight() {
      if (spotlight && !spotlightAlive()) { spotlight = null; }
      app.classList.toggle('is-spotting', !!spotlight);

      Array.prototype.forEach.call(document.querySelectorAll('.to-token'), function (row) {
        var on = !!(spotlight &&
          row.getAttribute('data-kind') === spotlight.kind &&
          row.getAttribute('data-token') === spotlight.name);
        row.classList.toggle('is-spot', on);
        var nameBtn = row.querySelector('.to-token-name');
        if (nameBtn && nameBtn.tagName === 'BUTTON') {
          nameBtn.setAttribute('aria-pressed', String(on));
        }
      });

      var hits = [];
      items.forEach(function (item) {
        item.spotHit = !!(spotlight && item.readings.some(readingHits));
        if (item.spotHit) { hits.push(item); }
      });
      items.forEach(function (item) {
        var childHit = hits.some(function (other) {
          return other !== item && item.element.contains(other.element);
        });
        item.element.classList.toggle('is-dim', !!spotlight && !item.spotHit && !childHit);
        if (!item.box) { return; }
        item.box.classList.toggle('is-spot', item.spotHit);
        item.box.classList.toggle('is-dim', !!spotlight && !item.spotHit);
        if (item.note) { item.note.classList.toggle('is-dim', !!spotlight && !item.spotHit); }
        if (item.line) { item.line.classList.toggle('is-dim', !!spotlight && !item.spotHit); }
        if (item.dot) { item.dot.classList.toggle('is-dim', !!spotlight && !item.spotHit); }
      });
      paintSpotChip();
    }

    // Clicking the active name again clears it. Otherwise that token takes over.
    function toggleSpotlight(kind, token) {
      if (spotlight && spotlight.kind === kind && spotlight.name === token.name) {
        spotlight = null;
      } else {
        spotlight = { kind: kind, name: token.name };
      }
      pickFilter(activeFilter);
      paintSpotlight();
    }

    function pickFilter(id) {
      activeFilter = id;
      drawTabs(tabs, readings, activeFilter, pickFilter);
      drawFilterNote(activeFilter);
      drawFindings(findings, readings, activeFilter, findingHandlers, data.tolerance, activeBuild, spotlight);
    }

    // Callout tags are rebuilt on every scan, so their hover has to be too.
    function wireNotes() {
      items.forEach(function (item) {
        if (!item.note) { return; }
        item.note.addEventListener('mouseenter', function () {
          if (pinnedItem) { return; }
          if (!app.classList.contains('to-overlay-on')) { return; }
          setActive(items, item);
          showTip(tip, item, item.note);
        });
        item.note.addEventListener('mouseleave', function () {
          if (pinnedItem) { return; }
          setActive(items, null);
          hideTip(tip);
        });
      });
    }

    // Check the sample against the current tokens and redraw every result.
    function rescan(animate) {
      var scan = scanAll(sample, data);
      readings = scan.readings;
      items = scan.items;
      buildOverlay(layer, items);
      wireNotes();
      reposition();
      pinnedItem = null;
      hideTip(tip);
      document.getElementById('to-findings-sub').textContent =
        readings.length + ' values checked across ' + items.length + ' elements';
      if (spotlight && !spotlightAlive()) { spotlight = null; }
      pickFilter(activeFilter);
      drawBreakdown(document.getElementById('to-breakdown'), readings);
      drawScore(readings, animate);
      paintSpotlight();
    }

    // 3. The token set. Editing a value updates that token and scans again.
    var inputPanel = document.getElementById('to-input-panel');
    var tokensToggle = document.getElementById('to-tokens-toggle');

    function tokenTotal() {
      return KINDS.reduce(function (sum, kind) { return sum + data.tokens[kind].length; }, 0);
    }

    // The slim bar's swatches and ranges follow the tokens as they are edited.
    function paintSummary() {
      var tokenCount = tokenTotal();
      document.getElementById('to-summary-title').textContent = 'Token set (' + tokenCount + ')';
      document.getElementById('to-input-sub').textContent =
        tokenCount + ' tokens · edit any value to rescan';
      var swatches = document.getElementById('to-summary-swatches');
      swatches.innerHTML = '';
      var sawNeutral = false;
      var split = false;
      colorRows(data.tokens.color).forEach(function (entry) {
        if (entry.group === 'accent' && sawNeutral && !split) {
          swatches.appendChild(make('span', 'to-mini-gap'));
          split = true;
        }
        if (entry.group === 'neutral') { sawNeutral = true; }
        var dot = make('span', 'to-mini-swatch');
        dot.style.background = entry.token.value;
        swatches.appendChild(dot);
      });
      var scales = document.getElementById('to-summary-scales');
      scales.innerHTML = '';
      ['spacing', 'type', 'radius'].forEach(function (kind) {
        var min = data.tokens[kind][0].value;
        var max = min;
        data.tokens[kind].forEach(function (token) {
          if (token.value < min) { min = token.value; }
          if (token.value > max) { max = token.value; }
        });
        scales.appendChild(make('span', 'to-scale-pill', KIND_LABEL[kind] + ' ' + min + '\u2013' + max));
      });
    }

    function setTokensOpen(open) {
      inputPanel.classList.toggle('is-collapsed', !open);
      var grid = document.getElementById('to-tokens');
      grid.inert = !open;
      grid.setAttribute('aria-hidden', open ? 'false' : 'true');
      tokensToggle.setAttribute('aria-expanded', String(open));
      tokensToggle.textContent = open ? 'Hide \u25b4' : 'Show tokens \u25be';
    }

    function renderTokens() {
      drawTokens(document.getElementById('to-tokens'), data, defaultTokens, function (token, value) {
        token.value = value;
        paintSummary();
        paintReset();
        rescan(false);
      }, onDrift, function (kind, token) {
        // Keep at least one token in every column.
        if (data.tokens[kind].length <= 1) { return; }
        data.tokens[kind] = data.tokens[kind].filter(function (item) { return item !== token; });
        renderTokens();
        rescan(false);
      }, function (kind, token) {
        data.tokens[kind].push(token);
        // Sizes slot into the scale. Colors stay at the end of the accents.
        if (kind !== 'color') {
          data.tokens[kind].sort(function (a, b) { return a.value - b.value; });
        }
        renderTokens();
        rescan(false);
      }, toggleSpotlight);
      // Rebuilding the columns makes new drift fields, so reapply Custom.
      markPreset(activePreset);
      paintSummary();
      paintReset();
      paintSpotlight();
      // A rebuild clears inert, so put it back if the grid is hidden.
      if (inputPanel.classList.contains('is-collapsed')) { setTokensOpen(false); }
    }

    // 3b. Tolerance: Strict / Standard / Loose / Custom, and Reset defaults.
    //     The four drift fields and this switch stay in step with each other.
    var presetBar = document.getElementById('to-presets');
    var activePreset = data.defaultPreset;

    function presetById(id) {
      for (var i = 0; i < data.presets.length; i += 1) {
        if (data.presets[i].id === id) { return data.presets[i]; }
      }
      return null;
    }

    // Strict, Standard, or Loose when every drift matches that preset.
    // Otherwise null, which means Custom.
    function matchingPreset(tolerance) {
      for (var i = 0; i < data.presets.length; i += 1) {
        var values = data.presets[i].tolerance;
        var same = KINDS.every(function (kind) { return values[kind] === tolerance[kind]; });
        if (same) { return data.presets[i].id; }
      }
      return null;
    }

    function markPreset(id) {
      activePreset = id;
      Array.prototype.forEach.call(presetBar.children, function (b) {
        var on = b.getAttribute('data-preset') === id;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      // Custom lights up every drift field so it is obvious they can be typed in.
      var fields = document.querySelectorAll('.to-drift-input');
      Array.prototype.forEach.call(fields, function (field) {
        field.classList.toggle('is-custom', id === 'custom');
      });
    }

    function writeDriftInputs() {
      var fields = document.querySelectorAll('.to-drift-input');
      Array.prototype.forEach.call(fields, function (field) {
        var kind = field.getAttribute('data-kind');
        field.value = String(data.tolerance[kind]);
        field.classList.remove('is-invalid');
      });
    }

    function applyPreset(id) {
      var preset = presetById(id);
      if (!preset) { return; }
      data.tolerance = copy(preset.tolerance);
      markPreset(id);
      writeDriftInputs();
    }

    // A typed drift updates the scan, then picks Custom — or a preset
    // when the four numbers land exactly on one.
    function onDrift(kind, value) {
      data.tolerance[kind] = value;
      markPreset(matchingPreset(data.tolerance) || 'custom');
      paintReset();
      rescan(false);
    }

    // Reset stays out of the header until a token or the tolerance has changed.
    // Added, deleted, and edited tokens all count, matched by name.
    function paintReset() {
      var base = presetById(data.defaultPreset).tolerance;
      var toleranceDirty = KINDS.some(function (kind) {
        return data.tolerance[kind] !== base[kind];
      });
      var tokensDirty = KINDS.some(function (kind) {
        var current = data.tokens[kind];
        var saved = defaultTokens[kind];
        if (current.length !== saved.length) { return true; }
        var byName = {};
        saved.forEach(function (token) { byName[token.name] = token.value; });
        return current.some(function (token) { return byName[token.name] !== token.value; });
      });
      document.getElementById('to-reset').hidden = !(toleranceDirty || tokensDirty);
    }

    function enterCustom() {
      var wasClosed = inputPanel.classList.contains('is-collapsed');
      if (wasClosed) { setTokensOpen(true); }
      markPreset('custom');
      var focusSpacing = function () {
        var spacing = document.querySelector('.to-drift-input[data-kind="spacing"]');
        if (spacing) { spacing.focus(); }
      };
      if (wasClosed) { window.requestAnimationFrame(focusSpacing); }
      else { focusSpacing(); }
    }

    tokensToggle.addEventListener('click', function () {
      setTokensOpen(inputPanel.classList.contains('is-collapsed'));
    });

    function addPresetButton(id, onClick) {
      var button = make('button', null, PRESET_LABEL[id]);
      button.type = 'button';
      button.setAttribute('data-preset', id);
      button.addEventListener('click', onClick);
      presetBar.appendChild(button);
    }

    data.presets.forEach(function (preset) {
      addPresetButton(preset.id, function () {
        if (preset.id === activePreset) { return; }
        applyPreset(preset.id);
        paintReset();
        rescan(false);
      });
    });
    addPresetButton('custom', enterCustom);

    document.getElementById('to-reset').addEventListener('click', function () {
      data.tokens = copy(defaultTokens);
      applyPreset(data.defaultPreset);
      renderTokens();
      rescan(false);
    });

    // 4. Capture and build. Either switch redraws the sample and scans again.
    var captureBar = document.getElementById('to-captures');
    var buildBar = document.getElementById('to-builds');
    var buildFile = document.getElementById('to-build-file');
    var activeCapture = data.defaultCapture;
    var activeBuild = data.defaultBuild;

    function byId(list, id) {
      return list.filter(function (item) { return item.id === id; })[0];
    }

    function paintSwitch(bar, attr, id) {
      Array.prototype.forEach.call(bar.children, function (button) {
        var on = button.getAttribute(attr) === id;
        button.classList.toggle('is-active', on);
        button.setAttribute('aria-pressed', String(on));
      });
    }

    function showFrame() {
      spotlight = null;
      var capture = byId(data.captures, activeCapture);
      var build = byId(data.builds, activeBuild);
      paintSwitch(captureBar, 'data-capture', capture.id);
      paintSwitch(buildBar, 'data-build', build.id);
      buildFile.textContent = capture.file + '-' + build.slug + '.html';
      sample.innerHTML = '';
      drawSample(sample, capture.samples[build.id]);
      frameScenario(capture, false);
      rescan(true);
    }

    data.captures.forEach(function (capture) {
      var button = make('button', null, capture.label);
      button.type = 'button';
      button.setAttribute('data-capture', capture.id);
      button.addEventListener('click', function () {
        if (capture.id === activeCapture) { return; }
        activeCapture = capture.id;
        showFrame();
      });
      captureBar.appendChild(button);
    });

    data.builds.forEach(function (build) {
      var button = make('button', null, build.label);
      button.type = 'button';
      button.setAttribute('data-build', build.id);
      button.addEventListener('click', function () {
        if (build.id === activeBuild) { return; }
        activeBuild = build.id;
        showFrame();
      });
      buildBar.appendChild(button);
    });

    // 4b. Zoom and pan. Only the sample is moved and scaled; the outlines
    //     and callouts are redrawn on top at normal size, so they stay crisp.
    var MIN_ZOOM = 0.5;
    var MAX_ZOOM = 2;
    var view = { x: 0, y: 0, z: 1 };
    var homeZoom = 1;
    var zoomIn = document.getElementById('to-zoom-in');
    var zoomOut = document.getElementById('to-zoom-out');
    var zoomReset = document.getElementById('to-zoom-reset');
    var recenter = document.getElementById('to-recenter');
    var frameRequest = null;

    function clamp(n, low, high) { return Math.min(high, Math.max(low, n)); }

    function applyView(redraw) {
      // Keep at least part of the sample on the canvas.
      view.x = clamp(view.x, -stage.clientWidth * 0.75, stage.clientWidth * 0.75);
      view.y = clamp(view.y, -stage.clientHeight * 0.75, stage.clientHeight * 0.75);
      sample.style.transform =
        'translate(' + view.x + 'px, ' + view.y + 'px) scale(' + view.z + ')';
      stage.style.backgroundSize = (16 * view.z) + 'px ' + (16 * view.z) + 'px';
      stage.style.backgroundPosition = view.x + 'px ' + view.y + 'px';
      zoomReset.textContent = Math.round(view.z * 100) + '%';
      // Recenter lights up once the sample has been dragged off center.
      recenter.classList.toggle('is-ready', view.x !== 0 || view.y !== 0);
      zoomOut.disabled = view.z <= MIN_ZOOM + 0.001;
      zoomIn.disabled = view.z >= MAX_ZOOM - 0.001;
      if (redraw === false) { return; }
      if (!pinnedItem) { hideTip(tip); }
      // Redraw the overlay at most once per screen frame.
      if (frameRequest) { return; }
      frameRequest = window.requestAnimationFrame(function () {
        frameRequest = null;
        reposition();
        placePinned();
      });
    }

    // Pick a starting zoom that leaves room for the callouts.
    // Each capture lists the magnifications to try, largest first.
    function fitZoom(capture) {
      sample.style.transform = 'none';
      var card = sample.firstElementChild;
      var steps = capture.zoom;
      if (!card || !stage.clientWidth) { return steps[0]; }
      var cs = getComputedStyle(stage);
      var padL = parseFloat(cs.paddingLeft) || 0;
      var padR = parseFloat(cs.paddingRight) || 0;
      var stageW = stage.clientWidth;
      var inner = Math.max(stageW - padL - padR, 0);
      var cardW = card.offsetWidth;
      for (var i = 0; i < steps.length; i += 1) {
        var z = steps[i];
        var right = padL + (inner - cardW * z) / 2 + cardW * z;
        if (right + 212 <= stageW) { return z; }
      }
      return steps[steps.length - 1];
    }

    // Center the sample and apply that capture's starting zoom.
    function frameScenario(capture, redraw) {
      homeZoom = fitZoom(capture);
      view.x = 0;
      view.y = 0;
      view.z = homeZoom;
      applyView(redraw);
    }

    function resetView(redraw) {
      view.x = 0;
      view.y = 0;
      view.z = homeZoom;
      applyView(redraw);
    }

    // Zoom so the point under (clientX, clientY) stays where it is.
    // With no point, zoom around the middle of the sample.
    function zoomTo(nextZoom, clientX, clientY) {
      var z = clamp(Math.round(nextZoom * 100) / 100, MIN_ZOOM, MAX_ZOOM);
      if (z === view.z) { return; }
      if (clientX !== undefined) {
        var box = stage.getBoundingClientRect();
        var centerX = box.left + sample.offsetLeft + sample.offsetWidth / 2;
        var centerY = box.top + sample.offsetTop + sample.offsetHeight / 2;
        var dx = (clientX - centerX - view.x) / view.z;
        var dy = (clientY - centerY - view.y) / view.z;
        view.x = clientX - centerX - dx * z;
        view.y = clientY - centerY - dy * z;
      }
      view.z = z;
      applyView();
    }

    zoomIn.addEventListener('click', function () { zoomTo(view.z + 0.25); });
    zoomOut.addEventListener('click', function () { zoomTo(view.z - 0.25); });
    zoomReset.addEventListener('click', function () { resetView(); });

    // Recenter keeps the current zoom and brings the sample back to the middle.
    recenter.addEventListener('click', function () {
      view.x = 0;
      view.y = 0;
      applyView();
    });

    // Ctrl/⌘ + scroll (and trackpad pinch) zooms. Plain scroll still
    // scrolls the page.
    stage.addEventListener('wheel', function (event) {
      if (!event.ctrlKey && !event.metaKey) { return; }
      event.preventDefault();
      zoomTo(view.z * Math.exp(-event.deltaY * 0.01), event.clientX, event.clientY);
    }, { passive: false });

    // Drag anywhere on the canvas to pan (mouse and pen; on touch screens a
    // drag still scrolls the page).
    var drag = null;
    var dragged = false;

    stage.addEventListener('pointerdown', function (event) {
      if (event.button !== 0 || event.pointerType === 'touch') { return; }
      if (event.target.closest('.to-canvas-bar, .to-note, input, textarea, select')) { return; }
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: view.x, startY: view.y };
      dragged = false;
    });

    stage.addEventListener('pointermove', function (event) {
      if (!drag || event.pointerId !== drag.id) { return; }
      var dx = event.clientX - drag.x;
      var dy = event.clientY - drag.y;
      if (!dragged && Math.abs(dx) + Math.abs(dy) < 4) { return; }
      if (!dragged) {
        dragged = true;
        stage.classList.add('is-panning');
        stage.setPointerCapture(event.pointerId);
        setActive(items, null);
      }
      view.x = drag.startX + dx;
      view.y = drag.startY + dy;
      applyView();
    });

    function endDrag(event) {
      if (!drag || event.pointerId !== drag.id) { return; }
      drag = null;
      stage.classList.remove('is-panning');
      // The click that ends a drag fires right after this; clear the flag
      // afterwards so the next real click (like Recenter) still works.
      window.setTimeout(function () { dragged = false; }, 0);
    }
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    // A drag that ends on a sample button should not also click it.
    stage.addEventListener('click', function (event) {
      if (!dragged) { return; }
      dragged = false;
      event.preventDefault();
      event.stopPropagation();
    }, true);

    applyPreset(activePreset);
    renderTokens();
    showFrame();
    window.addEventListener('resize', reposition);
    if (window.ResizeObserver) { new ResizeObserver(reposition).observe(stage); }
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(reposition); }

    // 5. Hovering the sample UI shows details for the item under the pointer.
    function itemFor(node) {
      for (var i = 0; i < items.length; i += 1) {
        if (items[i].element === node) { return items[i]; }
      }
      return null;
    }

    sample.addEventListener('mouseover', function (event) {
      if (pinnedItem) { return; }
      if (!app.classList.contains('to-overlay-on')) { return; }
      if (stage.classList.contains('is-panning')) { return; }
      var target = event.target.closest('[data-to-status]');
      var item = target ? itemFor(target) : null;
      if (!item) { return; }
      setActive(items, item);
      showTip(tip, item, item.element);
    });

    sample.addEventListener('mouseleave', function () {
      if (pinnedItem) { return; }
      setActive(items, null);
      hideTip(tip);
    });

    // A hover card would float in the wrong place while scrolling, so hide it.
    // A card opened from a finding stays, and moves with its element.
    app.addEventListener('scroll', function () {
      if (pinnedItem) { placePinned(); return; }
      hideTip(tip);
    });

    // 6. The On / Off switch (also the O key).
    function setOverlay(isOn) {
      app.classList.toggle('to-overlay-on', isOn);
      toggle.setAttribute('aria-checked', String(isOn));
      if (!isOn) { closeTip(); }
    }

    toggle.addEventListener('click', function () {
      setOverlay(!app.classList.contains('to-overlay-on'));
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        var inDraft = event.target.closest && event.target.closest('.to-token-draft');
        if (!inDraft && spotlight) { toggleSpotlight(spotlight.kind, { name: spotlight.name }); }
        return;
      }
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
      if (typing || event.metaKey || event.ctrlKey || event.altKey) { return; }
      if (event.key === 'o' || event.key === 'O') {
        setOverlay(!app.classList.contains('to-overlay-on'));
      } else if (event.key === '+' || event.key === '=') {
        zoomTo(view.z + 0.25);
      } else if (event.key === '-' || event.key === '_') {
        zoomTo(view.z - 0.25);
      } else if (event.key === '0') {
        resetView();
      }
    });

    // 6b. The Dark mode switch in the top bar. Light is the default.
    // The choice is remembered when the browser allows it (some block
    // storage for files opened by double-click, so it is wrapped in try).
    var themeSwitch = document.getElementById('to-theme');

    function setDark(isDark) {
      app.setAttribute('data-theme', isDark ? 'dark' : 'light');
      themeSwitch.setAttribute('aria-checked', String(isDark));
    }

    var savedTheme = null;
    try { savedTheme = window.localStorage.getItem('to-theme'); } catch (err) { /* ignore */ }
    setDark(savedTheme === 'dark');

    themeSwitch.addEventListener('click', function () {
      var nowDark = app.getAttribute('data-theme') !== 'dark';
      setDark(nowDark);
      try { window.localStorage.setItem('to-theme', nowDark ? 'dark' : 'light'); } catch (err) { /* ignore */ }
    });

    // 7. "All" / "Issues only" buttons above the canvas.
    var showButtons = document.querySelectorAll('#to-show button');
    Array.prototype.forEach.call(showButtons, function (button) {
      button.addEventListener('click', function () {
        var issuesOnly = button.getAttribute('data-show') === 'issues';
        app.classList.toggle('to-issues-only', issuesOnly);
        Array.prototype.forEach.call(showButtons, function (b) {
          var on = b === button;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-pressed', String(on));
        });
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
