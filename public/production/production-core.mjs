export const FOODS = Object.freeze([
  {key: '밥', label: '밥', icon: '🍚', grams: 225},
  {key: '국', label: '국', icon: '🍲', grams: 225},
  {key: '김치', label: '반찬', icon: '🥬', grams: 110}
]);

export function koreaDate(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Seoul'}).format(now);
}

export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === value;
}

export function orderPath(date, meal) {
  if (!validDate(date) || !['lunch', 'dinner'].includes(meal)) throw Error('날짜와 급식 구분을 확인하세요.');
  return `preorders/${date}${meal === 'dinner' ? '__dinner' : ''}`;
}

function integer(value, min, max) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^\d+$/.test(value.trim())) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}

export function collectOrders(raw, date, meal) {
  orderPath(date, meal);
  const rows = [], excluded = {cancelled: 0, empty: 0, invalid: 0};
  if (raw == null) return {rows, excluded};
  if (typeof raw !== 'object' || Array.isArray(raw)) throw Error('선주문 데이터 형식을 확인하세요.');
  for (const value of Object.values(raw)) {
    if (!value || typeof value !== 'object') { excluded.invalid++; continue; }
    if (['cancelled', 'canceled'].includes(value.status)) { excluded.cancelled++; continue; }
    const status = value.status == null ? 'pending' : value.status;
    if (!['pending', 'fulfilled'].includes(status) || (value.date != null && value.date !== date) ||
        (value.mealType != null && value.mealType !== meal) ||
        !value.foods || typeof value.foods !== 'object' || Array.isArray(value.foods)) {
      excluded.invalid++; continue;
    }
    const foods = Object.fromEntries(FOODS.map(({key}) => [key, integer(value.foods[key] ?? 0, 0, 10000)]));
    if (Object.values(foods).some(n => n === null)) { excluded.invalid++; continue; }
    if (Object.values(foods).every(n => n === 0)) { excluded.empty++; continue; }
    const names = Object.fromEntries(FOODS.map(({key}) => [key,
      typeof value.menuSnapshot?.[key] === 'string' ? value.menuSnapshot[key].trim().slice(0, 160) : '']));
    rows.push({grade: integer(value.grade, 1, 6), classNum: integer(value.classNum ?? value.classNo, 1, 99), status, foods, names});
  }
  // Never keep student names, IDs, PINs or face data in the aggregate model.
  return {rows, excluded};
}

export function summarize(rows, grade = 'all') {
  const filtered = grade === 'all' ? rows : rows.filter(r => String(r.grade ?? 'unknown') === String(grade));
  const result = {students: filtered.length, pending: 0, fulfilled: 0, portions: 0,
    foods: Object.fromEntries(FOODS.map(f => [f.key, {total: 0, pending: 0, fulfilled: 0, students: 0, names: []}])), classes: []};
  const classes = new Map();
  for (const r of filtered) {
    result[r.status]++;
    const id = `${r.grade ?? 'unknown'}-${r.classNum ?? 'unknown'}`;
    if (!classes.has(id)) classes.set(id, {grade: r.grade, classNum: r.classNum, students: 0, pending: 0, fulfilled: 0,
      foods: Object.fromEntries(FOODS.map(f => [f.key, 0]))});
    const c = classes.get(id); c.students++; c[r.status]++;
    for (const {key} of FOODS) {
      const n = r.foods[key], f = result.foods[key];
      f.total += n; f[r.status] += n; c.foods[key] += n; result.portions += n;
      if (n > 0) {
        f.students++;
        if (r.names[key] && !f.names.includes(r.names[key])) f.names.push(r.names[key]);
      }
    }
  }
  result.classes = [...classes.values()].sort((a,b) => (a.grade ?? 99) - (b.grade ?? 99) || (a.classNum ?? 999) - (b.classNum ?? 999));
  return result;
}

export function menuName(food, current, date, meal, today) {
  if (food.names.length) return {name: food.names.join(' / '), source: '신청 당시 메뉴', mixed: food.names.length > 1};
  const key = Object.keys(current || {}).find(k => k === food.key);
  const sameDate = current?.date === date || (!current?.date && date === today && meal === 'lunch');
  return key && typeof current[key] === 'string' && current[key].trim() && sameDate
    ? {name: current[key].trim(), source: '등록 메뉴', mixed: false}
    : {name: '메뉴명 미등록', source: '분류별 주문량 집계', mixed: false};
}

export function toCsv(rows) {
  const cell = value => {
    let s = String(value ?? '');
    if (/^[\s\u0000-\u001f]*[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return '\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n');
}
