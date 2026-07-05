import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = findWorkspaceRoot(root)
const sourcePath = join(root, 'src', 'main.tsx')
const scriptTargetPath = join(root, 'app.js')
const cssSourcePath = join(root, 'tailwind.css')
const cssTargetPath = join(root, 'app.css')
const shadcnPackageRoot = join(workspaceRoot, 'packages', 'shadcn-ui')

await build({
    entryPoints: [sourcePath],
    outfile: scriptTargetPath,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    jsx: 'automatic',
    minify: true,
    legalComments: 'none',
    define: {
        'process.env.NODE_ENV': '"production"'
    },
    plugins: [xpertRemoteComponentPlugin()]
})

execFileSync(resolveLocalBin(workspaceRoot, 'tailwindcss'), ['-i', cssSourcePath, '-o', cssTargetPath, '--minify'], {
    cwd: workspaceRoot,
    stdio: 'inherit'
})

stripTrailingWhitespace(scriptTargetPath)
stripTrailingWhitespace(cssTargetPath)

function findWorkspaceRoot(startDir) {
    let current = startDir
    while (current !== dirname(current)) {
        if (existsSync(join(current, 'pnpm-workspace.yaml'))) {
            return current
        }
        current = dirname(current)
    }
    return resolve(startDir)
}

function resolveLocalBin(workspaceRoot, name) {
    // Use the already-installed binary directly; pnpm exec can trigger install-time side effects in this repo.
    const executable = process.platform === 'win32' ? `${name}.cmd` : name
    const binPath = join(workspaceRoot, 'node_modules', '.bin', executable)
    if (!existsSync(binPath)) {
        throw new Error(`Missing local binary '${name}'. Run pnpm install before building remote components.`)
    }
    return binPath
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

function stripTrailingWhitespace(path) {
    const content = readFileSync(path, 'utf8')
    writeFileSync(path, content.replace(/[ \t]+$/gm, ''))
}
