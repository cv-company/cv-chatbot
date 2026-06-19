// api/admin.js  ← 新規ファイル。管理画面（admin.html）から呼ばれる、パスワード保護されたAPI。
// すべて POST で受け取り、body の { password, action, ... } で動作します。

function sbReady() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
function sbBase() {
  let u = (process.env.SUPABASE_URL || '').trim();
  u = u.replace(/\s+$/, '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  return u;
}
function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const h = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`;
  return h;
}
async function sbGet(path) {
  const r = await fetch(`${sbBase()}/rest/v1/${path}`, { headers: sbHeaders() });
  if (!r.ok) throw new Error('sb get ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
}
// 件数だけ取得（content-range ヘッダから読む）
async function sbCount(pathWithFilter) {
  const sep = pathWithFilter.includes('?') ? '&' : '?';
  const r = await fetch(`${sbBase()}/rest/v1/${pathWithFilter}${sep}select=*&limit=1`, {
    headers: { ...sbHeaders(), Prefer: 'count=exact', Range: '0-0' },
  });
  const cr = r.headers.get('content-range') || '';
  const total = cr.split('/')[1];
  return !total || total === '*' ? 0 : parseInt(total, 10);
}
async function sbReq(method, path, body) {
  const r = await fetch(`${sbBase()}/rest/v1/${path}`, {
    method,
    headers: { ...sbHeaders(), Prefer: 'return=minimal' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error('sb ' + method + ' ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return true;
}

// 日本時間の日付パーツ
function jst() {
  const j = new Date(Date.now() + 9 * 3600 * 1000);
  const y = j.getUTCFullYear();
  const m = String(j.getUTCMonth() + 1).padStart(2, '0');
  const d = String(j.getUTCDate()).padStart(2, '0');
  return { y, m, d };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { password, action } = req.body || {};
  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!sbReady()) return res.status(500).json({ error: 'supabase not configured' });

  try {
    // ---- ダッシュボードの数値 ----
    if (action === 'stats') {
      const { y, m, d } = jst();
      const todayStart = encodeURIComponent(`${y}-${m}-${d}T00:00:00+09:00`);
      const monthStart = encodeURIComponent(`${y}-${m}-01T00:00:00+09:00`);
      const realtimeFrom = encodeURIComponent(new Date(Date.now() - 5 * 60 * 1000).toISOString());

      const [realtime, today, month, leadsMonth, goalRows] = await Promise.all([
        sbCount(`sessions?last_seen=gte.${realtimeFrom}`),
        sbCount(`sessions?last_seen=gte.${todayStart}`),
        sbCount(`sessions?last_seen=gte.${monthStart}`),
        sbCount(`leads?created_at=gte.${monthStart}`),
        sbGet('goals?id=eq.1&select=target'),
      ]);
      const goalTarget = (goalRows[0] && goalRows[0].target) || 0;
      return res.status(200).json({ realtime, today, month, leadsMonth, goalTarget });
    }

    // ---- セッション一覧（会話ログのリスト） ----
    if (action === 'sessions') {
      const offset = Math.max(0, parseInt(req.body.offset || 0, 10));
      const limit = 30;
      const rows = await sbGet(
        `sessions?select=session_id,first_seen,last_seen,ip,blocked&order=last_seen.desc&limit=${limit}&offset=${offset}`
      );
      // 表示中セッションのメッセージ件数をまとめて取得
      const ids = rows.map((r) => r.session_id);
      let counts = {};
      if (ids.length) {
        const inList = encodeURIComponent('(' + ids.map((x) => `"${x}"`).join(',') + ')');
        const msgs = await sbGet(`messages?session_id=in.${inList}&select=session_id`);
        for (const mrow of msgs) counts[mrow.session_id] = (counts[mrow.session_id] || 0) + 1;
      }
      const out = rows.map((r) => ({ ...r, msgCount: counts[r.session_id] || 0 }));
      return res.status(200).json({ sessions: out, offset, limit });
    }

    // ---- 1セッションの会話全文 ----
    if (action === 'thread') {
      const sid = (req.body.sessionId || '').toString();
      if (!sid) return res.status(400).json({ error: 'sessionId required' });
      const msgs = await sbGet(
        `messages?session_id=eq.${encodeURIComponent(sid)}&select=role,content,created_at&order=created_at.asc&limit=500`
      );
      return res.status(200).json({ messages: msgs });
    }

    // ---- ブロック ----
    if (action === 'block') {
      const sid = (req.body.sessionId || '').toString();
      const ip = (req.body.ip || '').toString();
      if (sid) await sbReq('PATCH', `sessions?session_id=eq.${encodeURIComponent(sid)}`, { blocked: true });
      if (ip) {
        await fetch(`${sbBase()}/rest/v1/blocked_ips?on_conflict=ip`, {
          method: 'POST',
          headers: { ...sbHeaders(), Prefer: 'return=minimal,resolution=merge-duplicates' },
          body: JSON.stringify({ ip, reason: '管理画面から手動ブロック' }),
        });
      }
      return res.status(200).json({ ok: true });
    }

    // ---- ブロック解除 ----
    if (action === 'unblock') {
      const sid = (req.body.sessionId || '').toString();
      const ip = (req.body.ip || '').toString();
      if (sid) await sbReq('PATCH', `sessions?session_id=eq.${encodeURIComponent(sid)}`, { blocked: false });
      if (ip) await sbReq('DELETE', `blocked_ips?ip=eq.${encodeURIComponent(ip)}`);
      return res.status(200).json({ ok: true });
    }

    // ---- ブロック中の一覧 ----
    if (action === 'blocklist') {
      const [sessions, ips] = await Promise.all([
        sbGet('sessions?blocked=eq.true&select=session_id,ip,last_seen&order=last_seen.desc&limit=200'),
        sbGet('blocked_ips?select=ip,reason,created_at&order=created_at.desc&limit=200'),
      ]);
      return res.status(200).json({ sessions, ips });
    }

    // ---- 目標の更新 ----
    if (action === 'setGoal') {
      const target = Math.max(0, parseInt(req.body.target || 0, 10));
      await sbReq('PATCH', 'goals?id=eq.1', { target, updated_at: new Date().toISOString() });
      return res.status(200).json({ ok: true, target });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    return res.status(500).json({ error: String(e).slice(0, 300) });
  }
}
