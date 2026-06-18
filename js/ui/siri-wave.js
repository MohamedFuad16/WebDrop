const VERTEX_SHADER_SOURCE = `
attribute vec2 aPos; void main(){ gl_Position=vec4(aPos,0.0,1.0); }
`;

const SIRI_WAVE_FRAGMENT_SHADER_SOURCE = `
precision highp float;
uniform vec2 iResolution; uniform float iTime; uniform float iDirection;
const float PI = 3.14159265359;
const float AMPLITUDE   = 0.32;
const float FREQ        = 1.1;
const float ABER_FREQ   = 1.0;
const float SPEED       = 2.4;
const float WAVE_SCALE  = 0.6;
const float ABERRATION  = 2.6;
const float THICKNESS   = 3.0;
const float INTENSITY   = 2.;
const float FALLOFF     = 1.7;
const float EDGE_MASK   = 0.4;
const float EDGE_INSET  = 0.0;
const float BAND_FILL   = 30000.0;
const float BAND_THICK  = 0.08;
const float SOFTNESS    = 2.5;
const float LOW_AMP     = 6.0;
const float LOW_INT     = 1.5;
const float MID_ABER    = 0.8;
const float MID_ABAMP   = 0.05;
const float MID_BAND    = 20.0;
const float MID_SOFT    = 0.4;
const float HIGH_ABER   = 0.5;
const float HIGH_ABAMP  = 0.06;
const float RESOLVED    = 1.0;
const float UNRES_SCALE = 0.14;

vec3 spectral4(int s){
    float x = float(s);
    return clamp(vec3(abs(x-3.0)-1.0, 2.0-abs(x-2.0), 2.0-abs(x-4.0)), 0.0, 1.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord){
    vec2 R = iResolution.xy;
    float aspect = R.x / R.y;
    vec2 p = (fragCoord + 0.5) * 2.0 / R - 1.0;
    p.x *= aspect;
    float yScreen = p.y;
    p /= max(WAVE_SCALE, 0.1);

    float t   = iTime;
    float low  = clamp(0.45 + 0.45*sin(t*0.8)*sin(t*0.37+1.0), 0.0, 1.0);
    float mid  = clamp(0.40 + 0.40*sin(t*1.7+2.0)*sin(t*0.53), 0.0, 1.0);
    float high = clamp(0.30 + 0.30*sin(t*2.9+4.0)*sin(t*0.71+2.0), 0.0, 1.0);

    float res   = clamp(RESOLVED, 0.0, 1.0);
    float drift = mod(t, 20.0*PI) * SPEED * iDirection;

    float xN  = p.x / max(aspect, 1.0);
    float env = cos(PI*0.5 * min(abs(0.9*xN), 1.0));
    env *= env;

    float A1    = AMPLITUDE + 0.01*low*LOW_AMP;
    float A2    = A1 + mid*MID_ABAMP + high*HIGH_ABAMP;
    float AB    = (ABERRATION + mid*MID_ABER + high*HIGH_ABER)*res;
    float th    = mix(0.1, 0.01*THICKNESS, res);
    float inten = mix(0.1, 0.01*(INTENSITY + low*LOW_INT), res);
    float soft  = 0.01*res*max(0.0, SOFTNESS + mid*MID_SOFT);

    float dUnres = max(length(p) - mix(0.14, UNRES_SCALE, res), 0.0);
    float yMain = A1 * env * res * sin(p.x*FREQ + drift);

    float bandFillTh = max(BAND_THICK, 1e-4);
    float bandAmt    = 1e-4 * BAND_FILL * inten;
    vec3 num = vec3(0.0), den = vec3(0.0);
    for(int s = 0; s < 4; s++){
        vec3 hue = mix(vec3(1.0), spectral4(s), res);
        den += hue;
        float ab = mix(-AB, AB, float(s)/3.0);
        float yL = A2 * env * res * sin(p.x*ABER_FREQ + drift + ab);
        float d   = mix(dUnres, abs(p.y - yL), res);
        float lor = mix(1.0/(1.0 + (0.02*d)*(0.02*d)), 1.0, res);
        float line = inten / (sqrt(d*d + soft*soft) + th);
        float lo = min(yMain, yL), hi = max(yMain, yL);
        float dBand = max(0.0, max(p.y - hi, lo - p.y));
        float band  = bandAmt / (dBand + bandFillTh);
        num += hue * lor * (line + band);
    }
    vec3 col = num / den;

    float dM    = mix(dUnres, abs(p.y - yMain), res);
    float lorM  = mix(1.0/(1.0 + (0.02*dM)*(0.02*dM)), 1.0, res);
    float boost = (1.0 - res) * (14.0*low + 4.0);
    col += 0.5 * inten * (lorM + boost) / (sqrt(dM*dM + soft*soft) + th);

    col = pow(max(col, 0.0), vec3(1.5));
    float emT = clamp((abs(yScreen) - 1.0 + EDGE_INSET) / (-max(EDGE_MASK, 1e-4)), 0.0, 1.0);
    float em  = emT*emT*(3.0 - 2.0*emT);
    float gauss = exp(-pow(xN*FALLOFF, 2.0));
    col *= mix(1.0, em*gauss, res);
    col *= res;
    float alpha = clamp(max(max(col.r, col.g), col.b) * 0.72, 0.0, 1.0);
    fragColor = vec4(col, alpha);
}
void main(){ mainImage(gl_FragColor, gl_FragCoord.xy); }
`;

export class SiriWaveCore {
  constructor(canvas, { renderScale = 0.75 } = {}) {
    this.canvas = canvas;
    this.renderScale = renderScale;
    this.gl = canvas?.getContext("webgl", {
      alpha: true,
      antialias: true,
      depth: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      stencil: false
    });
    this.program = null;
    this.uniforms = {};
    this.buffer = null;
    this.frameId = 0;
    this.running = false;
    this.direction = 1;
    this.startedAt = 0;
    this.resizeObserver = null;
    this.resizeDirty = true;
    this.frameCount = 0;
    if (!this.gl) return;
    this.build();
    this.resize();
    if ("ResizeObserver" in globalThis) {
      this.resizeObserver = new ResizeObserver(() => {
        this.resizeDirty = true;
      });
      this.resizeObserver.observe(this.canvas);
    }
  }

  setRunning(running) {
    if (!this.gl) return;
    if (running === this.running) return;
    this.running = running;
    if (running) {
      this.startedAt = performance.now();
      this.resizeDirty = true;
      this.frameId = requestAnimationFrame(() => this.frame());
    } else {
      cancelAnimationFrame(this.frameId);
      this.frameId = 0;
    }
  }

  setDirection(direction) {
    const nextDirection = direction < 0 ? -1 : 1;
    if (nextDirection === this.direction) return;
    this.direction = nextDirection;
  }

  destroy() {
    this.setRunning(false);
    this.resizeObserver?.disconnect();
    if (this.program) this.gl?.deleteProgram(this.program);
    if (this.buffer) this.gl?.deleteBuffer(this.buffer);
    this.program = null;
    this.buffer = null;
  }

  compile(type, source) {
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      throw new Error(this.gl.getShaderInfoLog(shader) || "Siri wave shader compile failed.");
    }
    return shader;
  }

  build() {
    this.program = this.gl.createProgram();
    this.gl.attachShader(this.program, this.compile(this.gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE));
    this.gl.attachShader(this.program, this.compile(this.gl.FRAGMENT_SHADER, SIRI_WAVE_FRAGMENT_SHADER_SOURCE));
    this.gl.linkProgram(this.program);
    if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
      throw new Error(this.gl.getProgramInfoLog(this.program) || "Siri wave shader link failed.");
    }
    this.gl.useProgram(this.program);
    this.gl.clearColor(0, 0, 0, 0);
    this.buffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), this.gl.STATIC_DRAW);
    const aPos = this.gl.getAttribLocation(this.program, "aPos");
    this.gl.enableVertexAttribArray(aPos);
    this.gl.vertexAttribPointer(aPos, 2, this.gl.FLOAT, false, 0, 0);
    this.uniforms.iResolution = this.gl.getUniformLocation(this.program, "iResolution");
    this.uniforms.iTime = this.gl.getUniformLocation(this.program, "iTime");
    this.uniforms.iDirection = this.gl.getUniformLocation(this.program, "iDirection");
  }

  resize() {
    if (!this.canvas || !this.gl) return;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width * this.renderScale));
    const height = Math.max(1, Math.round(rect.height * this.renderScale));
    if (this.canvas.width === width && this.canvas.height === height) {
      this.resizeDirty = false;
      return;
    }
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
    this.resizeDirty = false;
  }

  frame() {
    if (!this.running || !this.gl || !this.program) return;
    this.frameCount += 1;
    if (this.resizeDirty || (!this.resizeObserver && this.frameCount % 30 === 0)) {
      this.resize();
    }
    const time = (performance.now() - this.startedAt) / 1000;
    this.gl.useProgram(this.program);
    this.gl.uniform2f(this.uniforms.iResolution, this.canvas.width, this.canvas.height);
    this.gl.uniform1f(this.uniforms.iTime, time);
    this.gl.uniform1f(this.uniforms.iDirection, this.direction || 1);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
    this.frameId = requestAnimationFrame(() => this.frame());
  }
}
