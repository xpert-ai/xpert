const { avatarGlyph } = require('../avatar-url.cjs')
const { randomUUID } = require('node:crypto')

const { dockPreferences: preferences } = require('../overlay-preferences.cjs')
const identity = (seat) => JSON.stringify([seat.kind, seat.id])

function account(service) {
  const profile = service.profile
  if (!service.credentials || !profile?.user.id || !profile.organizationId) return null
  return JSON.stringify([service.config.apiUrl, profile.user.tenantId, profile.user.id, profile.organizationId])
}

class DockSeats {
  keys = new Map()
  choices = new Map()
  selected = []
  refresh(service, groups) {
    const sidebar = service.sidebarState()
    const pins = new Map(sidebar.items.map((item) => [item.botId, item.pinnedAt || 0]))
    const activity = new Map(service.assistantActivity.items.map((item) => [item.xpertId, item]))
    const bots = [...service.bots].sort((a, b) => (pins.get(b.id) || 0) - (pins.get(a.id) || 0))
    const all = bots.map((bot) => {
      const current = activity.get(bot.assistantId || bot.id)
      return {
        kind: 'assistant',
        id: bot.id,
        name: bot.name,
        glyph: avatarGlyph(bot),
        image: bot.avatarUrl || null,
        unread: current?.unreadMessages || 0,
        question: current?.pendingThreads?.some((task) => task.kind === 'question') === true,
        working: current?.hasActiveRuns === true
      }
    })
    for (const group of groups) {
      if (group.purpose !== 'group' || group.archived) continue
      all.push({
        kind: 'group',
        id: group.id,
        name: group.title,
        glyph: '#',
        unread: group.unread ? 1 : 0,
        working: false
      })
    }
    const keys = new Map()
    const choices = new Map()
    for (const item of all) {
      const key = identity(item)
      const token = this.keys.get(key) || randomUUID()
      keys.set(key, token)
      choices.set(token, item)
    }
    this.keys = keys
    this.choices = choices
    const saved = Array.isArray(sidebar.dockSeats)
      ? sidebar.dockSeats
      : bots.slice(0, 3).map((b) => ({ kind: 'assistant', id: b.id }))
    this.selected = saved.filter((s) => s && typeof s.id === 'string' && ['assistant', 'group'].includes(s.kind))
  }
  entries(managing) {
    const selected = new Set(this.selected.map(identity))
    const tokens = managing ? this.choices.keys() : this.selected.map((s) => this.keys.get(identity(s)))
    return Array.from(tokens).flatMap((token) => {
      const seat = this.choices.get(token)
      if (!seat) return []
      return [
        {
          token,
          kind: seat.kind,
          name: seat.name,
          glyph: seat.glyph,
          image: seat.image ?? null,
          unread: seat.unread,
          working: seat.working,
          question: seat.question === true,
          selected: selected.has(identity(seat))
        }
      ]
    })
  }
  toggle(service, scope, token) {
    const seat = this.choices.get(token)
    if (!seat || account(service) !== scope) return false
    const key = identity(seat)
    const previous = this.selected
    const next = previous.some((s) => identity(s) === key)
      ? previous.filter((s) => identity(s) !== key)
      : [...previous, { kind: seat.kind, id: seat.id }]
    const sidebar = service.sidebarState()
    service.sidebars[scope] = { ...sidebar, dockSeats: next }
    try {
      service.persist()
    } catch (error) {
      service.sidebars[scope] = sidebar
      throw error
    }
    return true
  }
}

function readDockOffsets(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      ([id, offset]) => /^-?\d+$/.test(id) && Number.isFinite(offset) && offset >= 0 && offset <= 1
    )
  )
}

function dockOffset(area, height, y) {
  const room = area.height - height
  return room > 0 ? Math.max(0, Math.min(1, (y - area.y) / room)) : 0.5
}

function dockBounds(area, edge, count, open, managing, offset = 0.5, scale = 1, result = false) {
  // Keep 46 points at each end for the shoulders and the handle below the rail.
  const height = Math.min(area.height, Math.round((managing ? 400 : 104 + 54 * Math.min(count + 1, 9)) * scale))
  const width = Math.min(area.width, Math.round((managing ? 268 : result ? 284 : open ? 78 : 6) * scale))
  return {
    width,
    height,
    x: edge === 'left' ? area.x : area.x + area.width - width,
    y: area.y + Math.round((area.height - height) * offset)
  }
}

// The same 24-point quarter circle and 20-point hit stroke as the handle in dock.html.
function hitsDockHandle(distanceFromEdge, yFromRailBottom) {
  const x = distanceFromEdge - 37
  const y = yFromRailBottom - 34
  if (x > 0) return Math.hypot(x, y + 24) <= 10
  if (y > 0) return Math.hypot(x + 24, y) <= 10
  return Math.abs(Math.hypot(x, y) - 24) <= 10
}

module.exports = { account, DockSeats, dockBounds, dockOffset, hitsDockHandle, preferences, readDockOffsets }
