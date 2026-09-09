# ADR 0007: Bundle the IFC-Lite browser runtime with Webpack

- Status: accepted
- Date: 2026-09-09

## Context

The current IFC-Lite parser and geometry packages ship WebAssembly modules. The parser also re-exports IFCx support, which transitively includes point-cloud and LAZ WebAssembly assets even when the first viewer slice only loads IFC files.

Next.js Turbopack 16.3.4 cannot currently resolve this complete dependency graph. It tries to load generated WebAssembly glue as JavaScript and resolve WASI imports used by the transitive LAZ runtime. A production build therefore fails before the viewer can run.

The viewer also requires cross-origin isolation so IFC-Lite can use shared WebAssembly memory and workers.

## Decision

The web application uses Next.js with its Webpack builder for development, tests that start Next.js, and production builds. WebAssembly and font files are emitted as resources through explicit Webpack rules.

Viewer routes send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. Object-storage CORS explicitly allows the local application origins so signed MinIO downloads remain available from an isolated page.

Application code imports IFC-Lite only through `@mnemo/ifc-viewer-adapter`. It must not depend on generated glue files or undocumented deep package imports to reduce the bundle.

## Consequences

- Current IFC-Lite WASM assets build and run in the Next.js application.
- The first viewer bundle contains some point-cloud WebAssembly code before that feature is exposed.
- Webpack emits a warning for IFC-Lite's dynamic Node fallback import; the browser runtime does not execute that fallback.
- Turbopack can be reconsidered after both Next.js and IFC-Lite support this dependency graph without workarounds.
