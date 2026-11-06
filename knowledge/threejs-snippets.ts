export const basicThreeJSBoilerplate = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Interactive scene</title>
  <style>
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
    canvas { display: block; width: 100%; height: 100%; }
  </style>
</head>
<body>
  <script type="module">
    import * as THREE from 'https://esm.sh/three';
    import gsap from 'https://esm.sh/gsap';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
    camera.position.set(0, 0, 6);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    document.body.append(renderer.domElement);

    const object = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 2),
      new THREE.MeshStandardMaterial({ color: 0x9fe870, roughness: 0.35 })
    );
    scene.add(object, new THREE.HemisphereLight(0xffffff, 0x202030, 2));
    gsap.to(object.rotation, { y: Math.PI * 2, duration: 12, repeat: -1, ease: 'none' });

    function render(time) {
      requestAnimationFrame(render);
      renderer.render(scene, camera);
    }
    requestAnimationFrame(render);

    addEventListener('resize', () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });
  </script>
</body>
</html>`;
