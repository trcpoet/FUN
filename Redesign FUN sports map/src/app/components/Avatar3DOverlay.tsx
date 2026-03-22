import React, { useRef, useEffect, useState } from "react";

/**
 * 3D avatar rendered in its own canvas (separate WebGL context).
 * Positioned over the map at user coords via map.project(). Does not touch Mapbox's
 * context, so no vec4/unproject errors.
 */

const OVERLAY_WIDTH = 80;
const OVERLAY_HEIGHT = 120;

type Avatar3DOverlayProps = {
  map: import("mapbox-gl").Map;
  userCoords: { lat: number; lng: number };
  glbUrl: string;
  className?: string;
};

export function Avatar3DOverlay({ map, userCoords, glbUrl, className = "" }: Avatar3DOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<import("three").WebGLRenderer | null>(null);
  const [screenPos, setScreenPos] = useState<{ x: number; y: number } | null>(null);

  // Update screen position when map moves or user coords change.
  useEffect(() => {
    const update = () => {
      try {
        const point = map.project([userCoords.lng, userCoords.lat]);
        setScreenPos({ x: point.x, y: point.y });
      } catch {
        setScreenPos(null);
      }
    };
    update();
    map.on("move", update);
    map.on("moveend", update);
    return () => {
      map.off("move", update);
      map.off("moveend", update);
    };
  }, [map, userCoords.lat, userCoords.lng]);

  // Three.js: own context, load GLB, bobbing animation.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let rafId: number | undefined;
    let bgDisposable: {
      geometry: import("three").SphereGeometry;
      material: import("three").MeshBasicMaterial;
    } | null = null;

    Promise.all([
      import("three"),
      import("three/examples/jsm/loaders/GLTFLoader.js"),
    ])
      .then(([threeMod, gltfMod]) => {
        if (cancelled) return;
        // Vite/ESM: `three` is usually a namespace; `default` is often undefined.
        const T = (threeMod as { default?: unknown }).default ?? threeMod;
        if (!T || typeof (T as { Scene?: unknown }).Scene !== "function") {
          console.warn("[Avatar3DOverlay] three.js failed to load");
          return;
        }
        const Three = T as typeof import("three");
        const GLTFLoaderCtor =
          (gltfMod as { GLTFLoader?: typeof import("three/examples/jsm/loaders/GLTFLoader.js").GLTFLoader })
            .GLTFLoader ??
          (
            gltfMod as { default?: typeof import("three/examples/jsm/loaders/GLTFLoader.js").GLTFLoader }
          ).default;
        if (!GLTFLoaderCtor) {
          console.warn("[Avatar3DOverlay] GLTFLoader failed to load");
          return;
        }

      const scene = new Three.Scene();
      const camera = new Three.PerspectiveCamera(50, OVERLAY_WIDTH / OVERLAY_HEIGHT, 0.1, 100);
      camera.position.set(0, 0, 2.5);
      camera.lookAt(0, 0, 0);

      const light1 = new Three.DirectionalLight(0xffffff, 0.9);
      light1.position.set(2, 2, 3);
      scene.add(light1);
      const light2 = new Three.DirectionalLight(0xffffff, 0.4);
      light2.position.set(-1, -1, 2);
      scene.add(light2);
      scene.add(new Three.AmbientLight(0xffffff, 0.4));

      /** Inverted sphere backdrop — slow rotation reads as a soft “studio” sphere behind the avatar. */
      const bgSphereGeom = new Three.SphereGeometry(2.35, 48, 32);
      const bgSphereMat = new Three.MeshBasicMaterial({
        color: 0x2d3f5c,
        side: Three.BackSide,
        transparent: true,
        opacity: 0.42,
      });
      const bgSphere = new Three.Mesh(bgSphereGeom, bgSphereMat);
      bgSphere.position.set(0, 0, 0);
      scene.add(bgSphere);
      bgDisposable = { geometry: bgSphereGeom, material: bgSphereMat };

      const renderer = new Three.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
      });
      rendererRef.current = renderer;
      renderer.setSize(OVERLAY_WIDTH, OVERLAY_HEIGHT);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);

      let model: import("three").Object3D | null = null;
      let bob = 0;
      const loader = new GLTFLoaderCtor();
      loader.load(
        glbUrl,
        (gltf) => {
          if (cancelled) return;
          model = gltf.scene;
          model.scale.setScalar(0.8);
          model.position.y = 0;
          scene.add(model);
        },
        undefined,
        () => {}
      );

      function animate() {
        if (cancelled) return;
        bob += 0.04;
        if (model) {
          model.position.y = Math.sin(bob) * 0.03;
        }
        bgSphere.rotation.y += 0.0028;
        bgSphere.rotation.z = Math.sin(bob * 0.35) * 0.04;
        renderer.render(scene, camera);
        rafId = requestAnimationFrame(animate);
      }
      if (cancelled) {
        bgDisposable?.geometry.dispose();
        bgDisposable?.material.dispose();
        bgDisposable = null;
        renderer.dispose();
        rendererRef.current = null;
        return;
      }
      animate();
      })
      .catch((err) => {
        console.warn("[Avatar3DOverlay]", err);
      });

    return () => {
      cancelled = true;
      if (rafId !== undefined) cancelAnimationFrame(rafId);
      const r = rendererRef.current;
      if (r) {
        r.dispose();
        rendererRef.current = null;
      }
      bgDisposable?.geometry.dispose();
      bgDisposable?.material.dispose();
      bgDisposable = null;
    };
  }, [glbUrl]);

  if (!screenPos) return null;

  return (
    <div
      className={className}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: screenPos.x - OVERLAY_WIDTH / 2,
          top: screenPos.y - OVERLAY_HEIGHT,
          width: OVERLAY_WIDTH,
          height: OVERLAY_HEIGHT,
        }}
      >
        <canvas
          ref={canvasRef}
          width={OVERLAY_WIDTH}
          height={OVERLAY_HEIGHT}
          style={{ display: "block", width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}
