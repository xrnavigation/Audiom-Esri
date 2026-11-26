# @xrnavigation/audiom-runtime

Contract and in-process factory for an Experience Builder host. This package does not draw a map and does not talk to the legacy embed iframe.

Audiom-Embedder builds a URL and listens for postMessage. This package is the runtime that host calls, either in process or later through the same message shapes.

## Install

The package is not published. This folder is a source copy for the Experience Builder widget, the same way `shared/audiom-client` copies Audiom-Embedder. The canonical package remains the Audiom-Runtime repository.

Build it, then depend on this folder:

```json
{
  "dependencies": {
    "@xrnavigation/audiom-runtime": "file:./ArcGIS/client/your-extensions/shared/audiom-runtime"
  }
}
```

## Entries

- `@xrnavigation/audiom-runtime/contract` — types, errors, session, and JSON schema. No MapWorld, layerloader, or renderer.
- `@xrnavigation/audiom-runtime/in-process` — `createInProcessRuntime(config, host)`. The host passes snapshot and selection callbacks. Those callbacks may use MapWorld; this entry does not import it.

Do not publish this package from a feature branch. Remove `"private": true` only when the registry publish is intentional.
