import { IKnowledgeDocument, resolveI18nText } from '@xpert-ai/contracts'

// These execution IDs predate parserLabel snapshots and remain valid after plugin removal.
const legacyParserLabels: Record<string, { en_US: string; zh_Hans: string }> = {
  mineru: { en_US: 'MinerU', zh_Hans: 'MinerU' },
  'baidu-paddleocr-vl': { en_US: 'Baidu PaddleOCR-VL', zh_Hans: '百度 PaddleOCR-VL' },
  'baidu-unlimited-ocr': { en_US: 'Baidu Unlimited-OCR', zh_Hans: '百度 Unlimited-OCR' }
}

/** Display execution evidence, never the current (possibly not yet executed) parser settings. */
export function documentParserLabel(
  document: Partial<IKnowledgeDocument>,
  language: string,
  builtinLabel: string,
  missingLabel: string
): string {
  const metadata = document.metadata
  const analysis = metadata?.documentAnalysis
  const snapshot = metadata?.analysisSnapshot
  const recorded = metadata?.parser
  const provider =
    recorded ?? analysis?.provider ?? snapshot?.provider ?? metadata?.transformSnapshot?.transformer?.provider
  if (!provider) return missingLabel
  if (['builtin', 'default', 'pdf-visual'].includes(provider)) return builtinLabel
  const savedLabel = recorded && resolveI18nText(metadata.parserLabel, language)?.trim()
  if (savedLabel) return savedLabel
  const legacyLabel = resolveI18nText(legacyParserLabels[provider], language)
  if (legacyLabel) return legacyLabel
  const evidence = analysis?.engine ? analysis : snapshot
  // An unknown historical plugin still has execution evidence; retain its ID as the last resort.
  return evidence?.engine ? [evidence.provider ?? provider, evidence.engine].join(' · ') : provider
}
