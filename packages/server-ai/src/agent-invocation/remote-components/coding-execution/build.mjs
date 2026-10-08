import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { prependBrandIconLicense } from '../../../../scripts/build-remote-react.mjs'
const root = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(process.cwd(), 'package.json'))
const result = await build({
    entryPoints: [join(root, 'src/main.ts')],
    outfile: join(root, 'app.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    // The shadcn workspace can have a different peer layout; use one React runtime in this module iframe.
    alias: {
        react: dirname(require.resolve('react/package.json')),
        'react-dom': dirname(require.resolve('react-dom/package.json'))
    },
    loader: { '.svg': 'text' },
    banner: { js: ';' },
    metafile: true,
    minify: true,
    legalComments: 'none'
})
prependBrandIconLicense(result.metafile, join(root, 'app.js'), process.cwd())
execFileSync(
    join(process.cwd(), 'node_modules/.bin/tailwindcss'),
    ['-i', join(root, 'tailwind.css'), '-o', join(root, 'app.css'), '--minify'],
    { stdio: 'inherit' }
)
