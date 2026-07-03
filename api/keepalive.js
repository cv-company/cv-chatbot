// api/keepalive.js  ← 新規ファイル。1日1回Vercelが自動実行し、Supabaseに軽く触れて
// 無料プランの「7日間放置で一時停止」を防ぎます（読み取りだけ・何度実行しても安全）。

export default async function handler(req, res) {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\s+$/, '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  // 任意：CRON_SECRET を設定している場合のみ、Vercelのcronからの実行かを確認
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers['authorization'] || '';
    if (auth !== `Bearer ${secret}`) {
      // 外部から叩かれても害はないので、200で軽く返すだけ
      return res.status(200).json({ ok: true, skipped: 'no-secret-match' });
    }
  }

  const headers = { apikey: key };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;

  let ok = false, status = 0;
  try {
    const r = await fetch(`${url}/rest/v1/bots?select=bot_id&limit=1`, { headers });
    status = r.status;
    ok = r.ok;
    await r.text();
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e).slice(0, 200), at: new Date().toISOString() });
  }
  return res.status(200).json({ ok, status, at: new Date().toISOString() });
}
