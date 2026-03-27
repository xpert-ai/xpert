import { IEnvironment } from './types'

type RuntimeEnvironment = Partial<
  Pick<IEnvironment, 'CHATKIT_FRAME_URL' | 'CHATKIT_API_URL' | 'CHATKIT_API_KEY' | 'CHATKIT_XPERT_ID'>
>

export function getRuntimeEnv(): RuntimeEnvironment {
  return (
    (globalThis as typeof globalThis & {
      __XPERT_RUNTIME_ENV__?: RuntimeEnvironment
    }).__XPERT_RUNTIME_ENV__ || {}
  )
}
