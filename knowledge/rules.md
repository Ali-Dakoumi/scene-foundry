# Creative Coding Standards & Rules

You are an expert creative developer. First follow the output contract for the requested target:

- **Monorepo frontend feature or route:** When asked to implement code in the existing `frontend/` application, use its Vite and Vanilla TypeScript stack and follow the class-based architecture: `App` owns routing and global runtime behavior, routes extend `Page`, reusable UI extends `Component`, and page-owned listeners, fetches, and animations follow their existing lifecycle ownership patterns. Extend the existing application; do not replace it with a standalone HTML file or introduce another framework, router, or frame loop. The full contract is in `frontend/ARCHITECTURE.md`.
- **Standalone generated scene:** The current generator produces an isolated scene for a sandboxed iframe, not a feature integrated into the monorepo SPA. For this target, return one self-contained HTML document and do not depend on host application classes or modules. Follow the scene-specific rules below.

Do not mix these targets: the HTML-only output rule applies to standalone scenes, not to in-repository frontend features; the SPA lifecycle applies to in-repository features, not to isolated iframe scenes.

## Standalone scene rules

When generating a standalone scene, adhere to these rules:

1. **Strict GSAP 3 Syntax**: 
   - NEVER use `TweenMax`, `TweenLite`, `TimelineMax`, or `TimelineLite`. 
   - Always use modern `gsap.to()`, `gsap.from()`, `gsap.fromTo()`, and `gsap.timeline()`.
2. **Three.js CDN Imports**: 
   - You are writing code that will run directly in the browser via an iframe. 
   - ALWAYS use ES module imports from CDNs (e.g., `import * as THREE from 'https://esm.sh/three';`).
   - Import GSAP via CDN (e.g., `import gsap from 'https://esm.sh/gsap';`).
3. **Responsive Canvas**: 
   - ALWAYS include a `window.addEventListener('resize')` function to update the camera's aspect ratio and the renderer's size.
4. **Modern Three.js Geometries**: 
   - Never use the deprecated `*BufferGeometry` classes (e.g., `BoxBufferGeometry`). Use `BoxGeometry`, `SphereGeometry`, etc.
   - Use `THREE.Timer` for elapsed time; do not use the deprecated `THREE.Clock`.
5. **No Markdown**: 
   - Output ONLY valid HTML code. Do not wrap your response in ```html or ``` blocks.
6. **Self-Contained File**: 
   - Put all CSS in a `<style>` tag and all JavaScript in a `<script type="module">` tag just before the closing `</body>` tag. Set `body { margin: 0; overflow: hidden; background: #000; }`.
7. **Reference originality**:
   - Use the documented architecture and patterns as guidance only. Do not copy source code verbatim from the unlicensed reference portfolio.
