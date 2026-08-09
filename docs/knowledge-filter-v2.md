# Knowledge Filter V2

Knowledge Filter V2 adds a server-enforced fixed boundary and an optional Agent-generated dynamic filter to each Agent/workflow-to-knowledgebase binding. The effective predicate is always:

```text
tenant / organization / knowledgebase
AND enabled document and chunk
AND fixed filter
AND request filter
AND valid Agent dynamic filter
```

The first release supports Vector retrieval with PGVector and Milvus. Graph and Hybrid reject any V2 configuration. Chroma, Weaviate, external knowledgebases, and other vector backends reject an effective V2 predicate instead of silently searching the full knowledgebase.

## Configuration and API

New bindings default to:

```json
{
  "mode": "vector",
  "filtering": {
    "agent": { "enabled": false }
  }
}
```

The Agent retrieval tool accepts `input` and, only when enabled, an optional literal-only `dynamicFilter`. Fixed variables are resolved from runtime state on the server. A missing or invalid fixed variable fails closed. An invalid dynamic filter is discarded as a whole and records `invalid_dynamic_filter`; a valid zero-hit dynamic filter is not automatically relaxed.

The field catalog contains the stable `document.*` fields plus `metadata.<key>` or `chunk.metadata.<key>` from the knowledgebase metadata schema. Metadata schema definitions must declare a type and document/chunk scope. Existing definitions are migrated to document scope.

## One-time migration

Back up the Xpert tables, knowledge document tables, retrieval logs, template directories, and every Milvus collection before applying the migration.

Run the idempotent preflight first:

```bash
corepack pnpm migrate:knowledge-filter-v2
```

The command reports exact Xpert, workflow node, knowledgebase, template, and metadata locations for values that cannot be converted. It does not write in its default mode. Resolve every issue, then apply:

```bash
corepack pnpm migrate:knowledge-filter-v2 --apply
```

Useful controlled options are `--skip-templates`, `--template-root <path>`, and `--skip-milvus`. Do not use a skip option unless that resource is migrated separately before filtered retrieval is enabled.

The apply phase converts metadata columns to JSONB, creates relational/filter indexes, migrates published and draft Xpert/workflow configurations, updates templates, adds and backfills Milvus `filterAttributes`, creates JSON indexes, and verifies sampled Milvus values against PostgreSQL hashes. It never recalculates embeddings.

Milvus must be 2.6.2 or newer. The plugin uses `@zilliz/milvus2-sdk-node` 2.6.x and rejects an unsupported server during capability probing.

## Release gates

Before enabling Agent filtering:

1. Stop old Studio clients from writing legacy retrieval metadata.
2. Complete the preflight and backup.
3. Apply PostgreSQL, configuration, template, and Milvus migrations.
4. Deploy contracts, API/server, Studio, and the Milvus plugin together.
5. Smoke-test the same nested predicates against PGVector and Milvus, including file name, logical folder, MIME/extension, document metadata, and chunk metadata.
6. Verify document/folder rename, move, metadata edit, and disabled-document behavior without an embedding revision change.
7. Observe structured-filter errors, dynamic fallback rate, zero-hit rate, and filter/vector p95 latency before broadly enabling the Agent switch.

Retrieval logs contain normalized filters and hashes, counts, timings, backend, status, and structured errors, but never document body text. Access remains scoped through the knowledgebase endpoint.
