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

File URLs are now converted with `fileURLToPath()` (with the `:line:col`
suffix stripped first), Windows stack frames carrying a drive letter are
accepted, and the provider schema is loaded with `ignoreError=false` so a
missing schema fails loudly instead of becoming an undefined provider name.
