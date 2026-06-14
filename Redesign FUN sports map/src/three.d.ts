// Ambient shim for three.js — no @types/three is installed and the shipped package
// exposes no typings at these import paths. Only the members used by Avatar3DOverlay
// are declared, loosely as `any`. Classes are used where the name is referenced as both
// a value (`new Three.X()`) and a type; pure type references use `type X = any`.
// For real types, run `npm i -D @types/three` and delete this file.

declare module "three" {
  // Type-only references in Avatar3DOverlay (`model: import("three").Object3D | null`).
  // Kept as `any` so control-flow null-narrowing isn't introduced on assignment.
  export type Object3D = any;

  // Constructed via `new Three.X(...)` — need value (constructor) + type.
  export class Scene {
    [key: string]: any;
  }
  export class Mesh {
    constructor(...args: any[]);
    [key: string]: any;
  }
  export class PerspectiveCamera {
    constructor(...args: any[]);
    [key: string]: any;
  }
  export class DirectionalLight {
    constructor(...args: any[]);
    [key: string]: any;
  }
  export class AmbientLight {
    constructor(...args: any[]);
    [key: string]: any;
  }
  export class SphereGeometry {
    constructor(...args: any[]);
    [key: string]: any;
  }
  export class MeshBasicMaterial {
    constructor(params?: any);
    [key: string]: any;
  }
  export class WebGLRenderer {
    constructor(params?: any);
    [key: string]: any;
  }
  export const BackSide: any;
}

declare module "three/examples/jsm/loaders/GLTFLoader.js" {
  export class GLTFLoader {
    load(
      url: string,
      onLoad: (gltf: any) => void,
      onProgress?: (event: any) => void,
      onError?: (event: any) => void
    ): void;
    [key: string]: any;
  }
  // Some bundlers expose the loader on `.default`; type it as the constructor so the
  // `gltfMod.default` fallback cast in Avatar3DOverlay type-checks.
  const GLTFLoaderDefault: typeof GLTFLoader;
  export default GLTFLoaderDefault;
}
