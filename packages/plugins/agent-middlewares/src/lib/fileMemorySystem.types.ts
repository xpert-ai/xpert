import { z } from 'zod/v3'

export const FileMemorySystemIcon = `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="4" y="4" width="56" height="56" rx="10" fill="#1f3a5f"/>
  <path fill="#8fd3ff" d="M18 17h18l10 10v20a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V21a4 4 0 0 1 4-4z"/>
  <path fill="#dff4ff" d="M36 17v10h10z"/>
  <path fill="#1f3a5f" d="M21 33h22v3H21zm0 7h18v3H21z"/>
  <circle cx="23" cy="24" r="3" fill="#ffce70"/>
  <circle cx="31" cy="24" r="3" fill="#ffce70"/>
  <circle cx="39" cy="24" r="3" fill="#ffce70"/>
</svg>`

export const fileMemorySystemMiddlewareOptionsSchema = z.object({
  enableLogging: z.boolean().optional(),
  providerName: z.string().trim().min(1).default('file-memory')
})

export const fileMemorySystemStateSchema = z.object({
  fileMemorySurfacedPaths: z.array(z.string()).default([]),
  fileMemorySurfacedBytes: z.number().default(0)
})
