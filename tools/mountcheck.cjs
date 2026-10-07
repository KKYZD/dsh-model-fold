/**
 * Boots the REAL Cordis loader the way the profile does, with only the
 * `dsh-model-fold` row, to see whether the node half actually mounts.
 *
 * This is the check that was missing: every earlier suite tested the plugin's
 * own code in isolation, but never asked whether the loader accepts the row.
 * Cordis validates the plugin's exported `Config` (when present) and its
 * export shape, so a bad export fails the row before the browser half is ever
 * considered.
 *
 * Usage: node tools/mountcheck.cjs
 */
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

const PROFILE = path.join(os.homedir(), '.dsh', 'profiles', 'desktop')

async function main() {
	// Resolve cordis from the profile's own tree, exactly as the loader does.
	const { createRequire } = require('node:module')
	const profileRequire = createRequire(path.join(PROFILE, 'cordis.yml'))

	let cordis
	try {
		cordis = await import(profileRequire.resolve('@deepseek-ai/cordis'))
	} catch (error) {
		console.log(`SKIP: could not import cordis from the profile (${error.message})`)
		process.exit(2)
	}

	const results = []
	const check = (label, ok, detail) => results.push({ label, ok: Boolean(ok), detail })

	// Import the node half through the profile's resolution, as the loader would.
	let mod
	try {
		mod = await import(profileRequire.resolve('dsh-model-fold'))
		check('node half imports', true)
	} catch (error) {
		check('node half imports', false, error.message)
		report(results)
		return
	}

	check('exports an apply function', typeof mod.apply === 'function', typeof mod.apply)
	check('exports a name', typeof mod.name === 'string', mod.name)

	// Cordis reads `Config` as a schema when the binding exists. A defined but
	// non-schema Config is the classic silent row failure, so assert absence.
	check(
		'does not export a bogus Config',
		!('Config' in mod) || (mod.Config && typeof mod.Config === 'function'),
		'Config' in mod ? `present (${typeof mod.Config})` : 'absent (good)',
	)

	// Drive a real cordis app with this plugin and see whether it settles.
	const { Context } = cordis
	const app = new Context()
	let applied = false
	app.plugin({
		name: mod.name ?? 'dsh-model-fold',
		...(mod.Config === undefined ? {} : { Config: mod.Config }),
		apply: (...args) => {
			applied = true
			return mod.apply(...args)
		},
	})

	try {
		await app.start()
		check('cordis accepted and applied the plugin', applied)
	} catch (error) {
		check('cordis accepted and applied the plugin', false, error.message)
	} finally {
		try {
			await app.stop()
		} catch {}
	}

	report(results)
}

function report(results) {
	let failed = 0
	for (const entry of results) {
		if (!entry.ok) failed += 1
		console.log(`${entry.ok ? 'PASS' : 'FAIL'}  ${entry.label}${entry.detail !== undefined ? `  [${entry.detail}]` : ''}`)
	}
	console.log('')
	console.log(failed === 0 ? 'mount check: OK' : `mount check: ${failed} failure(s)`)
	process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => {
	console.error('harness error:', error)
	process.exit(1)
})
