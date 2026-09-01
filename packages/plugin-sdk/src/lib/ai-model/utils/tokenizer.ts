import type { TiktokenEncoding, TiktokenModel } from 'js-tiktoken'
import { getEncoding, encodingForModel, getEncodingNameForModel } from 'js-tiktoken'

const encodingCache = new Map<string, ReturnType<typeof getEncoding>>()

/**
 * Fallback token estimation method.
 *
 * 思路:
 * - 英文：约 4 chars / token
 * - 中文：约 1.5 chars / token
 * - Mixed：按字符区分
 */
function estimateTokens(text: string): number {
  if (!text) return 0

  let cn = 0
  let en = 0

  for (const ch of text) {
    if (/[\u4e00-\u9fa5]/.test(ch)) {
      cn++
    } else {
      en++
    }
  }

  // 中文 1 token ≈ 1.5 chars
  const cnTokens = cn / 1.5

  // 英文 1 token ≈ 4 chars
  const enTokens = en / 4

  return Math.ceil(cnTokens + enTokens)
}

/**
 * Count tokens in text
 * 1) Preferred: js-tiktoken precise encoding
 * 2) Fallback: estimated token count
 */
export function countTokensSafe(
  text: string,
  opts?: { model?: string; encodingName?: TiktokenEncoding | string }
): number {
  if (!text) return 0

  try {
    let resolvedEncoding: string
    if (opts?.encodingName) {
      resolvedEncoding = String(opts.encodingName)
    } else if (opts?.model) {
      resolvedEncoding = getEncodingNameForModel(opts.model as TiktokenModel) ?? 'cl100k_base'
    } else {
      resolvedEncoding = 'cl100k_base'
    }

    // Prefer exact token count via js-tiktoken
    const cacheKey = opts?.model ? `model:${opts.model}` : `encoding:${resolvedEncoding}`
    let enc = encodingCache.get(cacheKey)
    if (!enc) {
      enc = opts?.model
        ? encodingForModel(opts.model as TiktokenModel)
        : getEncoding(resolvedEncoding as TiktokenEncoding)
      encodingCache.set(cacheKey, enc)
    }

    const tokens = enc.encode(text)
    return tokens.length
  } catch {
    // Provider-specific model names are not always known by js-tiktoken.
    return estimateTokens(text)
  }
}
