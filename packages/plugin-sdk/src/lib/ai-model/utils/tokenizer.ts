import type { TiktokenEncoding, TiktokenModel } from 'js-tiktoken'
import { getEncoding, encodingForModel, getEncodingNameForModel } from 'js-tiktoken'

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

  let resolvedEncoding: string

  // Decide encoding name
  if (opts?.encodingName) {
    resolvedEncoding = String(opts.encodingName)
  } else if (opts?.model) {
    resolvedEncoding = getEncodingNameForModel(opts.model as TiktokenModel) ?? 'cl100k_base'
  } else {
    resolvedEncoding = 'cl100k_base'
  }

  try {
    // Prefer exact token count via js-tiktoken
    const enc = opts?.model
      ? encodingForModel(opts.model as TiktokenModel)
      : getEncoding(resolvedEncoding as TiktokenEncoding)

    const tokens = enc.encode(text)
    return tokens.length
  } catch (e) {
    // Fallback
    console.warn('[countTokensSafe] tiktoken failed, fallback estimate', e)
    return estimateTokens(text)
  }
}
