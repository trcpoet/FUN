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

    Promise.all([
      import("three"),
      import("three/examples/jsm/loaders/GLTFLoader.js"),
    ]).then(([THREE, { GLTFLoader }]) => {
      if (cancelled) return;
      const T = THREE.default;
      const scene = new T.Scene();
      const camera = new T.PerspectiveCamera(50, OVERLAY_WIDTH / OVERLAY_HEIGHT, 0.1, 100);
      camera.position.set(0, 0, 2.5);
      camera.lookAt(0, 0, 0);

      const light1 = new T.DirectionalLight(0xffffff, 0.9);
      light1.position.set(2, 2, 3);
      scene.add(light1);
      const light2 = new T.DirectionalLight(0xffffff, 0.4);
      light2.position.set(-1, -1, 2);
      scene.add(light2);
      scene.add(new T.AmbientLight(0xffffff, 0.4));

      const renderer = new T.WebGLRenderer({
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
      const loader = new GLTFLoader();
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
        renderer.render(scene, camera);
        rafId = requestAnimationFrame(animate);
      }
      animate();
    });

    return () => {
      cancelled = true;
      if (rafId !== undefined) cancelAnimationFrame(rafId);
      const r = rendererRef.current;
      if (r) {
        r.dispose();
        rendererRef.current = null;
      }
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
