import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rewriteCatalogDependencies } from './catalog-dependencies.mjs'

test('published manifests expand default and named catalogs in all dependency sections', () => {
  const manifest = {
    name: 'example',
    dependencies: { chatkit: 'catalog:', ordinary: '^2.0.0' },
    devDependencies: { chatkit: 'catalog:default' },
    peerDependencies: { chatkit: 'catalog:compatible' },
    optionalDependencies: { chatkit: 'catalog:' }
  }
  const workspace = { catalog: { chatkit: '0.6.3' }, catalogs: { compatible: { chatkit: '~0.6.3' } } }
  assert.equal(rewriteCatalogDependencies(manifest, workspace).length, 4)
  assert.deepEqual(manifest, {
    name: 'example',
    dependencies: { chatkit: '0.6.3', ordinary: '^2.0.0' },
    devDependencies: { chatkit: '0.6.3' },
    peerDependencies: { chatkit: '~0.6.3' },
    optionalDependencies: { chatkit: '0.6.3' }
  })
  assert.deepEqual(rewriteCatalogDependencies(manifest, workspace), [])
})

test('publishing fails closed for missing catalogs or non-publishable entries', () => {
  for (const workspace of [
    {},
    { catalog: {} },
    ...['', 123, 'catalog:other', 'workspace:*', 'file:../local', 'link:../local'].map((version) => ({
      catalog: { chatkit: version }
    }))
  ]) {
    assert.throws(
      () => rewriteCatalogDependencies({ name: 'example', dependencies: { chatkit: 'catalog:' } }, workspace),
      /Cannot publish example: dependencies.chatkit/
    )
  }
  assert.throws(
    () =>
      rewriteCatalogDependencies(
        { name: 'example', dependencies: { chatkit: 'catalog:missing' } },
        { catalog: { chatkit: '0.6.3' } }
      ),
    /catalog:missing/
  )
})
