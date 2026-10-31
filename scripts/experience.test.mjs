import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const experience = fs.readFileSync(new URL('../assets/js/experience.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/css/experience.css', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../.github/workflows/build-dashboard.yml', import.meta.url), 'utf8');

test('v3.15 workspace assets are loaded after the existing core application', () => {
  assert.match(html, /assets\/css\/experience\.css\?v=3\.15\.0/);
  assert.match(html, /assets\/js\/experience\.js\?v=3\.15\.0/);
  assert.ok(html.indexOf('assets/js/app.js') < html.indexOf('assets/js/experience.js'));
  assert.ok(html.indexOf('assets/js/vehicle-documents.js') < html.indexOf('assets/js/experience.js'));
});

test('appearance controls expose three validated accent palettes and persist only workspace preferences', () => {
  for (const accent of ['blue', 'mint', 'amber']) {
    assert.match(html, new RegExp(`data-accent-choice="${accent}"`));
    assert.match(css, new RegExp(`data-accent="${accent}"`));
  }
  assert.match(experience, /garage\.workspace\.preferences\.v1/);
  assert.match(experience, /VALID_ACCENTS/);
  assert.match(experience, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(html, /garageCompactToggle/);
  assert.match(html, /garageMotionToggle/);
});

test('global search connects to real event data and supports direct event navigation', () => {
  assert.match(app, /window\.GarageApp = Object\.freeze/);
  assert.match(app, /searchEvents,/);
  assert.match(app, /openEvent: openEventById/);
  assert.match(app, /data-event-id="\$\{escapeAttr\(event\.id\)\}"/);
  assert.match(app, /event\.id, event\.title, event\.description/);
  assert.match(experience, /window\.GarageApp\?\.searchEvents/);
  assert.match(experience, /window\.GarageApp\?\.openEvent\(key\)/);
});

test('command palette supports keyboard navigation and the documented global shortcuts', () => {
  assert.match(html, /id="garageCommandDialog"/);
  assert.match(experience, /event\.key === 'ArrowDown'/);
  assert.match(experience, /event\.key === 'ArrowUp'/);
  assert.match(experience, /event\.key === 'Enter'/);
  assert.match(experience, /event\.key\.toLowerCase\(\) === 'k'/);
  assert.match(experience, /event\.key\.toLowerCase\(\) === 'p'/);
  assert.match(experience, /event\.key === '\/'/);
  assert.ok(experience.includes('event.altKey && /^[1-9]$/.test(event.key)'));
});

test('new interaction layer respects reduced motion and responsive layouts', () => {
  assert.match(css, /:root\[data-motion="off"\]/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(css, /garage-scroll-progress/);
  assert.match(css, /garage-back-top/);
});

test('GitHub Actions runs a syntax check for the new browser experience module', () => {
  assert.match(workflow, /node --check assets\/js\/experience\.js/);
});
