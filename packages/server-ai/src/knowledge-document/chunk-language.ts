import type { DocumentInterface } from '@langchain/core/documents'
import type { KnowledgeChunkLanguage, KnowledgeChunkLanguageDetection } from '@xpert-ai/contracts'
import type { ChunkMetadata } from '@xpert-ai/plugin-sdk'
import { naturalLanguageUnits } from '../knowledgebase/plugins/textsplitter-common/structured-document'
import { LANGUAGE_URL_PATTERN, sentenceRanges } from '../knowledgebase/plugins/textsplitter-common/language-boundaries'

/** At most 32 KiB UTF-16 / 48 KiB UTF-8, including skipped Markdown syntax. No full-document copy or scan. */
export const LANGUAGE_SAMPLE_CODE_UNITS = 16 * 1024

export function detectChunkLanguage(
    documents: Iterable<DocumentInterface<ChunkMetadata>>
): KnowledgeChunkLanguageDetection {
    const votes = { Chinese: 0, English: 0, Mixed: 0 }
    let sampledCodeUnits = 0
    for (const document of documents) {
        if (sampledCodeUnits >= LANGUAGE_SAMPLE_CODE_UNITS) break
        if (document.metadata.mediaType && document.metadata.mediaType !== 'text') continue
        const layout = document.metadata.documentLayout
        if (layout && layout.type !== 'text' && layout.type !== 'title') continue
        let end = Math.min(document.pageContent.length, LANGUAGE_SAMPLE_CODE_UNITS - sampledCodeUnits)
        if (end < document.pageContent.length && /[\uD800-\uDBFF]/.test(document.pageContent[end - 1] ?? '')) end--
        const text = document.pageContent.slice(0, end)
        sampledCodeUnits += end
        for (const unit of naturalLanguageUnits({ pageContent: text, metadata: document.metadata })) {
            const natural = unit
                .replace(LANGUAGE_URL_PATTERN, ' ')
                .replace(/\b[\w.+-]+@[\w.-]+\.\w+\b|\$[^$\n]*\$|\\\([\s\S]*?\\\)/g, ' ')
            for (const range of sentenceRanges(natural, 'Mixed')) {
                const language = classifyNaturalUnit(natural.slice(range.start, range.end))
                if (language) votes[language]++
            }
        }
    }
    const naturalUnits = votes.Chinese + votes.English + votes.Mixed
    const detectedLanguage = !naturalUnits
        ? undefined
        : votes.Chinese / naturalUnits >= 0.8
          ? 'Chinese'
          : votes.English / naturalUnits >= 0.8
            ? 'English'
            : 'Mixed'
    return { detectedLanguage, sampledCodeUnits, naturalUnits }
}

function classifyNaturalUnit(text: string): KnowledgeChunkLanguage | undefined {
    const han = [...text.matchAll(/\p{Script=Han}/gu)].length
    const latin = [...text.matchAll(/\p{Script=Latin}+/gu)].map((match) => match[0])
    if (!han) return latin.length ? 'English' : undefined
    if (!latin.length) return 'Chinese'
    // Compare Han characters to Latin words, not letters. Short uppercase terms are neutral inside Chinese prose.
    const words = latin.filter((word) => !/^[A-Z]{2,8}$/.test(word)).length
    const chineseShare = han / (han + words)
    return chineseShare >= 0.7 ? 'Chinese' : chineseShare <= 0.2 ? 'English' : 'Mixed'
}
