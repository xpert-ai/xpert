// Local UI fixture: all update actions are in memory. It never downloads or installs software.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SidebarAccount } from '../../src/SidebarAccount'
import type { UpdateState } from '../../src/update-types'
import { setLocale } from '../../src/i18n'
import { applyDesktopTheme } from '../../src/theme'
import { defaultAppearance } from '../../src/appearance-types'
import { installShadcnThemeVars } from '../../src/ui'
import '../../src/styles.css'

const params = new URL(location.href).searchParams
setLocale(params.get('locale') || 'en')
installShadcnThemeVars()
document.documentElement.classList.toggle('dark', params.has('dark'))
applyDesktopTheme(defaultAppearance(), params.has('dark'))
let state: UpdateState = {
  status: params.has('idle') ? 'idle' : 'available',
  currentVersion: '0.1.0',
  version: '0.2.0',
  percent: 0,
  operation: null,
  revision: 1
}
const listeners = new Set<(state: UpdateState) => void>()
const publish = (patch: Partial<UpdateState>) => {
  state = { ...state, ...patch, revision: state.revision + 1 }
  listeners.forEach((listener) => listener(state))
  return state
}
let downloads = 0,
  installs = 0
window.xpertDesktop = {
  platform: 'darwin',
  invoke: async () => {
    throw new Error('Unexpected API access')
  },
  openWorkspace: async () => {},
  openPlatform: async () => false,
  setSidebarCollapsed: () => {},
  updates: {
    getState: async () => {
      const snapshot = state
      if (params.has('race')) {
        publish({ status: 'downloading', percent: 73 })
        await new Promise((resolve) => setTimeout(resolve, 150))
      }
      return snapshot
    },
    check: async () => publish({ status: 'available', operation: null }),
    download: async () => {
      downloads++
      return publish(
        params.has('fail') && downloads === 1
          ? { status: 'error', operation: 'download' }
          : { status: 'downloading', percent: 42, operation: null }
      )
    },
    install: async () => {
      installs++
      document.documentElement.dataset.installs = String(installs)
      return publish({ status: 'installing' })
    },
    onState: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}
if (params.has('browser')) delete window.xpertDesktop

function Preview() {
  const [compact, setCompact] = useState(params.has('compact'))
  return (
    <main className="flex h-full bg-background text-foreground">
      <aside className="flex h-full shrink-0 flex-col border-r bg-muted/35" style={{ width: compact ? 72 : 300 }}>
        <div className="flex-1 p-6 text-lg font-semibold">Bosi</div>
        <SidebarAccount
          compact={compact}
          profile={{
            user: { id: 'fixture', name: 'Tiven Wang' },
            organizationId: 'org',
            organizations: [{ id: 'org', name: 'Xpert' }]
          }}
          webUrl="https://example.com"
          onSettings={() => {}}
          onLogout={() => {}}
        />
      </aside>
      <div className="space-x-4 p-6">
        <button onClick={() => setCompact(!compact)}>Toggle sidebar</button>
        <button onClick={() => publish({ status: 'downloaded', percent: 100, operation: null })}>
          Complete download
        </button>
      </div>
    </main>
  )
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>
)
