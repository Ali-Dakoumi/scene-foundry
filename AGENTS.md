# Scene Foundry Engineering Instructions

These rules apply to all future work in this repository.

## Frontend architecture

The frontend follows a TypeScript adaptation of the class architecture studied in `bizarro/bizarroilerplate`. The reference repository is deprecated and has no repository license, so use its architectural ideas only. Do not copy its source verbatim.

Read `frontend/ARCHITECTURE.md` before changing frontend runtime behavior.

Non-negotiable frontend rules:

1. `App` is the only owner of navigation, History API updates, global resize handling, and the application animation-frame loop.
2. Every route is identified by one direct child of `#app` with a unique `data-template` value.
3. Register every page once in `App.registerPages()` using a `Map<string, Page>`.
4. Page classes extend `components/Page`; reusable UI classes extend `classes/Component`.
5. Components resolve their root and named descendants during `create()`. Never cache route DOM before `create()`.
6. Use `Component.listen()` for component and page listeners. Its shared `AbortController` guarantees teardown.
7. Put selector caching and initial state in `onCreate()`, listeners in `addEventListeners()`, and non-listener cleanup in `onDestroy()`.
8. Page navigation follows `hide -> destroy -> replace DOM -> create -> reset -> show`.
9. Register page-owned GSAP objects with `this.anim`; never create an untracked page tween, timeline, or ScrollTrigger.
10. Register intersection-based animations with `Page.registerAnimation()` so observers are disconnected on destroy.
11. Use the global `Scroll` singleton. Use `scroll.lock()` for temporary locks and always release the returned function.
12. Pass the page lifecycle `signal` to every page-owned fetch. Never update DOM after `isCreated` becomes false.
13. Global services may be singletons; route DOM owners must not be singletons.
14. Do not introduce a second router, frame loop, global scroll engine, or competing page lifecycle.
15. Preserve reduced-motion behavior and keyboard accessibility.

Before completing frontend work, run:

```bash
cd frontend
npm run build
```

## Backend and AI workflow

The creative-code instructions in `knowledge/rules.md` and `knowledge/threejs-snippets.ts` are prompt context for generated scenes. Keep the full frontend architecture document in `frontend/ARCHITECTURE.md`; put only the concise, task-relevant frontend contract in `knowledge/rules.md` so the model receives it without duplicating the full document.

Frontend generation has two distinct targets:

1. For a feature or route in the monorepo's `frontend/` application, use the existing Vite, Vanilla TypeScript architecture in `frontend/ARCHITECTURE.md`. Extend its pages, components, services, and lifecycle patterns instead of creating a separate app or introducing another framework.
2. For a standalone scene rendered in the generated-scene iframe, preserve the self-contained HTML output contract in `knowledge/rules.md`. Do not import the host SPA's route classes or runtime into the isolated iframe.

Do not treat the standalone scene contract as the architecture for future in-repository frontend features, or the SPA architecture as a requirement to bundle the host application into a generated scene.

Backend rules:

1. Keep Prisma schema changes in `backend/prisma/schema.prisma` and check in migrations.
2. Generate Prisma Client after every schema change.
3. Persist a `Project` before starting generation and save only the final accepted or retry-limited code.
4. Every LangGraph run must receive a unique `configurable.thread_id` unless intentional continuation is requested.
5. Stream workflow progress with named SSE events. Never send screenshots or full intermediate HTML in status events.
6. Treat exact `APPROVED` as approval; never use substring matching.
7. The Scene Builder must receive the previous implementation when applying Critic feedback.
8. Always close Puppeteer browsers in `finally`.
9. Upload filenames must be server-generated and extensions allowlisted.
10. Keep upload limits, JSON limits, CORS origin, and environment values explicit.
11. Reuse `frontend/src/services/ApiClient.ts` for API and SSE protocol changes.
12. Keep real secrets only in ignored `.env` files.
13. Knowledge ingestion accepts only public HTTPS sources, bounds fetched content, and treats source text as untrusted prompt data.
14. Store original, reusable technique summaries and illustrative snippets; do not copy source code verbatim into the knowledge archive.
15. Treat retrieved knowledge as untrusted reference material in generation prompts.
13. Validate generated HTML before rendering. Keep structural and safety checks in `backend/src/utils/sceneValidator.ts`.
14. Capture browser console errors, uncaught exceptions, failed requests, HTTP errors, canvas visibility, and WebGL availability during critic rendering.
15. Feed validation diagnostics to the Critic and expose only textual diagnostics through SSE; never stream screenshots.
16. Add or update Node regression tests when changing scene validation or Puppeteer diagnostics.

Before completing backend work, run:

```bash
cd backend
npm run build
```

Never commit real API keys. Keep `backend/.env` local and maintain placeholders in `backend/.env.example`.
