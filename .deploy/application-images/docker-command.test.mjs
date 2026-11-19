import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runDocker } from './docker-command.mjs'

test('registry reads preserve the exact manifest bytes and never retry authentication failures', () => {
  const raw = '{"config":{}}\n'
  assert.equal(runDocker(['buildx'], { exec: () => raw }), raw)
  let attempts = 0
  assert.throws(
    () =>
      runDocker(['push', 'example/image:tag'], {
        exec: () => {
          attempts++
          throw new Error('unauthorized: authentication required')
        }
      }),
    /unauthorized/
  )
  assert.equal(attempts, 1)
})

test('transient pushes retry the same tag with bounded backoff and visible progress', () => {
  const waits = [],
    messages = []
  let attempts = 0
  runDocker(['push', 'example/image:tag'], {
    exec: (command, args, options) => {
      assert.equal(command, 'docker')
      assert.deepEqual(args, ['push', 'example/image:tag'])
      assert.equal(options.stdio[1], 'inherit')
      if (++attempts < 3) throw Object.assign(new Error('push timed out'), { code: 'ETIMEDOUT' })
    },
    pause: (ms) => waits.push(ms),
    log: (message) => messages.push(message)
  })
  assert.equal(attempts, 3)
  assert.deepEqual(waits, [10_000, 20_000])
  assert.equal(messages.length, 2)
})

test('persistent network failures stop after three attempts; failed reads remain fatal', () => {
  for (const command of ['push', 'buildx']) {
    let attempts = 0
    assert.throws(
      () =>
        runDocker([command, 'example/image:tag'], {
          exec: () => {
            attempts++
            throw new Error('TLS handshake timeout')
          },
          pause: () => {},
          log: () => {}
        }),
      /TLS/
    )
    assert.equal(attempts, command === 'push' ? 3 : 1)
  }
})
