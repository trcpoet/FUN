// The one module that imports Sentry, and only what errorReporting uses. A dynamic
// `import('@sentry/react')` hands back the whole namespace, which the bundler cannot
// tree-shake: replay, feedback and tracing come along, about 155 kB gzipped. Named
// static imports here let it keep only init, capture and their default integrations.
export { init, captureException } from "@sentry/react";
