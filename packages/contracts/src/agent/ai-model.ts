export enum AiModelTypeEnum {
  LLM = 'llm',
  TEXT_EMBEDDING = 'text-embedding',
  RERANK = 'rerank',
  SPEECH2TEXT = 'speech2text',
  MODERATION = 'moderation',
  TTS = 'tts',
  IMAGE = 'image',
  /** @deprecated Use IMAGE for new image-generation model providers. */
  TEXT2IMG = 'text2img',
  VIDEO = 'video'
}
