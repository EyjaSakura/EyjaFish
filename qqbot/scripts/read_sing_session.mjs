import fs from 'node:fs'
import zlib from 'node:zlib'

const P = 'C:\\Users\\Eyjafjalla\\.dsh\\sessions\\_no-cwd\\qq-f3cf7a8638efad1eff03ccfd-mw1rozng\\session.v4.jsonl.zstd'
const buf = fs.readFileSync(P)
const magics = []
for (let i = 0; i + 3 < buf.length; i++) if (buf[i]===0x28&&buf[i+1]===0xb5&&buf[i+2]===0x2f&&buf[i+3]===0xfd) magics.push(i)
const parts = []
for (let k=0;k<magics.length;k++){ const s=magics[k]; let ok=false; for(let j=k+1;j<=Math.min(magics.length,k+3);j++){ const e=j<magics.length?magics[j]:buf.length; try{ parts.push(zlib.zstdDecompressSync(buf.subarray(s,e)).toString('utf8')); ok=true; k=j-1; break }catch{} } }
const lines = parts.join('').split('\n').filter(Boolean)
const events = []
for (const line of lines) { try { events.push(JSON.parse(line)) } catch {} }

const since = Date.now() - 60 * 60 * 1000
let sawProtocol = false
for (const e of events) {
  const t = e.time || 0
  if (t < since) continue
  const s = JSON.stringify(e)
  if (s.includes('唱歌协议')) sawProtocol = true
  if (e.type === 'tool/call' && /qq_sing|qq_sing_lyrics|qq_sing_save_sections/.test(s)) {
    console.log(new Date(t).toLocaleTimeString('zh-CN',{hour12:false}), 'CALL', e.data.name, String(e.data.arguments).slice(0,160))
  }
  if (e.type === 'tool/result' && /sing|权限|曲库|incoming/i.test(s)) {
    const c = (e.data?.message?.content||[]).map(x=>x.text||'').join(' ').slice(0,220)
    if (c) console.log(new Date(t).toLocaleTimeString('zh-CN',{hour12:false}), 'RESULT', c)
  }
  if (e.type === 'assistant/message') {
    const c = (e.data?.message?.content||[]).filter(x=>x.type==='text').map(x=>x.text).join(' ')
    if (c && /曲库|学|唱|incoming|弄不了|看不到/.test(c)) console.log(new Date(t).toLocaleTimeString('zh-CN',{hour12:false}), 'SAY', c.slice(0,200))
  }
}
console.log('protocol in context(1h):', sawProtocol)
