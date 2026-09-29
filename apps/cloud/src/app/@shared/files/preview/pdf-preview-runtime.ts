// Reuse the bundled worker; previews must not depend on a browser PDF extension or a CDN.
export async function loadPdfPreviewRuntime() {
  await import('pdfjs-dist/build/pdf.worker.entry')
  return import('pdfjs-dist')
}
