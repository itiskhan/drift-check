/*
 * sample-data.js
 * ---------------------------------------------------------------------------
 * This file holds the FAKE (made-up, NDA-safe) demo data for the tool:
 *
 *   1. tokens    - the "official" design values (the list we compare against)
 *   2. presets   - drift tolerance presets (Strict, Standard, Loose)
 *   3. captures  - three realistic UI components
 *   4. builds    - three lifecycle snapshots of each component
 *
 * Nothing in here comes from a real product. The Input panel on the page
 * edits the tokens and tolerance live. You can also change a value here
 * and refresh.
 *
 * Note for non-programmers: a "token" is just a named design value, like
 * "space-4 = 16px" or "color-primary = #2563eb".
 *
 * Each capture has the same layout in every build. Only the scanned values
 * change:
 *   v1.0 Clean  - every spacing, color, type, and radius matches a token
 *   v1.4 Drift  - a few values sit 1–2px or one shade off (within Standard)
 *   v2.1 Hotfix - those drifts remain, plus hardcoded values outside tolerance
 */

(function () {
  'use strict';

/* One piece of the sample UI. "styles" are what the scanner reads. */
function toNode(id, label, tag, styles, extra) {
  var node = { id: id, label: label, tag: tag, styles: styles };
  extra = extra || {};
  if (extra.text) { node.text = extra.text; }
  if (extra.attrs) { node.attrs = extra.attrs; }
  if (extra.children) { node.children = extra.children; }
  return node;
}

/* A fresh copy, so painting one build never changes another. */
function toClone(value) {
  return JSON.parse(JSON.stringify(value));
}

/* Overwrite a few styles on the nodes whose ids are listed. */
function toPaint(tree, patches) {
  function walk(list) {
    list.forEach(function (node) {
      var patch = patches[node.id];
      if (patch) {
        Object.keys(patch).forEach(function (key) { node.styles[key] = patch[key]; });
      }
      if (node.children) { walk(node.children); }
    });
  }
  walk(tree);
  return tree;
}

/* Start from the clean tree, then layer drift, then the hotfix overrides. */
function toBuild(clean, drift, hotfix, build) {
  var tree = toClone(clean);
  if (build === 'drift' || build === 'hotfix') { toPaint(tree, drift); }
  if (build === 'hotfix') { toPaint(tree, hotfix); }
  return tree;
}

/* -------------------------------------------------------------------------
 * Capture 1. Queue Row: thumbnail, title, metadata, status, primary button.
 * ---------------------------------------------------------------------- */
function queueClean() {
  return [
    toNode('row', 'Queue row', 'div', {
      display: 'flex',
      alignItems: 'center',
      gap: '16px',                  // space-4
      padding: '16px',              // space-4
      backgroundColor: '#ffffff',   // color-surface
      borderColor: '#e2e8f0',       // color-border
      borderWidth: '1px',
      borderStyle: 'solid',
      borderRadius: '12px',         // radius-lg
      width: '100%',
      maxWidth: '440px'
    }, {
      children: [
        toNode('thumb', 'Thumbnail', 'div', {
          flex: 'none',
          width: '48px',
          height: '36px',
          backgroundColor: '#f1f5f9', // color-background
          borderRadius: '8px'         // radius-md
        }, { attrs: { 'aria-hidden': 'true' } }),
        toNode('copy', 'Text block', 'div', {
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',                 // space-1
          flex: '1',
          minWidth: '0'
        }, {
          children: [
            toNode('title', 'Title', 'p', {
              margin: '0',
              fontSize: '14px',       // text-sm
              fontWeight: '600',
              lineHeight: '20px',
              color: '#0f172a'        // color-text
            }, { text: 'Season premiere highlights' }),
            toNode('meta', 'Metadata', 'p', {
              margin: '0',
              fontSize: '12px',       // text-xs
              lineHeight: '16px',
              color: '#64748b'        // color-text-muted
            }, { text: 'Updated 12m ago · 4 items' })
          ]
        }),
        toNode('pill', 'Status pill', 'span', {
          flex: 'none',
          padding: '4px 8px',         // space-1, space-2
          backgroundColor: '#f1f5f9', // color-background
          color: '#16a34a',           // color-success
          fontSize: '12px',           // text-xs
          fontWeight: '600',
          lineHeight: '16px',
          borderRadius: '999px'       // radius-pill
        }, { text: 'Ready' }),
        toNode('review', 'Review button', 'button', {
          flex: 'none',
          padding: '8px 16px',        // space-2, space-4
          backgroundColor: '#2563eb', // color-primary
          color: '#ffffff',           // color-surface
          fontSize: '14px',           // text-sm
          fontWeight: '600',
          lineHeight: '20px',
          borderWidth: '0',
          borderRadius: '8px'         // radius-md
        }, { text: 'Review', attrs: { type: 'button' } })
      ]
    })
  ];
}

/* A few eyeballed values, all still inside Standard tolerance. */
var queueDrift = {
  row: { padding: '18px' },             // 2px from space-4
  thumb: { borderRadius: '6px' },       // 2px from radius-sm and radius-md
  title: { fontSize: '15px' },          // 1px from text-sm
  meta: { color: '#6b7a90' },           // a near-match of color-text-muted
  review: { backgroundColor: '#2760e8' } // a near-match of color-primary
};

/* Friday overrides. The sprint drift above stays; these sit outside tolerance. */
var queueHotfix = {
  row: { borderColor: '#f472b6' },
  title: { color: '#7c3aed' },
  pill: { backgroundColor: '#ff3b8b', color: '#ffffff', fontSize: '10px' },
  review: { padding: '8px 20px', borderRadius: '14px' }
};

/* -------------------------------------------------------------------------
 * Capture 2. Publish Card: heading, description, one field, two buttons.
 * ---------------------------------------------------------------------- */
function publishClean() {
  return [
    toNode('card', 'Publish card', 'div', {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',                  // space-4
      padding: '24px',              // space-6
      backgroundColor: '#ffffff',   // color-surface
      borderColor: '#e2e8f0',       // color-border
      borderWidth: '1px',
      borderStyle: 'solid',
      borderRadius: '12px',         // radius-lg
      width: '100%',
      maxWidth: '400px'
    }, {
      children: [
        toNode('heading', 'Heading', 'h3', {
          margin: '0',
          fontSize: '20px',         // text-lg
          fontWeight: '600',
          lineHeight: '28px',
          color: '#0f172a'          // color-text
        }, { text: 'Publish release' }),
        toNode('blurb', 'Description', 'p', {
          margin: '0',
          fontSize: '14px',         // text-sm
          lineHeight: '20px',
          color: '#64748b'          // color-text-muted
        }, { text: 'Ship the approved cut to the production channel.' }),
        toNode('label', 'Field label', 'label', {
          fontSize: '12px',         // text-xs
          fontWeight: '500',
          lineHeight: '16px',
          color: '#64748b'          // color-text-muted
        }, { text: 'Release channel', attrs: { 'for': 'to-channel' } }),
        toNode('channel', 'Release channel', 'input', {
          width: '100%',
          padding: '12px 16px',     // space-3, space-4
          fontSize: '14px',         // text-sm
          lineHeight: '20px',
          color: '#0f172a',         // color-text
          backgroundColor: '#ffffff', // color-surface
          borderColor: '#e2e8f0',   // color-border
          borderWidth: '1px',
          borderStyle: 'solid',
          borderRadius: '8px'       // radius-md
        }, {
          attrs: {
            id: 'to-channel',
            type: 'text',
            value: 'production-web',
            readonly: 'readonly',
            'aria-label': 'Release channel'
          }
        }),
        toNode('actions', 'Button row', 'div', {
          display: 'flex',
          alignItems: 'center',
          gap: '12px'               // space-3
        }, {
          children: [
            toNode('cancel', 'Cancel button', 'button', {
              padding: '8px 16px',  // space-2, space-4
              backgroundColor: '#ffffff', // color-surface
              color: '#0f172a',     // color-text
              borderColor: '#e2e8f0', // color-border
              borderWidth: '1px',
              borderStyle: 'solid',
              fontSize: '14px',     // text-sm
              fontWeight: '500',
              lineHeight: '20px',
              borderRadius: '8px'   // radius-md
            }, { text: 'Cancel', attrs: { type: 'button' } }),
            toNode('publish', 'Publish button', 'button', {
              padding: '8px 16px',  // space-2, space-4
              backgroundColor: '#2563eb', // color-primary
              color: '#ffffff',     // color-surface
              fontSize: '14px',     // text-sm
              fontWeight: '600',
              lineHeight: '20px',
              borderWidth: '0',
              borderRadius: '8px'   // radius-md
            }, { text: 'Publish', attrs: { type: 'button' } })
          ]
        })
      ]
    })
  ];
}

var publishDrift = {
  card: { padding: '18px' },            // 2px from space-4
  blurb: { fontSize: '15px', color: '#6b7a90' },
  channel: { borderRadius: '6px' },     // 2px from radius-sm and radius-md
  publish: { padding: '10px 16px', backgroundColor: '#2760e8' }
};

var publishHotfix = {
  card: { borderColor: '#f472b6', borderRadius: '14px' },
  heading: { color: '#7c3aed' },
  label: { fontSize: '10px' },
  channel: { padding: '12px 20px', borderColor: '#ff3b8b' },
  cancel: { borderRadius: '14px' }
};

/* -------------------------------------------------------------------------
 * Capture 3. Data Row: name, category, timestamp, status, secondary action.
 * ---------------------------------------------------------------------- */
function dataClean() {
  return [
    toNode('row', 'Data row', 'div', {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1.5fr) auto auto auto',
      alignItems: 'center',
      gap: '8px',                   // space-2
      padding: '8px 12px',          // space-2, space-3
      backgroundColor: '#ffffff',   // color-surface
      borderColor: '#e2e8f0',       // color-border
      borderWidth: '1px',
      borderStyle: 'solid',
      borderRadius: '8px',          // radius-md
      width: '100%',
      maxWidth: '440px'
    }, {
      children: [
        toNode('name', 'Name cell', 'div', {
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',               // space-1
          minWidth: '0'
        }, {
          children: [
            toNode('title', 'Primary label', 'span', {
              fontSize: '14px',     // text-sm
              fontWeight: '600',
              lineHeight: '20px',
              color: '#0f172a',     // color-text
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }, { text: 'Audience weekly' }),
            toNode('subtitle', 'Subtitle', 'span', {
              fontSize: '12px',     // text-xs
              lineHeight: '16px',
              color: '#64748b'      // color-text-muted
            }, { text: 'Edited by studio ops' })
          ]
        }),
        toNode('tag', 'Category tag', 'span', {
          padding: '4px 8px',       // space-1, space-2
          backgroundColor: '#f1f5f9', // color-background
          color: '#64748b',         // color-text-muted
          fontSize: '12px',         // text-xs
          fontWeight: '500',
          lineHeight: '16px',
          borderRadius: '4px',      // radius-sm
          whiteSpace: 'nowrap'
        }, { text: 'Series' }),
        toNode('time', 'Timestamp', 'span', {
          fontSize: '12px',         // text-xs
          lineHeight: '16px',
          color: '#64748b',         // color-text-muted
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap'
        }, { text: '14:20 UTC' }),
        toNode('trail', 'Status and action', 'div', {
          display: 'flex',
          alignItems: 'center',
          gap: '8px'                // space-2
        }, {
          children: [
            toNode('pill', 'Status pill', 'span', {
              padding: '4px 8px',   // space-1, space-2
              backgroundColor: '#f1f5f9', // color-background
              color: '#16a34a',     // color-success
              fontSize: '12px',     // text-xs
              fontWeight: '600',
              lineHeight: '16px',
              borderRadius: '999px', // radius-pill
              whiteSpace: 'nowrap'
            }, { text: 'Synced' }),
            toNode('action', 'Open button', 'button', {
              padding: '8px 12px',  // space-2, space-3
              backgroundColor: '#ffffff', // color-surface
              color: '#0f172a',     // color-text
              borderColor: '#e2e8f0', // color-border
              borderWidth: '1px',
              borderStyle: 'solid',
              fontSize: '12px',     // text-xs
              fontWeight: '500',
              lineHeight: '16px',
              borderRadius: '8px'   // radius-md
            }, { text: 'Open', attrs: { type: 'button' } })
          ]
        })
      ]
    })
  ];
}

var dataDrift = {
  row: { padding: '10px 12px', borderColor: '#dde3ea' }, // 10px is 2px off; border is a near-match
  title: { fontSize: '15px' },
  subtitle: { color: '#6b7a90' },
  tag: { borderRadius: '6px' },
  pill: { padding: '4px 10px' }         // 10px is 2px from space-2 and space-3
};

var dataHotfix = {
  row: { padding: '10px 20px', borderColor: '#f472b6', borderRadius: '14px' },
  title: { color: '#7c3aed' },
  tag: { backgroundColor: '#ff3b8b', color: '#ffffff', fontSize: '10px' },
  time: { fontSize: '10px' },
  pill: { color: '#be185d' },
  action: { borderRadius: '14px' }
};

function samplesFor(clean, drift, hotfix) {
  return {
    clean: toBuild(clean(), drift, hotfix, 'clean'),
    drift: toBuild(clean(), drift, hotfix, 'drift'),
    hotfix: toBuild(clean(), drift, hotfix, 'hotfix')
  };
}

window.DRIFT_CHECK_DATA = {

  /* -------------------------------------------------------------------------
   * 1. TOKENS: the official list. Each one has a name and a value.
   *    scanner.js copies this list when the page opens. Reset defaults
   *    puts that copy back, so deleted tokens return, added tokens
   *    disappear, and edited values return to the numbers below.
   * ----------------------------------------------------------------------- */
  tokens: {

    // Spacing tokens (used for padding, margin and gap). Values are in pixels.
    spacing: [
      { name: 'space-1', value: 4 },
      { name: 'space-2', value: 8 },
      { name: 'space-3', value: 12 },
      { name: 'space-4', value: 16 },
      { name: 'space-6', value: 24 },
      { name: 'space-8', value: 32 }
    ],

    // Color tokens. Values are hex colors.
    color: [
      { name: 'color-primary',    value: '#2563eb' },
      { name: 'color-text',       value: '#0f172a' },
      { name: 'color-text-muted', value: '#64748b' },
      { name: 'color-surface',    value: '#ffffff' },
      { name: 'color-background', value: '#f1f5f9' },
      { name: 'color-border',     value: '#e2e8f0' },
      { name: 'color-success',    value: '#16a34a' },
      { name: 'color-danger',     value: '#dc2626' }
    ],

    // Type tokens (font sizes). Values are in pixels.
    type: [
      { name: 'text-xs', value: 12 },
      { name: 'text-sm', value: 14 },
      { name: 'text-md', value: 16 },
      { name: 'text-lg', value: 20 },
      { name: 'text-xl', value: 28 }
    ],

    // Radius tokens (corner rounding). Values are in pixels.
    radius: [
      { name: 'radius-sm',   value: 4 },
      { name: 'radius-md',   value: 8 },
      { name: 'radius-lg',   value: 12 },
      { name: 'radius-pill', value: 999 }
    ]
  },

  /* -------------------------------------------------------------------------
   * 2. TOLERANCE PRESETS: how far from a token still counts as "Drifted".
   *    - spacing, type, radius: number of pixels (2 means "within 2px")
   *    - color: a rough distance between two colors (0 = identical).
   *      About 24 means "a very similar shade".
   *    Anything further away than this is "Unmapped".
   * ----------------------------------------------------------------------- */
  presets: [
    { id: 'strict',   label: 'Strict System',   tolerance: { spacing: 0, color: 0,  type: 0, radius: 0 } },
    { id: 'standard', label: 'Standard',        tolerance: { spacing: 2, color: 24, type: 1, radius: 2 } },
    { id: 'loose',    label: 'Loose Tolerance', tolerance: { spacing: 4, color: 40, type: 2, radius: 4 } }
  ],
  defaultPreset: 'standard',

  /* -------------------------------------------------------------------------
   * 3. CAPTURES AND BUILDS
   *    The canvas shows one capture at one build. The filename is
   *    "<file>-<slug>.html", for example queue-row-v1.4.html.
   *    zoom is the list of starting magnifications to try, largest first.
   *    Queue Row and Publish Card stay at 100% or 95%. Data Row keeps
   *    stepping down until the callouts fit.
   * ----------------------------------------------------------------------- */
  defaultCapture: 'queue-row',
  defaultBuild: 'drift',

  builds: [
    { id: 'clean',  label: 'v1.0 Clean',  slug: 'v1.0' },
    { id: 'drift',  label: 'v1.4 Drift',  slug: 'v1.4' },
    { id: 'hotfix', label: 'v2.1 Hotfix', slug: 'v2.1' }
  ],

  captures: [
    {
      id: 'queue-row',
      label: 'Queue Row',
      file: 'queue-row',
      zoom: [1, 0.95],
      samples: samplesFor(queueClean, queueDrift, queueHotfix)
    },
    {
      id: 'publish-card',
      label: 'Publish Card',
      file: 'publish-card',
      zoom: [1, 0.95],
      samples: samplesFor(publishClean, publishDrift, publishHotfix)
    },
    {
      id: 'data-row',
      label: 'Data Row',
      file: 'data-row',
      zoom: [1, 0.95, 0.9, 0.85, 0.8, 0.75],
      samples: samplesFor(dataClean, dataDrift, dataHotfix)
    }
  ]
};

}());
