---
'@xpert-ai/plugin-sdk': patch
---

fix(plugin-sdk): resolve AI model provider schema paths on Windows

`AIModelProviderStrategy` derived the provider YAML directory from its own
stack frame and stripped the `file://` prefix with a plain string replace,
which leaves the leading slash before a Windows drive letter. The resulting
`dir` (`/C:/.../dist`) never resolved, and `loadYamlFile` swallowed the ENOENT
and returned `{}`, leaving `getProviderSchema().provider` undefined. That
surfaced much later as `Cannot read properties of undefined (reading
'toLowerCase')` from `AIModel.predefinedModels()`, so every request reaching
`getProviderModels()` -- including `POST /api/chat` -- returned 500.

The frame parsing is extracted into `resolveStackFramePath()` and now converts
file URLs with `fileURLToPath()` (stripping the `:line:col` suffix first so the
position cannot leak into the path), accepts Windows frames that carry a drive
letter, and falls back to stripping the scheme when the URL is not mappable on
the current platform. The provider schema is loaded with `ignoreError=false` so
a missing schema fails loudly instead of becoming an undefined provider name.
Covered by `ai-model-provider.decorator.spec.ts`.

Also fixes the package's jest config, which was written as an ES module (ESM
`import` syntax) but read `__dirname`. Jest could not even parse it
(`__dirname is not defined in ES module scope`), which disabled every
plugin-sdk test; it now derives the directory from `import.meta.url`.
