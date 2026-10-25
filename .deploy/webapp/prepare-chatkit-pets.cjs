// Keep offline pets independently provisioned; legacy UI packages remain usable
// during the rollout. Never silently build a local deployment with missing pets.
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')

function preparePets({ root = path.resolve(__dirname, '../..'), source } = {}) {
  const destination = path.join(root, '.cache/chatkit-pets')
  const resolve = createRequire(path.join(root, 'apps/cloud/package.json'))
  let installed
  try {
    installed = path.join(path.dirname(resolve.resolve('@xpert-ai/chatkit-assets/package.json')), 'pets')
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error
  }
  const candidates = source
    ? [path.resolve(root, source)]
    : [
        path.join(root, '.deploy/webapp/pet-assets/pets'),
        installed,
        path.join(root, 'node_modules/@xpert-ai/chatkit-ui/dist/app/pets'),
        path.join(root, 'apps/cloud/node_modules/@xpert-ai/chatkit-ui/dist/app/pets')
      ].filter(Boolean)
  const directory = candidates.find((entry) => fs.existsSync(path.join(entry, 'catalog.json')))
  if (!directory)
    throw new Error(
      'Missing offline ChatKit pets. Install @xpert-ai/chatkit-assets, set CHATKIT_PETS_SOURCE to its pets directory.'
    )
  const catalog = JSON.parse(fs.readFileSync(path.join(directory, 'catalog.json'), 'utf8'))
  if (!Array.isArray(catalog) || !catalog.length || !catalog.some((pet) => pet.id === 'boba'))
    throw new Error('Invalid ChatKit pet catalog')
  for (const pet of catalog) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(pet.id) || typeof pet.label !== 'string')
      throw new Error('Invalid ChatKit pet metadata')
    for (const file of ['pet.json', 'spritesheet.webp']) {
      if (!fs.statSync(path.join(directory, pet.id, file)).isFile())
        throw new Error(`Missing pet asset: ${pet.id}/${file}`)
    }
  }
  fs.rmSync(destination, { recursive: true, force: true })
  fs.mkdirSync(destination, { recursive: true })
  fs.copyFileSync(path.join(directory, 'catalog.json'), path.join(destination, 'catalog.json'))
  for (const pet of catalog) {
    fs.mkdirSync(path.join(destination, pet.id))
    for (const file of ['pet.json', 'spritesheet.webp'])
      fs.copyFileSync(path.join(directory, pet.id, file), path.join(destination, pet.id, file))
  }
  return { source: directory, destination, count: catalog.length }
}

if (require.main === module) {
  console.log(preparePets({ source: process.env.CHATKIT_PETS_SOURCE }))
}
module.exports = { preparePets }
