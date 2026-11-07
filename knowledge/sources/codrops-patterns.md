# Curated Codrops References

These are short, original technique notes for Scene Foundry. They describe ideas to adapt; they are not source-code templates. Do not copy repository code into generated scenes.

## WebGL sphere deformation

- Codrops article: https://tympanus.net/codrops/2021/01/26/twisted-colorful-spheres-with-three-js/
- Source repository: https://github.com/codrops/WebGLBlobs
- Reusable pattern: displace a dense sphere along its vertex normals using a time-varying noise field. Pass the same scalar displacement to the fragment shader to keep geometry and color visually coherent. A vertical UV-based sine wave can add a restrained twist.
- Scene Foundry adaptation: implement an original `ShaderMaterial`, keep displacement small enough to preserve a smooth silhouette, and derive color from the displacement value. Animate only uniforms or the parent transform; do not copy the repository shaders.
- License note: the repository README identifies its project as MIT-licensed. Verify the upstream license before reusing any source code.

## Scroll-driven layout transitions

- Codrops article: https://tympanus.net/codrops/2023/07/20/scroll-based-layout-animations/
- Source repository: https://github.com/codrops/ScrollBasedLayoutAnimations
- Reusable pattern: define the destination layout in CSS, capture the current layout with GSAP Flip, change a state class, then animate between the two layouts. ScrollTrigger can pin a short section while the transition runs.
- Scene Foundry adaptation: prefer declarative CSS states, keep each transition bounded to its owning page or component, and respect reduced-motion preferences. Do not add a competing global scroll engine.
- License note: the repository README identifies its project as MIT-licensed. Verify the upstream license before reusing any source code.

## Creative Hub project studies

These are original pattern summaries, not copied project source. Open the linked demo to study its actual motion and interaction; use the repository only after checking its license and asset credits.

### Semantic content paired with WebGL text

- Codrops article: https://tympanus.net/codrops/2025/06/05/how-to-create-responsive-and-seo-friendly-webgl-text/
- Source repository: https://github.com/ehaakana/codrops-text-demo
- Live demo: https://tympanus.net/Tutorials/AccessibleWebGLText/
- Reusable pattern: keep semantic, responsive text in the DOM and treat it as the source of truth for the visual layer. Measure its layout after fonts load, map those bounds into the 3D view, and use WebGL only for visual treatment. This preserves readable fallback content and gives the canvas a clear rendering role.
- Scene Foundry adaptation: retain accessible HTML labels and content, synchronize visual meshes on resize and font changes, and keep decorative canvas layers from intercepting pointer input.
- License: the repository README identifies its code as MIT; verify dependencies and font licenses separately.

### Masked WebGL lookbook transitions

- Creative Hub listing: https://tympanus.net/codrops/hub/all/
- Source repository: https://github.com/codrops/LookbookHoverEffects
- Live demo: https://tympanus.net/Demos/LookbookHoverEffects/
- Reusable pattern: drive a card takeover with one normalized transition value. A shader can use that value to reveal a curved, jagged, or glass-like boundary while GSAP handles enter/leave timing. Keep interaction semantics on the DOM card, not in the shader.
- Scene Foundry adaptation: use an original mask function and transition uniform, provide equivalent focus/touch behavior, and avoid layout changes during hover.
- License: the repository README identifies the code as MIT. Its font and bundled GSAP assets have separate terms; check them before reuse.

### Scroll-linked section seams

- Creative Hub listing: https://tympanus.net/codrops/hub/all/
- Source repository: https://github.com/codrops/SeamTransitions
- Live demo: https://tympanus.net/Demos/SeamTransitions/
- Reusable pattern: treat the boundary between two sections as a visual layer whose reveal is driven by scroll progress. Bind one bounded progress value to a mask, displacement, or texture blend rather than starting an independent time-based animation.
- Scene Foundry adaptation: use the host scroll lifecycle, scrub only short sections, provide a static seam for reduced motion, and avoid relying on optional paid GSAP plugins without checking their terms.
- License: the repository README identifies the project code as MIT; verify third-party plugin and media terms separately.

### Motion brief and accessible animation states

- Codrops article: https://tympanus.net/codrops/2026/10/26/animating-agents-gsap-animaxxing/
- Source repository: https://github.com/johnpolacek/museum-of-motion
- Live demo: https://tympanus.net/Demos/MuseumOfMotion/
- Reusable pattern: state the motion personality and timing rules once, then give each element an intro, settled/ambient, and outro state. Keep layout stable while animating, provide pause/replay controls for ongoing motion, and make reduced-motion a complete static presentation.
- Scene Foundry adaptation: express behavior in a short plan before coding, preserve focus and navigation during transitions, and validate for layout shift at multiple widths.
- License: the repository README identifies the project code as MIT. Check dependencies and any bundled assets separately.

### Three.js experience boundaries (study only)

- Codrops article: https://tympanus.net/codrops/2026/10/27/songs-of-hyrule-from-a-fans-idea-to-a-three-js-mini-game-in-a-few-days/
- Source repository: https://github.com/thibautlfr/ocarina
- Live demo: https://ocarina.thibaut-lefrancois.com/
- Article insight: separate world, input, audio, resources, and UI responsibilities; use typed events with explicit unsubscription; cap pixel ratio and keep performance instrumentation available.
- Scene Foundry adaptation: take only the general separation and cleanup ideas. This repository has no clearly stated code license, and its models, sounds, and game assets include third-party/Nintendo material. Do not copy its code or assets. Its singleton runtime is not a replacement for the host SPA's `App`/`Page` lifecycle.

## Preview status

- The Ocarina demo loaded in the integrated browser for a visual check. Other Codrops-hosted demos were readable through the public page fetch but returned HTTP 403 in the integrated browser during this review.
- No screenshots or video captures are stored here. Use the linked official demos to view the projects; the Hub listing also provides contributor preview media.

## Boundaries

The references are inspiration, not dependencies. Keep generated scenes self-contained and isolated in the preview iframe. For features in the host SPA, use its existing `App`, `Page`, and `Component` lifecycle rather than importing another router or the references' framework setup.
