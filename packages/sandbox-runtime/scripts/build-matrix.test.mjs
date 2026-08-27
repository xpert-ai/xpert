import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'

const script = path.resolve('packages/sandbox-runtime/scripts/build-matrix.mjs')

function buildMatrix(...args) {
  return JSON.parse(
    execFileSync(process.execPath, [script, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
  )
}

test('selects one family and derives its immutable tag from an explicit suite version', () => {
  const matrix = buildMatrix('--family', 'document', '--version', '1.2.0')

  assert.equal(matrix.include.length, 1)
  assert.equal(matrix.include[0].family, 'document')
  assert.equal(matrix.include[0].version, '1.2.0')
  assert.equal(matrix.include[0].versionTag, '1.2.0-lo7')
})

test('rejects an unknown image family', () => {
  assert.throws(
    () => buildMatrix('--family', 'missing-runtime'),
    /Unknown Sandbox Runtime image family: missing-runtime/
  )
})

test('rejects an invalid explicit suite version', () => {
  assert.throws(() => buildMatrix('--version', 'latest'), /Invalid Sandbox Runtime Suite version: latest/)
})
