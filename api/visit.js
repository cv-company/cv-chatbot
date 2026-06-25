// api/visit.js  ← 新規ファイル。チャット画面が開かれた時に「来訪サイン」を受け取り、
// 訪問者を記録します（リアルタイム/日/月の訪問者数の集計に使用）。

function sbReady() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// このボットを識別するID
const BOT_ID = 'cv';
function sbBase() {
  let u = (process.env.SUPABASE_URL || '').trim();
  u = u.replace(/\s+$/, '');
  u = u.replace(/\/+$/, '');
  u = u.replace(/\/rest\/v1$/, '');
  return u;
}
function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const h = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`;
  return h;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { visitorId } = req.body || {};
  if (!visitorId) return res.status(200).json({ ok: false });
  if (!sbReady()) return res.status(200).json({ ok: false });

  const fwd = (req.headers['x-forwarded-for'] || '').toString();
  const ip = fwd.split(',')[0].trim() || 'unknown';
  const ua = (req.headers['user-agent'] || '').toString().slice(0, 300);

  try {
    await fetch(`${sbBase()}/rest/v1/sessions?on_conflict=session_id`, {
      method: 'POST',
      headers: { ...sbHeaders(), Prefer: 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify({
        session_id: visitorId,
        bot_id: BOT_ID,
        last_seen: new Date().toISOString(),
        ip: ip,
        user_agent: ua,
      }),
    });
  } catch (e) { /* 失敗は無視 */ }

  return res.status(200).json({ ok: true });
}
