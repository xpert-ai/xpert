/**
 * Invariants: npm writes only a private staging directory. A completion marker
 * follows successful install and entry validation, then rename publishes it.
 * Existing complete artifacts are reused; failed builds never replace them.
 */
import { getConfig } from '@xpert-ai/server-config'
import { randomUUID } from 'node:crypto'
import { renameSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { satisfies, validRange } from 'semver'
import { t } from 'i18next'
import { z } from 'zod'
import { normalizePluginName } from '../types'
import { runInstallProcess } from './install-process'
import type { PluginStoreLease } from './plugin-store-lock'

const MARKER = '.xpert-registry-install.json'
const packageSchema = z.object({ name: z.string(), version: z.string() })
const markerSchema = packageSchema.extend({ schemaVersion: z.literal(1), spec: z.string() })

function incomplete(plugin: string) {
	return new Error(
		t('server-ai:Error.PluginInstallationIncomplete', {
			defaultValue: 'Plugin {{plugin}} has an incomplete or mismatched installation.',
			plugin
		})
	)
}

export function validateRegistrySpec(spec: string) {
	const name = normalizePluginName(spec)
	const version = spec.slice(name.length + 1)
	if (
		!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name) ||
		(version && !/^[a-zA-Z0-9.*+~^<>=| -]+$/.test(version))
	)
		throw incomplete(spec)
	return { name, version }
}

async function inspectArtifact(dir: string, spec: string) {
	const { name, version } = validateRegistrySpec(spec)
	const raw: unknown = JSON.parse(await readFile(join(dir, 'node_modules', name, 'package.json'), 'utf8'))
	const pkg = packageSchema.parse(raw)
	if (pkg.name !== name || (version && validRange(version) && !satisfies(pkg.version, version)))
		throw incomplete(spec)
	// Resolve without importing code into the serving process, and reject host fallback.
	const entry = await realpath(createRequire(join(dir, 'package.json')).resolve(name))
	const packageDir = await realpath(join(dir, 'node_modules', name))
	const entryPath = relative(packageDir, entry)
	if (entryPath.startsWith('..') || isAbsolute(entryPath)) throw incomplete(spec)
	return { schemaVersion: 1 as const, spec, name: pkg.name, version: pkg.version }
}

async function completed(dir: string, spec: string): Promise<boolean> {
	try {
		const raw: unknown = JSON.parse(await readFile(join(dir, MARKER), 'utf8'))
		const marker = markerSchema.parse(raw)
		const pkg = await inspectArtifact(dir, spec)
		return marker.spec === spec && marker.name === pkg.name && marker.version === pkg.version
	} catch {
		return false
	}
}

export async function installRegistryArtifact(input: {
	pluginDir: string
	plugin: string
	registry?: string
	legacyPeerDeps?: boolean
	lease: PluginStoreLease
}): Promise<void> {
	const { pluginDir, plugin, lease } = input
	validateRegistrySpec(plugin)
	await lease.assertOwned()
	if (await completed(pluginDir, plugin)) return
	const timeoutMs = getConfig().pluginInstallationOptions?.timeoutMs ?? 120_000
	const options = { timeoutMs, signal: lease.controller.signal }
	// Upgrade old successful installs offline. package.json alone is never proof of completion.
	try {
		const marker = await inspectArtifact(pluginDir, plugin)
		await runInstallProcess('npm', ['ls', '--all', '--omit=dev', '--omit=peer', '--json'], {
			...options,
			cwd: pluginDir
		})
		await lease.assertOwned()
		await writeFile(join(pluginDir, MARKER), JSON.stringify(marker), { flag: 'wx' })
		return
	} catch {
		lease.controller.signal.throwIfAborted()
		await lease.assertOwned()
	}

	await mkdir(dirname(pluginDir), { recursive: true })
	// A recovered store lock outlives the previous npm watchdog. Reap only our private stages.
	for (const entry of await readdir(dirname(pluginDir), { withFileTypes: true })) {
		if (entry.isDirectory() && entry.name.startsWith('.registry-stage-')) {
			await lease.assertOwned()
			await rm(join(dirname(pluginDir), entry.name), { recursive: true, force: true })
		}
	}
	const staging = await mkdtemp(join(dirname(pluginDir), '.registry-stage-'))
	try {
		await runInstallProcess(
			'npm',
			[
				'install',
				'--no-save',
				'--package-lock=false',
				'--no-audit',
				'--no-fund',
				...(input.legacyPeerDeps === false ? [] : ['--legacy-peer-deps']),
				'--prefix',
				staging,
				...(input.registry ? ['--registry', input.registry] : []),
				'--',
				plugin
			],
			{ ...options, cwd: staging }
		)
		const marker = await inspectArtifact(staging, plugin)
		await writeFile(join(staging, MARKER), JSON.stringify(marker), { flag: 'wx' })
		await lease.assertOwned()
		lease.assertValid()
		// Only incomplete legacy directories can be displaced. Keep them until publication succeeds.
		const quarantine = `${pluginDir}.incomplete-${randomUUID()}`
		let moved = false
		try {
			try {
				renameSync(pluginDir, quarantine)
				moved = true
			} catch (error) {
				if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'))
					throw error
			}
			renameSync(staging, pluginDir)
		} catch (error) {
			if (moved) renameSync(quarantine, pluginDir)
			throw error
		}
		if (moved) await rm(quarantine, { recursive: true, force: true })
	} finally {
		await rm(staging, { recursive: true, force: true })
	}
}
