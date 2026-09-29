// Invariant: read framework metadata only after all providers load. Reading it
// early can hide metadata loss caused by mixed reflect-metadata installations.
const assert = require('node:assert/strict')
const { Module } = require('@nestjs/common')
require('@nestjs/cqrs')
const { NestFactory, RouterModule } = require('@nestjs/core')
require('typeorm')
require('@nestjs/websockets')

assert.equal(Reflect.getMetadata('design:paramtypes', RouterModule)?.length, 2)
assert.equal(Reflect.getMetadata('self:paramtypes', RouterModule)?.[0]?.index, 1)

class RuntimeMetadataCheck {}
Module({ imports: [RouterModule.register([{ path: 'metadata-check', module: RuntimeMetadataCheck }])] })(
  RuntimeMetadataCheck
)

NestFactory.createApplicationContext(RuntimeMetadataCheck, { logger: false, abortOnError: false })
  .then(async (app) => {
    await app.close()
    console.log('Runtime metadata and router injection verified')
  })
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
