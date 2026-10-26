import { randomUUID } from 'node:crypto'
import { renameSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { normalizePluginName } from '../types'
import type { PluginStoreLease } from './plugin-store-lock'

export async function updatePluginManifest(
	manifestPath: string,
	update: (plugins: string[]) => string[],
	lease: PluginStoreLease
) {
	let current: string[] = []
	try {
		const raw: unknown = JSON.parse(await readFile(manifestPath, 'utf8'))
		current = z.array(z.string()).parse(raw)
	} catch (error) {
		// Never replace corrupt or unreadable state with an empty manifest.
		if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')) throw error
	}
	const byName = new Map<string, string>()
	for (const spec of update(current)) {
		byName.delete(normalizePluginName(spec))
		byName.set(normalizePluginName(spec), spec)
	}
	const temporary = `${manifestPath}.${randomUUID()}.tmp`
	try {
		await writeFile(temporary, JSON.stringify([...byName.values()], null, 2), { flag: 'wx' })
		await lease.assertOwned()
		lease.assertValid()
		renameSync(temporary, manifestPath)
	} finally {
		await rm(temporary, { force: true })
	}
}
