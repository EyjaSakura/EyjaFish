// 用 CDP 预置 WebUI token 并打开登录页（免手动输入）
const CDP = 'http://127.0.0.1:9223';
const URL_ = 'http://127.0.0.1:6099/webui';
const TOKEN = '904845364df0';

async function newTarget() {
  for (const method of ['PUT', 'POST']) {
    try {
      const r = await fetch(`${CDP}/json/new?url=${encodeURIComponent(URL_)}`, { method });
      if (r.ok) return await r.json();
    } catch (e) { }
  }
  return null;
}

function send(ws, id, method, params) {
  return new Promise((resolve) => {
    const off = (ev) => {
      try {
        const m = JSON.parse(ev.data);
        if (m.id === id) { ws.removeEventListener('message', off); resolve(m); }
      } catch (e) { }
    };
    ws.addEventListener('message', off);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const target = await newTarget();
if (!target) { console.log('no target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });

await send(ws, 1, 'Page.enable', {});
await send(ws, 2, 'Runtime.enable', {});
await send(ws, 6, 'Page.navigate', { url: URL_ });
await new Promise((r) => setTimeout(r, 4000));

const expr = `localStorage.setItem('token', ${JSON.stringify(TOKEN)}); 'set'`;
const setRes = await send(ws, 3, 'Runtime.evaluate', { expression: expr, returnByValue: true });
console.log('set token:', JSON.stringify(setRes.result?.result?.value || setRes.result));

await send(ws, 4, 'Page.reload', { ignoreCache: true });
await new Promise((r) => setTimeout(r, 3500));

const check = await send(ws, 5, 'Runtime.evaluate', { expression: 'location.href + " | " + document.title', returnByValue: true });
console.log('page:', check.result?.result?.value);
ws.close();
