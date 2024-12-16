import { BaseStore, GetOperation, OperationResults, PutOperation, type Item, type Operation } from '@langchain/langgraph'
import { Pool } from 'pg'
import { IndexConfig } from '@langchain/langgraph-checkpoint/dist/store/base'
import { getTextAtPath, tokenizePath } from './utils';

type PostgresIndexConfig = IndexConfig & {
  __tokenizedFields: Array<[string, string[]]>;
};



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

  private pgPool: Pool
  private index: PostgresIndexConfig

  get _indexConfig() {
    return this.index
  }

  get embeddings() {
    return this.index?.embeddings
  }

	constructor(private options?: {
      pgPool: Pool;
		  index?: PostgresIndexConfig
      tenantId: string
      organizationId: string
      userId: string
    }) {
		super()

    this.pgPool = options?.pgPool
    this.index = options?.index
	}

  async batch<Op extends Operation[]>(ops: Op): Promise<OperationResults<Op>> {
    const [groupedOps, numOps] = groupOps(ops);
    const results = new Array<Op>(numOps).fill(null) as OperationResults<Op>;

    if (groupedOps['GetOperation']) {
      await this.batchGetOps(groupedOps['GetOperation'] as Array<[number, GetOperation]>, results)
    }

    if (groupedOps['PutOperation']) {
      await this.batchPutOps(groupedOps['PutOperation'] as Array<[number, PutOperation]>)
    }

    return results
  }

	async batchGetOps(getOps: Array<[number, GetOperation]>, results: OperationResults<GetOperation[]>): Promise<void> {
		for await (const [query, params, namespace, items] of this.getBatchGetOpsQueries(getOps)) {
      console.log(query, params)
			const { rows } = await this.pgPool.query(query, params)
			const keyToRow: Record<string, any> = {}

      console.log(rows)

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

  async batchPutOps(putOps: Array<[number, PutOperation]>,): Promise<void> {
    const [queries, embeddingRequest] = this.prepareBatchPutQueries(putOps);
    if (embeddingRequest) {
      if (!this.embeddings) {
        throw new Error(
          "Embedding configuration is required for vector operations " +
          "(for semantic search). " +
          "Please provide an Embeddings when initializing the " + this.constructor.name + "."
        );
      }
      const [query, txtParams] = embeddingRequest;
      const vectors = await this.embeddings.embedDocuments(
        txtParams.map(param => param[param.length - 1])
      );
      queries.push([
        query,
        txtParams.flatMap((params, index) => {
          const [ns, k, pathname] = params;
          return [ns, k, pathname, vectors[index]];
        })
      ]);
    }

    for (const [query, params] of queries) {
      // console.log(query, params)
      await this.pgPool.query(query, params);
    }
  }

private prepareBatchPutQueries(
  putOps: Array<[number, PutOperation]>
): [Array<[string, any[]]>, [string, Array<[string, string, string, string]>] | null] {
  // Last-write wins
  const deduppedOps: Map<string, PutOperation> = new Map();
  for (const [, op] of putOps) {
    deduppedOps.set(`${op.namespace.join(':')}:${op.key}`, op);
  }

  const inserts: PutOperation[] = [];
  const deletes: PutOperation[] = [];
  for (const op of deduppedOps.values()) {
    if (op.value === null) {
      deletes.push(op);
    } else {
      inserts.push(op);
    }
  }

  const queries: Array<[string, any[]]> = [];

  if (deletes.length > 0) {
    const namespaceGroups: Map<string, string[]> = new Map();
    for (const op of deletes) {
      const ns = op.namespace.join(':');
      if (!namespaceGroups.has(ns)) {
        namespaceGroups.set(ns, []);
      }
      namespaceGroups.get(ns).push(op.key);
    }
    for (const [namespace, keys] of namespaceGroups.entries()) {
      const placeholders = keys.map(() => '%s').join(',');
      const query = `DELETE FROM copilot_store WHERE tenantId = '${this.options?.tenantId}' and organizationId = '${this.options?.organizationId}' and prefix = %s AND key IN (${placeholders})`;
      const params = [namespace, ...keys];
      queries.push([query, params]);
    }
  }

  let embeddingRequest: [string, Array<[string, string, string, string]>] | null = null;
  if (inserts.length > 0) {
    const values: string[] = [];
    // const insertionParams: any[] = [];
    const vectorValues: string[] = [];
    const embeddingRequestParams: Array<[string, string, string, string]> = [];

    // First handle main store insertions
    for (const op of inserts) {
      values.push(`('${this.options?.tenantId}', '${this.options?.organizationId}', '${this.options?.userId}', '${op.namespace.join(':')}', '${op.key}', '${JSON.stringify(op.value)}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`);
      // insertionParams.push(
      //   op.namespace.join(':'),
      //   op.key,
      //   JSON.stringify(op.value)
      // );
    }

    // Then handle embeddings if configured
    if (this.index) {
      for (const op of inserts) {
        if (op.index === false) {
          continue;
        }
        const value = op.value;
        const ns = op.namespace.join(':');
        const k = op.key;

        const paths = op.index === null
          ? this.index['__tokenizedFields']
          : op.index.map((ix: string) => [ix, tokenizePath(ix)]);

        for (const [path, tokenizedPath] of paths) {
          const texts = getTextAtPath(value, tokenizedPath);
          for (let i = 0; i < texts.length; i++) {
            const text = texts[i];
            const pathname = texts.length > 1 ? `${path}.${i}` : path as string;
            vectorValues.push("(%s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            embeddingRequestParams.push([ns, k, pathname, text]);
          }
        }
      }
    }
    const valuesStr = values.join(',');
    let query = `
      INSERT INTO copilot_store ( "tenantId", "organizationId", "createdById", prefix, key, value, "createdAt", "updatedAt")
      VALUES ${valuesStr}
      ON CONFLICT ("organizationId", prefix, key) DO UPDATE
      SET value = EXCLUDED.value,
          "updatedAt" = CURRENT_TIMESTAMP
    `;
    queries.push([query, null]);

    if (vectorValues.length > 0) {
      const vectorValuesStr = vectorValues.join(',');
      query = `
        INSERT INTO store_vectors (prefix, key, field_name, embedding, created_at, updated_at)
        VALUES ${vectorValuesStr}
        ON CONFLICT (prefix, key, field_name) DO UPDATE
        SET embedding = EXCLUDED.embedding,
            updated_at = CURRENT_TIMESTAMP
      `;
      embeddingRequest = [query, embeddingRequestParams];
    }
  }

  return [queries, embeddingRequest];
}


private extractTexts(ops: PutOperation[]): {
  [text: string]: [string[], string, string][];
} {
  if (!ops.length || !this._indexConfig) {
    return {};
  }

  const toEmbed: { [text: string]: [string[], string, string][] } = {};

  for (const op of ops) {
    if (op.value !== null && op.index !== false) {
      const paths =
        op.index === null || op.index === undefined
          ? this._indexConfig.__tokenizedFields ?? []
          : op.index.map(
              (ix) => [ix, tokenizePath(ix)] as [string, string[]]
            );
      for (const [path, field] of paths) {
        const texts = getTextAtPath(op.value, field);
        if (texts.length) {
          if (texts.length > 1) {
            texts.forEach((text, i) => {
              if (!toEmbed[text]) toEmbed[text] = [];
              toEmbed[text].push([op.namespace, op.key, `${path}.${i}`]);
            });
          } else {
            if (!toEmbed[texts[0]]) toEmbed[texts[0]] = [];
            toEmbed[texts[0]].push([op.namespace, op.key, path]);
          }
        }
      }
    }
  }

  return toEmbed;
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
    if ("key" in op && "namespace" in op && !("value" in op)) {
      // GetOperation
      opType = 'GetOperation'
    } else if ("namespacePrefix" in op) {
      // SearchOperation
     opType = 'SearchOperation'
    } else if ("value" in op) {
      // PutOperation
      opType = 'PutOperation'
    } else if ("matchConditions" in op) {
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
  return row && {
    ...row,
    // value: JSON.parse(row.value)
  }
}