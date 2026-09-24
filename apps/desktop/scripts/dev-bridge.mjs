import crypto from 'node:crypto'
import { DesktopService } from '../electron/service.cjs'
import { dispatch } from '../electron/dispatch.cjs'

// Browser preview only: each HttpOnly cookie owns an isolated, in-memory host session.
export function desktopBridge() {
  const sessions = new Map()
  return {
    name: 'xpert-desktop-development-bridge',
    configureServer(server) {
      server.middlewares.use('/__desktop', async (req, res) => {
        const origin = `http://${req.headers.host}`
        const port = server.config.server.port
        if (
          req.headers.host !== `127.0.0.1:${port}` ||
          req.headers.origin !== origin ||
          req.method !== 'POST' ||
          req.headers['content-type'] !== 'application/json'
        ) {
          res.writeHead(403).end()
          return
        }
        try {
          let input = ''
          for await (const chunk of req) {
            input += chunk
            if (input.length > 16384) throw new Error('Request too large')
          }
          const { method, argument } = JSON.parse(input)
          let id = /(?:^|; )xpert-desktop=([^;]+)/.exec(req.headers.cookie || '')?.[1]
          if (!id || !sessions.has(id)) {
            id = crypto.randomUUID()
            const localLogin =
              process.env.XPERT_DESKTOP_LOCAL_LOGIN === '1'
                ? (await import('./local-credentials.mjs')).readLocalCredentials
                : undefined
            sessions.set(id, { service: new DesktopService({ localLogin }), touched: Date.now() })
            res.setHeader('Set-Cookie', `xpert-desktop=${id}; HttpOnly; SameSite=Strict; Path=/__desktop`)
          }
          const current = sessions.get(id)
          current.touched = Date.now()
          for (const [key, item] of sessions) if (Date.now() - item.touched > 86400000) sessions.delete(key)
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify(await dispatch(current.service, method, argument)))
        } catch {
          res.writeHead(400).end(JSON.stringify({ ok: false, message: 'Invalid request.', status: 400 }))
        }
      })
    }
  }
}
