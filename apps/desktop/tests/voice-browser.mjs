// Browser audio pipeline smoke test against a local protocol fixture; no provider credentials.
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { WebSocketServer } from 'ws'
const require = createRequire(new URL('../package.json', import.meta.url))
const { createServer } = await import(require.resolve('vite'))
const root = fileURLToPath(new URL('..', import.meta.url))
const ws = new WebSocketServer({ port: 0, host: '127.0.0.1' })
await once(ws, 'listening')
const frames = []
const controls = []
let peer
ws.on('connection', (socket) => {
  peer = socket
  socket.on('message', (data, binary) =>
    binary ? frames.push(data.length) : controls.push(JSON.parse(data.toString()))
  )
  socket.send(JSON.stringify({ type: 'ready', sessionId: 'test' }))
})
const vite = await createServer({
  configFile: false,
  root,
  server: { host: '127.0.0.1', port: 0 },
  appType: 'custom',
  optimizeDeps: { entries: [], include: ['react'] }
})
vite.middlewares.use('/__voice-smoke', (_request, response) => {
  response.setHeader('Content-Type', 'text/html')
  response.end(`<!doctype html><html><body><iframe id="dialer" srcdoc="<button id='start' onclick='parent.postMessage({type: &quot;dial&quot;}, location.ancestorOrigins[0])'>Call</button>"></iframe><button id="mute">Mute</button><button id="interrupt">Interrupt</button><button id="end">End</button>
<script type="module">
import { VoiceRuntime } from '/src/voice/runtime.ts'
window.states=[]; window.streams=[]; window.hostCalls=[]; window.diagnostics=[];
const media=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia=async (options)=>{const stream=await media(options);window.streams.push(stream);return stream};
window.xpertDesktop={platform:'test',invoke:async (method)=>{window.hostCalls.push(method);return {ok:true,value:method==='voiceStart'?{sessionId:'test',conversationId:'conversation',threadId:'thread',assistantId:'assistant',ticket:'a'.repeat(64),url:'ws://127.0.0.1:${ws.address().port}'}:{ended:true}}}};
window.call=new VoiceRuntime((state)=>window.states.push(state),()=>{},(code)=>window.diagnostics.push(code??null));
window.addEventListener('message',(event)=>{if(event.source!==document.querySelector('#dialer').contentWindow||event.data?.type!=='dial')return;window.call.start({botId:'bot',assistantId:'assistant',threadId:null,name:'Test'},()=>{});});
document.querySelector('#mute').onclick=()=>window.call.mute(true);
document.querySelector('#interrupt').onclick=()=>window.call.interrupt();
document.querySelector('#end').onclick=()=>window.call.close();
</script></body></html>`)
})
let browser
try {
  await vite.listen()
  const address = vite.httpServer.address()
  browser = await chromium.launch({
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
  })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${address.port}/__voice-smoke`)
  await page.frameLocator('#dialer').locator('#start').click()
  await page.waitForFunction(() => window.states.includes('listening'))
  for (let n = 0; frames.length < 5 && n < 100; n++) await new Promise((resolve) => setTimeout(resolve, 20))
  assert.ok(frames.length >= 5, 'microphone frames reached the gateway')
  assert.ok(
    frames.every((size) => size === 640),
    'PCM frames are exactly 20 ms'
  )
  const audio = Buffer.alloc(24000)
  for (let i = 0; i < 12000; i++) audio.writeInt16LE(Math.round(Math.sin((i * Math.PI) / 27) * 6000), i * 2)
  peer.send(JSON.stringify({ type: 'response.started', responseId: 'r' }))
  // Three seconds generated in a burst used to overflow the one-second worklet queue.
  for (let i = 0; i < 6; i++) peer.send(audio)
  peer.send(JSON.stringify({ type: 'response.done', responseId: 'r' }))
  await page.waitForFunction(() => window.states.includes('speaking'))
  for (let i = 0; i < 100 && !controls.some((event) => event.type === 'playback.done' && event.responseId === 'r'); i++)
    await new Promise((resolve) => setTimeout(resolve, 50))
  assert.ok(
    controls.some((event) => event.type === 'playback.done' && event.responseId === 'r'),
    'full burst response plays to completion'
  )
  assert.ok(!controls.some((event) => event.type === 'end'), 'finishing one response does not hang up')
  assert.equal(await page.evaluate(() => window.states.includes('error')), false)

  peer.send(JSON.stringify({ type: 'response.started', responseId: 'interrupt' }))
  for (let i = 0; i < 8; i++) peer.send(audio)
  peer.send(JSON.stringify({ type: 'response.done', responseId: 'interrupt' }))
  await page.waitForFunction(() => window.states.at(-1) === 'speaking')
  await page.click('#interrupt')
  await page.waitForFunction(() => window.states.at(-1) === 'listening')
  assert.ok(
    !controls.some((event) => event.type === 'playback.done' && event.responseId === 'interrupt'),
    'interruption does not claim full playback'
  )

  // Keep memory bounded but interrupt only this oversized reply, not the entire call.
  peer.send(JSON.stringify({ type: 'response.started', responseId: 'oversized' }))
  for (let i = 0; i < 64; i++) peer.send(audio)
  peer.send(JSON.stringify({ type: 'response.done', responseId: 'oversized' }))
  await page.waitForFunction(() => window.diagnostics.includes('playback_overflow'))
  await page.waitForFunction(() => window.states.at(-1) === 'listening')
  assert.ok(!controls.some((event) => event.type === 'end'), 'oversized reply preserves the call')
  peer.send(audio) // A late frame from the interrupted response must be discarded.
  await new Promise((resolve) => setTimeout(resolve, 100))
  assert.equal(await page.evaluate(() => window.states.at(-1)), 'listening')
  peer.send(JSON.stringify({ type: 'response.started', responseId: 'next' }))
  peer.send(audio)
  peer.send(JSON.stringify({ type: 'response.done', responseId: 'next' }))
  await page.waitForFunction(() => window.states.at(-1) === 'speaking')
  await page.waitForFunction(() => window.states.at(-1) === 'listening')
  assert.equal(
    await page.evaluate(() => window.diagnostics.at(-1)),
    null,
    'the next response clears the recoverable warning'
  )
  await page.click('#mute')
  await new Promise((resolve) => setTimeout(resolve, 100))
  const mutedCount = frames.length
  await new Promise((resolve) => setTimeout(resolve, 120))
  assert.equal(frames.length, mutedCount, 'muted microphone sends no audio')
  await page.click('#end')
  await page.waitForFunction(() =>
    window.streams.every((stream) => stream.getTracks().every((track) => track.readyState === 'ended'))
  )
  assert.ok(controls.some((event) => event.type === 'interrupt'))
  assert.ok(controls.some((event) => event.type === 'mute' && event.muted))
  assert.equal(controls.filter((event) => event.type === 'end').length, 1, 'only explicit hangup ends the call')
  assert.equal(errors.length, 0, errors.join('\n'))
  console.log(
    'Browser voice smoke passed: microphone, PCM, burst playback, multiple turns, interruption, overflow recovery, mute, track cleanup.'
  )
} finally {
  await browser?.close()
  for (const socket of ws.clients) socket.terminate()
  await new Promise((resolve) => ws.close(resolve))
  await vite.close()
}
