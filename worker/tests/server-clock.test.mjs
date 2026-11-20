import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../assets/js/server-clock.js', import.meta.url), 'utf8');

test('server clock uses Worker epoch and monotonic elapsed time instead of the device wall clock', async () => {
  let mono = 100;
  const serverEpoch = Date.UTC(2026, 10, 20, 13, 6, 0);
  const listeners = new Map();
  const fakeWindow = {
    performance: { now: () => mono },
    fetch: async () => {
      mono = 140;
      return new Response(JSON.stringify({ ok: true, epochMs: serverEpoch, time: '2026-11-20T16:36:00+03:30', timezone: 'Asia/Tehran' }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
    AbortController,
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    addEventListener: (name, callback) => listeners.set(name, callback),
    document: { hidden: false, addEventListener: (name, callback) => listeners.set(`document:${name}`, callback) },
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    dispatchEvent: event => { listeners.get(event.type)?.(event); }
  };
  const context = { window: fakeWindow, Date, Intl, AbortController, setTimeout, clearTimeout, Response, console };
  vm.runInNewContext(source, context, { filename: 'server-clock.js' });
  const result = await fakeWindow.GarageClockReady;
  assert.equal(result.synced, true);
  assert.equal(fakeWindow.GarageClock.dateKey(new Date(serverEpoch)), '2026-11-20');
  const afterSync = fakeWindow.GarageClock.nowEpoch();
  mono += 60_000;
  assert.ok(Math.abs(afterSync - serverEpoch) < 100, 'clock anchor should stay within the small request round-trip');
  assert.equal(fakeWindow.GarageClock.nowEpoch(), afterSync + 60_000);
  assert.equal(fakeWindow.GarageClock.nowDate().toISOString(), new Date(afterSync + 60_000).toISOString());
});

test('server clock falls back without crashing when Worker time is unreachable', async () => {
  const fakeWindow = {
    performance: { now: () => 100 },
    fetch: async () => { throw new Error('network down'); },
    AbortController,
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    addEventListener: () => {},
    document: { hidden: false, addEventListener: () => {} }
  };
  const context = { window: fakeWindow, Date, Intl, AbortController, setTimeout, clearTimeout, Response, console };
  vm.runInNewContext(source, context, { filename: 'server-clock.js' });
  const result = await fakeWindow.GarageClockReady;
  assert.equal(result.synced, false);
  assert.match(result.error, /network down/);
  assert.ok(Number.isFinite(fakeWindow.GarageClock.nowEpoch()));
});
