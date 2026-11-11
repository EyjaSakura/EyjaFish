// 简单 CDP 求值：node cdp-eval.mjs "<expression>"
const CDP = 'http://127.0.0.1:9223';
const expr = process.argv[2] || '1';

const targets = await (await fetch(`${CDP}/json/list`)).json();
const page = targets.find((t) => t.type === 'page' && t.url.includes('6099'));
if (!page) { console.log('no page'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
const result = await new Promise((resolve) => {
  ws.addEventListener('message', (ev) => {
    try {
      const m = JSON.parse(ev.data);
      if (m.id === 1) resolve(m);
    } catch (e) { }
  });
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
});
console.log(JSON.stringify(result.result?.result?.value ?? result.result, null, 1));
ws.close();
