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

## Boundaries

The references are inspiration, not dependencies. Keep generated scenes self-contained and isolated in the preview iframe. For features in the host SPA, use its existing `App`, `Page`, and `Component` lifecycle rather than importing another router or the references' framework setup.
