import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = findWorkspaceRoot(root)
const shadcnPackageRoot = join(workspaceRoot, 'packages', 'shadcn-ui')

await build({
    entryPoints: [join(root, 'src', 'main.tsx')],
    outfile: join(root, 'app.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    jsx: 'automatic',
    minify: true,
    legalComments: 'none',
    banner: { js: ';' },
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [remoteComponentPlugin()]
})

execFileSync(
    resolveLocalBin(workspaceRoot, 'tailwindcss'),
    ['-i', join(root, 'tailwind.css'), '-o', join(root, 'app.css'), '--minify'],
    {
        cwd: workspaceRoot,
        stdio: 'inherit'
    }
)
stripTrailingWhitespace(join(root, 'app.js'))
stripTrailingWhitespace(join(root, 'app.css'))

function remoteComponentPlugin() {
    return {
        name: 'xpert-agent-evolution-remote',
        setup(esbuild) {
            esbuild.onResolve({ filter: /^@xpert-ai\/shadcn-ui$/ }, () => ({
                path: join(shadcnPackageRoot, 'src', 'index.ts')
            }))
            esbuild.onResolve({ filter: /^@\// }, (args) => ({
                path: resolveSourcePath(join(shadcnPackageRoot, 'src', args.path.slice(2)))
            }))
            const globals = new Map([
                ['react', 'react'],
                ['react/jsx-runtime', 'jsx-runtime'],
                ['react/jsx-dev-runtime', 'jsx-runtime'],
                ['react-dom', 'react-dom'],
                ['react-dom/client', 'react-dom-client']
            ])
            esbuild.onResolve({ filter: /^react(?:-dom)?(?:\/.*)?$/ }, (args) => ({
                path: globals.get(args.path) ?? args.path,
                namespace: 'xpert-global'
            }))
            esbuild.onLoad({ filter: /.*/, namespace: 'xpert-global' }, (args) => ({
                contents: globalShim(args.path),
                loader: 'js'
            }))
        }
    }
}

function globalShim(path) {
    if (path === 'jsx-runtime')
        return 'const R=globalThis.React;export const Fragment=R.Fragment;export function jsx(t,p,k){return R.createElement(t,k==null?p:{...p,key:k})}export const jsxs=jsx;export const jsxDEV=jsx;'
    if (path === 'react-dom-client')
        return 'const R=globalThis.ReactDOM;export const createRoot=R.createRoot;export const hydrateRoot=R.hydrateRoot;'
    if (path === 'react-dom')
        return 'const R=globalThis.ReactDOM;export default R;export const createPortal=R.createPortal;export const flushSync=R.flushSync;'
    return `const R=globalThis.React;export default R;export const Children=R.Children;export const Component=R.Component;export const Fragment=R.Fragment;export const Profiler=R.Profiler;export const PureComponent=R.PureComponent;export const StrictMode=R.StrictMode;export const Suspense=R.Suspense;export const cloneElement=R.cloneElement;export const createContext=R.createContext;export const createElement=R.createElement;export const createRef=R.createRef;export const forwardRef=R.forwardRef;export const isValidElement=R.isValidElement;export const lazy=R.lazy;export const memo=R.memo;export const startTransition=R.startTransition;export const useCallback=R.useCallback;export const useContext=R.useContext;export const useDebugValue=R.useDebugValue;export const useDeferredValue=R.useDeferredValue;export const useEffect=R.useEffect;export const useId=R.useId;export const useImperativeHandle=R.useImperativeHandle;export const useInsertionEffect=R.useInsertionEffect;export const useLayoutEffect=R.useLayoutEffect;export const useMemo=R.useMemo;export const useReducer=R.useReducer;export const useRef=R.useRef;export const useState=R.useState;export const useSyncExternalStore=R.useSyncExternalStore;export const useTransition=R.useTransition;export const version=R.version;`
}

function findWorkspaceRoot(startDir) {
    let current = startDir
    while (current !== dirname(current)) {
        if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current
        current = dirname(current)
    }
    return resolve(startDir)
}

function resolveLocalBin(workspaceRoot, name) {
    const executable = process.platform === 'win32' ? `${name}.cmd` : name
    const path = join(workspaceRoot, 'node_modules', '.bin', executable)
    if (!existsSync(path))
        throw new Error(`Missing local binary '${name}'. Run pnpm install before building remote components.`)
    return path
}

function resolveSourcePath(path) {
    for (const candidate of [path, `${path}.ts`, `${path}.tsx`, join(path, 'index.ts'), join(path, 'index.tsx')]) {
        if (existsSync(candidate)) return candidate
    }
    return path
}

function stripTrailingWhitespace(path) {
    writeFileSync(path, readFileSync(path, 'utf8').replace(/[ \t]+$/gm, ''))
}
