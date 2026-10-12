# Knowledgebase resource discovery

`platform.knowledgebase` separates catalog discovery, metadata, permission inspection and content retrieval. All new catalog methods use the authenticated runtime's tenant, organization and actor. Inputs cannot select another identity or organization.

| Method      | Responsibility                                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `query`     | Discover resources with explicit scope, metadata filters, required actions and cursor pagination.                            |
| `get`       | Read one resource's safe metadata, supported ingestion capability, configuration and processing readiness.                   |
| `getAccess` | Inspect named actions for up to 100 resource IDs. Missing and inaccessible IDs both return `unavailable`.                    |
| `search`    | Retrieve indexed content; its existing contract is unchanged.                                                                |
| `list`      | Deprecated for new integrations; preserves the old scope, shared-library behavior and array result. Use `query` in new code. |

The draft-only `listWritable` method has been removed. Destination discovery uses `query` with required actions.

Document lifecycle methods remain on `platform.knowledgebase.documents`; administrative provisioning remains on `platform.knowledgebase.provisioning`. Resource discovery does not create or connect libraries.

## Discover a destination

Feature-detect `query`, `get` and `getAccess` before using them on an older host. A workflow requiring write authorization must fail explicitly when these methods are absent; the old `list` is not an authorization substitute.

```ts
const actions: KnowledgebaseAction[] = ['documents.create', 'documents.process']
const page = await api.query({
  scope: { kind: 'workspace', workspaceId, relation: 'owned' },
  filter: {
    visibility: 'organization',
    applicationTags: { allOf: [imageLibraryTag] }
  },
  access: { requireAll: actions },
  page: { limit: 100, cursor }
})
```

- `owned` restricts results to the selected workspace. `available` also considers organization/public resources in the current organization, subject to point-read authorization. It does not grant access to another workspace or include tenant libraries implicitly.
- `organization` searches the current organization. `tenant` searches tenant-owned public libraries. No scope bypasses resource permissions.
- Text filtering is a literal substring of name/description; `applicationTags.allOf` requires every tag. Publication and visibility are separate filters.
- Page limits are 1–100 (default 20), with stable ascending ID keysets. Follow `nextCursor` even after a short or empty page; each request scans at most 1,000 rows. Only `null` confirms exhaustion.
- Cursors are bound to tenant, organization, actor, scope, filters and required actions. Changing these requires restarting the query. Permissions are evaluated again on every page. Pagination is not a database snapshot; insertions before the current ID may appear only in a fresh query.

Before starting paid work, inspect `getAccess` for every required action and `get` for readiness. `configuration.embeddingConfigured` means an embedding model binding exists, not that an external provider is currently healthy. Recheck access before saving, and retain normal authorization on actual document writes; an earlier check never authorizes a later write.

Catalog responses expose neither provider credentials nor model bindings. Current document/chunk mutations use the platform's existing knowledgebase write policy; exposing distinct action names allows future permission refinement without adding action-specific list methods.
