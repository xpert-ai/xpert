export function getErrorMessage(err: any): string {
  let error: string
  if (typeof err === 'string') {
    error = err
  } else if (err && err.constructor.name === "AggregateError") {
    return err.errors.map((_) => getErrorMessage(_)).join('\n\n')
  } else if (err instanceof Error) {
    error = err?.message
  } else if (err?.error instanceof Error) {
    error = err?.error?.message
  } else if(err?.message) {
    error = err?.message
  } else if (err) {
    // 实在没办法则转成 JSON string
    error = JSON.stringify(err)
  }

  return error
}
