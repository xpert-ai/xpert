const $ = (id) => document.getElementById(id)
const host = window.bosiDock
let state,
  managing = false,
  lastEntries
function button(item, choice) {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = choice ? 'choice' : 'seat'
  el.setAttribute('aria-label', item.name)
  el.title = item.name
  el.append(overlayAvatar(item))
  if (choice) {
    el.setAttribute('aria-pressed', String(item.selected))
    const label = document.createElement('span')
    label.className = 'name'
    label.textContent = item.name
    const tick = document.createElement('span')
    tick.className = 'check'
    tick.textContent = item.selected ? '✓' : '+'
    el.append(label, tick)
  } else if (item.unread || item.working) {
    const badge = document.createElement('i')
    badge.className = item.unread ? 'unread' : 'working'
    el.append(badge)
  }
  el.onclick = () => (choice ? host.toggle(item.token) : host.open(item.token))
  return el
}
function render() {
  if (!state) return
  const { entries, labels } = state
  document.documentElement.lang = state.locale
  document.body.dataset.theme = state.theme
  $('heading').textContent = labels.manage
  $('add').title = labels.manage
  $('add').setAttribute('aria-label', labels.manage)
  $('grip').setAttribute('aria-label', labels.move)
  $('done').textContent = labels.done
  $('shelf').hidden = !managing
  $('rail').hidden = managing
  if (lastEntries === entries) return
  lastEntries = entries
  if (managing) {
    const nodes = []
    for (const kind of ['assistant', 'group']) {
      const items = entries.filter((item) => item.kind === kind)
      if (!items.length) continue
      const h = document.createElement('h2')
      h.textContent = labels[kind]
      nodes.push(h, ...items.map((item) => button(item, true)))
    }
    $('options').replaceChildren(...nodes)
  } else $('seats').replaceChildren(...entries.map((item) => button(item, false)))
}
$('add').onclick = $('done').onclick = () => host.manage()
const grip = $('grip')
let captured, frame, latestY
function finishDrag(phase, e) {
  if (captured == null) return
  const pointer = captured
  captured = null
  cancelAnimationFrame(frame)
  frame = null
  document.body.classList.remove('dragging')
  if (grip.hasPointerCapture(pointer)) grip.releasePointerCapture(pointer)
  if (phase) void host.drag(phase, e.screenY)
}
grip.onpointerdown = (e) => {
  if (e.button !== 0 || captured != null) return
  e.preventDefault()
  captured = e.pointerId
  grip.setPointerCapture(captured)
  document.body.classList.add('dragging')
  void host.drag('start', e.screenY)
}
grip.onpointermove = (e) => {
  if (e.pointerId !== captured) return
  latestY = e.screenY
  if (frame != null) return
  frame = requestAnimationFrame(() => {
    frame = null
    void host.drag('move', latestY)
  })
}
grip.onpointerup = (e) => {
  if (e.pointerId === captured) {
    e.preventDefault()
    finishDrag('end', e)
  }
}
grip.onpointercancel = grip.onlostpointercapture = (e) => {
  if (e.pointerId === captured) finishDrag('cancel', e)
}
grip.onkeydown = (e) => {
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return
  e.preventDefault()
  void host.nudge(e.key)
}
host.subscribe(
  (value) => {
    state = value
    managing = value.managing
    render()
  },
  ({ edge, open, offset, strip, question, completed }) => {
    $('strip').hidden = !strip
    $('strip').classList.toggle('question', question)
    const result = $('result')
    result.hidden = !completed
    if (completed) {
      result.querySelector('span').textContent = completed.name
      result.querySelector('strong').textContent = completed.title
      result.onclick = () => host.openResult(completed.token)
    }
    document.body.dataset.edge = edge
    document.body.classList.toggle('shown', open)
    $('rail').inert = !open
    grip.setAttribute('aria-valuenow', String(Math.round(offset * 100)))
  },
  () => finishDrag()
)
