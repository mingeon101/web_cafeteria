/* Three ordered serial writes, followed by device-confirmed serving states. */
(function (root) {
  'use strict';
  const signals = new Map([
    ['배식 시작', 'start'], ['물체 감지됨: 자동 시퀀스 시작', 'start'],
    ['배식 완료', 'complete'], ['자동 시퀀스 종료. 대기 중...', 'complete']
  ]);
  class Session {
    constructor({ write, change = () => {} }) {
      this.write = write; this.change = change; this.state = 'idle'; this.buffer = '';
      this.decoder = new TextDecoder(); this.pending = []; this.snapshot = null;
    }
    active() { return ['sending', 'waiting', 'serving', 'error'].includes(this.state); }
    transition(state, detail = '') { this.state = state; this.change(state, detail, this.snapshot); }
    async send(counts, context, labeled = false) {
      if (this.active()) throw Error('진행 중인 배식이 있습니다.');
      if (!Array.isArray(counts) || counts.length !== 3 || counts.some(n => !Number.isInteger(n) || n < 0 || n > 20)) throw Error('배식 횟수를 확인해 주세요.');
      this.snapshot = Object.freeze({ ...context, counts: Object.freeze([...counts]) });
      counts = this.snapshot.counts;
      this.buffer = ''; this.decoder = new TextDecoder(); this.pending = [];
      this.transition('sending');
      try {
        for (const [index, label] of [[0, '밥'], [2, '반찬'], [1, '국']]) {
          if (this.state !== 'sending') throw Error('연결이 끊겨 전송을 중단했습니다.');
          await this.write(new TextEncoder().encode((labeled ? label + ':' : '') + counts[index] + '\n'));
          if (this.state !== 'sending') throw Error('전송 상태를 확인할 수 없습니다.');
          this.change('sending', label + ' ' + counts[index] + '회 전송됨', this.snapshot);
        }
        this.transition('waiting');
        for (const message of this.pending.splice(0)) this.message(message);
      } catch (error) { this.fail(error.message || '전송 실패'); throw error; }
    }
    receive(bytes) {
      if (!['sending', 'waiting', 'serving'].includes(this.state)) return;
      this.buffer += typeof bytes === 'string' ? bytes : this.decoder.decode(bytes, { stream: true });
      const lines = this.buffer.split(/\r\n|\n|\r/); this.buffer = lines.pop();
      for (const line of lines) this.message(line.trim());
      if (signals.has(this.buffer.trim())) {
        const message = this.buffer.trim(); this.buffer = ''; this.message(message);
      }
      if (this.buffer.length > 1024) this.buffer = '';
    }
    message(message) {
      const signal = signals.get(message);
      if (!signal) return;
      if (this.state === 'sending') { this.pending.push(message); return; }
      if (signal === 'start' && this.state === 'waiting') this.transition('serving');
      else if (signal === 'complete' && this.state === 'serving') this.transition('complete');
    }
    fail(reason) {
      if (['sending', 'waiting', 'serving'].includes(this.state)) {
        this.pending = []; this.transition('error', reason);
      }
    }
  }
  root.CafeteriaBluetoothSession = Session;
})(globalThis);
