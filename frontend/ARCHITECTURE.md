# Frontend Architecture

## Purpose

Scene Foundry uses a class-based Vanilla TypeScript SPA architecture inspired by the runtime model in the deprecated `bizarro/bizarroilerplate` project. It preserves the useful separation between application orchestration, pages, components, animations, and utilities while replacing the reference project's obsolete Webpack, Pug, custom scrolling, and manual listener conventions with Vite, TypeScript, Lenis, GSAP, and abortable lifecycles.

The reference repository has no repository license. This implementation is an original TypeScript adaptation of its architectural concepts, not a verbatim port.

## Contract for AI-generated frontend work

When implementing a feature or route in the monorepo's `frontend/` application, generated code must fit this architecture:

- Use the existing Vite and Vanilla TypeScript stack. Do not introduce React, another router, or a parallel application lifecycle.
- Put route behavior in a `Page` subclass and reusable UI behavior in a `Component` subclass. Register routes once through `App`.
- Follow the existing create/destroy lifecycle, listener, request cancellation, animation ownership, navigation, and accessibility rules in this document.
- Inspect and extend the existing implementation; do not replace working application structure with a standalone HTML document.
- Keep changes focused on the requested feature and run the frontend build.

This contract applies to code integrated into `frontend/`. The current generated-scene experience is a separate, sandboxed iframe artifact with a self-contained HTML output contract. Keep that artifact isolated; do not make it depend on the host SPA's TypeScript modules or lifecycle.

## Runtime ownership

```text
main.ts
  -> App
      -> page registry: Map<string, Page>
      -> active Page
      -> navigation and History API
      -> resize dispatch
      -> one requestAnimationFrame loop
      -> global Scroll singleton

Page
  -> Component lifecycle
  -> AnimationManager
  -> intersection Animation registry
  -> create / show / hide / reset / update / onResize / destroy

GeneratorPage
  -> generator DOM and events
  -> abortable generation/upload requests
  -> page-specific GSAP transitions
```

## Directory contract

```text
src/
├── app/
│   └── App.ts                 Persistent application controller
├── classes/
│   ├── Animation.ts           Intersection animation lifecycle
│   ├── Component.ts           Selector and listener lifecycle
│   └── Detection.ts           Cached capability detection
├── components/
│   └── Page.ts                Base route lifecycle
├── core/
│   ├── AnimationManager.ts    GSAP and ScrollTrigger ownership
│   └── Scroll.ts              Lenis/GSAP singleton
├── pages/
│   └── GeneratorPage.ts       Generator route controller
├── utils/
│   └── DOM.ts                 Type-safe DOM helpers
├── main.ts                    Minimal boot entry
└── style.css
```

## Application lifecycle

`main.ts` waits for fonts and constructs one `App`. `App` persists for the lifetime of the document.

On initial load:

1. Read the direct `#app > [data-template]` element.
2. Resolve the registered page from the page map.
3. Call `page.create(#app)`.
4. Start global listeners and the frame loop.
5. Call `page.show()`.

On navigation:

1. Fetch the destination HTML.
2. Parse `#app > [data-template]`.
3. Validate that its template is registered.
4. Await `currentPage.hide(nextTemplate)`.
5. Call `currentPage.destroy()`.
6. Replace the page DOM.
7. Update history and document title.
8. Call `nextPage.create(#app)` and `nextPage.reset()`.
9. Reset global scroll.
10. Await `nextPage.show(previousTemplate)`.
11. Refresh Lenis and ScrollTrigger measurements.

Back and Forward navigation use the same pipeline with `pushState` disabled.

## Component contract

Extend `Component` for reusable DOM behavior.

```ts
class Toolbar extends Component {
  constructor() {
    super({
      element: '.toolbar',
      elements: { buttons: 'button' },
    });
  }

  protected override onCreate(): void {
    // Cache typed elements and initialize local state.
  }

  protected override addEventListeners(): void {
    this.listen(this.element, 'click', this.handleClick);
  }

  protected override onDestroy(): void {
    // Release non-listener resources only.
  }
}
```

`create()` resolves current DOM and starts a new lifecycle `AbortController`. `destroy()` aborts listeners and page-owned requests, runs cleanup, and clears resolved descendants. Both methods are safe when called repeatedly.

Do not use raw `addEventListener` in a component when `this.listen()` can be used.

## Page contract

Every route extends `Page` and is registered in `App.registerPages()`.

```ts
class GalleryPage extends Page {
  constructor() {
    super({ element: '[data-template="gallery"]' });
  }

  override async show(previousTemplate?: string): Promise<void> {
    await super.show(previousTemplate);
    // Animate in; register GSAP objects with this.anim.
  }

  override async hide(nextTemplate?: string): Promise<void> {
    await super.hide(nextTemplate);
    // Animate out and resolve only when the transition is complete.
  }
}
```

A page may implement:

- `onCreate()` for selectors and initial state.
- `addEventListeners()` for `this.listen()` calls.
- `createAnimations()` for intersection animations.
- `show()` and `hide()` for route transitions.
- `reset()` for route-local state reset.
- `update(time)` for necessary frame work.
- `onResize()` for measurements.
- `onDestroy()` for resources not controlled by listeners or animation registries.

Never manipulate a destroyed page. After an awaited operation, check `this.isCreated` before touching DOM.

## Animation ownership

Every page-owned GSAP resource must be registered:

```ts
this.anim.registerTween(gsap.to(element, vars));
this.anim.registerTimeline(gsap.timeline());
this.anim.registerTrigger(ScrollTrigger.create(config));
```

`Page.destroy()` kills triggers, timelines, and tweens and disconnects registered intersection observers.

Use the `Animation` base class for reveal behavior driven by `IntersectionObserver`. Call `registerAnimation()` rather than retaining unmanaged observer instances.

The global application frame loop is reserved for work that truly needs every frame. Prefer GSAP, Lenis, CSS, and observers over page-level polling.

## Scrolling

`Scroll` is the only Lenis instance. It owns the exact GSAP ticker callback used for registration and teardown.

Temporary scroll locks are reference-counted:

```ts
const release = Scroll.getInstance().lock();
try {
  await work();
} finally {
  release();
}
```

This prevents a completed request from unlocking scrolling while a transition or modal still owns another lock.

Do not set `body.style.overflow` directly in page code.

## Fetch and async safety

Pass `this.signal` to page-owned requests. Destroying the page aborts them automatically.

```ts
const response = await fetch(url, { signal: this.signal });
if (!this.isCreated) return;
```

Abort errors are expected lifecycle events and should not produce user-facing failures. All acquired locks must be released in `finally` and again defensively from `onDestroy()` using an idempotent release callback.

All backend communication is owned by `services/ApiClient.ts`. The generation endpoint is a POST request returning Server-Sent Events. Pages consume typed `project`, `status`, and `complete` events and must not implement their own stream parser.

## Adding a route

1. Add a direct `#app` child with a unique `data-template` value to the route HTML.
2. Create a page class extending `Page`.
3. Register one instance in `App.registerPages()`.
4. Implement `show()` and `hide()` as awaitable transitions.
5. Keep route-specific API calls and DOM behavior inside the page.
6. Run `npm run build`.

## Deliberate differences from the reference

- Lenis replaces manual wheel interpolation and translated page wrappers.
- Event delegation replaces rebinding every anchor after navigation.
- `AbortController` replaces manual listener bookkeeping.
- GSAP animation ownership replaces unmanaged CSS/JS animation state.
- TypeScript replaces runtime-only selector assumptions.
- Vite replaces deprecated Webpack configuration.
- Accessibility behavior is preserved; Tab and focus are never disabled.
- The generated-scene iframe remains isolated from the application runtime.

These differences are mandatory. Do not reintroduce the deprecated implementation details merely to resemble the reference more closely.
