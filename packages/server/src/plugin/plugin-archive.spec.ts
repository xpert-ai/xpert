import { BadRequestException } from '@nestjs/common'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { extractPluginArchive } from './plugin-archive'

describe('plugin archive extraction', () => {
	const tempRoots: string[] = []

	afterEach(() => {
		for (const tempRoot of tempRoots.splice(0)) {
			fs.rmSync(tempRoot, { recursive: true, force: true })
		}
	})

	it('extracts tgz archives by file signature even when the upload mimetype looks like zip', async () => {
		const { archivePath, tempRoot } = createTgzPluginArchive()
		tempRoots.push(tempRoot)

		const extracted = await extractPluginArchive({
			buffer: fs.readFileSync(archivePath),
			originalname: 'plugin-uploaded-demo.tgz',
			mimetype: 'application/zip'
		})

		tempRoots.push(extracted.tempDir)
		expect(extracted.originalName).toBe('plugin-uploaded-demo.tgz')
		expect(extracted.packageDir).toBe(path.join(extracted.tempDir, 'package'))
		expect(extracted.packageJson).toEqual(
			expect.objectContaining({
				name: '@xpert-ai/plugin-uploaded-demo',
				version: '0.2.0'
			})
		)
	})

	it('returns a bad request for invalid archives instead of leaking raw extractor errors', async () => {
		const archive = {
			buffer: Buffer.from('this is not a valid zip file'),
			originalname: 'bad.zip',
			mimetype: 'application/zip'
		}

		await expect(extractPluginArchive(archive)).rejects.toBeInstanceOf(BadRequestException)
		await expect(extractPluginArchive(archive)).rejects.toThrow('Failed to extract plugin archive bad.zip')
	})
})

function createTgzPluginArchive() {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xpert-plugin-archive-test-'))
	const packageDir = path.join(tempRoot, 'package')
	fs.mkdirSync(path.join(packageDir, 'dist'), { recursive: true })
	fs.writeFileSync(
		path.join(packageDir, 'package.json'),
		JSON.stringify({
			name: '@xpert-ai/plugin-uploaded-demo',
			version: '0.2.0',
			main: 'dist/index.cjs.js',
			peerDependencies: {
				'@xpert-ai/plugin-sdk': '^3.8.0'
			}
		})
	)
	fs.writeFileSync(path.join(packageDir, 'dist', 'index.cjs.js'), 'module.exports = {}')

	const archivePath = path.join(tempRoot, 'plugin-uploaded-demo.tgz')
	execFileSync('tar', ['-czf', archivePath, '-C', tempRoot, 'package'])
	return { archivePath, tempRoot }
}
