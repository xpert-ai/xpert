import { BadRequestException } from '@nestjs/common'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import unzipper from 'unzipper'

export interface UploadedPluginArchiveFile {
	buffer: Buffer
	originalname?: string
	mimetype?: string
	size?: number
}

export interface UploadedPluginArchivePackageJson {
	name?: string
	version?: string
	dependencies?: Record<string, string>
	peerDependencies?: Record<string, string>
}

export interface ExtractedPluginArchive {
	tempDir: string
	packageDir: string
	packageJson: UploadedPluginArchivePackageJson
	originalName: string
}

type ArchiveKind = 'zip' | 'tar' | 'tgz'

export async function extractPluginArchive(file: UploadedPluginArchiveFile): Promise<ExtractedPluginArchive> {
	if (!file?.buffer?.length) {
		throw new BadRequestException('plugin archive file is required')
	}

	const originalName = normalizeUploadFileName(file.originalname)
	const kind = inferArchiveKind(file.buffer, originalName, file.mimetype)
	if (!kind) {
		throw new BadRequestException('Unsupported plugin archive type. Upload a .zip, .tgz, .tar.gz, or .tar file.')
	}

	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpert-plugin-upload-'))
	try {
		if (kind === 'zip') {
			await extractZipArchive(file.buffer, tempDir)
		} else {
			extractTarArchive(file.buffer, tempDir, kind)
		}

		const packageDir = findExtractedPackageDirectory(tempDir)
		const packageJson = readPluginPackageJson(packageDir)

		return {
			tempDir,
			packageDir,
			packageJson,
			originalName
		}
	} catch (error) {
		await cleanupExtractedPluginArchive(tempDir)
		if (error instanceof BadRequestException) {
			throw error
		}
		throw new BadRequestException(
			`Failed to extract plugin archive ${originalName}: ${getArchiveErrorMessage(error)}`
		)
	}
}

export async function cleanupExtractedPluginArchive(tempDir?: string | null) {
	if (!tempDir) {
		return
	}

	fs.rmSync(tempDir, { recursive: true, force: true })
}

function normalizeUploadFileName(originalName?: string) {
	const normalized = (originalName ?? 'plugin-archive').replace(/\\/g, '/').split('/').pop()?.trim()
	return normalized || 'plugin-archive'
}

function inferArchiveKind(buffer: Buffer, fileName: string, mimetype?: string): ArchiveKind | null {
	if (hasGzipMagic(buffer)) {
		return 'tgz'
	}
	if (hasZipMagic(buffer)) {
		return 'zip'
	}
	if (hasTarMagic(buffer)) {
		return 'tar'
	}

	const lowerName = fileName.toLowerCase()
	const lowerMime = (mimetype ?? '').toLowerCase()

	if (lowerName.endsWith('.tgz') || lowerName.endsWith('.tar.gz')) {
		return 'tgz'
	}
	if (lowerName.endsWith('.tar')) {
		return 'tar'
	}
	if (lowerName.endsWith('.zip')) {
		return 'zip'
	}

	if (lowerMime.includes('gzip') || lowerMime.includes('x-gzip')) {
		return 'tgz'
	}
	if (lowerMime.includes('tar')) {
		return 'tar'
	}
	if (lowerMime.includes('zip')) {
		return 'zip'
	}
	return null
}

function hasGzipMagic(buffer: Buffer) {
	return buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b
}

function hasZipMagic(buffer: Buffer) {
	return (
		buffer.length >= 4 &&
		buffer[0] === 0x50 &&
		buffer[1] === 0x4b &&
		((buffer[2] === 0x03 && buffer[3] === 0x04) ||
			(buffer[2] === 0x05 && buffer[3] === 0x06) ||
			(buffer[2] === 0x07 && buffer[3] === 0x08))
	)
}

function hasTarMagic(buffer: Buffer) {
	return buffer.length >= 262 && buffer.subarray(257, 262).toString('ascii') === 'ustar'
}

function getArchiveErrorMessage(error: unknown) {
	if (error instanceof Error && error.message) {
		return error.message
	}
	return String(error)
}

async function extractZipArchive(buffer: Buffer, outputDir: string) {
	const archive = await unzipper.Open.buffer(buffer)
	assertSafeArchiveEntries(
		archive.files.map((file) => file.path),
		'zip'
	)
	await archive.extract({ path: outputDir })
}

function extractTarArchive(buffer: Buffer, outputDir: string, kind: 'tar' | 'tgz') {
	const archivePath = path.join(outputDir, kind === 'tgz' ? 'upload.tgz' : 'upload.tar')
	fs.writeFileSync(archivePath, buffer)

	const listArgs = kind === 'tgz' ? ['-tzf', archivePath] : ['-tf', archivePath]
	const extractArgs = kind === 'tgz' ? ['-xzf', archivePath, '-C', outputDir] : ['-xf', archivePath, '-C', outputDir]
	const entries = execFileSync('tar', listArgs, { encoding: 'utf8' })
		.split('\n')
		.map((entry) => entry.trim())
		.filter(Boolean)

	assertSafeArchiveEntries(entries, 'tar')
	execFileSync('tar', extractArgs, { stdio: 'pipe' })
}

function assertSafeArchiveEntries(entries: string[], archiveType: string) {
	for (const entry of entries) {
		const normalized = path.posix.normalize(entry.replace(/\\/g, '/'))
		if (
			!normalized ||
			normalized === '.' ||
			normalized === '..' ||
			normalized.startsWith('../') ||
			path.posix.isAbsolute(normalized)
		) {
			throw new BadRequestException(`Unsafe ${archiveType} archive entry path: ${entry}`)
		}
	}
}

function findExtractedPackageDirectory(tempDir: string) {
	const direct = path.join(tempDir, 'package.json')
	if (fs.existsSync(direct)) {
		return tempDir
	}

	const npmPackRoot = path.join(tempDir, 'package', 'package.json')
	if (fs.existsSync(npmPackRoot)) {
		return path.join(tempDir, 'package')
	}

	const candidates: string[] = []
	scanForPackageJson(tempDir, candidates, 0)

	if (candidates.length === 1) {
		return path.dirname(candidates[0])
	}

	if (!candidates.length) {
		throw new BadRequestException('Uploaded plugin archive must contain a package.json file.')
	}

	throw new BadRequestException('Uploaded plugin archive must contain exactly one plugin package.json file.')
}

function scanForPackageJson(dir: string, candidates: string[], depth: number) {
	if (depth > 3) {
		return
	}

	const entries = fs.readdirSync(dir, { withFileTypes: true })
	if (entries.some((entry) => entry.isFile() && entry.name === 'package.json')) {
		candidates.push(path.join(dir, 'package.json'))
		return
	}

	for (const entry of entries) {
		if (!entry.isDirectory() || ['node_modules', '.git', '__MACOSX'].includes(entry.name)) {
			continue
		}

		scanForPackageJson(path.join(dir, entry.name), candidates, depth + 1)
	}
}

export function readPluginPackageJson(packageDir: string): UploadedPluginArchivePackageJson {
	const packageJsonPath = path.join(packageDir, 'package.json')
	try {
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as UploadedPluginArchivePackageJson
		if (!packageJson?.name) {
			throw new BadRequestException('Uploaded plugin package.json must declare a package name.')
		}
		return packageJson
	} catch (error) {
		if (error instanceof BadRequestException) {
			throw error
		}
		throw new BadRequestException('Failed to read uploaded plugin package.json.')
	}
}
