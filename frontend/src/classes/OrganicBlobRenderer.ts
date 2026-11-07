const vertexShaderSource = `
precision mediump float;

attribute vec3 aPosition;
attribute vec3 aNormal;

uniform mat4 uProjection;
uniform float uTime;
uniform vec2 uPointer;

varying vec3 vNormal;
varying vec3 vPosition;

float hash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

float noise(vec3 p) {
  vec3 cell = floor(p);
  vec3 local = fract(p);
  local = local * local * (3.0 - 2.0 * local);

  float a = hash(cell);
  float b = hash(cell + vec3(1.0, 0.0, 0.0));
  float c = hash(cell + vec3(0.0, 1.0, 0.0));
  float d = hash(cell + vec3(1.0, 1.0, 0.0));
  float e = hash(cell + vec3(0.0, 0.0, 1.0));
  float f = hash(cell + vec3(1.0, 0.0, 1.0));
  float g = hash(cell + vec3(0.0, 1.0, 1.0));
  float h = hash(cell + vec3(1.0, 1.0, 1.0));

  float lower = mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
  float upper = mix(mix(e, f, local.x), mix(g, h, local.x), local.y);
  return mix(lower, upper, local.z) * 2.0 - 1.0;
}

float organicNoise(vec3 p) {
  float value = noise(p);
  value += noise(p * 2.03 + vec3(2.4, -1.7, 0.8)) * 0.45;
  value += noise(p * 4.07 + vec3(-0.9, 3.1, 2.2)) * 0.2;
  return value / 1.65;
}

void main() {
  vec3 point = aPosition;
  float broad = organicNoise(point * 2.35 + vec3(uTime * 0.11, -uTime * 0.08, uTime * 0.09));
  float fine = noise(point * 6.0 - vec3(uTime * 0.13, 0.0, uTime * 0.1));
  float pointerFalloff = exp(-length(point.xy - uPointer) * 2.1);
  float pointerRipple = sin(point.x * 3.0 + point.y * 2.2 - uTime * 1.6) * pointerFalloff;
  float displacement = broad * 0.12 + fine * 0.025 + pointerRipple * 0.045;
  point += aNormal * displacement;

  float rotation = uTime * 0.12 + uPointer.x * 0.08;
  mat3 rotateY = mat3(
    cos(rotation), 0.0, sin(rotation),
    0.0, 1.0, 0.0,
    -sin(rotation), 0.0, cos(rotation)
  );
  mat3 rotateX = mat3(
    1.0, 0.0, 0.0,
    0.0, cos(uPointer.y * 0.08), -sin(uPointer.y * 0.08),
    0.0, sin(uPointer.y * 0.08), cos(uPointer.y * 0.08)
  );

  vec3 rotatedPoint = rotateY * rotateX * point * 1.08;
  vec3 rotatedNormal = normalize(rotateY * rotateX * aNormal);
  vPosition = rotatedPoint + vec3(0.0, 0.0, -3.55);
  vNormal = rotatedNormal;
  gl_Position = uProjection * vec4(vPosition, 1.0);
}
`;

const fragmentShaderSource = `
precision mediump float;

uniform vec2 uPointer;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDirection = normalize(-vPosition);
  vec3 keyLight = normalize(vec3(-0.55 + uPointer.x * 0.18, 0.68 + uPointer.y * 0.12, 0.72));
  vec3 fillLight = normalize(vec3(0.72, -0.5, 0.35));

  float keyDiffuse = max(dot(normal, keyLight), 0.0);
  float fillDiffuse = max(dot(normal, fillLight), 0.0);
  float specular = pow(max(dot(normal, normalize(keyLight + viewDirection)), 0.0), 42.0);
  float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.5);

  vec3 deepTeal = vec3(0.025, 0.32, 0.34);
  vec3 blueViolet = vec3(0.27, 0.15, 0.52);
  vec3 base = mix(deepTeal, blueViolet, smoothstep(-0.45, 0.75, normal.y + normal.x * 0.28));
  vec3 color = base * (0.18 + keyDiffuse * 0.95 + fillDiffuse * 0.28);
  color += vec3(0.48, 0.92, 0.79) * specular * 0.9;
  color += vec3(0.18, 0.55, 0.73) * rim * 0.62;

  gl_FragColor = vec4(color, 1.0);
}
`;

interface SphereMesh {
  positions: Float32Array;
  indices: Uint16Array;
}

function createSphereMesh(latitudeSegments = 56, longitudeSegments = 72): SphereMesh {
  const positions: number[] = [];
  const indices: number[] = [];

  for (let latitude = 0; latitude <= latitudeSegments; latitude += 1) {
    const theta = (latitude * Math.PI) / latitudeSegments;
    for (let longitude = 0; longitude <= longitudeSegments; longitude += 1) {
      const phi = (longitude * Math.PI * 2) / longitudeSegments;
      const x = Math.sin(theta) * Math.cos(phi);
      const y = Math.cos(theta);
      const z = Math.sin(theta) * Math.sin(phi);
      positions.push(x, y, z);
    }
  }

  for (let latitude = 0; latitude < latitudeSegments; latitude += 1) {
    for (let longitude = 0; longitude < longitudeSegments; longitude += 1) {
      const topLeft = latitude * (longitudeSegments + 1) + longitude;
      const bottomLeft = topLeft + longitudeSegments + 1;
      indices.push(
        topLeft, bottomLeft, topLeft + 1,
        bottomLeft, bottomLeft + 1, topLeft + 1,
      );
    }
  }

  return { positions: new Float32Array(positions), indices: new Uint16Array(indices) };
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('The browser could not allocate a WebGL shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unknown shader compilation error.';
    gl.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

function createProjection(aspect: number): Float32Array {
  const near = 0.1;
  const far = 50;
  const scale = 1 / Math.tan((37 * Math.PI) / 360);
  return new Float32Array([
    scale / aspect, 0, 0, 0,
    0, scale, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0,
  ]);
}

export class OrganicBlobRenderer {
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly positionBuffer: WebGLBuffer;
  private readonly indexBuffer: WebGLBuffer;
  private readonly indexCount: number;
  private readonly positionLocation: number;
  private readonly normalLocation: number;
  private readonly projectionLocation: WebGLUniformLocation | null;
  private readonly timeLocation: WebGLUniformLocation | null;
  private readonly pointerLocation: WebGLUniformLocation | null;
  private pointerX = 0;
  private pointerY = 0;
  private targetX = 0;
  private targetY = 0;
  private elapsed = 0;
  private lastTime = 0;
  private destroyed = false;
  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL is unavailable in this browser.');
    this.gl = gl;

    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    const program = gl.createProgram();
    if (!program) throw new Error('The browser could not allocate a WebGL program.');
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) || 'Unknown WebGL program link error.';
      gl.deleteProgram(program);
      throw new Error(message);
    }

    this.program = program;
    this.positionLocation = gl.getAttribLocation(program, 'aPosition');
    this.normalLocation = gl.getAttribLocation(program, 'aNormal');
    this.projectionLocation = gl.getUniformLocation(program, 'uProjection');
    this.timeLocation = gl.getUniformLocation(program, 'uTime');
    this.pointerLocation = gl.getUniformLocation(program, 'uPointer');
    if (this.positionLocation < 0 || this.normalLocation < 0) {
      gl.deleteProgram(program);
      throw new Error('The WebGL program is missing a required vertex attribute.');
    }

    const mesh = createSphereMesh();
    const positionBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();
    if (!positionBuffer || !indexBuffer) {
      if (positionBuffer) gl.deleteBuffer(positionBuffer);
      if (indexBuffer) gl.deleteBuffer(indexBuffer);
      gl.deleteProgram(program);
      throw new Error('The browser could not allocate WebGL geometry buffers.');
    }
    this.positionBuffer = positionBuffer;
    this.indexBuffer = indexBuffer;
    this.indexCount = mesh.indices.length;

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    gl.useProgram(program);
    gl.enableVertexAttribArray(this.positionLocation);
    gl.vertexAttribPointer(this.positionLocation, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(this.normalLocation);
    gl.vertexAttribPointer(this.normalLocation, 3, gl.FLOAT, false, 0, 0);
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    this.resize();
  }

  setPointer(x: number, y: number): void {
    this.targetX = Math.max(-1, Math.min(1, x));
    this.targetY = Math.max(-1, Math.min(1, y));
  }

  resize(): void {
    if (this.destroyed) return;
    const rect = this.canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * pixelRatio));
    const height = Math.max(1, Math.round(rect.height * pixelRatio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.gl.viewport(0, 0, width, height);
    this.gl.useProgram(this.program);
    this.gl.uniformMatrix4fv(
      this.projectionLocation,
      false,
      createProjection(width / height),
    );
    this.canvas.dataset.ready = 'true';
  }

  update(time: number, reducedMotion: boolean): void {
    if (this.destroyed) return;
    const delta = this.lastTime === 0 ? 0 : Math.min((time - this.lastTime) / 1_000, 0.05);
    this.lastTime = time;
    if (!reducedMotion) this.elapsed += delta;

    const damping = reducedMotion ? 1 : 1 - Math.exp(-delta * 5.5);
    this.pointerX += (this.targetX - this.pointerX) * damping;
    this.pointerY += (this.targetY - this.pointerY) * damping;

    this.gl.useProgram(this.program);
    this.gl.uniform1f(this.timeLocation, this.elapsed);
    this.gl.uniform2f(this.pointerLocation, this.pointerX, this.pointerY);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    this.gl.drawElements(this.gl.TRIANGLES, this.indexCount, this.gl.UNSIGNED_SHORT, 0);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.gl.deleteBuffer(this.positionBuffer);
    this.gl.deleteBuffer(this.indexBuffer);
    this.gl.deleteProgram(this.program);
    delete this.canvas.dataset.ready;
  }
}
