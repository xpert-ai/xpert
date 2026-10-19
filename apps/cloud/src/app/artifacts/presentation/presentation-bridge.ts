import { z } from 'zod'

const base = z.object({
  channel: z.literal('xpertai.remote_component'),
  protocolVersion: z.literal(1),
  instanceId: z.string().optional()
})
export const presentationMessage = z.discriminatedUnion('type', [
  base.extend({ type: z.literal('ready') }),
  base.extend({ type: z.literal('requestData'), requestId: z.string().min(1).max(128) }),
  base.extend({
    type: z.literal('executeAction'),
    requestId: z.string().min(1).max(128),
    actionKey: z.string().min(1).max(80),
    input: z.record(z.unknown())
  })
])

/** Remote code has no network or navigation authority; its only transport is the parent bridge. */
export function isolatePresentationHtml(html: string) {
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src about: blob:; object-src 'none'; base-uri 'none'; form-action 'none'">`
  if (!/<head(?:\s[^>]*)?>/i.test(html)) throw new Error('Invalid presentation entry')
  return html.replace(/<head(?:\s[^>]*)?>/i, (head) => head + policy)
}
