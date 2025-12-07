import ShortUniqueId from 'short-unique-id'

const shortuuidGenerator = new ShortUniqueId({ length: 10 })
export const shortuuid = (...args: Parameters<(typeof shortuuidGenerator)['randomUUID']>) =>
  shortuuidGenerator.randomUUID(...args)
