import {
	BaseStore,
	GetOperation,
	OperationResults,
	PutOperation,
	SearchOperation,
	type Operation
} from '@langchain/langgraph'
import { IndexConfig } from '@langchain/langgraph-checkpoint/dist/store/base'
import { Pool } from 'pg'
import { decodeNsBytes, getTextAtPath, tokenizePath } from './utils'

/**
 * In-memory key-value store with optional vector search.
 *
 * A lightweight store implementation using JavaScript Maps. Supports basic
 * key-value operations and vector search when configured with embeddings.
 *
 * @example
 * ```typescript
 * // Basic key-value storage
 * const store = new InMemoryStore();
 * await store.put(["users", "123"], "prefs", { theme: "dark" });
 * const item = await store.get(["users", "123"], "prefs");
 *
 * // Vector search with embeddings
 * import { OpenAIEmbeddings } from "@langchain/openai";
 * const store = new InMemoryStore({
 *   index: {
 *     dims: 1536,
 *     embeddings: new OpenAIEmbeddings({ modelName: "text-embedding-3-small" }),
 *   }
 * });
 *
 * // Store documents
 * await store.put(["docs"], "doc1", { text: "Python tutorial" });
 * await store.put(["docs"], "doc2", { text: "TypeScript guide" });
 *
 * // Search by similarity
 * const results = await store.search(["docs"], { query: "python programming" });
 * ```
 *
 * @warning This store keeps all data in memory. Data is lost when the process exits.
 * For persistence, use a database-backed store.
 */
export class CopilotMemoryStore extends BaseStore {
	static CREATE_VECTOR_TABLE = `CREATE TABLE IF NOT EXISTS copilot_store_vectors (
  prefix text NOT NULL,
  key text NOT NULL,
  field_name text NOT NULL,
  embedding $1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (prefix, key, field_name),
  FOREIGN KEY (prefix, key) REFERENCES copilot_store(prefix, key) ON DELETE CASCADE
);
`

	private pgPool: Pool

	private _indexConfig?: PostgresIndexConfig & {
		__tokenizedFields?: Array<[string, string[]]>
	}

	get embeddings() {
		return this._indexConfig?.embeddings
	}

	constructor(
		private options?: {
			pgPool: Pool
			index?: IndexConfig
			tenantId: string
			organizationId: string
			userId: string
		}
	) {
		super()

		this.pgPool = options?.pgPool
		if (options?.index) {
			this._indexConfig = {
				...options.index,
				__tokenizedFields: (options.index.fields ?? ['$']).map((p) => [p, p === '$' ? [p] : tokenizePath(p)])
			} as PostgresIndexConfig
		}
	}

	/**
	 * Method to ensure the existence of the table in the database. It creates
	 * the table if it does not already exist.
	 * @param dimensions Number of dimensions in your vector data type. For example, use 1536 for OpenAI's `text-embedding-3-small`. If not set, indexes like HNSW might not be used during query time.
	 * @returns Promise that resolves when the table has been ensured.
	 */
	async ensureTableInDatabase(dimensions?: number): Promise<void> {
		const extensionName = 'vector'
		const vectorColumnType = dimensions ? `${extensionName}(${dimensions})` : extensionName

		const createTableQuery = CopilotMemoryStore.CREATE_VECTOR_TABLE.replace('$1', vectorColumnType)
		await this.pgPool.query(createTableQuery)
	}

	async batch<Op extends Operation[]>(ops: Op): Promise<OperationResults<Op>> {
		const [groupedOps, numOps] = groupOps(ops)
		const results = new Array<Op>(numOps).fill(null) as OperationResults<Op>

		if (groupedOps['GetOperation']) {
			await this.batchGetOps(groupedOps['GetOperation'] as Array<[number, GetOperation]>, results)
		}

		if (groupedOps['PutOperation']) {
			await this.batchPutOps(groupedOps['PutOperation'] as Array<[number, PutOperation]>)
		}

		if (groupedOps['SearchOperation']) {
			await this.batchSearchOps(groupedOps['SearchOperation'] as Array<[number, SearchOperation]>, results)
		}

		return results
	}

	async batchGetOps(getOps: Array<[number, GetOperation]>, results: OperationResults<GetOperation[]>): Promise<void> {
		for await (const [query, params, namespace, items] of this.getBatchGetOpsQueries(getOps)) {
			const { rows } = await this.pgPool.query(query, params)
			const keyToRow: Record<string, any> = {}

			for (const row of rows) {
				keyToRow[row['key']] = row
			}
			for (const [idx, key] of items) {
				const row = keyToRow[key]
				if (row) {
					results[idx] = rowToItem(namespace, row)
				} else {
					results[idx] = null
				}
			}
		}
	}

	private getBatchGetOpsQueries(
		getOps: Array<[number, GetOperation]>
	): Array<[string, any[], string[], Array<[number, string]>]> {
		const namespaceGroups: Map<string, Array<[number, string]>> = new Map()

		for (const [idx, op] of getOps) {
			if (!namespaceGroups.has(op.namespace.join(':'))) {
				namespaceGroups.set(op.namespace.join(':'), [])
			}
			namespaceGroups.get(op.namespace.join(':')).push([idx, op.key])
		}

		const results: Array<[string, any[], string[], Array<[number, string]>]> = []
		for (const [namespace, items] of namespaceGroups.entries()) {
			const keys = items.map((item) => item[1])
			const keysToQuery = keys.map((_, index) => `$${index + 4}`).join(',')
			const query = `
        SELECT key, value, "createdAt", "updatedAt"
        FROM copilot_store
        WHERE "tenantId" = $1 AND "organizationId" = $2 AND prefix = $3 AND key IN (${keysToQuery})
      `
			const params = [this.options?.tenantId, this.options?.organizationId, namespace, ...keys]
			results.push([query, params, namespace.split(':'), items])
		}
		return results
	}

	async batchPutOps(putOps: Array<[number, PutOperation]>): Promise<void> {
		const [queries, embeddingRequest] = this.prepareBatchPutQueries(putOps)
		if (embeddingRequest) {
			if (!this.embeddings) {
				throw new Error(
					'Embedding configuration is required for vector operations ' +
						'(for semantic search). ' +
						'Please provide an Embeddings when initializing the ' +
						this.constructor.name +
						'.'
				)
			}
			const [query, txtParams] = embeddingRequest
			const vectors = await this.embeddings.embedDocuments(txtParams.map((param) => param[param.length - 1]))
			queries.push([
				query,
				txtParams.map((params, index) => {
					const [ns, k, pathname] = params
					return [ns, k, pathname, `[${vectors[index].join(',')}]`]
				})
			])
		}

		for (const [query, params] of queries) {
			if (Array.isArray(params?.[0])) {
				for await (const param of params) {
					await this.pgPool.query(query, param)
				}
			} else {
				await this.pgPool.query(query, params)
			}
		}
	}

	private prepareBatchPutQueries(
		putOps: Array<[number, PutOperation]>
	): [Array<[string, any[]]>, [string, Array<[string, string, string, string]>] | null] {
		// Last-write wins
		const deduppedOps: Map<string, PutOperation> = new Map()
		for (const [, op] of putOps) {
			deduppedOps.set(`${op.namespace.join(':')}:${op.key}`, op)
		}

		const inserts: PutOperation[] = []
		const deletes: PutOperation[] = []
		for (const op of deduppedOps.values()) {
			if (op.value === null) {
				deletes.push(op)
			} else {
				inserts.push(op)
			}
		}

		const queries: Array<[string, any[]]> = []

		if (deletes.length > 0) {
			const namespaceGroups: Map<string, string[]> = new Map()
			for (const op of deletes) {
				const ns = op.namespace.join(':')
				if (!namespaceGroups.has(ns)) {
					namespaceGroups.set(ns, [])
				}
				namespaceGroups.get(ns).push(op.key)
			}
			for (const [namespace, keys] of namespaceGroups.entries()) {
				const placeholders = keys.map((key, index) => `$${index + 2}`).join(',')
				const query = `DELETE FROM copilot_store WHERE "tenantId" = '${this.options?.tenantId}' and "organizationId" = '${this.options?.organizationId}' and "createdById" = '${this.options.userId}' and prefix = $1 AND key IN (${placeholders})`
				const params = [namespace, ...keys]
				queries.push([query, params])
			}
		}

		let embeddingRequest: [string, Array<[string, string, string, string]>] | null = null
		if (inserts.length > 0) {
			const values: string[] = []
			// const insertionParams: any[] = [];
			const vectorValues: string[] = []
			const embeddingRequestParams: Array<[string, string, string, string]> = []

			// First handle main store insertions
			for (const op of inserts) {
				values.push(
					`('${this.options?.tenantId}', '${this.options?.organizationId}', '${this.options?.userId}', '${op.namespace.join(':')}', '${op.key}', '${JSON.stringify(op.value)}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
				)
			}

			// Then handle embeddings if configured
			if (this._indexConfig) {
				for (const op of inserts) {
					if (op.index === false) {
						continue
					}
					const value = op.value
					const ns = op.namespace.join(':')
					const k = op.key

					const paths = !op.index
						? this._indexConfig['__tokenizedFields']
						: op.index.map((ix: string) => [ix, tokenizePath(ix)])

					for (const [path, tokenizedPath] of paths) {
						const texts = getTextAtPath(value, tokenizedPath)
						for (let i = 0; i < texts.length; i++) {
							const text = texts[i]
							const pathname = texts.length > 1 ? `${path}.${i}` : (path as string)
							vectorValues.push(`($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
							embeddingRequestParams.push([ns, k, pathname, text])
						}
					}
				}
			}
			const valuesStr = values.join(',')
			let query = `
        INSERT INTO copilot_store ( "tenantId", "organizationId", "createdById", prefix, key, value, "createdAt", "updatedAt")
        VALUES ${valuesStr}
        ON CONFLICT ("organizationId", prefix, key) DO UPDATE
        SET value = EXCLUDED.value,
            "updatedAt" = CURRENT_TIMESTAMP
      `
			queries.push([query, null])

			if (vectorValues.length > 0) {
				const vectorValuesStr = vectorValues.join(',')
				query = `
          INSERT INTO copilot_store_vectors (prefix, key, field_name, embedding, created_at, updated_at)
          VALUES ${vectorValuesStr}
          ON CONFLICT (prefix, key, field_name) DO UPDATE
          SET embedding = EXCLUDED.embedding,
              updated_at = CURRENT_TIMESTAMP
        `
				embeddingRequest = [query, embeddingRequestParams]
			}
		}

		return [queries, embeddingRequest]
	}

	private prepareBatchSearchQueries(
		searchOps: Array<[number, SearchOperation]>
	): [Array<[string, Array<string | number | null>]>, Array<[number, string]>] {
		const queries: Array<[string, Array<string | number | null>]> = []
		const embeddingRequests: Array<[number, string]> = []

		searchOps.forEach(([idx, op]) => {
			// Build filter conditions first
			const filterParams: Array<string | number> = []
			const filterConditions: string[] = []
			if (op.filter) {
				for (const [key, value] of Object.entries(op.filter)) {
					if (typeof value === 'object' && value !== null) {
						for (const [opName, val] of Object.entries(value)) {
							const [condition, filterParams_] = this.getFilterCondition(key, opName, val)
							filterConditions.push(condition)
							filterParams.push(...filterParams_)
						}
					} else {
						filterConditions.push('value->? = ?::jsonb')
						filterParams.push(key, JSON.stringify(value))
					}
				}
			}

			// Vector search branch
			if (op.query && this._indexConfig) {
				embeddingRequests.push([idx, op.query])

				// eslint-disable-next-line prefer-const
				let [scoreOperator, postOperator] = this.getDistanceOperator()
				const vectorType = this._indexConfig.annIndexConfig?.vectorType || 'vector'

				if (vectorType === 'bit' && this._indexConfig.distanceType === 'hamming') {
					scoreOperator = scoreOperator.replace('%s', this._indexConfig.dims.toString())
				} else {
					scoreOperator = scoreOperator.replace('%s', vectorType)
				}

				const vectorsPerDocEstimate = 1 // this._indexConfig.__estimatedNumVectors
				const expandedLimit = op.limit * vectorsPerDocEstimate * 2 + 1

				// Vector search with CTE for proper score handling
				const filterStr = filterConditions.length ? ' AND ' + filterConditions.join(' AND ') : ''
				let prefixFilterStr = ''
				let nsArgs: Array<string> = []
				if (op.namespacePrefix) {
					prefixFilterStr = `WHERE s.prefix LIKE $1 ${filterStr} `
					nsArgs = [`${namespaceToText(op.namespacePrefix)}%`]
				} else if (filterStr) {
					prefixFilterStr = `WHERE ${filterStr} `
				}

				const baseQuery = `
          WITH scored AS (
            SELECT s.prefix, s.key, s.value, s."createdAt", s."updatedAt", ${scoreOperator} AS neg_score
            FROM copilot_store s
            JOIN copilot_store_vectors sv ON s.prefix = sv.prefix AND s.key = sv.key
            ${prefixFilterStr}
            ORDER BY ${scoreOperator} ASC 
            LIMIT $2
          )
          SELECT * FROM (
            SELECT DISTINCT ON (prefix, key) 
              prefix, key, value, "createdAt", "updatedAt", ${postOperator} as score 
            FROM scored 
            ORDER BY prefix, key, score DESC
          ) AS unique_docs
          ORDER BY score DESC
          LIMIT $3
          OFFSET $4
        `
				const params = [
					'_PLACEHOLDER', // Vector placeholder
					...nsArgs,
					...filterParams,
					'_PLACEHOLDER',
					expandedLimit,
					op.limit,
					op.offset
				]

				queries.push([baseQuery, params])
			} else {
				// Regular search branch
				let baseQuery = `
          SELECT prefix, key, value, "createdAt", "updatedAt"
          FROM copilot_store
          WHERE prefix LIKE $1 AND "createdById" = $4
        `
				const params: Array<string | number> = [`${namespaceToText(op.namespacePrefix)}%`]

				if (filterConditions.length) {
					params.push(...filterParams)
					baseQuery += ' AND ' + filterConditions.join(' AND ')
				}

				baseQuery += ' ORDER BY "updatedAt" DESC'
				baseQuery += ' LIMIT $2 OFFSET $3'
				params.push(op.limit, op.offset)

        params.push(this.options.userId)

				queries.push([baseQuery, params])
			}
		})

		return [queries, embeddingRequests]
	}

	private async batchSearchOps(
		searchOps: Array<[number, SearchOperation]>,
		results: OperationResults<SearchOperation[]>
	): Promise<void> {
		const [queries, embeddingRequests] = this.prepareBatchSearchQueries(searchOps)

		if (embeddingRequests && this.embeddings) {
			const embeddings = await this.embeddings.embedDocuments(embeddingRequests.map(([_, query]) => query))
			for (let i = 0; i < embeddingRequests.length; i++) {
				const [idx, _] = embeddingRequests[i]
				const embedding = embeddings[i]
				const paramsList = queries[idx][1]
				for (let j = 0; j < paramsList.length; j++) {
					if (paramsList[j] === '_PLACEHOLDER') {
						paramsList[j] = `[${embedding.join(",")}]`
					}
				}
			}
		}

		for (let i = 0; i < searchOps.length; i++) {
			const [idx, _] = searchOps[i]
			const [query, params] = queries[i]
      console.log(query, params)
			const result = await this.pgPool.query(query, params)
			results[idx] = result.rows.map((row: any) => ({
        ...row,
        namespace: decodeNsBytes(row['prefix']),
      }))
		}
	}

	private extractTexts(ops: PutOperation[]): { [text: string]: [string[], string, string][] } {
		if (!ops.length || !this._indexConfig) {
			return {}
		}

		const toEmbed: { [text: string]: [string[], string, string][] } = {}

		for (const op of ops) {
			if (op.value !== null && op.index !== false) {
				const paths =
					op.index === null || op.index === undefined
						? (this._indexConfig.__tokenizedFields ?? [])
						: op.index.map((ix) => [ix, tokenizePath(ix)] as [string, string[]])
				for (const [path, field] of paths) {
					const texts = getTextAtPath(op.value, field)
					if (texts.length) {
						if (texts.length > 1) {
							texts.forEach((text, i) => {
								if (!toEmbed[text]) toEmbed[text] = []
								toEmbed[text].push([op.namespace, op.key, `${path}.${i}`])
							})
						} else {
							if (!toEmbed[texts[0]]) toEmbed[texts[0]] = []
							toEmbed[texts[0]].push([op.namespace, op.key, path])
						}
					}
				}
			}
		}

		return toEmbed
	}

	private getFilterCondition(key: string, op: string, value: any): [string, (string | number)[]] {
		// Helper to generate filter conditions.
		switch (op) {
			case '$eq':
				return [`value->? = ?::jsonb`, [key, JSON.stringify(value)]]
			case '$gt':
				return [`value->>? > ?`, [key, String(value)]]
			case '$gte':
				return [`value->>? >= ?`, [key, String(value)]]
			case '$lt':
				return [`value->>? < ?`, [key, String(value)]]
			case '$lte':
				return [`value->>? <= ?`, [key, String(value)]]
			case '$ne':
				return [`value->? != ?::jsonb`, [key, JSON.stringify(value)]]
			default:
				throw new Error(`Unsupported operator: ${op}`)
		}
	}

  getDistanceOperator(): [string, string] {
    // 获取基于配置的距离运算符和分数表达式
    // 注意：目前由于PGVector对混合向量和非向量过滤器的支持限制，我们不使用ANN索引
    // 要使用索引，PGVector期望：
    //  - 按运算符排序而不是表达式（即使否定也会阻止它）
    //  - 升序排列
    //  - 任何WHERE子句都应该在部分索引上。
    // 如果我们违反其中任何一项，它将使用顺序扫描
    // 详情请参见https://github.com/pgvector/pgvector/issues/216和pgvector文档。
    if (!this._indexConfig) {
      throw new Error('向量操作需要嵌入配置（用于语义搜索）。' + `请在初始化${this.constructor.name}时提供嵌入。`)
    }
  
    const config = this._indexConfig as PostgresIndexConfig
    const distanceType = config.distanceType || 'cosine'
  
    // 返回运算符和分数表达式
    // 运算符用于CTE中，并将与升序排序子句兼容。
    // 分数表达式用于最终查询中，并将与降序排序子句和用户对相似性分数的期望兼容。
    if (distanceType === 'l2') {
      // 最终: "-(sv.embedding <-> %s::%s)"
      // 我们返回“l2相似性”，以便排序顺序相同
      return ['sv.embedding <-> %s::?', '-scored.neg_score']
    } else if (distanceType === 'inner_product') {
      // 最终: "-(sv.embedding <#> %s::%s)"
      return ['sv.embedding <#> %s::?', '-(scored.neg_score)']
    } else {
      // 余弦相似性
      // 最终:  "1 - (sv.embedding <=> %s::%s)"
      return ['sv.embedding <=> %s::?', '1 - scored.neg_score']
    }
  }
}

function namespaceToText(namespace: string[], handleWildcards = false): string {
	// Convert namespace array to text string
	if (handleWildcards) {
		namespace = namespace.map((val) => (val === '*' ? '%' : val))
	}
	return namespace.join('.')
}

function groupOps(ops: Iterable<Operation>): [Record<string, Array<[number, Operation]>>, number] {
	const groupedOps: Record<string, Array<[number, Operation]>> = {}
	let tot = 0
	let idx = 0
	for (const op of ops) {
		let opType = null
		if ('key' in op && 'namespace' in op && !('value' in op)) {
			// GetOperation
			opType = 'GetOperation'
		} else if ('namespacePrefix' in op) {
			// SearchOperation
			opType = 'SearchOperation'
		} else if ('value' in op) {
			// PutOperation
			opType = 'PutOperation'
		} else if ('matchConditions' in op) {
			// ListNamespacesOperation
			opType = 'ListNamespacesOperation'
		}

		if (!groupedOps[opType]) {
			groupedOps[opType] = []
		}
		groupedOps[opType].push([idx, op])
		tot += 1
		idx += 1
	}
	return [groupedOps, tot]
}

function rowToItem(namespace: string[], row: any) {
	return (
		row && {
			...row
			// value: JSON.parse(row.value)
		}
	)
}

interface ANNIndexConfig {
	/**
	 * Configuration for vector index in PostgreSQL store.
	 */
	kind?: 'hnsw' | 'ivfflat' | 'flat'
	/**
	 * Type of index to use: 'hnsw' for Hierarchical Navigable Small World, or 'ivfflat' for Inverted File Flat.
	 */
	vectorType?: 'vector' | 'halfvec' | 'bit'
	/**
	 * Type of vector storage to use.
	 * Options:
	 * - 'vector': Regular vectors (default)
	 * - 'halfvec': Half-precision vectors for reduced memory usage
	 */
}

interface PostgresIndexConfig extends IndexConfig {
	/**
	 * Configuration for vector embeddings in PostgreSQL store with pgvector-specific options.
	 * Extends EmbeddingConfig with additional configuration for pgvector index and vector types.
	 */
	annIndexConfig?: ANNIndexConfig
	/**
	 * Specific configuration for the chosen index type (HNSW or IVF Flat).
	 */
	distanceType?: 'l2' | 'inner_product' | 'cosine' | 'hamming'
	/**
	 * Distance metric to use for vector similarity search:
	 * - 'l2': Euclidean distance
	 * - 'inner_product': Dot product
	 * - 'cosine': Cosine similarity
	 */
}
