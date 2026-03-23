import { pathToFileURL } from 'node:url'
import { resolve } from 'path'
import { toPluginImportTarget } from './plugin-loader'

describe('toPluginImportTarget', () => {
	it('keeps scoped packages as bare specifiers', () => {
		expect(toPluginImportTarget('@xpert-ai/plugin-lark')).toBe('@xpert-ai/plugin-lark')
		expect(toPluginImportTarget('@xpert-ai/plugin-lark/subpath')).toBe('@xpert-ai/plugin-lark/subpath')
	})

	it('converts filesystem paths to file urls', () => {
		const absolutePath = resolve('tmp-plugin-entry.js')
		expect(toPluginImportTarget(absolutePath)).toBe(pathToFileURL(absolutePath).href)
	})
})
