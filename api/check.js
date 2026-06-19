// api/check.js  ← 診断用の一時ファイル。ブラウザでこのURLを開くだけで、
// Supabaseへの接続・書き込みを点検し、結果をその場に表示します。
// （原因が分かったら、このファイルは削除して構いません）

export default async function handler(req, res) {
  const out = { steps: [] };
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  out.hasSupabaseUrl = !!url;
  out.hasServiceRoleKey = !!key;
  out.urlLooksValid = !!(url && url.startsWith('https://') && url.includes('.supabase.co'));

  if (!url || !key) {
    out.result = 'NG: 環境変数が見つかりません（Vercelの SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY を確認してください）';
    return res.status(200).json(out);
  }

  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
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
