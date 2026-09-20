const RESEND_API_KEY = process.env.RESEND_API_KEY;
// 도메인 인증 전에는 Resend의 기본 테스트 발신 주소를 사용합니다.
const FROM = process.env.RESEND_FROM || 'Smart Cafeteria <onboarding@resend.dev>';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body)
});

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST 요청만 사용할 수 있습니다.' });
  if (!RESEND_API_KEY) return json(500, { error: 'Netlify 환경변수 RESEND_API_KEY가 설정되지 않았습니다.' });
  try {
    const { to, subject, html, text } = JSON.parse(event.body || '{}');
    if (typeof to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return json(400, { error: '올바른 수신자 이메일 주소를 입력해 주세요.' });
    }
    if (![subject, html, text].every(value => typeof value === 'string' && value.trim())) {
      return json(400, { error: '이메일 내용이 완성되지 않았습니다.' });
    }
    if (subject.length > 200 || html.length > 20000 || text.length > 10000) {
      return json(400, { error: '이메일 내용이 너무 깁니다.' });
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, html, text })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return json(response.status, { error: result.message || 'Resend가 이메일을 받지 못했습니다.' });
    return json(200, { id: result.id });
  } catch (error) {
    console.error('send-report-email failed', error);
    return json(500, { error: error instanceof Error ? error.message : '이메일 발송 처리 중 오류가 발생했습니다.' });
  }
}
