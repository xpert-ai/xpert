// Readiness alone does not check database/cache connectivity.
async function check() {
  const base = `http://127.0.0.1:${process.env.PORT || 3000}/api/health`
  const request = async (url) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error(`Health endpoint returned HTTP ${response.status}`)
    return response.json()
  }
  const [ready, health] = await Promise.all([request(`${base}/ready`), request(base)])
  if (ready.status !== 'ready' || health.status !== 'ok') throw new Error('API is not healthy and ready')
  const required = ['database', 'cache', ...(process.env.REDIS_ENABLED === 'true' ? ['redis'] : [])]
  for (const name of required) {
    if (health.details?.[name]?.status !== 'up') throw new Error(`${name} is not healthy`)
  }
  console.log('API ready; database and cache healthy')
}

check().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
