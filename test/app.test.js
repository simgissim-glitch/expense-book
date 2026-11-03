import test from 'node:test';
import assert from 'node:assert/strict';
import app, { validDate, validExpense } from '../app.js';

test('실제 날짜와 정수 금액만 허용한다', () => {
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2024-02-29'), true);
  const entry = { date: '2026-11-03', item: '점심', category: '식비', amount: 12000 };
  assert.equal(validExpense(entry), true);
  for (const change of [{ amount: -1 }, { amount: 1.5 }, { amount: 2147483648 }, { item: '  ' }, { category: 'unknown' }, { date: '2026-13-01' }]) assert.equal(validExpense({ ...entry, ...change }), false);
});

test('인증, 쿠키, CSRF, 미설정 DB 및 비밀정보 노출 방지', async () => {
  const originalPassword = process.env.APP_PASSWORD;
  const originalDatabase = process.env.DATABASE_URL;
  process.env.APP_PASSWORD = 'test-only-password-do-not-use';
  delete process.env.DATABASE_URL;
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'expense-book' };
  try {
    assert.equal((await fetch(`${base}/api/expenses?month=2026-11`)).status, 401);
    assert.equal((await fetch(`${base}/.env`)).status, 404);
    assert.equal((await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal((await fetch(`${base}/api/login`, { method: 'POST', headers: { ...headers, Origin: 'https://attacker.example' }, body: '{}' })).status, 403);
    assert.equal((await fetch(`${base}/api/login`, { method: 'POST', headers, body: JSON.stringify({ password: 'wrong' }) })).status, 401);
    const login = await fetch(`${base}/api/login`, { method: 'POST', headers, body: JSON.stringify({ password: process.env.APP_PASSWORD }) });
    assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie'), /HttpOnly/);
    assert.match(login.headers.get('set-cookie'), /SameSite=Strict/);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const session = await fetch(`${base}/api/session`, { headers: { Cookie: cookie } });
    assert.equal((await session.json()).authenticated, true);
    assert.equal((await fetch(`${base}/api/expenses?month=2026-13`, { headers: { Cookie: cookie } })).status, 400);
    const missing = await fetch(`${base}/api/expenses?month=2026-11`, { headers: { Cookie: cookie } });
    assert.equal(missing.status, 503);
    assert.equal((await fetch(`${base}/api/expenses`, { method: 'POST', headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ date: '2026-02-30' }) })).status, 400);
    const tampered = `${cookie}bad`;
    assert.equal((await fetch(`${base}/api/expenses?month=2026-11`, { headers: { Cookie: tampered } })).status, 401);
    assert.equal((await fetch(base)).status, 200);
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (originalPassword === undefined) delete process.env.APP_PASSWORD; else process.env.APP_PASSWORD = originalPassword;
    if (originalDatabase === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalDatabase;
  }
});
