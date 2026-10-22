import {FOODS, DEFAULT_PLAN, koreaDate, validDate, orderPath, collectOrders, summarize, preparation, validatePlan, menuName, toCsv} from './production-core.mjs';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const fmt = n => new Intl.NumberFormat('ko-KR', {maximumFractionDigits: 2}).format(n);
const storageKey = 'cafeteria-production:v1';
let date = koreaDate(), meal = 'lunch', grade = 'all', epoch = 0, subscriptions = [];
let orders = null, menu = null, settings = null, issues = {}, connected = false, hasConnected = false, updated = null;
let summary = null, estimate = null, plan = structuredClone(DEFAULT_PLAN), preferences = {onsite: {}};
let db;

function loadPreferences() {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!raw || typeof raw !== 'object') return;
    const safe = validatePlan({...raw, onsite: 0});
    preferences = {...safe, onsite: raw.onsite && typeof raw.onsite === 'object' ? raw.onsite : {}};
  } catch { /* A damaged device preference must not prevent the live dashboard loading. */ }
}

function selectionKey() { return `${date}:${meal}:${grade}`; }
function restorePlan() {
  const input = {onsite: preferences.onsite?.[selectionKey()] ?? 0, buffer: preferences.buffer ?? DEFAULT_PLAN.buffer, grams: preferences.grams ?? DEFAULT_PLAN.grams};
  try { plan = validatePlan(input); }
  catch { plan = validatePlan({...input, onsite: 0}); }
  $('onsite').value = plan.onsite; $('buffer').value = plan.buffer;
  for (const [key,id] of [['밥','rice'],['국','soup'],['김치','side']]) $('grams-' + id).value = plan.grams[key];
}

function fresh() { return orders !== null && !issues.orders && connected && navigator.onLine; }
function setButtons() { $('csv').disabled = $('print').disabled = !fresh() || !summary || !estimate; }
function notify(lines, error = false) {
  $('notice').hidden = lines.length === 0;
  $('notice').classList.toggle('error', error);
  $('notice').textContent = lines.join('\n');
}

function dateLabel() {
  return new Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'}).format(new Date(date + 'T12:00:00+09:00'));
}
function scopeLabel() { return grade === 'all' ? '전체 학년' : grade === 'unknown' ? '학년 미상' : grade + '학년'; }
function currentMenu(food) { return menuName({...summary.foods[food.key], key: food.key}, menu, date, meal, koreaDate()); }

function updateGrades() {
  const allowed = settings?.schoolType === 'elementary' ? 6 : 3;
  const grades = new Set(Array.from({length: allowed}, (_,i) => String(i + 1)));
  for (const r of orders?.rows || []) grades.add(String(r.grade ?? 'unknown'));
  if (grade !== 'all') grades.add(grade);
  const list = [...grades].sort((a,b) => (Number(a) || 99) - (Number(b) || 99));
  $('grade').innerHTML = '<option value="all">전체 학년</option>' + list.map(g => `<option value="${g}">${g === 'unknown' ? '학년 미상' : g + '학년'}</option>`).join('');
  $('grade').value = grade;
}

function renderUnavailable(message) {
  summary = estimate = null;
  document.body.classList.add('unavailable');
  for (const id of ['students','pending','fulfilled','portions','total-kg','class-count']) $(id).textContent = '—';
  $('menu-cards').innerHTML = $('prep-cards').innerHTML = `<p class="empty">${esc(message)}</p>`;
  $('classes').innerHTML = `<tr><td colspan="7" class="empty">${esc(message)}</td></tr>`;
  $('exclusions').textContent = ''; setButtons();
}

function renderStatus() {
  const offline = !connected || !navigator.onLine;
  document.querySelector('.sync').classList.toggle('offline', offline || !!issues.orders);
  document.body.classList.toggle('stale', offline && orders !== null);
  $('connection').textContent = issues.orders ? '조회 실패' : offline ? (hasConnected ? '연결 끊김' : '연결 중') : orders ? '실시간 연결' : '불러오는 중';
  $('updated').textContent = updated ? new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false}).format(updated) + ' 반영' : '데이터를 불러오고 있습니다.';
  const messages = [];
  if (issues.orders) messages.push('선주문을 조회하지 못했습니다. 인터넷 연결과 관리자 읽기 권한을 확인한 뒤 다시 불러오세요. (' + issues.orders + ')');
  if (offline && orders !== null) messages.push('연결이 끊겼습니다. 마지막으로 받은 현황이며 새 주문이 반영되지 않을 수 있습니다. 연결 후 내보내기를 사용할 수 있습니다.');
  if (issues.menu) messages.push('현재 메뉴를 불러오지 못했습니다. 신청 당시 저장된 메뉴와 분류별 주문량으로 표시합니다.');
  if (issues.settings) messages.push('운영 설정을 불러오지 못했습니다. 선택한 급식의 선주문 기록은 계속 조회합니다.');
  if (meal === 'dinner' && settings?.dinnerEnabled === false) messages.push('현재 석식이 비활성화되어 있습니다. 이미 저장된 석식 신청 기록을 조회합니다.');
  if (orders?.excluded.invalid) messages.push('날짜·상태·수량 확인이 필요한 신청 ' + fmt(orders.excluded.invalid) + '건을 집계에서 제외했습니다.');
  if (summary && FOODS.some(f => summary.foods[f.key].names.length > 1)) messages.push('신청 당시 메뉴가 서로 다른 주문이 있습니다. 준비 전에 변경된 메뉴를 확인하세요. 횟수는 분류별 합계입니다.');
  notify(messages, !!issues.orders);
  $('context').textContent = `${dateLabel()} · ${meal === 'dinner' ? '석식' : '중식'} · ${scopeLabel()} · ${settings?.gradeScheduleEnabled ? '학년별 배식 시간 적용' : '공통 배식 시간'} · ${connected && navigator.onLine ? '주문 변경 시 자동 갱신' : '연결 확인 중'}`;
  setButtons();
}

function renderPlan() {
  if (!summary) return;
  estimate = preparation(summary, plan);
  $('formula').textContent = `(${scopeLabel()} 선주문 횟수 + 현장 ${fmt(plan.onsite)}명 × 메뉴별 1회) × 여유분 ${fmt(plan.buffer)}% 적용 · 메뉴별 올림`;
  $('prep-cards').innerHTML = estimate.map(f => `<article class="prep-card"><h3>${f.icon} ${f.label}</h3><strong>${fmt(f.target)}<span>회</span></strong><p class="kg">약 ${fmt(f.kg)} kg</p><div class="prep-breakdown"><div>선주문 <b>${fmt(f.ordered)}회</b></div><div>현장 예상 <b>${fmt(f.onsite)}회</b></div><div>여유분 <b>+${fmt(f.extra)}회</b></div><div>1회 중량 <b>${fmt(f.grams)}g</b></div></div></article>`).join('');
  $('total-kg').textContent = fmt(Number(estimate.reduce((sum,f) => sum + f.kg, 0).toFixed(6))) + ' kg';
  setButtons();
}

function render() {
  updateGrades();
  if (!orders || issues.orders) {
    renderUnavailable(issues.orders ? '선주문 조회 실패 · 다시 불러오기를 눌러 주세요.' : '선주문을 불러오는 중입니다.');
    renderStatus(); return;
  }
  document.body.classList.remove('unavailable');
  summary = summarize(orders.rows, grade);
  for (const [id,key,unit] of [['students','students','명'],['pending','pending','명'],['fulfilled','fulfilled','명'],['portions','portions','회']])
    $(id).innerHTML = fmt(summary[key]) + `<em>${unit}</em>`;
  $('menu-cards').innerHTML = FOODS.map(f => {
    const stat = summary.foods[f.key], name = currentMenu(f);
    return `<article class="menu-card"><div class="food-label"><span class="food-icon" aria-hidden="true">${f.icon}</span>${f.label}</div><h3 class="menu-name">${esc(name.name)}</h3><p class="menu-source">${name.source}</p><div class="order-amount">${fmt(stat.total)}<span>회</span></div><p class="food-students">${fmt(stat.students)}명 신청</p><div class="split-bar" aria-hidden="true"><span style="width:${stat.total ? stat.fulfilled / stat.total * 100 : 0}%"></span></div><div class="split-label"><span>대기 <b>${fmt(stat.pending)}회</b></span><span>완료 <b>${fmt(stat.fulfilled)}회</b></span></div>${name.mixed ? '<p class="mixed">메뉴 변경 내역 확인 필요</p>' : ''}</article>`;
  }).join('');
  $('class-count').textContent = fmt(summary.classes.length) + '개 반';
  $('classes').innerHTML = summary.classes.length ? summary.classes.map(c => `<tr><th scope="row">${c.grade == null ? '학년 미상' : c.grade + '학년'} / ${c.classNum == null ? '반 미상' : c.classNum + '반'}</th><td>${fmt(c.students)}명</td><td>${fmt(c.pending)}명</td><td>${fmt(c.fulfilled)}명</td>${FOODS.map(f => `<td>${fmt(c.foods[f.key])}회</td>`).join('')}</tr>`).join('') : '<tr><td colspan="7" class="empty">해당 조건에 등록된 선주문이 없습니다.</td></tr>';
  const e = orders.excluded;
  $('exclusions').textContent = `전체 기록 중 취소 ${fmt(e.cancelled)}건 · 0회 신청 ${fmt(e.empty)}건 · 확인 필요 ${fmt(e.invalid)}건 제외. 배식 완료분도 준비량 합계에 포함하며 실제 배식량은 별도 집계하지 않습니다.`;
  renderPlan(); renderStatus();
}

function clearSubscriptions() { for (const cancel of subscriptions) cancel(); subscriptions = []; }
function watch(path, key, receive, token) {
  const ref = db.ref(path);
  const success = snap => { if (epoch !== token) return; try { receive(snap.val()); delete issues[key]; } catch(e) { issues[key] = e.message; if (key === 'orders') orders = null; } render(); };
  const fail = e => { if (epoch !== token) return; issues[key] = e.code || e.message || '조회 오류'; if (key === 'orders') orders = null; render(); };
  ref.on('value', success, fail); subscriptions.push(() => ref.off('value', success));
}

function bind() {
  const token = ++epoch;
  clearSubscriptions(); orders = null; menu = null; settings = null; updated = null; issues = {};
  render();
  watch(orderPath(date, meal), 'orders', raw => { orders = collectOrders(raw, date, meal); updated = new Date(); }, token);
  watch(meal === 'dinner' ? 'menus/dinner' : 'menu', 'menu', raw => { menu = raw; }, token);
  watch('cafeteriaSettings/mealService', 'settings', raw => { settings = raw; }, token);
}

function changeSelection() {
  const candidate = $('date').value;
  if (!validDate(candidate)) { $('date').value = date; notify(['유효한 급식 날짜를 선택하세요.'], true); return; }
  date = candidate; meal = document.querySelector('[name=meal]:checked').value; grade = 'all';
  restorePlan(); bind();
}

$('date').value = date;
$('date').addEventListener('change', changeSelection);
document.querySelectorAll('[name=meal]').forEach(input => input.addEventListener('change', changeSelection));
$('grade').onchange = () => { grade = $('grade').value; restorePlan(); render(); };
$('reload').onclick = () => db ? bind() : location.reload();
$('plan-form').onsubmit = event => {
  event.preventDefault();
  try {
    plan = validatePlan({onsite: $('onsite').value, buffer: $('buffer').value,
      grams: {'밥': $('grams-rice').value, '국': $('grams-soup').value, '김치': $('grams-side').value}});
    renderPlan();
    preferences.buffer = plan.buffer; preferences.grams = plan.grams;
    preferences.onsite[selectionKey()] = plan.onsite;
    try { localStorage.setItem(storageKey, JSON.stringify(preferences)); $('plan-message').textContent = '준비량을 적용하고 이 기기에 기억했습니다.'; }
    catch { $('plan-message').textContent = '준비량을 적용했습니다. 이 브라우저에서는 설정 기억을 사용할 수 없습니다.'; }
  } catch(e) { $('plan-message').textContent = e.message; }
};
$('plan-form').addEventListener('input', () => { $('plan-message').textContent = '입력값이 변경되었습니다. 준비량 적용하기를 눌러 반영하세요.'; });
$('print').onclick = () => { if (fresh() && summary && estimate) window.print(); };
$('csv').onclick = () => {
  if (!fresh() || !summary || !estimate) return;
  const rows = [['급식 준비 현황', date, meal === 'dinner' ? '석식' : '중식', scopeLabel()],
    ['산출 기준', '배식 완료 포함 선주문 + 현장 인원 × 메뉴별 1회 + 여유분 / 조리 후 중량'],
    ['현장 예상 인원(명)', plan.onsite, '여유분(%)', plan.buffer],
    ['신청 학생(명)', summary.students, '배식 대기(명)', summary.pending, '배식 완료(명)', summary.fulfilled],
    ['분류','메뉴','선주문(회)','대기(회)','완료(회)','현장 예상(회)','여유분(회)','준비량(회)','1회 중량(g)','준비 중량(kg)'],
    ...estimate.map(f => [f.label,currentMenu(f).name,f.ordered,summary.foods[f.key].pending,summary.foods[f.key].fulfilled,f.onsite,f.extra,f.target,f.grams,Number(f.kg.toFixed(4))]),
    [], ['학년','반','신청 인원(명)','대기(명)','완료(명)','밥(회)','국(회)','반찬(회)'],
    ...summary.classes.map(c => [c.grade ?? '미상',c.classNum ?? '미상',c.students,c.pending,c.fulfilled,...FOODS.map(f => c.foods[f.key])]),
    [], ['제외 기록(전체 조회 범위)','취소',orders.excluded.cancelled,'0회 신청',orders.excluded.empty,'확인 필요',orders.excluded.invalid],
    ['조회 시각', updated?.toISOString()]];
  const url = URL.createObjectURL(new Blob([toCsv(rows)], {type: 'text/csv;charset=utf-8'}));
  const link = document.createElement('a'); link.href = url; link.download = `급식준비_${date}_${meal}_${grade}.csv`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

loadPreferences(); restorePlan();
try {
  if (!window.firebase?.database) throw Error('Firebase 연결 모듈을 불러오지 못했습니다.');
  firebase.initializeApp({apiKey: 'AIzaSyC3SvV8-bTyQClyZlGWybhR3z5YvLGXYL0', authDomain: 'smart-cafeteria-8a2ce.firebaseapp.com',
    databaseURL: 'https://smart-cafeteria-8a2ce-default-rtdb.firebaseio.com', projectId: 'smart-cafeteria-8a2ce'});
  db = firebase.database();
  const connectionRef = db.ref('.info/connected');
  connectionRef.on('value', snap => { connected = snap.val() === true; if (connected) hasConnected = true; renderStatus(); });
  window.addEventListener('online', renderStatus); window.addEventListener('offline', renderStatus);
  bind();
  window.addEventListener('pagehide', () => { ++epoch; clearSubscriptions(); connectionRef.off(); });
  // Returning with the back-forward cache must restore listeners after pagehide.
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
} catch(e) {
  issues.orders = e.message; renderUnavailable('연결 모듈을 확인한 뒤 다시 불러오세요.'); renderStatus();
}
