const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const { parse } = require('yaml')

const root = path.resolve(__dirname, '../..')
for (const file of ['docker-compose.yml', 'docker/docker-compose.yml', 'docker/docker-compose.cn.yml']) {
  test(`${file}: migration and API discover the same installed plugins`, () => {
    const { services } = parse(fs.readFileSync(path.join(root, file), 'utf8'))
    const api = services.api
    const job = services['schema-sync']
    assert.equal(job.image, api.image)
    assert.deepEqual(job.environment, api.environment)
    assert.deepEqual(job.env_file, api.env_file)
    assert.deepEqual(job.volumes, api.volumes)
    for (const target of ['/srv/xpert/plugins', '/var/lib/xpert/data/']) {
      assert.ok(
        job.volumes.some((mount) => mount.endsWith(`:${target}`)),
        `Missing ${target}`
      )
    }
    assert.deepEqual(job.command, ['node', 'main.js', '--command', 'schema-sync'])
    assert.equal(api.depends_on['schema-sync'].condition, 'service_completed_successfully')
  })
}
