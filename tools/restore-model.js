// One-off: restore the user's model through the picker UI itself.
(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  const q = (s) => document.querySelector(s)
  const qa = (s) => [...document.querySelectorAll(s)]
  const trigger = () => q('.mf-trigger')
  const hover = (el) => el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, relatedTarget: null }))
  try {
    if (q('.mf-menu')) { trigger().click(); await sleep(280) }
    trigger().click(); await sleep(350)
    const row = qa('.mf-item').find(i => i.querySelector('.mf-itemName')?.textContent === 'WorkBuddy Global')
    hover(row); await sleep(300)
    const target = qa('.mf-row').find(r => r.title && r.title.includes('Deepseek-V4.1-Flash · x0.00'))
    if (!target) return { ok: false, rows: qa('.mf-row').map(r => r.title) }
    target.click(); await sleep(900)
    return { ok: true, label: trigger()?.textContent, closed: !q('.mf-menu') }
  } catch (e) { return { ok: false, error: String(e.message || e) } }
})()
