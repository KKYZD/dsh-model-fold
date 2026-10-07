// Screenshot driver for the picker's three states (CDP attach to running DSH).
const http = require('http')
const fs = require('fs')
function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => { let b = ''; res.on('data', c => b += c); res.on('end', () => resolve(JSON.parse(b))) }).on('error', reject)
  })
}
async function main() {
  const targets = await getJSON('http://127.0.0.1:9222/json')
  const page = targets.find(t => t.type === 'page' && t.url.startsWith('dsh-app://'))
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  let id = 0
  const send = (method, params = {}) => new Promise((resolve) => { const mid = ++id; const h = (ev) => { const m = JSON.parse(ev.data); if (m.id === mid) { ws.removeEventListener('message', h); resolve(m) } }; ws.addEventListener('message', h); ws.send(JSON.stringify({ id: mid, method, params })) })
  const run = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`tools/shots/${name}.png`, Buffer.from(r.result.data, 'base64')); console.log('saved', name) }
  await send('Page.enable')
  await shot('01-closed')
  await run(`(async () => { const q=s=>document.querySelector(s); if (q('.mf-menu')) { q('.mf-trigger').click(); await new Promise(r=>setTimeout(r,250)) } q('.mf-trigger').click(); await new Promise(r=>setTimeout(r,400)); return 'open' })()`)
  await shot('02-menu-open')
  await run(`(async () => { const qa=s=>[...document.querySelectorAll(s)]; const row=qa('.mf-item').find(i=>i.textContent.includes('WorkBuddy Global')); row.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,relatedTarget:null})); await new Promise(r=>setTimeout(r,350)); return 'sub' })()`)
  await shot('03-submenu-global')
  await run(`(async () => { const qa=s=>[...document.querySelectorAll(s)]; const row=qa('.mf-item').find(i=>i.textContent.includes('Trae')); row.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,relatedTarget:null})); await new Promise(r=>setTimeout(r,350)); return 'sub-trae' })()`)
  await shot('04-submenu-trae')
  await run(`(async () => { const q=s=>document.querySelector(s); if (q('.mf-menu')) q('.mf-trigger').click(); await new Promise(r=>setTimeout(r,250)); return 'closed' })()`)
  console.log('label:', await run(`document.querySelector('.mf-trigger')?.textContent`))
  ws.close()
}
main().catch(e => { console.error(e); process.exit(1) })
