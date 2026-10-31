// Isolated UI fixture: no credentials, business API, Agent execution or external delivery.
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { NotificationProvider } from '../../src/notifications/NotificationProvider'
import { UserMenu } from '../../src/UserMenu'
import { Button, Dialog, DialogContent, DialogTitle, DialogDescription, installShadcnThemeVars } from '../../src/ui'
import { setLocale } from '../../src/i18n'
import { applyDesktopTheme } from '../../src/theme'
import { defaultAppearance } from '../../src/appearance-types'
import type { Announcement, NotificationSnapshot } from '@xpert-ai/contracts'
import '../../src/styles.css'
const params = new URL(location.href).searchParams
setLocale(params.get('locale') || 'en')
installShadcnThemeVars()
document.documentElement.classList.toggle('dark', params.has('dark'))
applyDesktopTheme(defaultAppearance(), params.has('dark'))
const a: Announcement = {
  id: 'a1111111-1111-4111-8111-111111111111',
  title: '维护公告 · Maintenance',
  body: '# 服务维护\n' + '维护期间后台任务会自动恢复。\n'.repeat(30) + '<img src="https://invalid.example/tracker">',
  category: 'maintenance',
  severity: 'important',
  clients: ['desktop', 'web'],
  startsAt: new Date().toISOString(),
  expiresAt: null,
  action: null,
  status: 'published',
  revision: 2,
  createdAt: new Date().toISOString(),
  dismissedAt: null
}
const history: Announcement[] = [a]
let snapshot: NotificationSnapshot = {
  supported: true,
  version: '1',
  announcements: [a],
  notifications: [],
  hasMoreAnnouncements: false,
  hasMoreNotifications: false
}
const originalFetch = window.fetch
window.fetch = async (url, init) => {
  if (url !== '/__desktop') return originalFetch(url, init)
  const { method, argument } = JSON.parse(String(init?.body))
  let value: unknown
  if (method === 'notificationSnapshot' || method === 'notificationRefresh') value = snapshot
  else if (method === 'notificationAnnouncement') value = history.find((item) => item.id === argument)
  else if (method === 'notificationDismiss') {
    snapshot = {
      ...snapshot,
      version: String(Number(snapshot.version) + 1),
      announcements: snapshot.announcements.filter((item) => item.id !== argument)
    }
    document.documentElement.dataset.dismissed = argument
    value = { dismissed: true }
  } else if (method === 'notificationHistory') value = { items: history.slice(argument), total: history.length }
  else if (method === 'notificationList') value = { items: [], hasMore: false, nextOffset: 0 }
  else throw new Error(`Unexpected fixture operation ${method}`)
  return Response.json({ ok: true, value })
}
function Fixture() {
  const [blocking, setBlocking] = useState(params.has('blocked'))
  const [identity, setIdentity] = useState(1)
  return (
    <NotificationProvider key={identity} activeThreadId={null} onOpen={async () => {}}>
      <main className="flex h-screen items-start gap-4 bg-background p-8 text-foreground">
        <div className="w-56">
          <UserMenu
            profile={{
              user: { id: 'fixture', name: '通知验收', tenantId: 'fixture', avatarUrl: null },
              organizationId: 'fixture',
              organizations: [{ id: 'fixture', name: '测试工作区' }]
            }}
            webUrl="https://example.test"
            onSettings={() => setBlocking(true)}
            onLogout={() => {
              snapshot = { ...snapshot, announcements: [] }
              setIdentity((value) => value + 1)
            }}
          />
        </div>
        <Button
          onClick={() => {
            const item = { ...a, id: 'b1111111-1111-4111-8111-111111111111', title: '新公告 · New announcement' }
            history.unshift(item)
            snapshot = { ...snapshot, version: '3', announcements: [item] }
            document.dispatchEvent(new Event('visibilitychange'))
          }}
        >
          Publish B
        </Button>
        <Button
          onClick={() => {
            snapshot = { ...snapshot, version: '4', announcements: [] }
            document.dispatchEvent(new Event('visibilitychange'))
          }}
        >
          Withdraw
        </Button>
        <Dialog open={blocking} onOpenChange={setBlocking}>
          <DialogContent>
            <DialogTitle>Existing dialog</DialogTitle>
            <DialogDescription>Announcement should wait.</DialogDescription>
            <Button onClick={() => setBlocking(false)}>Close existing dialog</Button>
          </DialogContent>
        </Dialog>
      </main>
    </NotificationProvider>
  )
}
createRoot(document.getElementById('root')!).render(<Fixture />)
