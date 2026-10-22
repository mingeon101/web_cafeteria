(function () {
  'use strict';
  const $bt = id => document.getElementById('bt-' + id);
  const settingsKey = 'cafeteria.serving.serial.settings.v1';
  const pendingKey = 'cafeteria.serving.serial.pending.v1';
  let port, reader, writer, readTask, closing = false, connected = false, connecting = false, saving = false, journal = null, completing = false;
  let dbQueue = Promise.resolve();
  const panel = document.createElement('section'); panel.className = 'bt-panel';
  panel.innerHTML = `<div class="bt-toolbar"><b>배식 장치</b><span id="bt-status" role="status" aria-live="polite">연결 안 됨</span><button type="button" id="bt-connect">블루투스 연결</button><button type="button" id="bt-disconnect" disabled>연결 해제</button></div>
  <p>PC에서 HC-05 / HC-06을 먼저 페어링한 뒤, 연결 버튼을 눌러 해당 장치 또는 블루투스 COM 포트를 선택하세요.</p>
  <details id="bt-settings"><summary>통신 설정</summary><div class="bt-fields"><label>통신 속도<select id="bt-baud"><option value="9600">9600 bps</option><option value="19200">19200 bps</option><option value="38400">38400 bps</option><option value="57600">57600 bps</option><option value="115200">115200 bps</option></select></label><label>전송 형식<select id="bt-format"><option value="numbers">숫자만 · 2 ↵ 1 ↵ 3 ↵</option><option value="labels">이름 포함 · 밥:2 ↵ 반찬:1 ↵ 국:3 ↵</option></select></label></div><p>아두이노·모듈과 통신 속도를 맞춰 주세요. 밥 → 반찬 → 국 순서로 각각 한 줄을 전송합니다.</p></details>
  <p id="bt-error" role="alert" hidden></p><button type="button" id="bt-reconcile" hidden>장치 확인 후 작업 종료</button><button type="button" id="bt-save-retry" hidden>완료 기록 저장 재시도</button>`;
  document.querySelector('#app .header').after(panel);
  const style = document.createElement('style'); style.textContent = `.bt-panel{background:#fff;border:1px solid #ddd9ed;border-radius:18px;padding:16px 20px;margin:0 0 20px;color:#252337}.bt-toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.bt-toolbar span{flex:1;font-size:14px}.bt-panel button{border:0;border-radius:10px;padding:10px 16px;background:#6c55d9;color:#fff;cursor:pointer}.bt-panel button:disabled{opacity:.45;cursor:default}.bt-panel details{margin-top:10px;font-size:13px}.bt-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.bt-fields label{display:grid;gap:5px}.bt-fields input,.bt-fields select{width:100%;box-sizing:border-box;border:1px solid #d7d2e5;border-radius:8px;padding:9px}.bt-panel p{font-size:13px;line-height:1.6;margin:10px 0 0}#bt-error{color:#b42318}#bt-reconcile,#bt-save-retry{margin-top:10px;background:#9a3e21}.bt-item{border:1px solid #ddd9ed;border-radius:14px;padding:18px;display:flex;justify-content:space-between;gap:10px}.bt-item span{color:#6c55d9}.bt-item+ .bt-item{margin-top:10px}@media(max-width:600px){.bt-fields{grid-template-columns:1fr}.bt-toolbar span{flex-basis:60%}}`;
  document.head.append(style);
  try { const config = JSON.parse(localStorage.getItem(settingsKey) || 'null'); if (config) { if (['9600', '19200', '38400', '57600', '115200'].includes(String(config.baud))) $bt('baud').value = String(config.baud); if (['numbers', 'labels'].includes(config.format)) $bt('format').value = config.format; } }
  catch { /* Invalid local preferences are ignored. */ }
  try { journal = JSON.parse(localStorage.getItem(pendingKey) || 'null'); }
  catch { journal = { invalid: true }; }
  function locked() { return saving || completing || !!journal || session.active(); }
  function report(message = '') { $bt('error').hidden = !message; $bt('error').textContent = message; }
  function controls() {
    const busy = locked();
    $bt('connect').disabled = connecting || closing || connected || busy;
    $bt('disconnect').disabled = !connected || busy;
    for (const id of ['baud', 'format']) $bt(id).disabled = connected || connecting || closing || busy;
    $bt('reconcile').hidden = !(session.state === 'error' || (journal && !journal.completed && session.state === 'idle'));
  }
  function persist(record) { localStorage.setItem(pendingKey, JSON.stringify(record)); journal = record; }
  function path(snapshot) { return `students/${snapshot.uid}/serve/${snapshot.key}/hardware`; }
  function hardware(state, detail, snapshot) {
    if (!snapshot?.key) return;
    dbQueue = dbQueue.catch(() => {}).then(() => db.ref(path(snapshot)).set({ status: state, detail: detail || '', updatedAt: firebase.database.ServerValue.TIMESTAMP }));
    dbQueue.catch(() => report('장치 상태 기록을 저장하지 못했습니다. 연결을 확인하세요.'));
  }
  function render(state, detail, snapshot) {
    const titles = { sending: '배식량 전송 중', waiting: '배식 시작을 기다리고 있어요', serving: '배식 진행 중', complete: '배식이 완료되었습니다!', error: '장치 확인이 필요합니다' };
    $bt('status').textContent = titles[state] || (connected ? '연결됨' : '연결 안 됨');
    const page = document.getElementById('page-progress');
    page.querySelector('h1').textContent = titles[state] || '';
    page.querySelector('.desc').textContent = state === 'error' ? '자동 재전송하지 않습니다. 장치 상태를 먼저 확인해 주세요.' : state === 'sending' ? (detail || '밥 → 반찬 → 국 순서로 전송합니다.') : state === 'waiting' ? '장치의 ‘배식 시작’ 응답을 기다립니다.' : state === 'serving' ? '장치에서 배식하고 있습니다. 완료 응답을 기다립니다.' : '완료 기록을 저장하고 있습니다.';
    const list = document.getElementById('progress-list'); list.replaceChildren();
    for (const [index, label] of [[0, '밥'], [2, '반찬'], [1, '국']]) {
      const row = document.createElement('div'); row.className = 'bt-item';
      const name = document.createElement('b'); name.textContent = `${label} · ${snapshot?.counts?.[index] ?? 0}회`;
      const status = document.createElement('span'); status.textContent = { sending: '전송 중', waiting: '응답 대기', serving: '배식 중', complete: '완료', error: '확인 필요' }[state];
      row.append(name, status); list.append(row);
    }
    if (state === 'error') report(detail || '연결 상태를 확인해 주세요.');
    controls();
  }
  async function complete(snapshot) {
    if (completing) return; completing = true; controls();
    try {
      persist({ snapshot, completed: true });
      await dbQueue.catch(() => {});
      const updates = {}; const stamp = firebase.database.ServerValue.TIMESTAMP;
      updates[path(snapshot)] = { status: 'complete', completedAt: stamp, updatedAt: stamp };
      if (snapshot.preordered) for (const prefix of [`preorders/${snapshot.date}/${snapshot.uid}`, `students/${snapshot.uid}/preorders/${snapshot.date}`]) {
        updates[prefix + '/status'] = 'fulfilled'; updates[prefix + '/fulfilledAt'] = stamp;
      }
      await db.ref().update(updates);
      // A per-order queue marker makes a failed/retried save idempotent.
      await db.ref('stats').transaction(stats => {
        stats = stats || {}; stats.bluetoothCompleted = stats.bluetoothCompleted || {};
        const marker = snapshot.uid + '_' + snapshot.key;
        if (!stats.bluetoothCompleted[marker]) { stats.queueCount = Math.max(0, Number(stats.queueCount || 0) - 1); stats.bluetoothCompleted[marker] = true; }
        return stats;
      });
      localStorage.removeItem(pendingKey); journal = null;
      if (snapshot.preordered && user?.uid === snapshot.uid && todayPreorder) todayPreorder.status = 'fulfilled';
      $bt('save-retry').hidden = true; report();
      goPage('complete');
    } catch (error) { report('배식은 완료됐지만 기록 저장에 실패했습니다. 저장만 다시 시도해 주세요.'); $bt('save-retry').hidden = false; }
    finally { completing = false; controls(); }
  }
  const session = new CafeteriaBluetoothSession({
    write: async bytes => {
      if (!systemOperating) throw Error('급식 시스템 운영이 중지되어 전송을 멈췄습니다. 장치 상태를 확인해 주세요.');
      if (!connected || !writer) throw Error('블루투스 연결이 끊겼습니다.');
      await writer.write(bytes);
    },
    change(state, detail, snapshot) {
      render(state, detail, snapshot);
      hardware(state, detail, snapshot);
      if (state === 'complete') void complete(snapshot);
    }
  });
  function disconnected() { connected = false; session.fail('블루투스 연결이 끊겼습니다. 전송 여부를 장치에서 확인해 주세요.'); if (!locked()) $bt('status').textContent = '연결 안 됨'; controls(); void cleanup(); }
  const onPortDisconnect = event => { if (event.target === port || event.port === port) disconnected(); };
  async function readResponses(activePort, activeReader) {
    try {
      while (connected && port === activePort) {
        const { value, done } = await activeReader.read();
        if (done) { if (connected) disconnected(); break; }
        if (value) session.receive(value);
      }
    } catch (error) { if (!closing) disconnected(); }
    finally { activeReader.releaseLock(); if (reader === activeReader) reader = null; }
  }
  async function cleanup() {
    if (closing) return; closing = true; connected = false; controls();
    navigator.serial?.removeEventListener('disconnect', onPortDisconnect);
    try { if (reader) await reader.cancel(); } catch { /* Disconnected readers may already be closed. */ }
    try { await readTask; } catch { /* Read failure is shown separately. */ }
    try { if (writer) writer.releaseLock(); } catch { /* A failed write may have released its stream. */ }
    try { await port?.close(); } catch { /* A disconnected port may already be closed. */ }
    port = reader = writer = readTask = null; closing = false; controls();
  }
  $bt('connect').addEventListener('click', async () => {
    if (locked() || connecting || closing || connected) return;
    const config = { baud: Number($bt('baud').value), format: $bt('format').value };
    if (!navigator.serial) { report('PC용 Chrome 또는 Edge에서 열어 주세요. 이 브라우저에서는 블루투스 시리얼 포트를 선택할 수 없습니다.'); return; }
    connecting = true; controls(); report();
    try {
      port = await navigator.serial.requestPort();
      await port.open({ baudRate: config.baud, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
      if (!port.readable || !port.writable) throw Error('선택한 포트에서 송수신할 수 없습니다.');
      writer = port.writable.getWriter(); reader = port.readable.getReader();
      localStorage.setItem(settingsKey, JSON.stringify(config)); connected = true;
      navigator.serial.addEventListener('disconnect', onPortDisconnect);
      readTask = readResponses(port, reader);
      $bt('settings').open = false; $bt('status').textContent = '블루투스 시리얼 · 연결됨';
    } catch (error) { await cleanup(); report(error.name === 'NotFoundError' ? '장치 선택을 취소했습니다. 다시 연결할 수 있습니다.' : '연결 실패: ' + error.message); }
    finally { connecting = false; controls(); }
  });
  $bt('disconnect').addEventListener('click', async () => { if (!locked()) { await cleanup(); $bt('status').textContent = '연결 안 됨'; controls(); } });
  $bt('save-retry').addEventListener('click', () => { if (session.state === 'complete') void complete(session.snapshot); else if (journal?.completed) void complete(journal.snapshot); });
  $bt('reconcile').addEventListener('click', async () => {
    if (!confirm('장치의 배식을 멈추고 실제 배식 여부를 확인했나요? 이 작업은 배식 완료 처리나 재전송을 하지 않습니다. 선주문은 관리자 확인이 필요합니다.')) return;
    const snapshot = session.snapshot || journal?.snapshot;
    if (snapshot?.key) { try { await dbQueue.catch(() => {}); await db.ref(path(snapshot)).set({ status: 'manual_review', updatedAt: firebase.database.ServerValue.TIMESTAMP }); } catch { report('작업 상태를 저장하지 못했습니다. 다시 시도해 주세요.'); return; } }
    try { localStorage.removeItem(pendingKey); } catch { report('이 기기의 작업 상태를 해제할 수 없습니다.'); return; }
    journal = null; session.state = 'idle'; session.snapshot = null; report(); await cleanup(); controls(); resetAll();
  });
  async function submit() {
    if (locked()) throw Error('진행 중인 배식을 먼저 확인해 주세요.');
    if (!connected || !writer) throw Error('화면 위의 ‘블루투스 연결’로 배식 장치를 먼저 연결해 주세요.');
    if (!systemOperating) throw Error('급식 시스템 운영이 중지되었습니다.');
    if (todayPreorder?.status === 'processing') throw Error('이미 전송 중이거나 확인이 필요한 선주문입니다. 관리자에게 확인해 주세요.');
    saving = true; controls();
    let record;
    try {
      // Persist before the Firebase save so a page reload cannot silently start a second batch.
      persist({ saving: true });
      await saveServeData();
      const snapshot = { uid: user.uid, key: currentServeKey, date: todayDateKey(), preordered: todayPreorder?.status === 'processing', counts: [...counts] };
      record = { snapshot }; persist(record);
      stopServeDetector(); stopProgressTimer(); cancelProgressEdit();
      document.getElementById('btn-progress-edit').hidden = true;
      document.getElementById('progress-edit-panel').classList.remove('show'); goPage('progress');
      await session.send(snapshot.counts, snapshot, $bt('format').value === 'labels');
    } catch (error) {
      if (!record) { report('저장 상태를 확인해야 합니다. 장치로 배식량은 전송하지 않았습니다.'); controls(); }
      throw error;
    } finally { saving = false; controls(); }
  }
  window.BluetoothServing = { submit, locked, receive: bytes => session.receive(bytes) };
  if (journal) {
    $bt('status').textContent = '이전 작업 확인 필요';
    report('이전 작업이 남아 있습니다. 중복 전송을 막았습니다. 장치 상태를 확인한 뒤 작업을 종료해 주세요.');
    if (journal.completed && journal.snapshot) {
      $bt('save-retry').hidden = false;
      report('장치의 완료 응답을 받은 작업입니다. 완료 기록 저장을 재시도해 주세요. 재전송하지 않습니다.');
    }
  }
  controls();
})();
