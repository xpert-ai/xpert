import { json } from 'express'

export const MCP_PUBLICATION_MAX_BODY_BYTES = 4 * 1024 * 1024

export function createMcpPublicationJsonBodyParser() {
  return json({ limit: MCP_PUBLICATION_MAX_BODY_BYTES })
}
