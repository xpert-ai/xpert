import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { Injectable, Logger } from '@nestjs/common'
import z from 'zod'
import { MemoryRecallPlanner, MemoryRecordHeader } from './types'

const MEMORY_SELECTOR_SYSTEM_PROMPT = `You are selecting file-based memories for an AI agent runtime.

You will receive:
- the user's current query
- a manifest of available memory files, each with id, kind, title, layer, tags, summary, and update time
- an optional list of recently used tools

Return a JSON object with a "selectedIds" array containing up to 5 memory ids that are clearly useful for this query.
- Be selective. If a memory is only weakly related, leave it out.
- Prefer memories that clarify user preferences, shared business rules, standard replies, and domain-specific meanings.
- Prefer user-private memories over shared memories when both are relevant.
- Do not select frozen or archived memories.
- Do not select usage-reference memories for tools that are already active in the current loop unless the memory contains warnings, gotchas, or known issues.
- It is valid to return an empty list.
- Your final answer must be valid JSON.`

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  return typeof error === 'string' ? error : JSON.stringify(error)
}

@Injectable()
export class DefaultMemoryRecallPlanner implements MemoryRecallPlanner {
  readonly #logger = new Logger(DefaultMemoryRecallPlanner.name)

  async selectRecallHeaders(
    query: string,
    headers: MemoryRecordHeader[],
    chatModel?: BaseChatModel | null,
    options: {
      limit?: number
      recentTools?: readonly string[]
      alreadySurfaced?: ReadonlySet<string>
    } = {}
  ): Promise<MemoryRecordHeader[]> {
    const limit = options.limit ?? 5
    const candidateHeaders = (headers ?? []).filter((header) => !options.alreadySurfaced?.has(header.filePath))
    if (!candidateHeaders.length) {
      return []
    }

    if (!chatModel) {
      return this.selectRecallHeadersFallback(query, candidateHeaders, limit)
    }

    const schema = z.object({
      selectedIds: z.array(z.string()).default([])
    })
    const manifest = candidateHeaders.map((header) => formatManifestLine(header)).join('\n')
    const toolsSection = options.recentTools?.length ? `\n\nRecently used tools: ${options.recentTools.join(', ')}` : ''

    try {
      const result = await chatModel.withStructuredOutput(schema).invoke([
        {
          role: 'system',
          content: MEMORY_SELECTOR_SYSTEM_PROMPT
        },
        {
          role: 'human',
          content: `Query: ${query}\n\nAvailable memories:\n${manifest}${toolsSection}\n\nRespond with JSON only, for example: {"selectedIds":["memory-1"]}`
        }
      ])
      const selected = new Set((result['selectedIds'] ?? []).slice(0, limit))
      const headersById = new Map(candidateHeaders.map((header) => [header.id, header]))
      const matches = Array.from(selected)
        .map((id) => headersById.get(String(id)))
        .filter(Boolean)

      if (matches.length) {
        return matches
      }
    } catch (err) {
      this.#logger.warn(`Memory recall selector failed: ${getErrorMessage(err)}`)
    }

    return this.selectRecallHeadersFallback(query, candidateHeaders, limit)
  }

  private selectRecallHeadersFallback(query: string, headers: MemoryRecordHeader[], limit = 5) {
    return headers
      .map((header) => ({
        header,
        score: scoreHeader(header, query)
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || toTime(b.header.updatedAt) - toTime(a.header.updatedAt))
      .slice(0, limit)
      .map((item) => item.header)
  }
}

function scoreHeader(header: MemoryRecordHeader, query: string) {
  const titleScore = scoreText(query, header.title)
  const summaryScore = scoreText(query, header.summary)
  const tagScore = scoreText(query, normalizeTags(header.tags).join(' '))
  const exactTitle = includesNormalized(header.title, query) ? 0.2 : 0
  const layerBoost = header.audience === 'user' ? 0.05 : 0
  return Number(
    Math.min(1, titleScore * 0.5 + summaryScore * 0.25 + tagScore * 0.15 + exactTitle + layerBoost).toFixed(4)
  )
}

function formatManifestLine(header: MemoryRecordHeader) {
  const tags = normalizeTags(header.tags)
  const tagPart = tags.length ? ` tags=[${tags.join(', ')}]` : ''
  const summaryPart = header.summary ? ` summary="${header.summary}"` : ''
  const ownerPart = header.ownerUserId ? ` ownerUserId=${header.ownerUserId}` : ''
  return `- id=${header.id} kind=${header.kind} layer="${header.layerLabel}" audience=${header.audience}${ownerPart} title="${header.title}" updatedAt=${header.updatedAt}${tagPart}${summaryPart}`
}

function normalizeTags(tags?: string[] | null) {
  return Array.from(
    new Set(
      (tags ?? [])
        .filter(Boolean)
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  )
}

function tokenize(value?: string | null) {
  const chunks = (value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)

  const tokens = new Set<string>()
  for (const chunk of chunks) {
    if (chunk.length > 1) {
      tokens.add(chunk)
    }

    if (containsHan(chunk)) {
      const chars = Array.from(chunk).filter(Boolean)
      for (const char of chars) {
        if (containsHan(char)) {
          tokens.add(char)
        }
      }
      for (let size = 2; size <= Math.min(4, chars.length); size++) {
        for (let index = 0; index <= chars.length - size; index++) {
          tokens.add(chars.slice(index, index + size).join(''))
        }
      }
    }
  }

  return tokens
}

function scoreText(query: string, text?: string | null) {
  const queryTokens = Array.from(tokenize(query))
  if (!queryTokens.length) {
    return 0
  }
  const textTokens = tokenize(text)
  if (!textTokens.size) {
    return 0
  }
  let matched = 0
  queryTokens.forEach((token) => {
    if (textTokens.has(token)) {
      matched += 1
    }
  })
  const ratio = matched / queryTokens.length
  const exact = includesNormalized(text, query) ? 0.2 : 0
  return Math.min(1, ratio + exact)
}

function includesNormalized(text?: string | null, query?: string | null) {
  const left = (text ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
  const right = (query ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
  return !!left && !!right && left.includes(right)
}

function containsHan(value: string) {
  return /\p{Script=Han}/u.test(value)
}

function toTime(value?: string | Date | null) {
  if (!value) {
    return 0
  }
  return new Date(value).getTime()
}
