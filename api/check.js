// api/check.js  ← 診断用の一時ファイル。ブラウザでこのURLを開くだけで、
// Supabaseの設定（URL/キーの種類/書き込み）を点検し、結果をその場に表示します。
// （原因が分かったら、このファイルは削除して構いません）

function sbHeaders(key) {
  const h = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`; // 旧式JWTのときのみ
  return h;
}

export default async function handler(req, res) {
  const out = { steps: [] };
  const rawUrl = process.env.SUPABASE_URL || '';
  const url = rawUrl.trim().replace(/\s+$/, '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  out.urlHadTrailingSlashOrSpace = (rawUrl !== url);

  out.hasSupabaseUrl = !!url;
  out.hasServiceRoleKey = !!key;
  out.urlStartsWithHttps = url.startsWith('https://');
  out.urlLooksValid = !!(url.startsWith('https://') && url.includes('.supabase.co'));

  // キーの種類を判定（値そのものは表示しない）
  if (key.startsWith('sb_secret_')) out.keyType = 'secret（正しい：サーバー用）';
  else if (key.startsWith('sb_publishable_')) out.keyType = 'publishable（NG：これは公開用キーです。secretキーに変えてください）';
  else if (key.startsWith('eyJ')) out.keyType = 'legacy service_role（JWT・使用可）';
  else if (key.startsWith('https://')) out.keyType = 'URLが入っています（NG：キーを入れてください）';
  else out.keyType = '不明';

  if (!out.urlLooksValid) {
    out.result = 'NG: SUPABASE_URL が正しくありません。https://〇〇.supabase.co の形にしてください（sb_... ではありません）';
    return res.status(200).json(out);
  }
  if (!key || out.keyType.includes('NG') || out.keyType === '不明') {
    out.result = 'NG: SUPABASE_SERVICE_ROLE_KEY が正しくありません（secretキー = sb_secret_... を入れてください）';
    return res.status(200).json(out);
  }

  const headers = sbHeaders(key);
  const testId = 'diag_' + Date.now();

  // 1) 書き込みテスト
  try {
    const r = await fetch(`${url}/rest/v1/sessions`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ session_id: testId }),
    });
    const text = await r.text();
    out.steps.push({ step: 'insert', status: r.status, body: text.slice(0, 400) });
  } catch (e) {
    out.steps.push({ step: 'insert', error: String(e) });
  }

  // 2) 読み込みテスト
  try {
    const r = await fetch(`${url}/rest/v1/sessions?session_id=eq.${testId}&select=session_id`, { headers });
    const text = await r.text();
    out.steps.push({ step: 'select', status: r.status, body: text.slice(0, 400) });
  } catch (e) {
    out.steps.push({ step: 'select', error: String(e) });
  }

  // 3) 後始末（テスト行を削除）
  try {
    await fetch(`${url}/rest/v1/sessions?session_id=eq.${testId}`, { method: 'DELETE', headers });
  } catch (e) {}

  const insert = out.steps.find((s) => s.step === 'insert');
  out.result =
    insert && insert.status >= 200 && insert.status < 300
      ? 'OK: Supabaseへの書き込みに成功しました（記録は動く状態です）'
      : 'NG: 書き込みに失敗しました。上の status と body を確認してください';

  return res.status(200).json(out);
}
