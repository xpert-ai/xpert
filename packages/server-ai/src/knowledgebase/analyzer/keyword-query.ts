import { t } from 'i18next'
import { keywordLexemes, quoteKeywordLexeme } from './keyword-lexemes'

// Bound tsquery size, including the disjunctions used to omit one ordinary group.
const MAX_QUERY_LEXEMES = 64
const MIN_RELAXED_ORDINARY_GROUPS = 2
// Omitting one group expands quadratically; longer queries remain strict.
const MAX_RELAXED_QUERY_GROUPS = 12

export type KeywordQueryPlan = {
    strict: string
    relaxed?: string
    /** Independent lexical groups, used for coverage ranking. */
    groups: string[]
}

/** Inspect casing before normalization; separate Latin identifiers from adjacent CJK prose. */
export function keywordIdentifiers(text: string): string[] {
    return [
        ...new Set(text.normalize('NFKC').match(/[\p{Script=Latin}\p{N}][\p{Script=Latin}\p{M}\p{N}_.:-]*/gu) ?? [])
    ].filter((token) => /[\p{N}_-]/u.test(token) || /\p{Ll}\p{Lu}|\p{Lu}{2}/u.test(token))
}

function conjunction(groups: string[]) {
    return groups.map((group) => `(${group})`).join(' & ')
}

/** Find a complete decomposition, never infer that a mere substring is equivalent. */
function decompose(term: string, terms: readonly string[]): string[] | undefined {
    const paths = new Map<number, string[]>([[0, []]])
    for (let offset = 0; offset < term.length; offset++) {
        const path = paths.get(offset)
        if (!path) continue
        for (const part of terms) {
            if (part.length < term.length && term.startsWith(part, offset) && !paths.has(offset + part.length)) {
                paths.set(offset + part.length, [...path, part])
            }
        }
    }
    return paths.get(term.length)
}

export function keywordQueryPlan(
    terms: readonly string[],
    identifierTerms: readonly (readonly string[])[] = []
): KeywordQueryPlan {
    const unique = [...new Set(keywordLexemes(terms))]
    const identifiers = identifierTerms.map(keywordLexemes)
    if (identifiers.some((items) => !items.length)) return { strict: '', groups: [] }
    const protectedTerms = new Set(identifiers.flat())
    // Never silently truncate a protected identifier or build an unbounded tsquery.
    if (new Set([...unique, ...protectedTerms]).size > MAX_QUERY_LEXEMES) {
        throw new RangeError(
            t('server-ai:Error.KeywordQueryTooManyTerms', {
                defaultValue: 'Keyword queries support at most 64 independent lexemes.'
            })
        )
    }
    const ordinary = unique.filter((term) => !protectedTerms.has(term))
    const consumed = new Set<string>()
    const groups: string[] = []
    for (const term of [...ordinary].sort((left, right) => right.length - left.length)) {
        if (consumed.has(term)) continue
        const parts = decompose(
            term,
            ordinary.filter((item) => !consumed.has(item))
        )
        groups.push(
            parts
                ? `(${quoteKeywordLexeme(term)} | (${parts.map(quoteKeywordLexeme).join(' & ')}))`
                : quoteKeywordLexeme(term)
        )
        consumed.add(term)
        parts?.forEach((part) => consumed.add(part))
    }
    // Analyzer tokenization may split identifiers; preserve every token and its order.
    const required = identifiers.map((items) => items.map(quoteKeywordLexeme).join(' <-> '))
    const allGroups = [...required, ...groups]
    const strict = conjunction(allGroups)
    // A protected identifier alone is useful; a single ordinary word is not a relaxed query.
    const canRelax =
        groups.length > 0 &&
        allGroups.length <= MAX_RELAXED_QUERY_GROUPS &&
        (required.length > 0 || groups.length > MIN_RELAXED_ORDINARY_GROUPS)
    const relaxed = canRelax
        ? groups
              .map(
                  (_group, omitted) => `(${conjunction([...required, ...groups.filter((_item, i) => i !== omitted)])})`
              )
              .join(' | ')
        : undefined
    return { strict, relaxed, groups: allGroups }
}
