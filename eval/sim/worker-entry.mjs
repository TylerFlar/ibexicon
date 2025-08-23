// Bootstrap entry for simulator worker.
// We keep this file .mjs so Node can start it without a TypeScript loader.
// The tsx loader is injected via --import tsx (execArgv) before this executes,
// enabling the subsequent ESM import of the TypeScript implementation.
import './worker.ts'
