# Offline pet build input

Extract `@xpert-ai/chatkit-assets` here so this directory contains `pets/catalog.json`
and `pets/<id>/spritesheet.webp`. Only the extracted `pets` directory is needed.
It is ignored by Git but included in the Docker build context. The build prepares
these assets into Cloud's `/pets` output; no external network is needed at runtime.

Alternatively install the optional package in the Cloud build workspace, or set
`CHATKIT_PETS_SOURCE` to a local `pets` directory for non-Docker builds.
