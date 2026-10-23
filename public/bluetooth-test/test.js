(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let port = null, reader = null, writer = null, readTask = null;
  let connected = false, opening = false, writing = false, closing = false;
  let decoder = new TextDecoder();
  function log(event, data = {}) {
    const stamp = new Date().toLocaleTimeString('ko-KR', { hour12: false }) + '.' + String(new Date().getMilliseconds()).padStart(3, '0');
    const line = document.createElement('div'); line.textContent = `[${stamp}] ${event} ${JSON.stringify(data)}`;
    $('logs').append(line); while ($('logs').children.length > 200) $('logs').firstElementChild.remove();
    $('logs').scrollTop = $('logs').scrollHeight;
    console.info('[BT테스트]', event, data);
  }
  const errorInfo = error => ({ name: error?.name || 'Error', message: error?.message || String(error) });
  function notice(text = '') { $('notice').textContent = text; }
  function render() {
    const busy = opening || writing || closing;
    $('connect').disabled = connected || busy || !navigator.serial;
    $('disconnect').disabled = !connected || busy;
    $('baud').disabled = connected || busy;
    for (let i = 1; i <= 3; i++) {
      $('send-' + i).disabled = !connected || busy;
      $('value-' + i).disabled = busy;
    }
    $('status').textContent = closing ? '연결 해제 중…' : opening ? '장치 선택 / 연결 중…' : connected ? '연결됨 · 버튼을 눌러 개별 전송' : '연결 안 됨';
  }
  function lost() {
    connected = false; log('DISCONNECTED'); notice('연결이 끊겼습니다. 자동으로 재전송하지 않습니다.'); render(); void cleanup();
  }
  const disconnectEvent = event => { if (event.target === port || event.port === port) lost(); };
  async function receive(activePort, activeReader) {
    try {
      while (connected && port === activePort) {
        const { value, done } = await activeReader.read();
        if (done) { if (connected) lost(); break; }
        if (value) {
          const text = decoder.decode(value, { stream: true });
          log('RX', { text, hex: Array.from(value.slice(0, 256), b => b.toString(16).padStart(2, '0')).join(' '), byteLength: value.length });
        }
      }
    } catch (error) { if (!closing) { log('RX_ERROR', errorInfo(error)); lost(); } }
    finally { activeReader.releaseLock(); if (reader === activeReader) reader = null; }
  }
  async function cleanup() {
    if (closing) return; closing = true; connected = false; render();
    navigator.serial?.removeEventListener('disconnect', disconnectEvent);
    try { await reader?.cancel(); } catch { /* Port may already be gone. */ }
    try { await readTask; } catch { /* Already reported. */ }
    try { writer?.releaseLock(); } catch { /* Write may have failed. */ }
    try { await port?.close(); } catch (error) { log('PORT_CLOSE_ERROR', errorInfo(error)); }
    port = reader = writer = readTask = null; closing = false; render(); log('PORT_CLOSED');
  }
  $('connect').addEventListener('click', async () => {
    if (connected || opening || closing || writing || !navigator.serial) return;
    opening = true; notice(); render();
    const baudRate = Number($('baud').value);
    try {
      log('PORT_CHOOSER_OPEN', { baudRate });
      port = await navigator.serial.requestPort();
      log('PORT_SELECTED', { info: port.getInfo?.() || {} });
      await port.open({ baudRate, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
      if (!port.readable || !port.writable) throw Error('선택한 포트에서 송수신할 수 없습니다.');
      writer = port.writable.getWriter(); reader = port.readable.getReader();
      decoder = new TextDecoder(); connected = true;
      navigator.serial.addEventListener('disconnect', disconnectEvent);
      readTask = receive(port, reader); log('CONNECTED', { baudRate });
    } catch (error) {
      log('CONNECT_ERROR', errorInfo(error)); await cleanup();
      notice(error.name === 'NotFoundError' ? '장치 선택을 취소했습니다.' : '연결 실패: ' + error.message);
    } finally { opening = false; render(); }
  });
  async function send(index) {
    if (!connected || !writer || writing || opening || closing) return;
    const input = $('value-' + index), raw = input.value;
    if (!/^[0-9]$/.test(raw)) { notice('숫자 문자 0~9 중 한 글자를 입력해 주세요.'); input.focus(); return; }
    const text = raw;
    const code = text.charCodeAt(0);
    const bytes = Uint8Array.of(code);
    const hex = '0x' + code.toString(16).toUpperCase().padStart(2, '0');
    writing = true; notice(); render();
    log('TX_REQUEST', { input: index, char: text, hex, bytes: Array.from(bytes), byteLength: bytes.length });
    try {
      await writer.write(bytes);
      log('TX_WRITE_OK', { input: index, char: text, hex, byteLength: bytes.length });
      $('result').textContent = `${index}번 문자 '${text}' (${hex}, 1바이트) 전송 쓰기 완료 · 아두이노 수신 확인 응답과는 별개입니다.`;
    } catch (error) { log('TX_ERROR', { input: index, ...errorInfo(error) }); lost(); }
    finally { writing = false; render(); }
  }
  for (let i = 1; i <= 3; i++) $('send-' + i).addEventListener('click', () => send(i));
  $('disconnect').addEventListener('click', async () => { if (!writing && !opening && !closing) { await cleanup(); notice(); } });
  $('clear').addEventListener('click', () => $('logs').replaceChildren());
  if (!navigator.serial) notice('PC용 Chrome 또는 Edge에서 이 페이지를 열어 주세요. 현재 브라우저는 포트 선택을 지원하지 않습니다.');
  render(); log('READY', { serialSupported: !!navigator.serial });
})();
