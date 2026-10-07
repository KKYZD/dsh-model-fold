#!/usr/bin/env node
/**
 * CDP probe for the running DSH window.
 *
 * Usage: node tools/cdp-probe.cjs [--reload] [--eval <file.js>] [--watch <seconds>]
 *
 * --reload   reload the page first and capture ~6s of console/exception traffic.
 * --eval     evaluate a JS file in the page main world after settling, print result JSON.
 * --watch    keep collecting console/exception events for N seconds.
 *
 * Errors and warnings are always printed; plain logs only when --verbose.
 */
const http = require('http')

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = ''
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => {
        try { resolve(JSON.parse(body)) } catch (error) { reject(error) }
      })
    }).on('error', reject)
  })
}

const args = process.argv.slice(2)
const wantReload = args.includes('--reload')
const verbose = args.includes('--verbose')
const evalIndex = args.indexOf('--eval')
const watchIndex = args.indexOf('--watch')
const captureIndex = args.indexOf('--capture')
const captureFile = captureIndex !== -1 ? args[captureIndex + 1] : null
const capture = captureFile ? { events: [] } : null

async function main() {
  const targets = await getJSON('http://127.0.0.1:9222/json')
  const page = targets.find((t) => t.type === 'page' && t.url.startsWith('dsh-app://'))
  if (!page) {
    console.error('NO_PAGE_TARGET', targets.map((t) => `${t.type}:${t.url}`))
    process.exit(1)
  }
  console.log('# attached:', page.title, page.url)

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })

  let nextId = 1
  const pending = new Map()
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })

  const consoleLines = []
  const printEvent = (line) => {
    consoleLines.push(line)
    console.log(line)
  }

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.id !== undefined) {
      const entry = pending.get(message.id)
      if (!entry) return
      pending.delete(message.id)
      if (message.error) entry.reject(new Error(`${message.error.message} (#${message.id})`))
      else entry.resolve(message.result)
      return
    }
    const { method, params } = message
    if (method === 'Runtime.consoleAPICalled') {
      const level = params.type
      const text = params.args
        .map((a) => a.value ?? a.description ?? (a.preview ? a.preview.description : a.type))
        .join(' ')
      if (capture) {
        capture.events.push({
          kind: 'console.' + level,
          text,
          stack: params.stackTrace ? params.stackTrace.callFrames : undefined,
        })
      }
      if (level === 'error' || level === 'warning' || verbose || level === 'assert') {
        printEvent(`[console.${level}] ${text}`)
      }
    } else if (method === 'Runtime.exceptionThrown') {
      const detail = params.exceptionDetails
      const text = detail.exception?.description || detail.text
      if (capture) {
        capture.events.push({
          kind: 'exception',
          text,
          stack: detail.stackTrace ? detail.stackTrace.callFrames : undefined,
        })
      }
      printEvent(`[exception] ${text}`)
    } else if (method === 'Log.entryAdded') {
      const entry = params.entry
      if (capture) capture.events.push({ kind: 'log.' + entry.level, text: entry.text, url: entry.url })
      if (entry.level === 'error' || entry.level === 'warning' || verbose) {
        printEvent(`[log.${entry.level}] ${entry.text} (${entry.url})`)
      }
    }
  }

  await send('Runtime.enable')
  await send('Log.enable')
  await send('Page.enable')

  if (wantReload) {
    printEvent('# reloading page...')
    await send('Page.reload')
    await new Promise((resolve) => setTimeout(resolve, 7000))
  }

  if (evalIndex !== -1) {
    const file = args[evalIndex + 1]
    const expression = require('fs').readFileSync(file, 'utf8')
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (result.exceptionDetails) {
      console.log('EVAL_EXCEPTION:', JSON.stringify(result.exceptionDetails, null, 2))
    } else {
      console.log('EVAL_RESULT:', JSON.stringify(result.result.value, null, 2))
    }
  }

  if (watchIndex !== -1) {
    const seconds = Number(args[watchIndex + 1]) || 5
    printEvent(`# watching ${seconds}s...`)
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
  }

  if (captureFile) {
    require('fs').writeFileSync(captureFile, JSON.stringify(capture.events, null, 2))
    console.log(`# captured ${capture.events.length} events -> ${captureFile}`)
  }

  ws.close()
  process.exit(0)
}

main().catch((error) => { console.error('PROBE_FAILED:', error); process.exit(1) })
