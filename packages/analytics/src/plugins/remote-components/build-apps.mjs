import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const remoteRoot = dirname(fileURLToPath(import.meta.url))
const pluginsRoot = dirname(remoteRoot)
const workspaceRoot = findWorkspaceRoot(remoteRoot)
const shadcnPackageRoot = join(workspaceRoot, 'packages', 'shadcn-ui')
const components = [
	{
		name: 'semantic-modeling',
		directory: join(pluginsRoot, 'datax-semantic-modeling', 'remote-components', 'semantic-modeling')
	},
	{
		name: 'metric-management',
		directory: join(pluginsRoot, 'datax-metric-management', 'remote-components', 'metric-management')
	},
	{
		name: 'query-analysis',
		directory: join(pluginsRoot, 'datax-query-analysis', 'remote-components', 'query-analysis')
	}
]

async function bundleComponent(component) {
	const sourceDirectory = join(component.directory, 'src')
	const temporaryDirectory = await mkdtemp(join(tmpdir(), `xpert-${component.name}-`))
	const temporaryCssPath = join(temporaryDirectory, 'app.css')
	try {
		const monacoWorkerSource = component.name === 'semantic-modeling' ? await bundleMonacoEditorWorker() : ''
		const result = await build({
			entryPoints: [join(sourceDirectory, 'main.tsx')],
			bundle: true,
			format: 'iife',
			platform: 'browser',
			target: ['es2020'],
			outfile: join(temporaryDirectory, 'bundle.js'),
			write: false,
			logLevel: 'silent',
			legalComments: 'none',
			jsx: 'automatic',
			minify: true,
			loader: {
				'.ttf': 'dataurl'
			},
			define: {
				'process.env.NODE_ENV': '"production"',
				__XPERT_MONACO_WORKER_SOURCE__: JSON.stringify(monacoWorkerSource)
			},
			plugins: [xpertRemoteComponentPlugin()],
			banner: {
				js: ';'
			}
		})
		const scriptOutput = result.outputFiles?.find((output) => output.path.endsWith('.js'))
		if (!scriptOutput) {
			throw new Error(`esbuild did not produce ${component.name}/app.js output`)
		}
		const bundledCss = result.outputFiles?.find((output) => output.path.endsWith('.css'))?.text ?? ''

		execFileSync(
			resolveLocalBin(workspaceRoot, 'tailwindcss'),
			['-i', join(component.directory, 'tailwind.css'), '-o', temporaryCssPath, '--minify'],
			{
				cwd: workspaceRoot,
				stdio: 'inherit'
			}
		)
		const tailwindCss = await readFile(temporaryCssPath, 'utf8')
		return [
			{
				outputPath: join(component.directory, 'app.js'),
				text: stripTrailingWhitespace(scriptOutput.text)
			},
			{
				outputPath: join(component.directory, 'app.css'),
				text: stripTrailingWhitespace(`${bundledCss}\n${tailwindCss}`)
			}
		]
	} finally {
		await rm(temporaryDirectory, { recursive: true, force: true })
	}
}

async function bundleMonacoEditorWorker() {
	const result = await build({
		entryPoints: [join(workspaceRoot, 'node_modules', 'monaco-editor', 'esm', 'vs', 'editor', 'editor.worker.js')],
		bundle: true,
		format: 'iife',
		platform: 'browser',
		target: ['es2020'],
		write: false,
		logLevel: 'silent',
		legalComments: 'none',
		minify: true
	})
	const output = result.outputFiles?.[0]
	if (!output) {
		throw new Error('esbuild did not produce the Monaco editor worker output')
	}
	return output.text
}

const outputs = (await Promise.all(components.map(bundleComponent))).flat()

if (process.argv.includes('--check')) {
	let outdated = false
	await Promise.all(
		outputs.map(async ({ outputPath, text }) => {
			const current = await readFile(outputPath, 'utf8').catch(() => '')
			if (current !== text) {
				console.error(
					`${relative(process.cwd(), outputPath)} is out of date. Run corepack pnpm nx run analytics:generate-remote-components`
				)
				outdated = true
			}
		})
	)
	if (outdated) {
		process.exit(1)
	}
} else {
	await Promise.all(outputs.map(({ outputPath, text }) => writeFile(outputPath, text)))
}

function findWorkspaceRoot(startDirectory) {
	let current = startDirectory
	while (current !== dirname(current)) {
		if (existsSync(join(current, 'pnpm-workspace.yaml'))) {
			return current
		}
		current = dirname(current)
	}
	return resolve(startDirectory)
}

function resolveLocalBin(root, name) {
	const executable = process.platform === 'win32' ? `${name}.cmd` : name
	const path = join(root, 'node_modules', '.bin', executable)
	if (!existsSync(path)) {
		throw new Error(`Missing local binary '${name}'. Run corepack pnpm install before building remote components.`)
	}
	return path
}

function xpertRemoteComponentPlugin() {
	const reactShimPath = 'xpert-react-shim'
	const jsxRuntimeShimPath = 'xpert-react-jsx-runtime-shim'
	const reactDomShimPath = 'xpert-react-dom-shim'
	const reactDomClientShimPath = 'xpert-react-dom-client-shim'

	return {
		name: 'xpert-remote-component',
		setup(esbuild) {
			esbuild.onResolve({ filter: /^@xpert-ai\/shadcn-ui$/ }, () => ({
				path: join(shadcnPackageRoot, 'src', 'index.ts')
			}))
			esbuild.onResolve({ filter: /^@\// }, (args) => ({
				path: resolveSourcePath(join(shadcnPackageRoot, 'src', args.path.slice(2)))
			}))
			esbuild.onResolve({ filter: /^react$/ }, () => ({
				path: reactShimPath,
				namespace: 'xpert-global'
			}))
			esbuild.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({
				path: jsxRuntimeShimPath,
				namespace: 'xpert-global'
			}))
			esbuild.onResolve({ filter: /^react\/jsx-dev-runtime$/ }, () => ({
				path: jsxRuntimeShimPath,
				namespace: 'xpert-global'
			}))
			esbuild.onResolve({ filter: /^react-dom$/ }, () => ({
				path: reactDomShimPath,
				namespace: 'xpert-global'
			}))
			esbuild.onResolve({ filter: /^react-dom\/client$/ }, () => ({
				path: reactDomClientShimPath,
				namespace: 'xpert-global'
			}))
			esbuild.onLoad({ filter: /.*/, namespace: 'xpert-global' }, (args) => ({
				contents: getGlobalShim(args.path),
				loader: 'js'
			}))
		}
	}
}

function resolveSourcePath(path) {
	for (const candidate of [
		path,
		`${path}.ts`,
		`${path}.tsx`,
		`${path}.js`,
		`${path}.jsx`,
		join(path, 'index.ts'),
		join(path, 'index.tsx')
	]) {
		if (existsSync(candidate)) {
			return candidate
		}
	}
	return path
}

function getGlobalShim(path) {
	if (path === 'xpert-react-shim') {
		return `
const React = globalThis.React;
export default React;
export const Children = React.Children;
export const Component = React.Component;
export const Fragment = React.Fragment;
export const Profiler = React.Profiler;
export const PureComponent = React.PureComponent;
export const StrictMode = React.StrictMode;
export const Suspense = React.Suspense;
export const cloneElement = React.cloneElement;
export const createContext = React.createContext;
export const createElement = React.createElement;
export const createRef = React.createRef;
export const forwardRef = React.forwardRef;
export const isValidElement = React.isValidElement;
export const lazy = React.lazy;
export const memo = React.memo;
export const startTransition = React.startTransition;
export const useCallback = React.useCallback;
export const useContext = React.useContext;
export const useDebugValue = React.useDebugValue;
export const useDeferredValue = React.useDeferredValue;
export const useEffect = React.useEffect;
export const useId = React.useId;
export const useImperativeHandle = React.useImperativeHandle;
export const useInsertionEffect = React.useInsertionEffect;
export const useLayoutEffect = React.useLayoutEffect;
export const useMemo = React.useMemo;
export const useReducer = React.useReducer;
export const useRef = React.useRef;
export const useState = React.useState;
export const useSyncExternalStore = React.useSyncExternalStore;
export const useTransition = React.useTransition;
export const version = React.version;
`
	}

	if (path === 'xpert-react-jsx-runtime-shim') {
		return `
const React = globalThis.React;
export const Fragment = React.Fragment;
export function jsx(type, props, key) {
  return React.createElement(type, key == null ? props : { ...props, key });
}
export const jsxs = jsx;
export const jsxDEV = jsx;
`
	}

	if (path === 'xpert-react-dom-client-shim') {
		return `
const ReactDOM = globalThis.ReactDOM;
export const createRoot = ReactDOM.createRoot;
export const hydrateRoot = ReactDOM.hydrateRoot;
`
	}

	return `
const ReactDOM = globalThis.ReactDOM;
export default ReactDOM;
export const createPortal = ReactDOM.createPortal;
export const flushSync = ReactDOM.flushSync;
export const unstable_batchedUpdates = ReactDOM.unstable_batchedUpdates;
`
}

function stripTrailingWhitespace(content) {
	return content.replace(/[ \t]+$/gm, '').trimEnd() + '\n'
}
