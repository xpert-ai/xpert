// PostgreSQL limits each lexeme to < 2 KB and positions to 16383.
export function keywordLexemes(terms: readonly string[]) {
    return terms.filter(
        (term) => typeof term === 'string' && term.length > 0 && !term.includes('\0') && Buffer.byteLength(term) < 2048
    )
}

export function quoteKeywordLexeme(term: string) {
    return `'${term.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`
}

export function keywordTsVector(terms: readonly string[]) {
    const positions = new Map<string, Set<number>>()
    keywordLexemes(terms).forEach((term, index) => {
        const values = positions.get(term) ?? new Set<number>()
        if (values.size < 256) values.add(Math.min(index + 1, 16383))
        positions.set(term, values)
    })
    return [...positions].map(([term, values]) => `${quoteKeywordLexeme(term)}:${[...values].join(',')}`).join(' ')
}

export function keywordTsQuery(terms: readonly string[]) {
    return [...new Set(keywordLexemes(terms))].slice(0, 64).map(quoteKeywordLexeme).join(' & ')
}
