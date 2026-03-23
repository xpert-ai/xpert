import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { stageWorkspacePlugin } from './organization-plugin.store'

describe('stageWorkspacePlugin', () => {
	let tempRoot: string
	let previousWorkspaceRoots: string | undefined

	beforeEach(() => {
		tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'org-plugin-store-'))
		previousWorkspaceRoots = process.env.PLUGIN_WORKSPACE_ROOTS
		process.env.PLUGIN_WORKSPACE_ROOTS = tempRoot
	})

	afterEach(() => {
		if (previousWorkspaceRoots === undefined) {
			delete process.env.PLUGIN_WORKSPACE_ROOTS
		} else {
			process.env.PLUGIN_WORKSPACE_ROOTS = previousWorkspaceRoots
		}
		fs.rmSync(tempRoot, { recursive: true, force: true })
	})

	it('skips node_modules when staging a workspace plugin', () => {
		const workspacePath = createWorkspace(tempRoot)
		fs.mkdirSync(path.join(workspacePath, 'node_modules', 'left-pad'), { recursive: true })
		fs.writeFileSync(path.join(workspacePath, 'node_modules', 'left-pad', 'index.js'), 'module.exports = 1')

		const pluginDir = stageWorkspacePlugin({
			organizationId: 'org-1',
			pluginName: 'test-plugin',
			expectedPackageName: 'test-plugin',
			workspacePath,
			rootDir: path.join(tempRoot, 'staging-root')
		})

		const stagedPackageDir = path.join(pluginDir, 'node_modules', 'test-plugin')
		expect(fs.existsSync(path.join(stagedPackageDir, 'src', 'index.ts'))).toBe(true)
		expect(fs.existsSync(path.join(stagedPackageDir, 'node_modules'))).toBe(false)
	})

	it('rejects symlinks that escape the workspace root', () => {
		const workspacePath = createWorkspace(tempRoot)
		const externalTarget = path.join(tempRoot, 'external-target')
		fs.mkdirSync(externalTarget, { recursive: true })
		fs.writeFileSync(path.join(externalTarget, 'secret.txt'), 'outside')
		fs.symlinkSync(externalTarget, path.join(workspacePath, 'external-link'), process.platform === 'win32' ? 'junction' : 'dir')

		expect(() =>
			stageWorkspacePlugin({
				organizationId: 'org-1',
				pluginName: 'test-plugin',
				expectedPackageName: 'test-plugin',
				workspacePath,
				rootDir: path.join(tempRoot, 'staging-root')
			})
		).toThrow(/outside workspace root/)
	})

	it('keeps symlink targets valid after staging', () => {
		const workspacePath = createWorkspace(tempRoot)
		const sourceTarget = path.join(workspacePath, 'src', 'index.ts')
		const sourceLink = path.join(workspacePath, 'linked-index.ts')
		fs.symlinkSync(path.relative(workspacePath, sourceTarget), sourceLink, 'file')

		const pluginDir = stageWorkspacePlugin({
			organizationId: 'org-1',
			pluginName: 'test-plugin',
			expectedPackageName: 'test-plugin',
			workspacePath,
			rootDir: path.join(tempRoot, 'staging-root')
		})

		const stagedPackageDir = path.join(pluginDir, 'node_modules', 'test-plugin')
		const stagedLink = path.join(stagedPackageDir, 'linked-index.ts')
		const stagedTarget = path.join(stagedPackageDir, 'src', 'index.ts')

		if (process.platform === 'win32') {
			expect(fs.lstatSync(stagedLink).isSymbolicLink()).toBe(false)
			expect(fs.readFileSync(stagedLink, 'utf8')).toBe(fs.readFileSync(stagedTarget, 'utf8'))
			return
		}

		expect(fs.lstatSync(stagedLink).isSymbolicLink()).toBe(true)
		expect(fs.realpathSync.native(stagedLink)).toBe(fs.realpathSync.native(stagedTarget))
	})

	it('stages packaged runtime dependencies from a pnpm deploy workspace', () => {
		const deployRoot = createDeployWorkspace(tempRoot)

		const pluginDir = stageWorkspacePlugin({
			organizationId: 'org-1',
			pluginName: '@scope/test-plugin',
			expectedPackageName: '@scope/test-plugin',
			workspacePath: deployRoot,
			rootDir: path.join(tempRoot, 'staging-root')
		})

		const stagedPackageDir = path.join(pluginDir, 'node_modules', '@scope', 'test-plugin')
		expect(fs.existsSync(path.join(stagedPackageDir, 'dist', 'index.js'))).toBe(true)
		expect(fs.readFileSync(path.join(stagedPackageDir, 'node_modules', 'runtime-dep', 'index.js'), 'utf8')).toBe(
			'module.exports = "runtime";'
		)
	})
})

function createWorkspace(tempRoot: string) {
	const workspacePath = path.join(tempRoot, 'workspace')
	fs.mkdirSync(path.join(workspacePath, 'src'), { recursive: true })
	fs.writeFileSync(
		path.join(workspacePath, 'package.json'),
		JSON.stringify({
			name: 'test-plugin'
		})
	)
	fs.writeFileSync(path.join(workspacePath, 'src', 'index.ts'), 'export const plugin = {}')
	return workspacePath
}

function createDeployWorkspace(tempRoot: string) {
	const deployRoot = path.join(tempRoot, 'deploy-workspace')
	const stagedPackageDir = path.join(deployRoot, 'node_modules', '.pnpm', 'node_modules', '@scope', 'test-plugin')
	const runtimeStoreDir = path.join(tempRoot, 'runtime-store', 'runtime-dep')
	const runtimeLinkDir = path.join(stagedPackageDir, 'node_modules', 'runtime-dep')

	fs.mkdirSync(path.join(stagedPackageDir, 'dist'), { recursive: true })
	fs.mkdirSync(path.join(runtimeLinkDir, '..'), { recursive: true })
	fs.mkdirSync(runtimeStoreDir, { recursive: true })
	fs.writeFileSync(
		path.join(deployRoot, 'package.json'),
		JSON.stringify({
			name: '@scope/test-plugin'
		})
	)
	fs.writeFileSync(
		path.join(stagedPackageDir, 'package.json'),
		JSON.stringify({
			name: '@scope/test-plugin',
			dependencies: {
				'runtime-dep': '1.0.0'
			}
		})
	)
	fs.writeFileSync(path.join(stagedPackageDir, 'dist', 'index.js'), 'export default {}')
	fs.writeFileSync(path.join(runtimeStoreDir, 'index.js'), 'module.exports = "runtime";')
	fs.symlinkSync(
		runtimeStoreDir,
		runtimeLinkDir,
		process.platform === 'win32' ? 'junction' : 'dir'
	)

	return deployRoot
}
