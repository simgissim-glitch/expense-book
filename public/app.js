const $ = id => document.getElementById(id);
const categories = ['식비', '카페·간식', '교통', '쇼핑', '생활', '문화·여가', '건강', '기타'];
const won = value => Number(value).toLocaleString('ko-KR');
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
let editing = null, rows = [], deleting = null, requestVersion = 0;
let failedLoad = false;
categories.forEach(category => { const option = document.createElement('option'); option.textContent = category; $('category').append(option); });
$('date').value = today(); $('month').value = today().slice(0, 7);
function notice(message) { $('notice').textContent = message; $('notice').hidden = !message; }
async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'expense-book' }, credentials: 'same-origin' });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/login') showLogin();
    throw new Error(data.error || '요청을 처리하지 못했습니다.');
  }
  return data;
}
function showLogin() { $('login-view').hidden = false; $('app-view').hidden = true; $('password').value = ''; }
async function showApp() { $('login-view').hidden = true; $('app-view').hidden = false; await load(); }
$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true; $('login-error').textContent = '';
  try { await api('/login', { method: 'POST', body: JSON.stringify({ password: $('password').value }) }); $('password').value = ''; await showApp(); } catch (error) { $('login-error').textContent = error.message; } finally { button.disabled = false; }
});
$('logout').onclick = async () => { try { await api('/logout', { method: 'POST' }); showLogin(); resetForm(); } catch (error) { notice(error.message); } };
async function load() {
  const version = ++requestVersion;
  notice('');
  $('summary-month').textContent = `${Number($('month').value.slice(5))}월`;
  $('clear-date').hidden = !$('search-date').value;
  try {
    const query = new URLSearchParams({ month: $('month').value });
    if ($('search-date').value) query.set('date', $('search-date').value);
    const data = await api(`/expenses?${query}`);
    if (version !== requestVersion) return;
    failedLoad = false; rows = data.expenses;
    $('total').replaceChildren(document.createTextNode(won(data.total)), Object.assign(document.createElement('span'), { textContent: '원' }));
    $('count').replaceChildren(document.createTextNode(won(data.count)), Object.assign(document.createElement('span'), { textContent: '건' }));
    const sorted = [...data.categories].sort((a, b) => b.amount - a.amount);
    $('top-category').textContent = data.total ? sorted[0].category : '—';
    $('top-amount').textContent = data.total ? `${won(sorted[0].amount)}원 · 전체의 ${Math.round(sorted[0].amount / data.total * 100)}%` : '아직 기록이 없어요';
    $('chart').replaceChildren();
    for (const entry of sorted) {
      const row = document.createElement('div'); row.className = 'chart-row';
      const label = document.createElement('span'); label.textContent = entry.category;
      const track = document.createElement('div'); track.className = 'bar-track';
      const bar = document.createElement('div'); bar.className = 'bar';
      const percent = data.total ? entry.amount / data.total * 100 : 0;
      bar.style.width = `${percent}%`; track.append(bar);
      const amount = document.createElement('span'); amount.className = 'chart-amount'; amount.textContent = `${won(entry.amount)}원`;
      const share = document.createElement('span'); share.className = 'chart-percent'; share.textContent = `${Math.round(percent)}%`; amount.append(share);
      row.setAttribute('aria-label', `${entry.category} ${won(entry.amount)}원, ${Math.round(percent)}퍼센트`);
      row.append(label, track, amount); $('chart').append(row);
    }
    renderRows();
  } catch (error) { if (version === requestVersion) { failedLoad = true; rows = []; renderRows(); $('empty').querySelector('h3').textContent = '내역을 불러오지 못했어요'; $('empty').querySelector('p').textContent = '설정을 확인한 뒤 조회 월을 다시 선택해 주세요.'; notice(error.message); } }
}
function renderRows() {
  $('expenses').replaceChildren(); $('empty').hidden = rows.length > 0; $('list-count').textContent = rows.length;
  if (!failedLoad) { $('empty').querySelector('h3').textContent = '아직 지출 기록이 없어요'; $('empty').querySelector('p').textContent = '첫 지출을 기록하고 나의 소비를 알아가 보세요.'; }
  for (const expense of rows) {
    const tr = document.createElement('tr');
    const name = document.createElement('td'); const title = document.createElement('strong'); title.textContent = expense.item;
    const date = document.createElement('small'); date.textContent = expense.date.replaceAll('-', '. '); name.append(title, date);
    const category = document.createElement('td'); const tag = document.createElement('span'); tag.className = 'category-tag'; tag.textContent = expense.category; category.append(tag);
    const amount = document.createElement('td'); amount.className = 'align-right money'; amount.textContent = `${won(expense.amount)}원`;
    const actions = document.createElement('td'); actions.className = 'align-right';
    const edit = document.createElement('button'); edit.className = 'row-action'; edit.textContent = '수정'; edit.setAttribute('aria-label', `${expense.item} 수정`); edit.onclick = () => editExpense(expense);
    const remove = document.createElement('button'); remove.className = 'row-action delete'; remove.textContent = '삭제'; remove.setAttribute('aria-label', `${expense.item} 삭제`); remove.onclick = () => { deleting = expense.id; $('delete-dialog').showModal(); };
    actions.append(edit, remove); tr.append(name, category, amount, actions); $('expenses').append(tr);
  }
}
function resetForm() { editing = null; $('expense-form').reset(); $('date').value = today(); $('form-title').textContent = '지출 기록하기'; $('save-button').textContent = '＋ 지출 추가하기'; $('cancel-edit').hidden = true; }
function editExpense(expense) {
  editing = expense.id;
  ['date', 'item', 'category', 'amount'].forEach(key => { $(key).value = expense[key]; });
  $('form-title').textContent = '지출 수정하기'; $('save-button').textContent = '변경 내용 저장'; $('cancel-edit').hidden = false;
  $('expense-form').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('item').focus({ preventScroll: true });
}
$('cancel-edit').onclick = resetForm;
$('expense-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = $('save-button'); button.disabled = true;
  const body = { date: $('date').value, item: $('item').value.trim(), category: $('category').value, amount: Number($('amount').value) };
  try {
    await api(editing ? `/expenses/${editing}` : '/expenses', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(body) });
    $('month').value = body.date.slice(0, 7); $('search-date').value = ''; resetForm(); await load(); if (!failedLoad) notice('지출을 저장했습니다.');
  } catch (error) { notice(error.message); } finally { button.disabled = false; }
});
$('delete-cancel').onclick = () => $('delete-dialog').close();
$('delete-confirm').onclick = async () => {
  $('delete-confirm').disabled = true;
  try { await api(`/expenses/${deleting}`, { method: 'DELETE' }); $('delete-dialog').close(); if (editing === deleting) resetForm(); await load(); if (!failedLoad) notice('지출을 삭제했습니다.'); } catch (error) { $('delete-dialog').close(); notice(error.message); } finally { $('delete-confirm').disabled = false; }
};
$('month').onchange = () => { if (!$('month').value) $('month').value = today().slice(0, 7); $('search-date').value = ''; load(); };
function changeMonth(delta) { const [year, month] = $('month').value.split('-').map(Number); const date = new Date(Date.UTC(year, month - 1 + delta, 1)); if (date.getUTCFullYear() < 1900 || date.getUTCFullYear() > 9999) return; $('month').value = date.toISOString().slice(0, 7); $('search-date').value = ''; load(); }
$('prev-month').onclick = () => changeMonth(-1); $('next-month').onclick = () => changeMonth(1);
$('search-date').onchange = () => { if ($('search-date').value) $('month').value = $('search-date').value.slice(0, 7); load(); };
$('clear-date').onclick = () => { $('search-date').value = ''; load(); };
api('/session').then(session => { if (session.authenticated) showApp(); else if (!session.configured) $('login-error').textContent = '서버의 DATABASE_URL과 APP_PASSWORD 설정이 필요합니다.'; }).catch(error => { $('login-error').textContent = error.message; });
