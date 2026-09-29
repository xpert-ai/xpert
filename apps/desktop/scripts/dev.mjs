import { createServer } from 'vite'
import { spawn } from 'node:child_process'
import electron from 'electron'

const server = await createServer()
await server.listen()
const child = spawn(electron, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, XPERT_DESKTOP_DEV_URL: 'http://127.0.0.1:4390/' }
})
const shutdown = async () => {
  child.kill()
  await server.close()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
child.on('exit', async (code) => {
  await server.close()
  process.exit(code || 0)
})
