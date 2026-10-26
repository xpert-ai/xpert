import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import i18next from 'i18next'
import { runInstallProcess } from './install-process'

describe('Installation child lifecycle', () => {
	let cwd: string
	beforeEach(async () => {
		cwd = await mkdtemp(join(tmpdir(), 'install-process-'))
		await i18next.init({ lng: 'en', resources: {} })
	})
	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true })
	})
	it('stops the child process group on lost ownership before returning to cleanup', async () => {
		const controller = new AbortController()
		const script = `const {spawn}=require('node:child_process');
            spawn(process.execPath,['-e', "setTimeout(()=>require('node:fs').writeFileSync('late','bad'),1000)"],{stdio:'inherit'});
            setTimeout(()=>{},10000)`
		const result = runInstallProcess(process.execPath, ['-e', script], {
			cwd,
			signal: controller.signal,
			timeoutMs: 5000
		})
		const rejection = expect(result).rejects.toThrow('cancelled')
		await new Promise((resolve) => setTimeout(resolve, 500))
		controller.abort()
		await rejection
		await new Promise((resolve) => setTimeout(resolve, 1100))
		await expect(readFile(join(cwd, 'late'))).rejects.toMatchObject({ code: 'ENOENT' })
	})
})
