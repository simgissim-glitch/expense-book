import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const app = express();
const production = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '8kb' }));
app.use(cookieParser());
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.get('origin');
    if (origin && origin !== `${req.protocol}://${req.get('host')}` && !(production && origin === `https://${req.get('host')}`)) return res.status(403).json({ error: '허용되지 않은 요청입니다.' });
    if (req.get('x-requested-with') !== 'expense-book') return res.status(403).json({ error: '허용되지 않은 요청입니다.' });
  }
  next();
});
const equal = (a, b) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const signature = value => createHmac('sha256', process.env.APP_PASSWORD).update(`expense-book-session:${value}`).digest('hex');
const authenticated = req => {
  if (!process.env.APP_PASSWORD) return false;
  const [expiry, sig] = (req.cookies.session || '').split('.');
  return /^\d+$/.test(expiry || '') && Number(expiry) > Date.now() && equal(sig || '', signature(expiry));
};
const cookieOptions = { httpOnly: true, secure: production, sameSite: 'strict', path: '/' };
app.get('/api/session', (req, res) => res.json({ authenticated: authenticated(req), configured: Boolean(process.env.APP_PASSWORD && process.env.DATABASE_URL) }));
app.post('/api/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: '로그인 시도가 많습니다. 15분 후 다시 시도해 주세요.' } }), (req, res) => {
  if (!process.env.APP_PASSWORD) return res.status(503).json({ error: '서버에 APP_PASSWORD를 설정해 주세요.' });
  if (typeof req.body.password !== 'string' || !equal(req.body.password, process.env.APP_PASSWORD)) return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
  const expiry = String(Date.now() + 12 * 60 * 60 * 1000);
  res.cookie('session', `${expiry}.${signature(expiry)}`, { ...cookieOptions, maxAge: 12 * 60 * 60 * 1000 }).json({ ok: true });
});
app.post('/api/logout', (req, res) => res.clearCookie('session', cookieOptions).json({ ok: true }));
app.use('/api', (req, res, next) => authenticated(req) ? next() : res.status(401).json({ error: '로그인이 필요합니다.' }));
let initialization;
async function database() {
  if (!process.env.DATABASE_URL) { const error = new Error('configuration'); error.status = 503; throw error; }
  const sql = neon(process.env.DATABASE_URL);
  if (!initialization) initialization = sql`CREATE TABLE IF NOT EXISTS expenses (id SERIAL PRIMARY KEY, date DATE NOT NULL, item VARCHAR(100) NOT NULL, category VARCHAR(30) NOT NULL, amount INTEGER NOT NULL CHECK (amount > 0), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`.catch(error => { initialization = undefined; throw error; });
  await initialization;
  return sql;
}
export const categories = ['식비', '카페·간식', '교통', '쇼핑', '생활', '문화·여가', '건강', '기타'];
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= '1900-01-01' && value <= '9999-12-31';
}
export function validExpense(body) {
  return body && validDate(body.date) && typeof body.item === 'string' && body.item.trim().length > 0 && body.item.trim().length <= 100 && categories.includes(body.category) && Number.isInteger(body.amount) && body.amount > 0 && body.amount <= 2147483647;
}
app.get('/api/expenses', async (req, res) => {
  const month = req.query.month;
  const date = req.query.date;
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !validDate(`${month}-01`) || (date !== undefined && !validDate(date))) return res.status(400).json({ error: '날짜를 확인해 주세요.' });
  const sql = await database();
  const rows = await sql`SELECT id, to_char(date, 'YYYY-MM-DD') AS date, item, category, amount FROM expenses WHERE date >= ${month + '-01'}::date AND date < (${month + '-01'}::date + INTERVAL '1 month') ORDER BY date DESC, id DESC`;
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const totals = categories.map(category => ({ category, amount: rows.filter(row => row.category === category).reduce((sum, row) => sum + row.amount, 0) }));
  res.json({ expenses: date ? rows.filter(row => row.date === date) : rows, total, categories: totals, count: rows.length });
});
app.post('/api/expenses', async (req, res) => {
  if (!validExpense(req.body)) return res.status(400).json({ error: '날짜, 항목, 카테고리, 금액을 확인해 주세요.' });
  const { date, item, category, amount } = req.body;
  const sql = await database();
  const [row] = await sql`INSERT INTO expenses (date, item, category, amount) VALUES (${date}, ${item.trim()}, ${category}, ${amount}) RETURNING id`;
  res.status(201).json(row);
});
app.put('/api/expenses/:id', async (req, res) => {
  if (!/^\d{1,10}$/.test(req.params.id) || Number(req.params.id) > 2147483647 || !validExpense(req.body)) return res.status(400).json({ error: '입력 내용을 확인해 주세요.' });
  const { date, item, category, amount } = req.body;
  const sql = await database();
  const rows = await sql`UPDATE expenses SET date=${date}, item=${item.trim()}, category=${category}, amount=${amount} WHERE id=${req.params.id} RETURNING id`;
  res.status(rows.length ? 200 : 404).json(rows[0] || { error: '내역을 찾을 수 없습니다.' });
});
app.delete('/api/expenses/:id', async (req, res) => {
  if (!/^\d{1,10}$/.test(req.params.id) || Number(req.params.id) > 2147483647) return res.status(400).json({ error: '잘못된 내역입니다.' });
  const sql = await database();
  const rows = await sql`DELETE FROM expenses WHERE id=${req.params.id} RETURNING id`;
  res.status(rows.length ? 200 : 404).json(rows[0] || { error: '내역을 찾을 수 없습니다.' });
});
app.use('/api', (req, res) => res.status(404).json({ error: '요청을 찾을 수 없습니다.' }));
app.use(express.static(fileURLToPath(new URL('./public', import.meta.url))));
app.use((error, req, res, next) => {
  const status = error.status === 503 ? 503 : error.type === 'entity.parse.failed' ? 400 : 500;
  res.status(status).json({ error: status === 503 ? '서버에 DATABASE_URL을 설정해 주세요.' : status === 400 ? '잘못된 요청입니다.' : '처리하지 못했습니다. 데이터베이스 연결을 확인해 주세요.' });
});
export default app;
