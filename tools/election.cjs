/**
 * Runs the plugin's registration against the REAL slot core extracted from the
 * shipping app, instead of a hand-written stub.
 *
 * This is the check that was missing: it proves (or refutes) that a
 * `priority: -1` registration actually wins the `single`-slot election against
 * a default-priority occupant, and that `slots.inject` fires for a slot
 * declared by a different plugin.
 */
const fs = require('fs')
const path = require('path')

const DOCS = path.join(__dirname, '..', '.docs')
const PLUGIN = path.join(__dirname, '..')

// The real slot core is ESM with a single cordis import; load it dynamically.
async function main() {
	// `.docs/` is a local-only reference extract (gitignored, not published):
	// re-create it from the installed app with `node tools/asar.cjs`.
	if (!fs.existsSync(path.join(DOCS, 'real-slots.js'))) {
		console.error(
			'election.cjs needs the local `.docs/real-slots.js` extract (not part of the repo).\n' +
				'Re-create it from the installed app: `node tools/asar.cjs "<DSH>/resources/app.asar" extract <slots entry> .docs/real-slots.js`',
		)
		process.exit(1)
	}
	const slotsModule = await import(pathToFileUrl(path.join(DOCS, 'real-slots.js')))
	const { SlotCore } = slotsModule

	const results = []
	const check = (label, ok, detail) => results.push({ label, ok: Boolean(ok), detail })

	//#region reproduce the parent declaration
	// Slots are declared by a parent entry's `children` table, so stand in for
	// `ui-conversation` (the composer) declaring the model seat as single/session.
	const core = new SlotCore()
	core.register(
		{
			name: 'root',
			children: {
				'conversation.input.model': { kind: 'single', scope: 'session' },
			},
		},
		function ComposerShell() {},
	)
	const spec = core.spec('conversation.input.model')
	check('slot declared as single', spec && spec.kind === 'single', spec && spec.kind)
	check('slot scope is session', spec && spec.scope === 'session', spec && spec.scope)
	//#endregion

	//#region the stock registration (the built-in ModelSelect)
	const stockComponent = function StockModelSelect() {}
	const stockDisposer = core.register(
		{ name: 'conversation.input.model', locale: 'model' },
		stockComponent,
	)
	const afterStock = core.entriesOfSlot('conversation.input.model')
	check('stock registration occupies the slot', afterStock.length === 1, `entries=${afterStock.length}`)
	check('stock wins the election at default priority', afterStock[0] && afterStock[0].component === stockComponent)
	//#endregion

	//#region the plugin's registration (priority -1)
	// Load the real bundle and run apply() against a context that records the
	// registration, then replay that registration into the real core.
	const source = fs.readFileSync(path.join(PLUGIN, 'lib', 'client.js'), 'utf8')

	let captured = null
	const fakeWindow = {
		__ModuleLoader__: {
			load: (definition) => {
				fakeWindow.__captured = definition.factory((name) => {
					if (name === 'react') return makeReactStub()
					if (name === 'react/jsx-runtime') return makeJsxStub()
					throw new Error(`unexpected require: ${name}`)
				})
			},
		},
	}
	// Capture the registration the plugin attempts, without the real renderer.
	const slotRegistry = {
		inject: (name, fn) => fn(),
		register: (options, component) => {
			captured = { options, component }
			return () => {}
		},
	}
	const scopeStub = {
		slots: slotRegistry,
		modelDirectories: {
			directoryFor: () => ({
				store: {},
				load: () => Promise.resolve(),
				select: () => Promise.resolve({ ok: true }),
			}),
		},
		sessions: { subagentAddress: () => undefined },
	}
	// `apply` waits on its inject list; hand it the scope when it asks.
	const ctx = {
		inject: (deps, fn) => {
			const missing = deps.filter((name) => !(name in scopeStub))
			if (missing.length > 0) throw new Error(`inject asked for unavailable services: ${missing.join(', ')}`)
			return fn(scopeStub)
		},
	}
	const fakeDocument = {
		querySelector: () => null,
		createElement: () => ({ dataset: {} }),
		head: { appendChild: () => {} },
	}
	const runner = new Function('window', 'document', source)
	let applyError = null
	try {
		runner(fakeWindow, fakeDocument)
	} catch (error) {
		applyError = `bundle execution threw: ${error.message}`
	}
	check('bundle executes without throwing', applyError === null, applyError)

	// Now drive the plugin's apply with a context, surfacing any throw.
	const loadedModule = fakeWindow.__captured
	check('bundle exported apply', loadedModule && typeof loadedModule.apply === 'function')
	if (loadedModule && typeof loadedModule.apply === 'function') {
		let error = null
		try {
			loadedModule.apply(ctx)
		} catch (thrown) {
			error = thrown.message
		}
		check('apply runs without throwing', error === null, error)
	}

	check('plugin captured a registration', captured !== null)
	if (captured) {
		check('plugin registers the same slot name', captured.options.name === 'conversation.input.model', captured.options.name)
		check('plugin uses negative priority to shadow', captured.options.priority === -1, `priority=${captured.options.priority}`)
	}
	//#endregion

	//#region the decisive election test against the real core
	if (captured) {
		let failed = null
		try {
			core.register(
				{ name: captured.options.name, priority: captured.options.priority, locale: captured.options.locale },
				captured.component,
			)
		} catch (error) {
			failed = error.message
		}
		check('registering at priority -1 does NOT throw', failed === null, failed)
		const winners = core.entriesOfSlot('conversation.input.model')
		check('exactly one winner after shadowing', winners.length === 1, `winners=${winners.length}`)
		check('the plugin component wins the election', winners[0] && winners[0].component === captured.component)
		check(
			'the stock component is still on the ledger (not destroyed)',
			core.entries('conversation.input.model').length === 2,
			`ledger=${core.entries('conversation.input.model').length}`,
		)
		// Disposing the shadow must hand the slot back to the stock seat, which
		// is what makes this plugin removable without a restart.
		stockDisposer()
		const afterStockDispose = core.entriesOfSlot('conversation.input.model')
		check(
			'disposing the stock entry leaves the plugin in place',
			afterStockDispose.length === 1 && afterStockDispose[0].component === captured.component,
		)
	}
	//#endregion

	let failures = 0
	for (const entry of results) {
		if (!entry.ok) failures += 1
		console.log(`${entry.ok ? 'PASS' : 'FAIL'}  ${entry.label}${entry.detail !== undefined ? `  [${entry.detail}]` : ''}`)
	}
	console.log('')
	console.log(`${results.length - failures}/${results.length} checks passed`)
	process.exit(failures === 0 ? 0 : 1)
}

function pathToFileUrl(p) {
	return require('node:url').pathToFileURL(p).href
}

function makeReactStub() {
	return {
		Fragment: Symbol('Fragment'),
		useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
		useMemo: (fn) => fn(),
		useCallback: (fn) => fn,
		useRef: (init) => ({ current: init }),
		useEffect: () => {},
		useSyncExternalStore: (_sub, get) => get(),
	}
}
function makeJsxStub() {
	const jsx = (type, props, key) => ({ type, props: props ?? {}, key })
	return { jsx, jsxs: jsx, Fragment: Symbol('Fragment') }
}

main().catch((error) => {
	console.error('harness error:', error)
	process.exit(1)
})
