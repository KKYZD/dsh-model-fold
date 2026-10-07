// E2E test of the ZCode-style submenu picker on the live page.
(async () => { try {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  const q = (s) => document.querySelector(s)
  const qa = (s) => [...document.querySelectorAll(s)]
  const out = { steps: [] }
  const step = (name, data) => out.steps.push({ name, ...data })
  const trigger = () => q('.mf-trigger')
  // React synthesizes onPointerEnter from the bubbling pointerover/out pair;
  // a raw synthetic pointerenter never reaches the handler.
  const hover = (el) => {
    el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, relatedTarget: null }))
  }
  if (!trigger()) { out.error = 'no trigger'; return out }

  // open (guard against a leftover open menu from earlier probes)
  if (q('.mf-menu')) { trigger().click(); await sleep(280) }
  trigger().click(); await sleep(350)
  const menu = q('.mf-menu')
  const items = qa('.mf-item')
  const trigRect = trigger().getBoundingClientRect()
  const menuRect = menu.getBoundingClientRect()
  step('open', {
    providers: items.map(i => i.querySelector('.mf-itemName')?.textContent),
    checkedProvider: items.filter(i => i.querySelector('.mf-check')).map(i => i.querySelector('.mf-itemName')?.textContent),
    menuAboveTrigger: menuRect.bottom <= trigRect.top + 2,
    menuRightAligned: Math.abs(menuRect.right - trigRect.right) < 24,
    menuSolidBg: getComputedStyle(menu).backgroundColor !== 'rgba(0, 0, 0, 0)',
  })

  // hover WorkBuddy -> submenu
  const wb = items.find(i => i.querySelector('.mf-itemName')?.textContent === 'WorkBuddy')
  hover(wb)
  await sleep(300)
  let sub = q('.mf-sub')
  const subRect = sub?.getBoundingClientRect()
  step('hoverWorkBuddy', {
    subRows: sub ? sub.querySelectorAll('.mf-row').length : 0,
    opensBesideMenu: subRect ? subRect.right <= menuRect.left + 2 || subRect.left >= menuRect.right - 2 : false,
    alignedToRow: subRect ? Math.abs(subRect.top - wb.getBoundingClientRect().top) < 400 : false,
    scrollable: sub ? sub.scrollHeight >= sub.clientHeight : null,
  })

  // hover Trae -> submenu switches
  const trae = items.find(i => i.querySelector('.mf-itemName')?.textContent === 'Trae')
  hover(trae)
  await sleep(300)
  sub = q('.mf-sub')
  step('hoverTrae', {
    subRows: sub ? sub.querySelectorAll('.mf-row').length : 0,
    subHeight: sub ? sub.getBoundingClientRect().height : null,
    maxHeightClamped: sub ? sub.getBoundingClientRect().height <= 296 : null,
  })

  // keyboard: Escape closes submenu, focus to provider row
  sub.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await sleep(250)
  step('escapeSub', { subClosed: !q('.mf-sub'), menuStillOpen: !!q('.mf-menu') })

  // keyboard: focus WorkBuddy row, ArrowRight opens submenu
  const wbRow = qa('.mf-item').find(i => i.querySelector('.mf-itemName')?.textContent === 'WorkBuddy')
  wbRow.focus()
  wbRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  await sleep(300)
  sub = q('.mf-sub')
  step('arrowRight', {
    subRows: sub ? sub.querySelectorAll('.mf-row').length : 0,
    focusOnModel: document.activeElement && document.activeElement.className === 'mf-row',
    focusedTitle: document.activeElement && document.activeElement.title,
  })

  // ArrowDown moves within submenu, Enter selects
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  await sleep(200)
  const focusedTitle2 = document.activeElement && document.activeElement.title
  document.activeElement.click()
  await sleep(900)
  step('enterSelect', {
    picked: focusedTitle2,
    labelAfter: trigger()?.textContent,
    allClosed: !q('.mf-menu') && !q('.mf-sub'),
  })

  // restore the user's model via the same UI
  if (q('.mf-menu')) { trigger().click(); await sleep(280) }
  trigger().click(); await sleep(350)
  out.restoreMenuOpen = !!q('.mf-menu')
  const globalRow = qa('.mf-item').find(i => i.querySelector('.mf-itemName')?.textContent === 'WorkBuddy Global')
  out.restoreRowFound = globalRow !== undefined
  if (globalRow) hover(globalRow)
  await sleep(300)
  out.restoreSubOpen = !!q('.mf-sub')
  const restoreRow = qa('.mf-row').find(r => r.title === 'Deepseek-V4.1-Flash')
  out.restoreRowExists = restoreRow !== undefined
  if (restoreRow) restoreRow.click()
  await sleep(900)
  step('restore', { label: trigger()?.textContent, closed: !q('.mf-menu') })
  return out
  } catch (error) {
    out.error = String(error && error.message || error)
    return out
  }
})()
