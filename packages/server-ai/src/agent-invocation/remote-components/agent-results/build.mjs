import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
const root = dirname(fileURLToPath(import.meta.url))
await build({
    entryPoints: [join(root, 'src/main.ts')],
    outfile: join(root, 'app.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    minify: true,
    legalComments: 'none'
})
execFileSync(
    join(process.cwd(), 'node_modules/.bin/tailwindcss'),
    ['-i', join(root, 'tailwind.css'), '-o', join(root, 'app.css'), '--minify'],
    { stdio: 'inherit' }
)
