# Structured knowledge graph publication

Use `KnowledgeGraphRuntimeCapability` for source-owned, already structured data. It publishes explicit identities, relationships, typed properties, and source chunk references without LLM extraction or identity classification. Unstructured documents continue to use the normal extraction pipeline.

## Source and publication lifecycle

1. Create an Agent Knowledge Writer managed document owned by the publishing Assistant. Set `metadata.graphSource = { mode: 'structured' }` before writing chunks, so automatic graph extraction is skipped.
2. Write the complete chunk projection and its embeddings using `AgentKnowledgeWriterCapability`. Use immutable, content-versioned chunk keys.
3. Resolve `KnowledgeGraphRuntimeCapability` and call `publish`. Supply the managed document owner, external source version, complete chunk ID manifest, entities, and relations. Each item must reference one or more chunks in the manifest.
4. Poll `status` until `success`. A queued receipt means the snapshot is accepted, not yet searchable. Display failure/retry separately from embedding completion.
5. A new snapshot replaces only this document's graph contribution. `retract` publishes an empty graph while retaining chunks and contributions from other documents. Deleting the source document follows the existing source cleanup lifecycle.

```ts
const graph = runtime.get(KnowledgeGraphRuntimeCapability)
const owner = { knowledgebaseId, documentId, xpertId, agentKey }
const receipt = await graph.publish({
  ...owner,
  publicationKey: 'automotive-bom:ASSEMBLY-01',
  sourceVersion: 'R2:source-content-hash',
  chunkIds: ['R2:root', 'R2:position-10'],
  entities: [
    {
      id: 'root',
      namespace: 'automotive:BOM:ASSEMBLY-01:R2',
      nodeKey: 'ASSEMBLY-01',
      type: 'Root',
      name: 'Drive assembly',
      chunkIds: ['R2:root']
    },
    {
      id: 'sensor',
      namespace: 'automotive:BOM:ASSEMBLY-01:R2:position-10',
      nodeKey: 'SENSOR-01',
      type: 'Component',
      name: 'Temperature sensor',
      properties: { resistance: 100, unit: 'ohm' },
      chunkIds: ['R2:position-10']
    }
  ],
  relations: [
    {
      source: 'root',
      target: 'sensor',
      type: 'CONTAINS',
      properties: { quantity: 2, unit: 'EA' },
      chunkIds: ['R2:position-10']
    }
  ]
})
```

`namespace + nodeKey` is the exact identity within the knowledgebase. Include source revision and assembly occurrence in component namespaces; material master namespaces can be shared across BOMs. Do not merge occurrence-specific quantities or features onto a shared material. Relations reference local entity IDs in the same complete snapshot.

The platform validates ownership, KB write access, enabled graph configuration, endpoint identities and chunk membership before accepting. Repeating the same snapshot against the same source epoch is idempotent. Snapshot persistence and source-contribution replacement are transactional. Retry/rebuild replay the stored structured snapshot; they never fall back to an LLM. If the source chunks have changed, republish from the source application. The immutable chunk-key convention is necessary to distinguish payload changes that retain otherwise identical IDs.

Properties are JSON values, stored per source contribution and exposed in entity/relation metadata. `metadata.propertySources` retains per-document provenance when entities are shared. Graph visualization, graph/hybrid retrieval, entity evidence links and embedding indexes use the existing platform APIs.

For deployments without schema synchronization, apply `packages/server-ai/src/graphrag/migrations/20260913-structured-properties.sql` before starting the updated API. This additive migration adds property columns to both graph contribution tables.

If structured projections were created before the missing-confidence fix, also apply `20260913-structured-mention-confidence.sql` from that directory. It restores unknown mention confidence to `NULL` only for current structured snapshots without explicit confidence values. Model/manual evidence and explicit zero confidence are preserved. This prevents valid structured evidence from receiving a zero graph-retrieval score.
