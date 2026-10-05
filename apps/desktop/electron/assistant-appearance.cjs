const resourceId = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/
module.exports.createAssistantAppearanceMethods = (ClientError) => {
  const assistant = (service, input) => {
    const bot = service.bots.find((item) => item.id === input?.botId || item.assistantId === input?.botId)
    const authorizedNavigation =
      typeof input?.botId === 'string' &&
      service.appearanceAssistantIds?.has(input.botId) &&
      service.appearanceAssistantIds.get(input.botId) === service.generation
    if ((!bot && !authorizedNavigation) || !service.profile?.organizationId)
      throw new ClientError('Select a Bot in the current workspace first.', 403)
    return bot ? bot.assistantId || bot.id : input.botId
  }
  return {
    assistantAppearance(input) {
      return this.request(`/api/xpert/${encodeURIComponent(assistant(this, input))}/appearance`, {
        scope: 'organization'
      })
    },
    async saveAssistantAppearance(input) {
      const id = assistant(this, input)
      const result = await this.request(`/api/xpert/${encodeURIComponent(id)}/appearance`, {
        method: 'POST',
        scope: 'organization',
        includeServerMessage: true,
        retry: false,
        body: { revision: input.revision, name: input.name, avatar: input.avatar }
      })
      // Remove only this entry's legacy name override after saving the shared identity.
      for (const bot of this.bots.filter((item) => (item.assistantId || item.id) === id)) this.clearBotProfile(bot.id)
      return result
    },
    async uploadAssistantAvatar(input) {
      return uploadImage(this, input, false, ClientError)
    },
    async uploadAssistantPet(input) {
      return uploadImage(this, input, true, ClientError)
    },
    async assistantPetCatalog(input) {
      assistant(this, input)
      const url = new URL('/pets/catalog.json', this.config.frameUrl)
      const response = await this.fetcher(url.href, { redirect: 'error', signal: AbortSignal.timeout(15000) })
      if (!response.ok) throw new ClientError('Could not load the pet catalog. Update ChatKit and retry.', 502)
      const bytes = await readLimited(response, 256 * 1024, ClientError)
      const catalog = JSON.parse(bytes.toString('utf8'))
      if (
        !Array.isArray(catalog) ||
        catalog.length > 1000 ||
        catalog.some(
          (pet) =>
            !pet ||
            typeof pet.id !== 'string' ||
            !resourceId.test(pet.id) ||
            typeof pet.label !== 'string' ||
            pet.label.length > 100 ||
            (pet.spriteVersionNumber !== undefined && ![1, 2].includes(pet.spriteVersionNumber))
        )
      )
        throw new ClientError('Could not load the pet catalog. Update ChatKit and retry.', 502)
      return catalog.map(({ id, label, spriteVersionNumber }) => ({
        id,
        label,
        ...(spriteVersionNumber === undefined ? {} : { spriteVersionNumber })
      }))
    },
    async assistantPetAsset(input) {
      assistant(this, input)
      if (typeof input.petId !== 'string' || !resourceId.test(input.petId))
        throw new ClientError('Invalid assistant settings.')
      const url = new URL(`/pets/${input.petId}/spritesheet.webp`, this.config.frameUrl)
      const response = await this.fetcher(url.href, { redirect: 'error', signal: AbortSignal.timeout(15000) })
      if (!response.ok) throw new ClientError('Could not load the pet image.', 502)
      const bytes = await readLimited(response, 8 * 1024 * 1024, ClientError)
      return { src: `data:image/webp;base64,${bytes.toString('base64')}` }
    }
  }
}

async function readLimited(response, limit, ClientError) {
  if (Number(response.headers.get('content-length')) > limit)
    throw new ClientError('Could not load the pet image.', 502)
  const reader = response.body?.getReader()
  if (!reader) throw new ClientError('Could not load the pet image.', 502)
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > limit) throw new ClientError('Could not load the pet image.', 502)
      chunks.push(Buffer.from(value))
    }
  } finally {
    await reader.cancel()
  }
  return Buffer.concat(chunks)
}

async function uploadImage(service, input, pet, ClientError) {
  const generation = service.generation
  const appearance = await service.assistantAppearance(input)
  if (!appearance.canEdit) throw new ClientError('This account does not have access.', 403)
  if (generation !== service.generation) throw new ClientError('The workspace changed. Please retry.', 409)
  const limit = (pet ? 8 : 5) * 1024 * 1024
  const message = pet ? 'Choose a PNG, WebP or GIF smaller than 8 MB.' : 'Choose a PNG image smaller than 5 MB.'
  if (
    typeof input.data !== 'string' ||
    input.data.length > Math.ceil(limit / 3) * 4 ||
    !/^[a-zA-Z0-9+/]*={0,2}$/.test(input.data)
  )
    throw new ClientError(message)
  const bytes = Buffer.from(input.data, 'base64')
  const png = bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
  const webp =
    bytes.length >= 16 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
  const gif = bytes.length >= 13 && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))
  if (bytes.length > limit || !(png || (pet && (webp || gif)))) throw new ClientError(message)
  const extension = png ? 'png' : webp ? 'webp' : 'gif'
  const body = new FormData()
  body.append(
    'file',
    new Blob([bytes], { type: `image/${extension}` }),
    `assistant-${pet ? 'pet' : 'avatar'}.${extension}`
  )
  body.append('targets', JSON.stringify([{ kind: 'storage' }]))
  const asset = await service.request('/api/files/upload', {
    method: 'POST',
    scope: 'organization',
    body,
    retry: false
  })
  if (generation !== service.generation) throw new ClientError('The workspace changed. Please retry.', 409)
  const url = asset?.destinations?.find((item) => item.kind === 'storage')?.metadata?.storageFile?.url
  if (typeof url !== 'string' || !/^https?:\/\//.test(url))
    throw new ClientError('Avatar upload did not return an image URL.', 502)
  return { url }
}
