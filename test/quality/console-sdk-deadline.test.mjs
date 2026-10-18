/** Loopback-only transport evidence; no dev accounts, external endpoints or published resources. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import test from 'node:test';
import { consoleSdkRead, createConsoleRoundtripBudget } from '../verify-console-roundtrip.mjs';

const requireTools = createRequire(new URL('../../packages/tools-lib/package.json', import.meta.url));
const axios = requireTools('axios');

test('management can shorten the shared absolute budget but cannot enlarge or restart it', () => {
  let now = 1000;
  const budget = createConsoleRoundtripBudget({ now: () => now, totalMs: 900_000 });
  assert.equal(Date.parse(budget.deadlineAt) - Date.parse(budget.startedAt), 900_000);
  now += 899_999; assert.equal(budget.timeout(30_000), 1);
  now += 1; assert.throws(() => budget.timeout(30_000), /budget expired/u);
  for (const totalMs of [0, -1, 1.5, 1_200_001, NaN, Infinity]) assert.throws(() => createConsoleRoundtripBudget({ totalMs }), /budget must be positive/u);
});

test('absolute SDK deadline cancels a continuously active response and restores the owned Axios defaults', async (t) => {
  const sockets = new Set();
  let chunks = 0;
  let closedResolve;
  const closed = new Promise((resolve) => { closedResolve = resolve; });
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.write('{"value":"');
    const drip = setInterval(() => { chunks += 1; response.write(' '); }, 25);
    response.on('close', () => { clearInterval(drip); closedResolve(); });
  });
  server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise((resolve) => server.close(resolve)); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const client = axios.create();
  const before = { timeout: client.defaults.timeout, signal: client.defaults.signal, hadSignal: Object.hasOwn(client.defaults, 'signal') };
  let now = Date.now();
  const budget = createConsoleRoundtripBudget({ now: () => now });
  now += 1_200_000 - 250;
  let transport = 'pending';
  await assert.rejects(consoleSdkRead(budget, { FUtil: { Axios: client } }, () =>
    client.get(`http://127.0.0.1:${server.address().port}/drip`).then(() => { transport = 'resolved'; }, (error) => { transport = error.code; throw error; })), /bounded SDK/u);
  let timer;
  try {
    await Promise.race([closed, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('The bounded observer left its transport/socket alive.')), 1000); })]);
  } finally { clearTimeout(timer); }
  assert.ok(chunks >= 2, 'the response actually stayed active, rather than testing an idle timeout');
  assert.equal(transport, 'ERR_CANCELED');
  assert.equal(client.defaults.timeout, before.timeout);
  assert.equal(client.defaults.signal, before.signal);
  assert.equal(Object.hasOwn(client.defaults, 'signal'), before.hadSignal);
});
