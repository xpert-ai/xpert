/**
 * Invariants: scripts cannot control the executor's transaction/session.
 * This lexer recognizes PostgreSQL strings/comments, including dollar-quoted bodies.
 * It is a host-script guard, never an authorization boundary for untrusted plugin SQL.
 */
export function sqlStatements(sql: string): string[][] {
	const statements: string[][] = [[]]
	let i = 0
	while (i < sql.length) {
		const rest = sql.slice(i)
		if (/^\s/.test(rest)) {
			i++
			continue
		}
		if (rest.startsWith('--')) {
			const end = sql.indexOf('\n', i)
			i = end < 0 ? sql.length : end + 1
		} else if (rest.startsWith('/*')) {
			i += 2
			let depth = 1
			while (i < sql.length && depth) {
				if (sql.slice(i, i + 2) === '/*') {
					depth++
					i += 2
				} else if (sql.slice(i, i + 2) === '*/') {
					depth--
					i += 2
				} else i++
			}
			if (depth) throw new Error('INVALID_SQL')
		} else if (rest[0] === "'" || rest[0] === '"') {
			const quote = rest[0]
			const escaped = quote === "'" && i > 0 && /[eE]/.test(sql[i - 1])
			i++
			let closed = false
			while (i < sql.length) {
				if (escaped && sql[i] === '\\') i += 2
				else if (sql[i] === quote) {
					i++
					if (sql[i] === quote) i++
					else {
						closed = true
						break
					}
				} else i++
			}
			if (!closed) throw new Error('INVALID_SQL')
			statements.at(-1)!.push('<quoted>')
		} else if (/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/.test(rest)) {
			const delimiter = /^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/.exec(rest)![0]
			const end = sql.indexOf(delimiter, i + delimiter.length)
			if (end < 0) throw new Error('INVALID_SQL')
			i = end + delimiter.length
			statements.at(-1)!.push('<body>')
		} else if (rest[0] === ';') {
			statements.push([])
			i++
		} else {
			const token = /^[A-Za-z_][A-Za-z_0-9$]*/.exec(rest)?.[0] ?? rest[0]
			statements.at(-1)!.push(token.toUpperCase())
			i += token.length
		}
	}
	return statements.filter((tokens) => tokens.length)
}

export function validateSql(sql: string, readOnly = false): void {
	const statements = sqlStatements(sql)
	if (!statements.length) throw new Error('EMPTY_SQL')
	for (const tokens of statements) {
		if (readOnly && (statements.length !== 1 || !['SELECT', 'WITH'].includes(tokens[0]))) {
			throw new Error('INVALID_VERIFICATION_SQL')
		}
		if (
			[
				'BEGIN',
				'START',
				'COMMIT',
				'END',
				'ROLLBACK',
				'ABORT',
				'SAVEPOINT',
				'RELEASE',
				'PREPARE',
				'SET',
				'RESET',
				'DISCARD',
				'VACUUM',
				'CALL',
				'\\'
			].includes(tokens[0]) ||
			tokens.includes('CONCURRENTLY')
		) {
			throw new Error('UNSUPPORTED_TRANSACTION_CONTROL')
		}
	}
}
