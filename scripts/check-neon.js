import app from '../app.js';
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'expense-book' };
let id;
async function call(path, method = 'GET', body) {
  const response = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${data.error}`);
  return { data, response };
}
try {
  const login = await call('/login', 'POST', { password: process.env.APP_PASSWORD });
  headers.Cookie = login.response.headers.get('set-cookie').split(';')[0];
  const entry = { date: '2026-11-03', item: `Integration check ${Date.now()}`, category: '기타', amount: 123 };
  id = (await call('/expenses', 'POST', entry)).data.id;
  let list = (await call('/expenses?month=2026-11&date=2026-11-03')).data;
  if (!list.expenses.some(x => x.id === id && x.amount === 123)) throw new Error('Create/read mismatch');
  await call(`/expenses/${id}`, 'PUT', { ...entry, amount: 456 });
  list = (await call('/expenses?month=2026-11')).data;
  if (!list.expenses.some(x => x.id === id && x.amount === 456)) throw new Error('Update mismatch');
  if (list.total !== list.expenses.reduce((sum, x) => sum + x.amount, 0)) throw new Error('Monthly total mismatch');
  if (list.total !== list.categories.reduce((sum, x) => sum + x.amount, 0)) throw new Error('Category total mismatch');
  await call(`/expenses/${id}`, 'DELETE');
  const removed = id; id = undefined;
  list = (await call('/expenses?month=2026-11')).data;
  if (list.expenses.some(x => x.id === removed)) throw new Error('Delete mismatch');
  console.log('PASS: Neon create/read/update/delete, date search, monthly/category totals. Temporary record removed.');
} catch (error) {
  console.error(error.message); process.exitCode = 1;
} finally {
  if (id) {
    try { await call(`/expenses/${id}`, 'DELETE'); console.log('Temporary record removed.'); }
    catch { console.error(`Cleanup failed for temporary record ${id}`); }
  }
  await new Promise(resolve => server.close(resolve));
}
