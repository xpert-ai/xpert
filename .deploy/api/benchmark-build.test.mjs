import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compilationTimings } from './benchmark-build.mjs'

test('legacy compilation includes plugins and API, excluding dependency install', () => {
  const result = compilationTimings(`#10 [build 1/3] RUN pnpm install --frozen-lockfile
#10 DONE 90.0s
#11 [build 2/3] RUN pnpm build:plugins
#11 DONE 44.0s
#12 [build 3/3] RUN node -e "heap limit" && pnpm nx build api --verbose
#12 DONE 120.9s`)
  assert.equal(result.seconds, 164.9)
  assert.equal(result.steps.length, 2)
})

test('unified compilation is counted once and cached builds cannot masquerade as measurements', () => {
  assert.equal(compilationTimings('#10 [build 1/1] RUN node .deploy/api/build.mjs\n#10 DONE 81.2s').seconds, 81.2)
  assert.throws(
    () => compilationTimings('#10 [build 1/1] RUN node .deploy/api/build.mjs\n#10 CACHED'),
    /did not execute/
  )
  assert.throws(() => compilationTimings('#10 DONE 1.0s'), /No API compilation/)
})
