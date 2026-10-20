# @xpert-ai/desktop-protocol

## 0.3.7

### Patch Changes

- Updated dependencies [3e0460d]
- Updated dependencies [babce0b]
- Updated dependencies [c2b52ba]
- Updated dependencies [ba77738]
- Updated dependencies [0f55121]
- Updated dependencies [8a0c256]
- Updated dependencies [854a4c0]
- Updated dependencies [1b5096f]
  - @xpert-ai/contracts@3.25.0

## 0.3.6

### Patch Changes

- Updated dependencies [c4f9bb3]
  - @xpert-ai/contracts@3.23.0

## 0.3.5

### Patch Changes

- Updated dependencies [5afe7d1]
- Updated dependencies [94dd967]
- Updated dependencies [8ecf7b0]
- Updated dependencies [94dd967]
- Updated dependencies [616bab6]
- Updated dependencies [ddeb74f]
  - @xpert-ai/contracts@3.22.0

## 0.3.4

### Patch Changes

- Updated dependencies [3b7f2cd]
  - @xpert-ai/contracts@3.21.3

## 0.3.3

### Patch Changes

- Updated dependencies [f60db7b]
- Updated dependencies [558b1cd]
  - @xpert-ai/contracts@3.21.2

## 0.3.2

### Patch Changes

- Updated dependencies [e42fc94]
- Updated dependencies [7de8eae]
- Updated dependencies [f304e7b]
- Updated dependencies [d9db433]
- Updated dependencies [f816d25]
  - @xpert-ai/contracts@3.21.1

## 0.3.1

### Patch Changes

- 75f1cd3: Support browser microphone recording with optional shared tab audio through declared View client commands and a host permission dialog. Produce independent 24 kHz PCM WAV chunks, preserve ordered retryable delivery in page memory, and carry the initiating View runtime scope to event and file actions. Add translated source selection and upload-lifetime guidance.

  Keep capture state and controls scoped to the initiating identity, View and Project, respect capture ID selection, and stop on device loss, scope changes or recording limits. Confirm meeting creation before starting capture, release devices on failed or cancelled startup, and preserve the final audio block before the stopped event. Add regression coverage for permission cleanup, delivery retries, scope changes, PCM processing and browser/native command separation.

## 0.3.0

### Minor Changes

- 17e0342: Add a generic, user-initiated microphone and system-audio capture capability on macOS 15+. Deliver versioned capture events and WAV chunks to callbacks declared by the requesting plugin View, with encrypted local buffering, resumable delivery, device ownership checks, and shutdown on sleep or account changes. Keep application workflows in plugins and publish the shared command and delivery contracts.

### Patch Changes

- Updated dependencies [eecb9fa]
- Updated dependencies [f76a9c9]
- Updated dependencies [eecb9fa]
- Updated dependencies [c5e19d5]
- Updated dependencies [4b7a346]
- Updated dependencies [4fff330]
  - @xpert-ai/contracts@3.21.0

## 0.2.1

### Patch Changes

- Updated dependencies [d18aa7f]
- Updated dependencies [b86bba1]
- Updated dependencies [a01cd48]
- Updated dependencies [bf33018]
- Updated dependencies [aa33949]
- Updated dependencies [d4dba33]
- Updated dependencies [01fd502]
- Updated dependencies [deff039]
- Updated dependencies [b66bdcc]
- Updated dependencies [b86bba1]
- Updated dependencies [f5add6a]
- Updated dependencies [c941907]
- Updated dependencies [c0dd14c]
- Updated dependencies [00b626e]
- Updated dependencies [3142346]
- Updated dependencies [3185f56]
- Updated dependencies [98a7367]
- Updated dependencies [d81dbe2]
- Updated dependencies [a131790]
  - @xpert-ai/contracts@3.20.0

## 0.2.0

### Minor Changes

- 99d09ec: Release a coordinated minor update across all Xpert workspace packages, including the API, Web and Bosi applications, shared SDK and contracts, backend and UI libraries, bundled plugins, sandbox runtimes and documentation.

### Patch Changes

- Updated dependencies [8a78318]
- Updated dependencies [1e44173]
- Updated dependencies [c953822]
- Updated dependencies [b7983c8]
- Updated dependencies [08f66e7]
- Updated dependencies [b62543f]
- Updated dependencies [5f26e05]
- Updated dependencies [99d09ec]
  - @xpert-ai/contracts@3.19.0
