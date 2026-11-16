import crypto from 'node:crypto'
import { MAX_PLUGIN_ZIP_BYTES } from '../electron/plugin-archive.mjs'
import { createRequire } from 'node:module'
// Keep the Node host outside Vite's ESM configuration bundle.
const require = createRequire(import.meta.url)
const { DesktopService } = require('../electron/service.cjs')
const { connectionDefaults } = require('../electron/connection/defaults.cjs')
const { dispatch } = require('../electron/dispatch.cjs')

// Browser preview only: each HttpOnly cookie owns an isolated, in-memory host session.
export function desktopBridge() {
  const sessions = new Map()
  return {
    name: 'xpert-desktop-development-bridge',
    configureServer(server) {
      const defaultConfig = connectionDefaults()
      server.httpServer?.once('close', () => {
        for (const { service } of sessions.values()) service.userNotifications.stop()
      })
      server.middlewares.use('/__desktop', async (req, res) => {
        const origin = `http://${req.headers.host}`
        const port = server.config.server.port
        const zipUpload = req.url?.split('?')[0] === '/plugin-zip'
        if (
          req.headers.host !== `127.0.0.1:${port}` ||
          req.headers.origin !== origin ||
          req.method !== 'POST' ||
          req.headers['content-type'] !== (zipUpload ? 'application/zip' : 'application/json')
        ) {
          res.writeHead(403).end()
          return
        }
        try {
          let id = /(?:^|; )xpert-desktop=([^;]+)/.exec(req.headers.cookie || '')?.[1]
          if (!id || !sessions.has(id)) {
            id = crypto.randomUUID()
            const localLogin =
              process.env.XPERT_DESKTOP_LOCAL_LOGIN === '1'
                ? (await import('./local-credentials.mjs')).readLocalCredentials
                : undefined
            const systemLanguages = (req.headers['accept-language'] || '')
              .split(',')
              .map((value) => value.split(';')[0].trim())
            sessions.set(id, {
              service: new DesktopService({ localLogin, defaultConfig, systemLanguages }),
              touched: Date.now()
            })
            res.setHeader('Set-Cookie', `xpert-desktop=${id}; HttpOnly; SameSite=Strict; Path=/__desktop`)
          }
          const current = sessions.get(id)
          current.touched = Date.now()
          for (const [key, item] of sessions)
            if (Date.now() - item.touched > 86400000) {
              item.service.userNotifications.stop()
              sessions.delete(key)
            }
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          let command
          if (zipUpload) {
            const organizationId = new URL(req.url, origin).searchParams.get('organizationId')
            if (!current.service.profile?.organizationId || current.service.profile.organizationId !== organizationId) {
              res.end(
                JSON.stringify({
                  ok: false,
                  status: 409,
                  message: 'The organization changed. Select an assistant again.'
                })
              )
              return
            }
            const chunks = []
            let size = 0
            for await (const chunk of req) {
              size += chunk.length
              if (size > MAX_PLUGIN_ZIP_BYTES) {
                res.end(
                  JSON.stringify({ ok: false, status: 413, message: 'The ZIP package exceeds the 100 MiB limit.' })
                )
                return
              }
              chunks.push(chunk)
            }
            command = {
              method: 'installOrganizationPluginZip',
              argument: { organizationId, bytes: Buffer.concat(chunks, size) }
            }
          } else {
            let input = ''
            for await (const chunk of req) {
              input += chunk
              if (input.length > 16384) throw new Error('Request too large')
            }
            command = JSON.parse(input)
          }
          res.end(JSON.stringify(await dispatch(current.service, command.method, command.argument)))
        } catch {
          res.writeHead(400).end(JSON.stringify({ ok: false, message: 'Invalid request.', status: 400 }))
        }
      })
    }
  }
}
