/// <reference lib="es2022.intl" />
import type { KnowledgeChunkLanguage } from '@xpert-ai/contracts'

export interface TextRange {
    start: number
    end: number
}

const segmenters = new Map<KnowledgeChunkLanguage, Intl.Segmenter>()

/** CJK prose punctuation ends a bare URL; Han characters remain valid in hosts and paths. */
export const LANGUAGE_URL_PATTERN =
    /(?:https?:\/\/|www\.)[^\s<>\u3002\uff01\uff1f\uff1b\uff0c\u3001\u201c\u201d\u2018\u2019\uff08\uff09]+/g

const protectedTextPattern = new RegExp(
    [
        /(`+)[\s\S]*?\1|\$[^$\n]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|!?\[[^\]\n]*\]\([^\)\n]*\)/.source,
        LANGUAGE_URL_PATTERN.source
    ].join('|'),
    'g'
)

/** Sentence boundaries are suggestions; callers retain character/token limits and structural ownership. */
export function sentenceRanges(text: string, language: KnowledgeChunkLanguage): TextRange[] {
    const ends = new Set<number>()
    if (typeof Intl.Segmenter === 'function') {
        let segmenter = segmenters.get(language)
        if (!segmenter) {
            segmenter = new Intl.Segmenter(language === 'Chinese' ? 'zh' : 'en', { granularity: 'sentence' })
            segmenters.set(language, segmenter)
        }
        for (const segment of segmenter.segment(text)) ends.add(segment.index + segment.segment.length)
    } else {
        for (const match of text.matchAll(/[.!?]+(?:["')\]]*)(?:\s+|$)/g)) ends.add(match.index + match[0].length)
    }
    if (language !== 'English') {
        for (const match of text.matchAll(/[\u3002\uff01\uff1f\uff1b;]+[\u201d\u2019\u300d\u300f"')\]]*/g)) {
            ends.add(match.index + match[0].length)
        }
    }
    // Do not introduce a language boundary inside inline code, math, links, or URLs.
    const protectedRanges = [...text.matchAll(protectedTextPattern)].map((match) => ({
        start: match.index,
        end: match.index + match[0].length
    }))
    const result: TextRange[] = []
    let start = 0
    let protectedIndex = 0
    ends.add(text.length)
    for (const end of [...ends].sort((a, b) => a - b)) {
        while (protectedRanges[protectedIndex]?.end <= end) protectedIndex++
        const protectedRange = protectedRanges[protectedIndex]
        if (protectedRange && protectedRange.start < end && end < protectedRange.end) continue
        if (end > start) result.push({ start, end })
        start = end
    }
    return result
}
