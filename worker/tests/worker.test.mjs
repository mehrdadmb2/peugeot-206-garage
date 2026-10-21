import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const API_TOKEN = 'test-api-access-token-long-enough-for-testing-123456';
const baseEnv = {
  TELEGRAM_BOT_TOKEN: '123456:test-telegram-token',
  TELEGRAM_WEBHOOK_SECRET: 'webhook-secret-test-123456789012345',
  ALLOWED_TELEGRAM_USER_ID: '424242',
  API_ACCESS_TOKEN: API_TOKEN,
  GITHUB_TOKEN: 'github-test-token',
  GITHUB_OWNER: 'mehrdadmb2',
  GITHUB_REPO: 'peugeot-206-garage',
  GITHUB_BRANCH: 'main'
};

function installMockFetch(t, { index = null, config = null, months = {}, githubWrites = [], telegramMessages = [] } = {}) {
  const originalFetch = globalThis.fetch;
  const state = { index, config, months: { ...months }, githubWrites, telegramMessages, requests: [] };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    state.requests.push({ url: url.href, method: init.method || 'GET', headers: init.headers, body: init.body });
    if (url.hostname === 'api.telegram.org') {
      const method = url.pathname.split('/').pop();
      if (method === 'sendMessage') {
        state.telegramMessages.push(JSON.parse(init.body));
        return Response.json({ ok: true, result: { message_id: 99 } });
      }
      return Response.json({ ok: true, result: true });
    }
    if (url.hostname === 'api.github.com') {
      const path = decodeURIComponent(url.pathname.split('/contents/')[1] || '');
      if ((init.method || 'GET') === 'PUT') {
        const payload = JSON.parse(init.body);
        const decoded = Buffer.from(payload.content, 'base64').toString('utf8');
        state.githubWrites.push({ path, payload, value: JSON.parse(decoded) });
        if (path === 'data/index.json') state.index = JSON.parse(decoded);
        else if (path === 'data/config.json') state.config = JSON.parse(decoded);
        else state.months[path.replace('data/logs/', '').replace('.json', '')] = JSON.parse(decoded);
        return Response.json({ content: { sha: 'new-blob-sha' }, commit: { sha: 'new-commit-sha' } }, { status: 201 });
      }
      let value = null;
      if (path === 'data/index.json') value = state.index;
      else if (path === 'data/config.json') value = state.config;
      else if (path.startsWith('data/logs/') && path.endsWith('.json')) value = state.months[path.slice(10, -5)] || null;
      if (!value) return Response.json({ message: 'Not Found' }, { status: 404 });
      const json = JSON.stringify(value, null, 2);
      return Response.json({ sha: 'existing-sha', content: Buffer.from(json, 'utf8').toString('base64') });
    }
    throw new Error(`Unexpected external request: ${url.href}`);
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  return state;
}

function webhookRequest(text) {
  return new Request('https://worker.test/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': baseEnv.TELEGRAM_WEBHOOK_SECRET },
    body: JSON.stringify({ message: { message_id: 1, date: Math.floor(Date.now() / 1000), text, from: { id: 424242 }, chat: { id: 424242, type: 'private' } } })
  });
}

test('Telegram odometer command commits event and index before replying', async t => {
  const mock = installMockFetch(t);
  const response = await worker.fetch(webhookRequest('/km 156000'), baseEnv);
  assert.equal(response.status, 200);
  assert.equal(mock.githubWrites.length, 2, 'monthly event and index both have to be committed');
  assert.ok(mock.githubWrites.some(item => item.path.startsWith('data/logs/') && item.value.events?.some(event => event.type === 'odometer' && event.odometerKm === 156000)));
  assert.ok(mock.githubWrites.some(item => item.path === 'data/index.json' && item.value.months.length === 1));
  assert.equal(mock.telegramMessages.length, 1);
  assert.ok(mock.requests.findIndex(request => request.url.includes('api.github.com') && request.method === 'PUT') < mock.requests.findIndex(request => request.url.includes('/sendMessage')), 'Telegram success must be sent only after GitHub commits finish');
  assert.equal(mock.telegramMessages[0].parse_mode, 'HTML');
  assert.match(mock.telegramMessages[0].text, /<b>✅ ثبت شد:/);
});

test('unknown slash command shows help without saving an accidental note', async t => {
  const mock = installMockFetch(t);
  const response = await worker.fetch(webhookRequest('/banancommand'), baseEnv);
  assert.equal(response.status, 200);
  assert.equal(mock.githubWrites.length, 0);
  assert.match(mock.telegramMessages[0].text, /شناخته نشد/);
  assert.match(mock.telegramMessages[0].text, /<code>\/km 156000<\/code>/);
});

test('external API requires a bearer token', async t => {
  installMockFetch(t);
  const response = await worker.fetch(new Request('https://worker.test/api/v1/overview'), baseEnv);
  assert.equal(response.status, 401);
});

test('external API record awaits GitHub commits before returning persisted true', async t => {
  const mock = installMockFetch(t);
  const response = await worker.fetch(new Request('https://worker.test/api/v1/record', {
    method: 'POST',
    headers: { authorization: `Bearer ${API_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text: '/km 156321' })
  }), baseEnv);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.persisted, true);
  assert.equal(mock.githubWrites.length, 2);
  assert.ok(mock.githubWrites.every(write => write.payload.message.includes('garage: update')));
  assert.ok(mock.githubWrites.some(item => item.path.startsWith('data/logs/') && item.value.events?.some(event => event.odometerKm === 156321)));
});

test('health endpoint is request-driven and exposes no secret', async () => {
  const response = await worker.fetch(new Request('https://worker.test/health'), baseEnv);
  const body = await response.json();
  assert.equal(body.mode, 'request-driven');
  assert.equal(body.scheduler, 'not required; no scheduled handler');
  assert.equal(JSON.stringify(body).includes('github-test-token'), false);
});


test('reports read the committed GitHub month index and log files', async t => {
  const month = new Date().toISOString().slice(0, 7);
  const storedEvent = { id: 'event-12345678', type: 'fuel', title: 'سوخت‌گیری', description: '20l', occurredAt: new Date().toISOString(), date: month + '-01', liters: 20, odometerKm: 156200, costRial: 7000000 };
  const mock = installMockFetch(t, {
    index: { schemaVersion: 1, updatedAt: new Date().toISOString(), months: [month] },
    months: { [month]: { schemaVersion: 1, month, events: [storedEvent] } }
  });
  const response = await worker.fetch(new Request('https://worker.test/api/v1/events?type=fuel', {
    headers: { authorization: `Bearer ${API_TOKEN}` }
  }), baseEnv);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.count, 1);
  assert.equal(body.events[0].id, storedEvent.id);
  assert.ok(mock.requests.some(request => request.url.includes('/contents/data/index.json')));
  assert.ok(mock.requests.some(request => request.url.includes(`/contents/data/logs/${month}.json`)));
});
