/**
 * One-shot verification: manifest shape, host discovery, component behaviour,
 * and the real slot-core election. Run from anywhere:
 *   node tools/verify.cjs
 */
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const os = require('node:os')

const ROOT = path.resolve(__dirname, '..')
const PROFILE_CORDIS = path.join(os.homedir(), '.dsh', 'profiles', 'desktop', 'cordis.yml')

const suites = [
	{ name: 'manifest + bundle format', args: [path.join(__dirname, 'validate.cjs'), ROOT] },
	{ name: 'host discovery', args: [path.join(__dirname, 'discover.cjs'), pathToFileUrl(PROFILE_CORDIS), 'dsh-model-fold'] },
	{ name: 'component behaviour', args: [path.join(__dirname, 'smoke.cjs'), ROOT] },
	{ name: 'slot-core election', args: [path.join(__dirname, 'election.cjs')] },
]

function pathToFileUrl(p) {
	return require('node:url').pathToFileURL(p).href
}

let failed = 0
for (const suite of suites) {
	process.stdout.write(`\n=== ${suite.name} ===\n`)
	try {
		const out = execFileSync(process.execPath, suite.args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
		const summary = out.trim().split(/\r?\n/).filter(Boolean).pop()
		console.log(summary ?? '(no output)')
	} catch (error) {
		failed += 1
		const text = `${error.stdout ?? ''}${error.stderr ?? ''}`
		console.log(text.trim().split(/\r?\n/).filter((line) => line.startsWith('FAIL')).join('\n') || text.trim().slice(-400))
	}
}

console.log('')
console.log(failed === 0 ? 'ALL SUITES PASSED' : `${failed} suite(s) failed`)
process.exit(failed === 0 ? 0 : 1)
