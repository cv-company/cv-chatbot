// api/admin.js  ← 管理画面API（複数ボット対応版・パスワード保護）
// すべて POST。body の { password, action, bot, ... } で動作。
// bot を省略 or 'all' の場合は全ボット合算。

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

function jst() {
  const j = new Date(Date.now() + 9 * 3600 * 1000);
  const y = j.getUTCFullYear();
  const m = String(j.getUTCMonth() + 1).padStart(2, '0');
  const d = String(j.getUTCDate()).padStart(2, '0');
  return { y, m, d };
}
// ボット絞り込み句（'all'/空 のときは絞らない）
function botClause(bot) {
  return bot && bot !== 'all' ? `bot_id=eq.${encodeURIComponent(bot)}&` : '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { password, action } = req.body || {};
  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!sbReady()) return res.status(500).json({ error: 'supabase not configured' });

  const bot = (req.body.bot || 'all').toString();
  const bc = botClause(bot);

  try {
    // ---- ボット一覧 ----
    if (action === 'bots') {
      const list = await sbGet('bots?select=bot_id,name&order=created_at.asc');
      return res.status(200).json({ bots: list });
    }

    // ---- ダッシュボードの数値 ----
    if (action === 'stats') {
      const { y, m, d } = jst();
      const todayStart = encodeURIComponent(`${y}-${m}-${d}T00:00:00+09:00`);
      const monthStart = encodeURIComponent(`${y}-${m}-01T00:00:00+09:00`);
      const realtimeFrom = encodeURIComponent(new Date(Date.now() - 5 * 60 * 1000).toISOString());

      const [realtime, today, month, leadsMonth] = await Promise.all([
        sbCount(`sessions?${bc}last_seen=gte.${realtimeFrom}`),
        sbCount(`sessions?${bc}last_seen=gte.${todayStart}`),
        sbCount(`sessions?${bc}last_seen=gte.${monthStart}`),
        sbCount(`leads?${bc}created_at=gte.${monthStart}`),
      ]);

      // 目標：特定ボットはその値、全体は合算
      let goalTarget = 0;
      if (bot && bot !== 'all') {
        const g = await sbGet(`bot_goals?bot_id=eq.${encodeURIComponent(bot)}&select=target`);
        goalTarget = (g[0] && g[0].target) || 0;
      } else {
        const gs = await sbGet('bot_goals?select=target');
        goalTarget = gs.reduce((s, r) => s + (r.target || 0), 0);
      }
      return res.status(200).json({ realtime, today, month, leadsMonth, goalTarget, bot });
    }

    // ---- セッション一覧 ----
    if (action === 'sessions') {
      const offset = Math.max(0, parseInt(req.body.offset || 0, 10));
      const limit = 30;
      const rows = await sbGet(
        `sessions?${bc}select=session_id,bot_id,first_seen,last_seen,ip,blocked&order=last_seen.desc&limit=${limit}&offset=${offset}`
      );
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
      const targetBot = bot && bot !== 'all' ? bot : 'cv';
      if (sid) await sbReq('PATCH', `sessions?session_id=eq.${encodeURIComponent(sid)}`, { blocked: true });
      if (ip) {
        await fetch(`${sbBase()}/rest/v1/blocked_ips?on_conflict=bot_id,ip`, {
          method: 'POST',
          headers: { ...sbHeaders(), Prefer: 'return=minimal,resolution=merge-duplicates' },
          body: JSON.stringify({ bot_id: targetBot, ip, reason: '管理画面から手動ブロック' }),
        });
      }
      return res.status(200).json({ ok: true });
    }

    // ---- ブロック解除 ----
    if (action === 'unblock') {
      const sid = (req.body.sessionId || '').toString();
      const ip = (req.body.ip || '').toString();
      const ipBot = (req.body.ipBot || (bot && bot !== 'all' ? bot : 'cv')).toString();
      if (sid) await sbReq('PATCH', `sessions?session_id=eq.${encodeURIComponent(sid)}`, { blocked: false });
      if (ip) await sbReq('DELETE', `blocked_ips?bot_id=eq.${encodeURIComponent(ipBot)}&ip=eq.${encodeURIComponent(ip)}`);
      return res.status(200).json({ ok: true });
    }

    // ---- ブロック中の一覧 ----
    if (action === 'blocklist') {
      const [sessions, ips] = await Promise.all([
        sbGet(`sessions?${bc}blocked=eq.true&select=session_id,bot_id,ip,last_seen&order=last_seen.desc&limit=200`),
        sbGet(`blocked_ips?${bc}select=bot_id,ip,reason,created_at&order=created_at.desc&limit=200`),
      ]);
      return res.status(200).json({ sessions, ips });
    }

    // ---- 目標の更新（ボット単位） ----
    if (action === 'setGoal') {
      if (!bot || bot === 'all') return res.status(400).json({ error: '目標はボットを選んで設定してください' });
      const target = Math.max(0, parseInt(req.body.target || 0, 10));
      await fetch(`${sbBase()}/rest/v1/bot_goals?on_conflict=bot_id`, {
        method: 'POST',
        headers: { ...sbHeaders(), Prefer: 'return=minimal,resolution=merge-duplicates' },
        body: JSON.stringify({ bot_id: bot, target, updated_at: new Date().toISOString() }),
      });
      return res.status(200).json({ ok: true, target });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    return res.status(500).json({ error: String(e).slice(0, 300) });
  }
}
