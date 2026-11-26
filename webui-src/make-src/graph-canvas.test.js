const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const m = require('../app/mithril');
const physics = require('../app/network/graph_physics');
const { createViewport } = require('../app/network/graph_viewport');

function setup(width = 1200, reduced = true) {
  const positions = { own: { x: 500, y: 325 }, friend: { x: 800, y: 550 }, other: { x: 900, y: 600 } };
  const camera = { ready: true, x: 500, y: 325, width: 1000, height: 650 };
  const handlers = {};
  const frames = new Map();
  let frame = 0;
  let arc;
  const painted = [];
  let clips = 0;
  const context = new Proxy({
    measureText: (text) => ({ width: text.length * 6 }),
    arc: (x, y, radius) => { arc = { x, y, radius }; },
    fill: () => painted.push(arc),
    clip: () => { clips++; },
  }, { get: (target, key) => target[key] || (() => {}) });
  const canvas = {
    getContext: () => context,
    getBoundingClientRect: () => ({ width, height: 700, left: 0, top: 0 }),
    parentElement: { querySelector: () => null, querySelectorAll: () => [] },
    addEventListener: (name, handler) => { handlers[name] = handler; },
    removeEventListener() {}, setPointerCapture() {}, hasPointerCapture: () => true,
    releasePointerCapture() {}, focus() {},
  };
  const attrs = {
    nodes: Object.keys(positions).map((id, index) => ({ id, name: id, level: index ? 1 : 0 })),
    edges: [], positions, camera, zoom: 1, edgeLength: 105, fitVersion: 0, selectedId: 'own', search: '', showNames: true,
    onselect: (id) => { attrs.selectedId = id; }, onzoom: (zoom) => { attrs.zoom = zoom; },
  };
  const tokens = { '--graph-node-radius': 7, '--graph-own-radius': 10, '--t-label': 12, '--touch': 44, '--graph-fit-padding': 32, '--s2': 8, '--s1': 4, '--stroke': 1 };
  const module = { exports: {} };
  vm.runInNewContext(readFileSync(require.resolve('../app/network/graph_canvas'), 'utf8'), {
    module,
    require: (name) => ({ mithril: m, 'network/graph_physics': physics, 'network/graph_viewport': { createViewport } })[name],
    window: { devicePixelRatio: 1, matchMedia: (query) => ({ matches: reduced && query.includes('reduced-motion'), addEventListener() {}, removeEventListener() {} }), addEventListener() {}, removeEventListener() {} },
    document: { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} },
    getComputedStyle: () => ({ getPropertyValue: (name) => String(tokens[name] || 'black') }),
    ResizeObserver: class { observe() {} disconnect() {} }, MutationObserver: class { observe() {} disconnect() {} },
    performance, requestAnimationFrame: (callback) => { frames.set(++frame, callback); return frame; },
    cancelAnimationFrame: (id) => frames.delete(id),
  });
  const component = module.exports();
  component.view({ attrs });
  component.oncreate({ dom: canvas });
  const flush = () => {
    painted.length = 0;
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback());
  };
  const viewport = createViewport(camera);
  viewport.resize(width, 700);
  viewport.setInsets({ left: 8, right: 8, top: 8, bottom: 8 });
  const screen = (id) => viewport.toScreen(positions[id], attrs.zoom);
  const update = () => { component.view({ attrs }); component.onupdate(); flush(); };
  const pointer = (type, x, y) => handlers[type]({ clientX: x, clientY: y, pointerId: 1, button: 0, preventDefault() {} });
  flush();
  return { positions, camera, attrs, component, screen, viewport, painted, update, pointer, handlers, clips: () => clips };
}

test('canvas zoom preserves cached positions with and without reduced motion', () => {
  for (const reduced of [true, false]) for (const width of [390, 1200]) {
    const graph = setup(width, reduced);
    const before = JSON.stringify(graph.positions);
    for (const zoom of [2.5, 0.5, 1]) {
      graph.attrs.zoom = zoom;
      graph.update();
      assert.equal(JSON.stringify(graph.positions), before);
    }
  }
});

test('zoom clips off-screen peers instead of stacking them on the border', () => {
  const graph = setup();
  graph.attrs.zoom = 2.5;
  graph.update();
  assert.ok(graph.clips() > 0);
  const own = graph.screen('own');
  assert.ok(graph.painted.length > 0);
  assert.ok(graph.painted.every((point) => point.x === own.x && point.y === own.y));
});

test('background panning moves only the camera and keeps pointer conversion aligned', () => {
  const graph = setup();
  graph.attrs.zoom = 2.5;
  graph.update();
  const before = JSON.stringify(graph.positions);
  const own = graph.screen('own');
  graph.pointer('pointerdown', 40, 40);
  graph.pointer('pointermove', 100, 80);
  graph.pointer('pointerup', 100, 80);
  graph.update();
  const after = graph.screen('own');
  assert.ok(Math.abs(after.x - own.x - 60) < 1e-8);
  assert.ok(Math.abs(after.y - own.y - 40) < 1e-8);
  assert.equal(JSON.stringify(graph.positions), before);
});

test('a panned peer can be picked and dragged without snapping to the pointer', () => {
  const graph = setup();
  graph.attrs.zoom = 2.5;
  graph.update();
  const before = { ...graph.positions.friend };
  const hidden = graph.screen('friend');
  graph.pointer('pointerdown', 40, 40);
  graph.pointer('pointermove', 40 + 600 - hidden.x, 40 + 350 - hidden.y);
  graph.pointer('pointerup', 40 + 600 - hidden.x, 40 + 350 - hidden.y);
  const point = graph.screen('friend');
  graph.pointer('pointerdown', point.x + 4, point.y + 4);
  assert.equal(graph.attrs.selectedId, 'friend');
  graph.pointer('pointermove', point.x + 4, point.y + 4);
  assert.ok(Math.hypot(graph.positions.friend.x - before.x, graph.positions.friend.y - before.y) < 1e-8);
  graph.pointer('pointermove', point.x + 24, point.y + 14);
  const moved = graph.screen('friend');
  assert.ok(Math.abs(moved.x - point.x - 20) < 1e-8);
  assert.ok(Math.abs(moved.y - point.y - 10) < 1e-8);
  graph.pointer('pointerup', point.x + 24, point.y + 14);
});

test('keyboard navigation reveals off-screen peers without moving their layout', () => {
  const graph = setup();
  graph.attrs.zoom = 2.5;
  graph.update();
  const before = JSON.stringify(graph.positions);
  graph.handlers.keydown({ key: 'PageDown', preventDefault() {} });
  assert.equal(graph.attrs.selectedId, 'friend');
  assert.ok(graph.viewport.contains(graph.screen('friend')));
  assert.equal(JSON.stringify(graph.positions), before);
});

test('horizontal wheel scrolling does not change zoom', () => {
  const graph = setup();
  graph.handlers.wheel({ deltaY: 0, preventDefault: () => assert.fail('Horizontal scroll captured') });
  assert.equal(graph.attrs.zoom, 1);
});
