import ShortUniqueId from 'short-unique-id'

const suuidGenerator = new ShortUniqueId({ length: 10 })
export const suuid = (...args: Parameters<(typeof suuidGenerator)['randomUUID']>) =>
  suuidGenerator.randomUUID(...args)
