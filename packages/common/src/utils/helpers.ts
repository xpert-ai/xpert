export function getErrorMessage(err: any): string {
  let error: string
  if (typeof err === 'string') {
    error = err
  } else if (err && (err.name === "AggregateError" || err.constructor.name === "AggregateError")) {
    return err.errors.map((_) => getErrorMessage(_)).join('\n\n')
  } else if (err instanceof Error) {
    error = err?.message
  } else if (err?.error instanceof Error) {
    error = err?.error?.message
  } else if(err?.message) {
    error = err?.message
  } else if (err) {
    // If there is no other way, convert it to JSON string
    error = JSON.stringify(err)
  }

  return error
}

export function getPythonErrorMessage(error) {
  const detail = error.response?.data?.detail
  if (typeof detail === 'string') {
    return detail
  } else if (Array.isArray(detail)) {
    return detail.map((item) => item.msg || item).join('\n')
  }
  return error.response?.data || getErrorMessage(error)
}