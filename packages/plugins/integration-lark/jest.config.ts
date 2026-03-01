import fs from 'node:fs'
import path from 'node:path'

/* eslint-disable */
const workspaceRoot = path.resolve(__dirname, '../../..')
const nodeModulesRoot = path.join(workspaceRoot, 'node_modules')
const transformSeedPackages = [
	'@xpert-ai/chatkit-types',
	'lodash-es',
	'ali-oss',
	'oidc-provider',
	'form-data-encoder'
]

const readPackageJson = (packageName: string): Record<string, any> | null => {
	const packagePath = path.join(nodeModulesRoot, ...packageName.split('/'), 'package.json')
	try {
		const content = fs.readFileSync(packagePath, 'utf8')
		return JSON.parse(content) as Record<string, any>
	} catch {
		return null
	}
}

const collectTransformPackages = (seedPackages: string[]) => {
	const seen = new Set<string>()
	const queue = [...seedPackages]

	while (queue.length) {
		const name = queue.shift()
		if (!name || seen.has(name)) {
			continue
		}
		seen.add(name)

		const pkg = readPackageJson(name)
		if (!pkg) {
			continue
		}

		const deps = {
			...pkg.dependencies,
			...pkg.optionalDependencies,
			...pkg.peerDependencies
		}
		for (const dep of Object.keys(deps || {})) {
			if (!seen.has(dep)) {
				queue.push(dep)
			}
		}
	}

	return Array.from(seen)
}

const escapeRegex = (value: string) => value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
const transformPackages = collectTransformPackages(transformSeedPackages)
const transformPattern = transformPackages.length
	? `/node_modules/(?!(${transformPackages.map(escapeRegex).join('|')})(/|$))`
	: '/node_modules/'

export default {
	displayName: 'integration-lark',
	preset: '../../../jest.preset.js',
	testEnvironment: 'node',
	transform: {
		'^.+\\.(ts|tsx)$': [
			'ts-jest',
			{
				tsconfig: '<rootDir>/tsconfig.spec.json'
			}
		],
		'^.+\\.(js|jsx|mjs)$': [
			'babel-jest',
			{
				presets: [
					[
						'@babel/preset-env',
						{
							targets: { node: 'current' }
						}
					]
				]
			}
		]
	},
	transformIgnorePatterns: [transformPattern],
	moduleFileExtensions: ['ts', 'js', 'html'],
	coverageDirectory: '../../../coverage/packages/plugins/integration-lark'
}
