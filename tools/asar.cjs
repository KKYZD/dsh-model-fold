/**
 * Reads Electron asar archives: list entries, or extract one file.
 * Usage:
 *   node asar.cjs <archive> list [regex]
 *   node asar.cjs <archive> extract <internal/path> <outFile>
 */
const fs = require('fs')

const archive = process.argv[2]
const mode = process.argv[3]
const fd = fs.openSync(archive, 'r')
const head = Buffer.alloc(16)
fs.readSync(fd, head, 0, 16, 0)
const headerSize = head.readUInt32LE(12)
const headerBuf = Buffer.alloc(headerSize)
fs.readSync(fd, headerBuf, 0, headerSize, 16)
const root = JSON.parse(headerBuf.toString('utf8').replace(/\u0000+$/, ''))
const dataBase = 16 + headerSize

function walk(node, prefix, out) {
	const files = node.files || {}
	for (const name of Object.keys(files)) {
		const value = files[name]
		const full = prefix + '/' + name
		if (value.files) walk(value, full, out)
		else out.push({ path: full, size: value.size, offset: value.offset })
	}
	return out
}

const entries = walk(root, '', [])

if (mode === 'list') {
	const pattern = process.argv[4] ? new RegExp(process.argv[4]) : null
	let shown = 0
	for (const entry of entries) {
		if (pattern && !pattern.test(entry.path)) continue
		console.log(`${entry.path}  [${entry.size}]`)
		shown += 1
	}
	console.error(`--- ${shown} of ${entries.length} entries ---`)
} else if (mode === 'extract') {
	const wanted = process.argv[4]
	const outFile = process.argv[5]
	const entry = entries.find((candidate) => candidate.path === wanted)
	if (!entry) {
		console.error('NOT FOUND: ' + wanted)
		process.exit(1)
	}
	const buffer = Buffer.alloc(entry.size)
	fs.readSync(fd, buffer, 0, entry.size, dataBase + parseInt(entry.offset, 10))
	fs.writeFileSync(outFile, buffer)
	console.log(`extracted ${outFile} (${entry.size} bytes)`)
} else {
	console.error('usage: asar.cjs <archive> list [regex] | extract <path> <out>')
	process.exit(1)
}
