// api/lead.js  ← 新規ファイル。お問い合わせフォームの送信が成功した時に呼ばれ、
// 「お問い合わせ獲得（リード）」を1件記録します（目標＝お問い合わせ数 の集計に使用）。

function sbReady() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { visitorId, note } = req.body || {};
  if (!sbReady()) return res.status(200).json({ ok: false });

  try {
    await fetch(`${process.env.SUPABASE_URL}/rest/v1/leads`, {
      method: 'POST',
      headers: { ...sbHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({ session_id: visitorId || null, note: note || null }),
    });
  } catch (e) { /* 失敗は無視 */ }

  return res.status(200).json({ ok: true });
}
