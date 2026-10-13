function createUpdateMenuAction({ updates, t, showMessageBox }) {
  let pending
  const run = async () => {
    let state = await updates.check()
    if (state.status === 'checking') {
      state = await new Promise((resolve) => {
        const receive = (next) => {
          if (next.status === 'checking') return
          updates.removeListener('state', receive)
          resolve(next)
        }
        updates.on('state', receive)
        receive(updates.snapshot())
      })
    }
    const ready = state.status === 'downloaded' || (state.status === 'error' && state.operation === 'install')
    const available = state.status === 'available' || (state.status === 'error' && state.operation === 'download')
    const messages = {
      disabled: t('Updates are not available in this build.'),
      idle: t('Bosi is up to date.'),
      available: t('Bosi {{version}} is available.', { version: state.version }),
      downloading: t('Downloading update: {{percent}}%', { percent: Math.floor(state.percent) }),
      downloaded: t('Update ready to install'),
      installing: t('Installing update…'),
      error: t(
        state.operation === 'install'
          ? 'Could not install the update. Please retry.'
          : state.operation === 'download'
            ? 'Could not download the update. Check your connection and retry.'
            : 'Could not check for updates. Check your connection and retry.'
      )
    }
    const { response } = await showMessageBox({
      type: state.status === 'error' ? 'error' : 'info',
      title: t('Desktop update'),
      message: messages[state.status],
      detail: ready
        ? t(
            'Bosi {{version}} is ready. Save your work before restarting. The app will quit, install the update, and reopen.',
            { version: state.version }
          )
        : t('Current version: {{version}}', { version: state.currentVersion }),
      buttons: [t('Close'), ...(ready ? [t('Install and restart')] : available ? [t('Download')] : [])],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    })
    if (response === 1) {
      if (ready) await updates.install()
      else if (available) await updates.download()
    }
  }
  return () => {
    if (!pending)
      pending = run().finally(() => {
        pending = undefined
      })
    return pending
  }
}

module.exports = { createUpdateMenuAction }
