# Creative Coding Standards & Rules

## Choose the correct target

- **Host SPA feature:** extend the existing Vite/Vanilla TypeScript application. `App` owns navigation/runtime; routes extend `Page`, reusable UI extends `Component`, and page-owned listeners, requests, and animations follow their lifecycles. Read `frontend/ARCHITECTURE.md`; do not create another app, router, or frame loop.
- **Generated scene:** produce one self-contained HTML document for the sandboxed iframe. Do not import host SPA classes. Follow the standalone rules below.
- Never apply the HTML-only output rule to an SPA feature or the SPA lifecycle to an isolated scene.

## Small-step creative workflow

Work in layers and inspect each one before adding the next. Do not begin with shaders or elaborate motion.

### 1. Inspect and plan

- Read the relevant implementation and classify the target. Inventory existing UI, dependencies, scroll/reveal behavior, animations, canvases/scenes, shaders, and responsive/reduced-motion support.
- Search relevant asset locations for images, video, fonts, models, and shader files. Reuse suitable assets; do not assume an asset exists or invent a path.
- State the visual goal briefly and split it into a few outcomes: layout/content, working controls, simple motion, optional scroll reveals, optional visual effects.
- Establish hierarchy (focal subject, supporting content, controls, background, reading order). Ask one focused question only if an essential choice cannot be inferred; otherwise make a reversible choice.

### 2. Build layout and UI first

- Start with a complete static, responsive composition: structure, typography, spacing, color, and image placement. The page must remain understandable and usable with scripts or animation unavailable.
- Make visible controls work before polishing them. Prefer semantic HTML, native buttons/links, keyboard/focus/touch support, and meaningful image alt text.
- Use available images intentionally: choose crop, scale, layering, and role. Avoid arbitrary stock-like imagery. If an essential asset is missing, use a deliberate CSS/SVG treatment or ask for it.
- Check narrow and wide layouts; fix overflow, overlap, contrast, and layout shifts before adding effects.

### 3. Add restrained GSAP motion

- First inspect and reuse existing motion utilities and lifecycle ownership.
- Add a short entrance/timeline to clarify hierarchy; prefer opacity and transforms, bounded staggers, and stable layout. Do not animate every element or animate layout properties without a clear reason.
- Honor `prefers-reduced-motion`; settle or skip nonessential motion, and provide pause controls for persistent/repeating motion.

### 4. Add scroll reveals selectively

- Detect/reuse existing scroll, reveal, IntersectionObserver, or ScrollTrigger behavior. Never add a competing scroll engine or duplicate trigger.
- Reveal content only to support reading order or narrative. Default to subtle, one-shot reveals; use scrub/pinning only when the effect genuinely follows scroll progress.
- Do not leave content inaccessible or hidden if scripts fail. Clean up observers/triggers with their owning page/component.
- Check forward/backward scrolling, resize, reduced motion, and route teardown.

### 5. Choose images, DOM, WebGL, or shaders deliberately

- DOM/CSS/SVG and ordinary images are the default for interface, typography, editorial layouts, and most 2D effects. Use Three.js/WebGL only when real 3D, lighting, particles, GPU interaction, or a specific shader materially improves the brief.
- Inspect for an existing scene, canvas, image effects, shaders, and reusable components before creating another. Extend working infrastructure instead of duplicating it.
- Keep meaningful content and controls in the DOM even when a canvas adds visual treatment. Use regular images unless distortion, depth, or GPU interaction is required.
- Add custom shaders only for a specific effect that simpler CSS/SVG/materials cannot provide. Keep geometry and uniforms bounded; provide a usable non-WebGL fallback.
- For WebGL, verify asset loading, visible canvas, resize, capped pixel ratio, cleanup, and failure behavior. Do not create a second renderer/animation loop unnecessarily.
- Treat references as inspiration. Check code, plugin, font, model, and media licenses separately; do not copy unlicensed source or assets.

### 6. Verify in layers

- After layout: inspect representative viewport sizes and initial composition.
- After UI/motion: test controls, keyboard/focus, reduced motion, scroll behavior, and cleanup.
- After WebGL: test canvas visibility, assets, resize, and fallback. Use a browser screenshot/live preview when available; report limitations instead of claiming unobserved behavior.

## Standalone generated-scene rules

1. Use modern GSAP 3 APIs only (`gsap.to/from/fromTo/timeline`); never use legacy `TweenMax`, `TweenLite`, `TimelineMax`, or `TimelineLite`.
2. Keep CSS in `<style>` and browser code in `<script type="module">` before `</body>`. Do not import host SPA modules.
3. Import GSAP using CDN ESM. Import Three.js only when the rendering decision above requires WebGL.
4. For WebGL, use CDN ESM, modern geometry classes, resize camera and renderer together, and `THREE.Timer` rather than deprecated `THREE.Clock`.
5. Return only valid HTML, without Markdown fences or explanation. Preserve layout, prevent unintended overflow, and keep a usable fallback where possible.
