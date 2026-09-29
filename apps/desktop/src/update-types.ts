export interface UpdateState {
  status: 'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'error'
  currentVersion: string
  version: string | null
  percent: number
  operation: 'check' | 'download' | 'install' | null
  revision: number
}

export interface UpdateBridge {
  getState: () => Promise<UpdateState>
  check: () => Promise<UpdateState>
  download: () => Promise<UpdateState>
  install: () => Promise<UpdateState>
  onState: (listener: (state: UpdateState) => void) => () => void
}
