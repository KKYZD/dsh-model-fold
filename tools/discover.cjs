/**
 * Replicates `dsh-client-modules`' node-half discovery for one Loader row, so a
 * package can be checked without booting the GUI.
 *
 * Mirrors the real pipeline:
 *   locatePkgJson  -> resolve the row specifier, find the owning package.json
 *   parseDshClient -> validate `dsh.client`
 *   clientExportOf -> read `exports["./client"]`
 *   read the bundle and confirm it registers the exact package name
 */
const fs = require('fs')
const path = require('path')
const { createRequire } = require('node:module')

const baseUrl = process.argv[2]
const loaderName = process.argv[3]

/** Verbatim from the host: bare package-root specifier, or undefined. */
function exactPackageSpecifier(specifier) {
	if (specifier.startsWith('@')) {
		const parts = specifier.split('/')
		return parts.length === 2 && parts.every(Boolean) ? specifier : undefined
	}
	return specifier.length > 0 && !specifier.includes('/') && !specifier.includes(':') ? specifier : undefined
}

function optionalStringArray(subject, field, value) {
	if (value === undefined) return undefined
	if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
		throw new Error(`client-modules: ${subject} ${field} must be a string array`)
	}
	return value
}

function parseDshClient(pkgName, value) {
	if (value === undefined) return undefined
	if (typeof value !== 'object' || value === null) {
		throw new Error(`client-modules: ${pkgName} has a non-object dsh.client declaration`)
	}
	if (typeof value.platform !== 'string') {
		throw new Error(`client-modules: ${pkgName} dsh.client.platform must be a string`)
	}
	const inject = optionalStringArray(pkgName, 'dsh.client.inject', value.inject)
	const external = optionalStringArray(pkgName, 'dsh.client.external', value.external)
	return { platform: value.platform, inject, external }
}

function clientExportOf(pkgName, exportsField) {
	if (typeof exportsField !== 'object' || exportsField === null) return undefined
	const client = exportsField['./client']
	if (client === undefined) return undefined
	if (typeof client === 'string') return client
	if (typeof client === 'object' && client !== null) {
		const fallback = client.default
		if (typeof fallback === 'string') return fallback
	}
	throw new Error(`client-modules: ${pkgName} exports["./client"] must be a string or an object with a string default`)
}

const report = []
const step = (label, fn) => {
	try {
		const value = fn()
		report.push({ label, ok: true, value })
		return value
	} catch (error) {
		report.push({ label, ok: false, error: error.message })
		return undefined
	}
}

const expected = exactPackageSpecifier(loaderName)
step('row specifier is a bare package name', () => {
	if (expected === undefined) throw new Error(`"${loaderName}" is not a bare package specifier`)
	return expected
})

const pkgJsonPath = step('resolve <name>/package.json', () =>
	createRequire(baseUrl).resolve(`${expected}/package.json`),
)

let manifest = null
if (pkgJsonPath) {
	manifest = step('read manifest', () => JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')))
}

let declaration = null
if (manifest) {
	step('manifest name matches row', () => {
		if (manifest.name !== expected) {
			throw new Error(`package.json name "${manifest.name}" != row specifier "${expected}"`)
		}
		return manifest.name
	})
	declaration = step('parse dsh.client', () => parseDshClient(manifest.name, manifest.dsh && manifest.dsh.client))
	if (declaration) {
		step('platform is "web"', () => {
			if (declaration.platform !== 'web') throw new Error(`platform is "${declaration.platform}"`)
			return declaration.platform
		})
	}
}

let clientRel = null
if (manifest) {
	clientRel = step('read exports["./client"]', () => clientExportOf(manifest.name, manifest.exports))
}

if (clientRel && pkgJsonPath) {
	const clientPath = path.resolve(path.dirname(pkgJsonPath), clientRel)
	const source = step('read client bundle', () => fs.readFileSync(clientPath, 'utf8'))
	if (source) {
		step('bundle calls __ModuleLoader__.load', () => {
			if (!source.includes('window.__ModuleLoader__.load(')) throw new Error('no loader call found')
			return true
		})
		step('bundle registers the exact package name', () => {
			const match = source.match(/__ModuleLoader__\.load\(\s*\{[\s\S]{0,200}?id:\s*['"]([^'"]+)['"]/)
			const id = match && match[1]
			if (id !== expected) throw new Error(`registers "${id}" but the host expects "${expected}"`)
			return id
		})
	}
}

let failures = 0
for (const entry of report) {
	if (!entry.ok) failures += 1
	console.log(`${entry.ok ? 'PASS' : 'FAIL'}  ${entry.label}${entry.ok ? `  [${entry.value}]` : `  -> ${entry.error}`}`)
}
console.log('')
console.log(failures === 0 ? 'host discovery: OK' : `host discovery: ${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
