import type { IncomingMessage, ServerResponse } from 'node:http'

/** Keep bounded raw bytes for HMAC verification. Consumers must authenticate them before parsing or routing. */
export function captureSignedJsonBody(
  request: IncomingMessage & { rawBody?: Buffer },
  _response: ServerResponse,
  buffer: Buffer
) {
  if (request.headers['x-hub-signature-256'] && buffer.length <= 2 * 1024 * 1024) request.rawBody = Buffer.from(buffer)
}
