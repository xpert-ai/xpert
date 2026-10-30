// Run unchanged store modules in independent processes; stub only host configuration/scope constants.
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const options = JSON.parse(process.argv[2])
const cache = new Map()
function load(file) {
	if (cache.has(file)) return cache.get(file).exports
	const module = { exports: {} }
	cache.set(file, module)
	const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
		compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
	}).outputText
	vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: file })(
		(name) => {
			if (name === '@xpert-ai/server-config')
				return {
					getConfig: () => ({
						assetOptions: { serverRoot: options.root },
						pluginInstallationOptions: {
							timeoutMs: options.timeoutMs || 5000,
							lockWaitMs: options.lockWaitMs || 5000
						}
					})
				}
			if (name === '@xpert-ai/plugin-sdk')
				return {
					GLOBAL_ORGANIZATION_SCOPE: 'global',
					SYSTEM_GLOBAL_SCOPE: 'system:global',
					TENANT_GLOBAL_SCOPE_PREFIX: 'tenant:',
					TENANT_GLOBAL_SCOPE_SUFFIX: ':global',
					getTenantGlobalScopeKey: (id) => `tenant:${id}:global`,
					isTenantGlobalScopeKey: (value) =>
						typeof value === 'string' && value.startsWith('tenant:') && value.endsWith(':global')
				}
			if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name + '.ts'))
			return require(name)
		},
		module,
		module.exports
	)
	return module.exports
}
async function run() {
	await require('i18next').init({ lng: 'en', resources: {} })
	const store = load(path.join(__dirname, '../organization-plugin.store.ts'))
	let ticks = 0
	const timer = setInterval(() => ticks++, 20)
	try {
		await store.installOrganizationPlugins(options.organizationId || 'org-1', [options.spec], {
			rootDir: options.root,
			runtimeName: options.runtimeName,
			publishManifest: options.publishManifest
		})
		process.send({ success: true, ticks })
	} catch (error) {
		process.send({ success: false, error: error.message, ticks })
	} finally {
		clearInterval(timer)
		process.disconnect()
	}
}
run().catch((error) => {
	console.error(error)
	process.exit(1)
})
