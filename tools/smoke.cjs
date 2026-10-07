/**
 * Headless harness: loads the real client bundle against stub implementations of
 * the four host contracts it touches (`react`, `react/jsx-runtime`, the slot
 * registry, and the model directory service), with NO browser and NO DSH.
 *
 * The point is to prove the plugin's own logic before trusting it in the GUI:
 * registration shape, shadowing priority, provider menu defaults, the
 * hover/keyboard-driven model submenu, and selection routing. Rendering is
 * exercised through the component function directly, so a crash in the picker
 * logic surfaces here.
 */
const path = require('path')
const fs = require('fs')

const PLUGIN = process.argv[2]
const CLIENT = path.join(PLUGIN, 'lib', 'client.js')

//#region stub host: react
let hookState = []
let hookCursor = 0
const layoutQueue = []
const effectQueue = []
const react = {
	Fragment: Symbol('Fragment'),
	useState: (init) => {
		const i = hookCursor++
		if (!(i in hookState)) hookState[i] = typeof init === 'function' ? init() : init
		return [hookState[i], (next) => { hookState[i] = typeof next === 'function' ? next(hookState[i]) : next }]
	},
	useMemo: (fn, _deps) => fn(),
	useCallback: (fn, _deps) => fn,
	useRef: (init) => {
		const i = hookCursor++
		if (!(i in hookState)) hookState[i] = { current: init }
		return hookState[i]
	},
	/**
	 * Real React runs effects after commit. The harness queues them and the
	 * render() driver flushes both queues in commit order, so keyboard-open
	 * focus and other effect-driven behavior is exercised here too.
	 */
	useEffect: (fn) => {
		effectQueue.push(fn)
	},
	useLayoutEffect: (fn) => {
		layoutQueue.push(fn)
	},
	useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
}

function jsx(type, props, key) {
	return { type, props: props ?? {}, key }
}
function jsxs(type, props, key) {
	return { type, props: props ?? {}, key }
}

/** Walk the element tree the component returned, collecting every node. */
function walk(node, out = []) {
	if (node === null || node === undefined || typeof node === 'boolean') return out
	if (Array.isArray(node)) {
		for (const child of node) walk(child, out)
		return out
	}
	if (typeof node === 'object' && 'type' in node) {
		out.push(node)
		walk(node.props.children, out)
	}
	return out
}
//#endregion

//#region stub host: slot registry
const registrations = []
const slots = {
	inject: (name, fn) => fn(),
	register: (options, component) => {
		registrations.push({ options, component })
		return () => {}
	},
}
//#endregion

//#region stub host: model directory
const snapshot = {
	current: { provider: 'workbuddy-global', model: 'deepseek-v4.1-flash' },
	routable: true,
	groups: [
		{ id: 'deepseek-account', name: 'DeepSeek Account', models: [{ id: 'ds-a1', name: 'DeepSeek-A1' }] },
		{ id: 'deepseek-official', name: 'DeepSeek', models: [{ id: 'ds-b1', name: 'DeepSeek-B1' }] },
		{
			id: 'workbuddy-global',
			name: 'WorkBuddy Global',
			models: [
				{
					id: 'deepseek-v4.1-flash',
					name: 'Deepseek-V4.1-Flash',
					reasoning: {
						defaultEffort: 'medium',
						efforts: [
							{ id: 'low', name: 'Low' },
							{ id: 'medium', name: 'Medium' },
							{ id: 'high', name: 'High' },
						],
					},
				},
				{ id: 'gpt-6-sol', name: 'GPT-6-Sol' },
				{ id: 'hy4-preview-f', name: 'Hy4 preview' },
			],
		},
	],
	failures: [],
	status: 'ready',
	pending: null,
	error: null,
}

const selections = []
/** The uSES store the seat reads its snapshot from. */
const store = {
	getSnapshot: () => snapshot,
	subscribe: () => () => {},
}
/** The service the plugin's inject callback consumes: it reads `.store`. */
const directory = {
	store,
	load: () => Promise.resolve(snapshot),
	select: (selection) => {
		selections.push(selection)
		return Promise.resolve({ ok: true, value: undefined })
	},
}
//#endregion

//#region stub host: locale
const DICT = {
	'provider.account': 'DeepSeek Account',
	'trigger.fallback': 'Select model',
	'trigger.loading': 'Loading models...',
	'menu.model': 'Model',
	'menu.effort': 'Reasoning effort',
	'effort.providerDefault': 'Default',
	'empty.efforts': 'This model offers no reasoning levels.',
	'error.action': 'Model operation failed: {message}',
	'action.reload': 'Reload',
	'empty.models': 'No models available.',
}
const t = (key, params) => {
	let value = DICT[key]
	if (value === undefined) throw new Error(`unknown locale key: ${key}`)
	if (params) for (const [k, v] of Object.entries(params)) value = value.replace(`{${k}}`, String(v))
	return value
}
//#endregion

//#region load the bundle
const source = fs.readFileSync(CLIENT, 'utf8')
let loaded = null
const fakeWindow = {
	__ModuleLoader__: {
		load: (definition) => {
			loaded = definition.factory((name) => {
				if (name === 'react') return react
				if (name === 'react/jsx-runtime') return { jsx, jsxs, Fragment: react.Fragment }
				throw new Error(`unexpected require: ${name}`)
			})
		},
	},
	innerWidth: 1600,
	innerHeight: 1020,
	setTimeout,
	clearTimeout,
}
/**
 * Minimal DOM stand-in. `activeElement` is mutable so the keyboard tests can
 * place focus on a specific row and observe where the handler moves it.
 */
const fakeDocument = {
	activeElement: null,
	addEventListener: () => {},
	removeEventListener: () => {},
	querySelector: () => null,
	createElement: () => ({ dataset: {}, textContent: '' }),
	head: { appendChild: () => {} },
}
const runner = new Function('window', 'document', source)
runner(fakeWindow, fakeDocument)
//#endregion

const results = []
const check = (label, condition, detail) => {
	results.push({ label, pass: Boolean(condition), detail })
}

check('bundle exposed an apply function', typeof loaded.apply === 'function')
check(
	'bundle declared the fiber inject gate',
	JSON.stringify(loaded.inject) === JSON.stringify(['slots', 'sessions', 'remote', 'remote.session']),
	JSON.stringify(loaded.inject),
)

// Run apply against the stubbed context.
const ctx = {
	inject: (deps, fn) => fn({ slots, modelDirectories: { directoryFor: () => directory }, sessions: { subagentAddress: () => undefined } }),
}
loaded.apply(ctx)

check('registered exactly one seat', registrations.length === 1, `count=${registrations.length}`)
const reg = registrations[0]
check('seat name is conversation.input.model', reg && reg.options.name === 'conversation.input.model')
check('seat shadows stock via negative priority', reg && reg.options.priority === -1, `priority=${reg && reg.options.priority}`)
check('seat reuses the stock locale namespace', reg && reg.options.locale === 'model')

// The injected props are what the renderer would hand the component.
const injected = reg.options.inject('session-1')
check('inject exposes a directory store, not the service', injected.directory === store)

/**
 * One fake DOM element per rendered node. `focus` records the target so the
 * keyboard tests can observe where focus moved; `getBoundingClientRect`
 * feeds the menu/submenu anchor math with a believable composer geometry.
 */
let focusedElement = null
function makeElement(node) {
	const el = {
		node,
		focus: () => { focusedElement = el },
		getBoundingClientRect: () => ({
			top: 600, bottom: 634, left: 1100, right: 1400, width: 300, height: 34,
		}),
	}
	return el
}

/** Attach a rendered tree's refs the way React would after committing. */
function attachRefs(tree) {
	for (const node of tree) {
		const ref = node.props && node.props.ref
		if (typeof ref === 'function') ref(makeElement(node))
		else if (ref && typeof ref === 'object' && 'current' in ref) ref.current = makeElement(node)
	}
}

/**
 * Full mount cycle, mirroring React's commit order: render, attach refs, run
 * queued layout effects (which measure anchors and may set state), render
 * again to settle, attach the settled pass's refs, return its tree.
 */
function render() {
	hookCursor = 0
	layoutQueue.length = 0
	effectQueue.length = 0
	hookCursor = 0
	const pass1 = reg.component({ ...injected, locked: false, t })
	const tree1 = walk(pass1)
	attachRefs(tree1)
	for (const fn of layoutQueue.splice(0)) fn()
	hookCursor = 0
	const pass2 = reg.component({ ...injected, locked: false, t })
	const tree2 = walk(pass2)
	attachRefs(tree2)
	for (const fn of layoutQueue.splice(0)) fn()
	for (const fn of effectQueue.splice(0)) fn()
	return tree2
}

const byClass = (tree, className) => tree.filter((n) => n.props && n.props.className === className)
const first = (tree, className) => byClass(tree, className)[0]

//#region closed and open states
const closedTree = render()
check('trigger rendered', first(closedTree, 'mf-trigger') !== undefined)
check('menu closed initially -> no panels', byClass(closedTree, 'mf-menu').length === 0 && byClass(closedTree, 'mf-sub').length === 0)

first(closedTree, 'mf-trigger').props.onClick()
const openTree = render()
const heads = byClass(openTree, 'mf-item')
const subs = byClass(openTree, 'mf-sub')
check('open renders the provider menu', first(openTree, 'mf-menu') !== undefined)
check('providers + effort row are listed', heads.length === 4, `rows=${heads.length}`)
check('no submenu before a provider is engaged', subs.length === 0)

// ZCode parity: the provider holding the current model carries the check.
const checked = heads.filter((n) => byClass(walk(n), 'mf-check').length === 1)
check(
	'exactly the current provider is checked',
	checked.length === 1 && walk(checked[0]).some((n) => n.props && n.props.className === 'mf-itemName' && n.props.children === 'WorkBuddy Global'),
)
// ZCode parity: every provider row ends in a right-pointing chevron.
const carets = heads.filter((n) => byClass(walk(n), 'mf-caret').length === 1)
check('every provider row carries a submenu chevron', carets.length === heads.length, `rows=${carets.length}/${heads.length}`)

// The effort row shows the label and the current level (stock root-pane shape).
const effortRow = heads.find((n) => walk(n).some((c) => c.props && c.props.className === 'mf-itemName' && c.props.children === 'Reasoning effort'))
check('effort row rendered under the providers', effortRow !== undefined)
const effortValue = effortRow && walk(effortRow).find((c) => c.props && c.props.className === 'mf-value')
check('effort row shows the effective level', effortValue !== undefined && effortValue.props.children === 'Medium', effortValue && JSON.stringify(effortValue.props.children))

// The trigger carries the stock `model · effort` label.
const triggerEffort = walk(first(openTree, 'mf-trigger')).find((c) => c.props && c.props.className === 'mf-triggerEffort')
check('trigger shows the effort in caption tone', triggerEffort !== undefined && triggerEffort.props.children === ' \u00B7 Medium', triggerEffort && JSON.stringify(triggerEffort.props.children))

// The menu is anchored above the trigger, not statically placed.
const menuNode = first(openTree, 'mf-menu')
check(
	'menu is bottom-right anchored with a height clamp',
	menuNode.props.style && typeof menuNode.props.style.bottom === 'number' && typeof menuNode.props.style.maxHeight === 'number',
	JSON.stringify(menuNode.props.style),
)
//#endregion

//#region submenu interactions
const makeEvent = (key) => ({ key, preventDefault: () => {}, stopPropagation: () => {} })
// Hovering (pointerenter) a provider opens its model submenu.
const accountRow = heads[0]
accountRow.props.onPointerEnter({ currentTarget: makeElement(accountRow) })
const hoverTree = render()
const hoverRows = byClass(hoverTree, 'mf-row')
check('pointer enter opens that provider submenu', byClass(hoverTree, 'mf-sub').length === 1, `rows=${hoverRows.length}`)
check('submenu lists only that provider models', hoverRows.length === 1 && hoverRows[0].props.title === 'DeepSeek-A1')

// Rendered state after the hover: the hovered row is expanded, the others are not.
const hoverHeads = byClass(hoverTree, 'mf-item')
check(
	'hovered provider expanded, the rest collapsed',
	hoverHeads[0].props['aria-expanded'] === true && hoverHeads[1].props['aria-expanded'] === false && hoverHeads[2].props['aria-expanded'] === false,
	`aria=${hoverHeads.map((n) => n.props['aria-expanded'])}`,
)

// Clicking a model row routes through directory.select and closes everything.
hoverRows[0].props.onClick()
const afterSelectTree = render()
check('selection routed through the shared directory', selections.length === 1, JSON.stringify(selections))
check(
	'selection carries provider + model id',
	selections[0] && selections[0].provider === 'deepseek-account' && selections[0].model === 'ds-a1',
)
check('picker fully closed after selection', byClass(afterSelectTree, 'mf-menu').length === 0 && byClass(afterSelectTree, 'mf-sub').length === 0)

// Reopening starts at the menu level again.
first(afterSelectTree, 'mf-trigger').props.onClick()
const reopenTree = render()
check('reopening shows the provider menu, not a submenu', byClass(reopenTree, 'mf-sub').length === 0 && byClass(reopenTree, 'mf-menu').length === 1)

// Selecting the current model from ITS submenu keeps the checked markers.
const reopenHeads = byClass(reopenTree, 'mf-item')
const globalRow = reopenHeads.find((n) => walk(n).some((c) => c.props && c.props.className === 'mf-itemName' && c.props.children === 'WorkBuddy Global'))
globalRow.props.onPointerEnter({ currentTarget: makeElement(globalRow) })
const globalTree = render()
const globalRows = byClass(globalTree, 'mf-row')
check('current provider submenu lists its models', globalRows.length === 3, `rows=${globalRows.length}`)
const checkedRows = globalRows.filter((n) => {
	const checkNode = walk(n).find((c) => c.props && c.props.className === 'mf-check')
	return checkNode && checkNode.props.children === '\u2713'
})
check('current model is checked in the submenu', checkedRows.length === 1 && checkedRows[0].props.title === 'Deepseek-V4.1-Flash')

// Collapse the submenu so the keyboard tests start from the menu level.
first(globalTree, 'mf-sub').props.onKeyDown(makeEvent('Escape'))
render()

const mapTree = render()
const mapHeads = byClass(mapTree, 'mf-item')
const menuNode2 = first(mapTree, 'mf-menu')
check('menu exposes a keydown handler', typeof menuNode2.props.onKeyDown === 'function')
/**
 * The component records el->key in the ref callbacks of the render pass that
 * produced the keydown handler; re-drive those same ref callbacks with fresh
 * elements so `document.activeElement` is a key the handler can find.
 */
const elFor = (node) => {
	const el = makeElement(node)
	node.props.ref(el)
	return el
}
const headEls = mapHeads.map((n) => elFor(n))
const rowName = (node) => {
	const nameNode = walk(node).find((c) => c.props && (c.props.className === 'mf-itemName' || c.props.className === 'mf-rowCopy'))
	return nameNode && nameNode.props.children
}

fakeDocument.activeElement = headEls[0]
focusedElement = null
menuNode2.props.onKeyDown(makeEvent('ArrowDown'))
check(
	'ArrowDown moves focus to the next provider row',
	focusedElement !== null && rowName(focusedElement.node) === 'DeepSeek',
	`name=${focusedElement && rowName(focusedElement.node)}`,
)

// ArrowRight on a provider row opens its submenu and focuses the first model.
fakeDocument.activeElement = headEls[0]
focusedElement = null
menuNode2.props.onKeyDown(makeEvent('ArrowRight'))
const rightTree = render()
const rightRows = byClass(rightTree, 'mf-row')
check('ArrowRight opens the focused provider submenu', rightRows.length === 1, `rows=${rightRows.length}`)
check(
	'keyboard open focuses the first model row',
	focusedElement !== null && focusedElement.node.props.title === 'DeepSeek-A1',
	focusedElement && focusedElement.node.props.title,
)

// Escape collapses the submenu and returns focus to its provider row.
const rightMenu = first(rightTree, 'mf-menu')
const rightRowsEls = rightRows.map((n) => elFor(n))
fakeDocument.activeElement = rightRowsEls[0]
focusedElement = null
rightMenu.props.onKeyDown(makeEvent('Escape'))
const afterEscTree = render()
check('Escape collapses the submenu', byClass(afterEscTree, 'mf-sub').length === 0 && byClass(afterEscTree, 'mf-menu').length === 1)
check(
	'Escape hands focus back to the provider row',
	focusedElement !== null && rowName(focusedElement.node) === 'DeepSeek Account',
	focusedElement && rowName(focusedElement.node),
)

// Escape at the menu level closes the picker entirely.
const escMenu = first(afterEscTree, 'mf-menu')
escMenu.props.onKeyDown(makeEvent('Escape'))
const closedAgain = render()
check('second Escape closes the picker', byClass(closedAgain, 'mf-menu').length === 0)
//#endregion

//#region reasoning effort
// Reopen and drive the effort row like a pointer user would.
first(closedAgain, 'mf-trigger').props.onClick()
const efTree = render()
const efRow = byClass(efTree, 'mf-item').find((n) =>
	walk(n).some((c) => c.props && c.props.className === 'mf-itemName' && c.props.children === 'Reasoning effort'),
)
check('effort row present on reopen', efRow !== undefined)
efRow.props.onPointerEnter({ currentTarget: makeElement(efRow) })
const efOpen = render()
const efRows = byClass(efOpen, 'mf-row')
check('effort submenu lists the model levels', efRows.length === 3, `rows=${efRows.length}`)
const levelName = (row) => {
	const copy = walk(row).find((c) => c.props && c.props.className === 'mf-rowCopy')
	return copy && copy.props.children
}
const checkedLevel = efRows.filter((row) => {
	const checkNode = walk(row).find((c) => c.props && c.props.className === 'mf-check')
	return checkNode && checkNode.props.children === '\u2713'
})
check('effective level is checked', checkedLevel.length === 1 && levelName(checkedLevel[0]) === 'Medium', checkedLevel[0] && levelName(checkedLevel[0]))

// Choosing High resubmits the current provider/model with the new effort.
const highRow = efRows.find((row) => levelName(row) === 'High')
highRow.props.onClick()
const afterEffort = render()
check(
	'effort choice resubmits current provider/model',
	selections[1] && selections[1].provider === 'workbuddy-global' && selections[1].model === 'deepseek-v4.1-flash' && selections[1].reasoningEffort === 'high',
	JSON.stringify(selections[1]),
)
check('picker closed after effort choice', byClass(afterEffort, 'mf-menu').length === 0 && byClass(afterEffort, 'mf-sub').length === 0)
//#endregion

console.log('')
let failed = 0
for (const r of results) {
	console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.label}${r.detail ? `  [${r.detail}]` : ''}`)
	if (!r.pass) failed++
}
console.log('')
console.log(`${results.length - failed}/${results.length} checks passed`)
process.exit(failed === 0 ? 0 : 1)
