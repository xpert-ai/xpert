// Exercise the real repositories and document write guard against migrated PostgreSQL.
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')

async function seedContentDocuments(source) {
  const [{ id: tenantId }] = await source.query(
    `INSERT INTO tenant(name) VALUES('content-schema-fixture') RETURNING id`
  )
  const [{ id: userId }] = await source.query(
    `INSERT INTO "user"("tenantId",email) VALUES($1,'content-schema@example.invalid') RETURNING id`,
    [tenantId]
  )
  const [{ id: organizationId }] = await source.query(
    `INSERT INTO organization("tenantId",name,currency,"defaultValueDateType")
     VALUES($1,'content-schema-fixture','USD','TODAY') RETURNING id`,
    [tenantId]
  )
  const [{ id: documentId }] = await source.query(
    `INSERT INTO content_document("tenantId","organizationId","createdById","projectId",path,title,"modelKey","fileHash","sourceProvider","sourceId")
     VALUES($1,$2,$3,$4,'shared/content-schema.md','Keep this title','markdown','hash','fixture','fixture') RETURNING id`,
    [tenantId, organizationId, userId, randomUUID()]
  )
  return documentId
}

async function verifyContentDocuments(source, bundle, migrate, root) {
  const { contentDocumentEntities, ContentDocument } = require(
    `${root}/packages/server-ai/src/content-resource/documents/entities`
  )
  const { ContentFileOwnershipService } = require(
    `${root}/packages/server-ai/src/shared/volume/content-file-ownership.service`
  )
  const tables = contentDocumentEntities.map((entity) => source.getMetadata(entity).tableName)
  assert.equal(tables.length, 5)
  for (const entity of contentDocumentEntities) {
    assert.ok(bundle.managedTables.includes(source.getMetadata(entity).tableName))
    await source.getRepository(entity).find({ take: 1 }) // selects every mapped field, including inherited columns
  }
  const id = await seedContentDocuments(source)
  const repository = source.getRepository(ContentDocument)
  const document = await repository.findOneByOrFail({ id })
  const guard = new ContentFileOwnershipService(repository)
  await guard.assertUnmanaged(document.tenantId, document.projectId, 'new-upload.pdf')
  await assert.rejects(() => guard.assertUnmanaged(document.tenantId, document.projectId, document.path))
  await assert.rejects(() => repository.insert({ ...document, id: randomUUID() }), /duplicate key/)
  await repository.update(id, { status: 'deleted' })
  await guard.assertUnmanaged(document.tenantId, document.projectId, document.path)
  await repository.insert({ ...document, id: randomUUID() }) // tombstones must not reserve the path

  const before = await source.query('SELECT to_jsonb(d) AS row FROM content_document d ORDER BY id')
  await migrate(source, bundle)
  await migrate(source, bundle, 'verify')
  assert.deepEqual(await source.query('SELECT to_jsonb(d) AS row FROM content_document d ORDER BY id'), before)

  const [{ definition }] = await source.query(
    `SELECT pg_get_indexdef(indexrelid) AS definition FROM pg_index
     WHERE indexrelid='"IDX_content_document_active_path"'::regclass`
  )
  await source.query('DROP INDEX "IDX_content_document_active_path"')
  await assert.rejects(() => migrate(source, bundle, 'verify'), /content_document.index/)
  await source.query(definition)
  await source.query('ALTER TABLE content_document ALTER COLUMN "fileHash" DROP NOT NULL')
  await assert.rejects(() => migrate(source, bundle, 'verify'), /content_document.fileHash/)
  await source.query('ALTER TABLE content_document ALTER COLUMN "fileHash" SET NOT NULL')
  await migrate(source, bundle, 'verify')
  console.log(
    'PASS content repositories, file ownership guard, active-path uniqueness, tombstones, repeat apply and drift detection'
  )
}

module.exports = { seedContentDocuments, verifyContentDocuments }
