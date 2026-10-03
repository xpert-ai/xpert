// Test-only entry: renders the production settings shell against the read-only host fixture.
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { installShadcnThemeVars } from '../../src/ui'
import { ConnectionSettings } from '../../src/ConnectionSettings'
import { defaultAppearance } from '../../src/appearance-types'
import { applyDesktopTheme } from '../../src/theme'
import { setLocale } from '../../src/i18n'
import '../../src/styles.css'
installShadcnThemeVars()
setLocale('zh-Hans')
const appearance = defaultAppearance()
applyDesktopTheme(appearance, false)
function Preview() {
  const [scenario, setScenario] = useState('populated')
  const [revision, setRevision] = useState(0)
  const [dark, setDark] = useState(false)
  return (
    <>
      <div style={{ position: 'absolute', top: 8, right: 20, zIndex: 100, display: 'flex', gap: 10, fontSize: 12 }}>
        <label>
          测试场景{' '}
          <select
            aria-label="测试场景"
            value={scenario}
            onChange={async (event) => {
              const value = event.target.value
              await fetch('/__usage-scenario', { method: 'POST', body: value })
              setScenario(value)
              setRevision((n) => n + 1)
            }}
          >
            {['populated', 'empty', 'forbidden', 'unavailable', 'unlimited', 'no-plan'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            document.documentElement.classList.toggle('dark', !dark)
            applyDesktopTheme(appearance, !dark)
            setDark(!dark)
          }}
        >
          切换主题
        </button>
        <span>测试数据</span>
      </div>
      <ConnectionSettings
        key={revision}
        config={{
          apiUrl: 'http://localhost:3000',
          webUrl: 'http://localhost:4200',
          frameUrl: 'http://localhost:4200/chatkit',
          theme: dark ? 'dark' : 'light',
          locale: 'zh-Hans',
          appearance
        }}
        signedIn
        userName="个人账号"
        usageContext={{ key: String(revision), organizationName: '当前组织' }}
        initialSection="usage"
        onPreview={() => {}}
        onClose={() => {}}
        onSave={async (config) => config}
      />
    </>
  )
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Preview />
  </React.StrictMode>
)
