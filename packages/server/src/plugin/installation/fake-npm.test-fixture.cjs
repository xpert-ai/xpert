#!/usr/bin/env node
// Test-only npm: no network or actual package installation.
const fs = require('node:fs')
const path = require('node:path')
const args = process.argv.slice(2)
const events = process.env.PLUGIN_TEST_EVENTS
if (args[0] === 'ls') {
	if (events) fs.appendFileSync(events, JSON.stringify({ action: 'validate' }) + '\n')
	process.exit(process.env.PLUGIN_TEST_INVALID_LEGACY === 'true' ? 1 : 0)
}
const prefix = args[args.indexOf('--prefix') + 1]
const spec = args.at(-1)
const at = spec.lastIndexOf('@')
const name = at > 0 ? spec.slice(0, at) : spec
const version = at > 0 ? spec.slice(at + 1) : '1.0.0'
if (events)
	fs.appendFileSync(
		events,
		JSON.stringify({ action: 'start', spec, prefix, pid: process.pid, time: Date.now() }) + '\n'
	)
const target = path.join(prefix, 'node_modules', name)
fs.mkdirSync(target, { recursive: true })
fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({ name, version, main: 'index.js' }))
setTimeout(
	() => {
		if (process.env.PLUGIN_TEST_FAIL === 'true') process.exit(7)
		fs.writeFileSync(path.join(target, 'index.js'), 'module.exports = {}\n')
		if (events) fs.appendFileSync(events, JSON.stringify({ action: 'finish', spec, time: Date.now() }) + '\n')
	},
	Number(process.env.PLUGIN_TEST_DELAY_MS || 100)
)
