const byId = (id) => document.getElementById(id)
const stop = byId('stop')
const tasks = byId('tasks')
const list = byId('list')
document.addEventListener('keydown', (event) => {
  if (event.key === 'Tab') document.body.classList.add('keyboard-input')
})
function usePointer() {
  document.body.classList.remove('keyboard-input')
}
document.addEventListener('pointermove', usePointer)
document.addEventListener('pointerdown', usePointer)
let state
let assistants = []
function compactName(name) {
  return name.replace(/(?:助手|アシスタント|\bassistant)\s*$/iu, '').trim() || name
}
function assistantAvatar(assistant) {
  return overlayAvatar({ ...assistant, kind: 'assistant' })
}
let pressedGrant
stop.onpointerdown = () => {
  pressedGrant = state.active?.id
}
stop.onpointercancel = () => {
  pressedGrant = undefined
}
stop.onclick = (event) => {
  const id = event.detail ? pressedGrant : state.active?.id
  pressedGrant = undefined
  if (id) void window.bosiIsland.stop(id)
}
let hoverTimer,
  hoverOpened = false,
  pinned = false
let inside = false
const main = document.querySelector('main')
const body = byId('body')
function toggle() {
  clearTimeout(hoverTimer)
  if (!state?.active && !state?.tasks.length) return
  pinned = !state?.expanded
  hoverOpened = false
  void window.bosiIsland.expand(pinned)
}
byId('identity').onclick = tasks.onclick = toggle
function enter() {
  clearTimeout(hoverTimer)
  document.body.classList.remove('closing')
  document.body.classList.add('hovered')
  hoverTimer = setTimeout(() => {
    if ((state?.active || state?.tasks.length) && !pinned && !state?.expanded) {
      hoverOpened = true
      void window.bosiIsland.expand(true)
    }
  }, 300)
}
function leave() {
  clearTimeout(hoverTimer)
  hoverTimer = setTimeout(() => {
    if (hoverOpened && !pinned) void window.bosiIsland.expand(false)
    hoverOpened = false
    document.body.classList.remove('hovered')
  }, 100)
}
function setInside(value, fromNative = false) {
  if (!state) return
  // A forwarded native move also reconciles the click-through flag after a missed leave.
  if (inside !== value || fromNative) void window.bosiIsland.interactive(value)
  if (inside === value) return
  inside = value
  if (value) enter()
  else leave()
}
function pointerAt({ x, y }, fromNative = false) {
  const rect = main.getBoundingClientRect()
  setInside(x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom, fromNative)
}
main.onpointerenter = () => setInside(true)
main.onpointerleave = () => setInside(false)
document.addEventListener('pointermove', (event) => pointerAt({ x: event.clientX, y: event.clientY }))
function reset() {
  clearTimeout(hoverTimer)
  inside = pinned = hoverOpened = false
  state = undefined
  assistants = []
  list.replaceChildren()
  byId('identity').querySelector('.avatar')?.remove()
  byId('brand').hidden = false
  pressedGrant = undefined
  document.body.classList.remove('hovered', 'closing', 'expanded', 'ready')
}
window.bosiIsland.subscribe(
  (next) => {
    const changed = Boolean(state?.expanded) !== next.expanded
    const previous = state
    if (next.assistants) assistants = next.assistants
    const owner = next.singleOwner ? assistants[0] : null
    if (next.assistants || previous?.singleOwner !== next.singleOwner) {
      byId('identity').querySelector('.avatar')?.remove()
      byId('brand').hidden = Boolean(owner)
      if (owner) byId('identity').prepend(assistantAvatar(owner))
    }
    state = next
    document.body.style.setProperty('--surface-top', next.top + 'px')
    document.body.style.setProperty('--compact-width', next.compactWidth + 'px')
    document.body.style.setProperty('--hover-width', next.hoverWidth + 'px')
    document.body.style.setProperty('--expanded-width', next.expandedWidth + 'px')
    document.body.style.setProperty('--expanded-height', next.expandedHeight + 'px')
    if (changed) document.body.classList.toggle('closing', !next.expanded)
    if (!next.expanded) pinned = false
    document.body.classList.toggle('expanded', next.expanded)
    body.inert = !next.expanded
    document.documentElement.lang = next.locale
    document.body.classList.toggle('notched', next.gap > 0)
    document.body.style.setProperty('--bar-height', next.barHeight + 'px')
    document.body.style.setProperty('--task-row-height', next.taskRowHeight + 'px')
    document.body.style.setProperty('--detail-bottom-padding', next.detailBottomPadding + 'px')
    document.body.style.setProperty('--camera-width', next.gap + 'px')
    const first = next.tasks[0]
    byId('greeting').textContent = next.idle ? '👋' : '•••'
    byId('greeting').hidden = !next.idle && (!next.working || next.active || next.pendingTotal)
    byId('greeting').title = next.idle ? next.greeting : (next.working ?? '')
    byId('greeting').setAttribute('aria-label', byId('greeting').title)
    byId('activity').hidden = !next.active
    byId('name').textContent = owner
      ? compactName(owner.name)
      : next.pendingTotal
        ? next.labels.pending
        : (next.active?.name ?? next.working ?? 'Bosi')
    byId('identity').title =
      owner?.name ?? (next.pendingTotal ? next.labels.tasks : (next.active?.label ?? next.working ?? next.greeting))
    byId('identity').setAttribute('aria-label', byId('identity').title)
    byId('identity').setAttribute('aria-expanded', String(next.expanded))
    byId('label').textContent = next.active?.label ?? next.labels.tasks
    byId('detail').textContent = next.active?.title ?? ''
    byId('label').title = byId('label').textContent
    byId('detail').title = byId('detail').textContent
    stop.hidden = !next.active
    stop.querySelector('span').textContent = next.labels.stop
    stop.title = next.active ? next.labels.stopWindow + ' · ' + next.active.label : ''
    stop.setAttribute('aria-label', stop.title)
    tasks.hidden = !next.pendingTotal
    tasks.disabled = !first && !next.active
    tasks.dataset.kind = first?.kind ?? ''
    tasks.title = next.labels.review + ' (' + next.pendingTotal + ')'
    tasks.setAttribute('aria-label', tasks.title)
    tasks.setAttribute('aria-expanded', String(next.expanded))
    tasks.querySelector('span').textContent = next.pendingTotal
    list.hidden = !first
    if (next.assistants || JSON.stringify(previous?.tasks) !== JSON.stringify(next.tasks)) {
      list.replaceChildren(
        ...next.tasks.map((task) => {
          const assistant = assistants[task.assistant]
          const row = document.createElement('button')
          const name = document.createElement('strong')
          const action = document.createElement('span')
          name.textContent = name.title = assistant.name
          action.className = 'task-action'
          action.textContent = task.label + ' ›'
          row.append(assistantAvatar(assistant), name, action)
          row.onclick = () => window.bosiIsland.review(task.id)
          return row
        })
      )
    }
    // Establish the initial dimensions before enabling transitions on a newly shown panel.
    if (!document.body.classList.contains('ready')) {
      main.getBoundingClientRect()
      document.body.classList.add('ready')
    }
  },
  (point) => pointerAt(point, true),
  reset
)
