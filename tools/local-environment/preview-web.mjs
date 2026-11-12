// Development preview only. Reuse Angular's locked Vite and the existing proxy
// contract without keeping Angular's compiler, watchers or prebundler resident.
import { access } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const angularRequire = createRequire(require.resolve('@angular/build/package.json'))

export async function startPreview({ directory, port, proxy }) {
  await access(path.join(directory, 'index.html'))
  const { preview } = await import(pathToFileURL(angularRequire.resolve('vite')).href)
  return preview({
    configFile: false,
    envFile: false,
    appType: 'spa',
    build: { outDir: directory },
    preview: { host: '127.0.0.1', port, strictPort: true, proxy }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.argv[2])
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('An unprivileged Web port is required')
  }
  const server = await startPreview({
    directory: path.resolve('dist/apps/cloud/browser'),
    port,
    proxy: require(path.resolve('apps/cloud/proxy.conf.cjs'))
  })
  server.printUrls()
}
