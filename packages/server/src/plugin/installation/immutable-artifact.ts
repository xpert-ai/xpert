// A committed runtime name is immutable. Startup must never rebuild it from a
// mutable workspace or silently substitute a registry version/tag.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { t } from 'i18next'

const marker = '.xpert-runtime-artifact.json'
const schema = z.object({ packageName: z.string(), runtimeName: z.string() })

export function hasImmutableArtifact(directory: string, packageName: string, runtimeName: string) {
	try {
		const value: unknown = JSON.parse(readFileSync(join(directory, marker), 'utf8'))
		const receipt = schema.parse(value)
		return (
			receipt.packageName === packageName &&
			receipt.runtimeName === runtimeName &&
			existsSync(join(directory, 'node_modules', packageName, 'package.json'))
		)
	} catch {
		return false
	}
}

export function markImmutableArtifact(directory: string, packageName: string, runtimeName: string) {
	const target = join(directory, marker)
	writeFileSync(`${target}.tmp`, JSON.stringify({ packageName, runtimeName }))
	renameSync(`${target}.tmp`, target)
}

export function missingImmutableArtifact(plugin: string) {
	return new Error(
		t('server:Error.PluginCommittedArtifactMissing', {
			plugin,
			defaultValue:
				'The committed artifact for plugin {{plugin}} is missing or incomplete. Restore the artifact before restarting.'
		}) || 'PLUGIN_COMMITTED_ARTIFACT_MISSING'
	)
}
