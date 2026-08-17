"use client";

import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

interface ProductModel3DProps {
  modelPath?: string;
  productName?: string;
  autoRotate?: boolean;
  rotateSpeed?: number;
}

type Status = "loading" | "ready" | "error";

export default function ProductModel3D({
  modelPath = "/models/snickersModel.glb",
  productName = "Product",
  autoRotate = true,
  rotateSpeed = 0.8,
}: ProductModel3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const resumeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isAutoRotatingRef = useRef<boolean>(autoRotate);

  const [status, setStatus] = useState<Status>("loading");
  const [isRotating, setIsRotating] = useState<boolean>(autoRotate);
  const [loadPct, setLoadPct] = useState<number>(0);
  const [hint, setHint] = useState<boolean>(false);

  const toggleRotate = useCallback(() => {
    const next = !isAutoRotatingRef.current;
    isAutoRotatingRef.current = next;
    setIsRotating(next);

    if (controlsRef.current) {
      controlsRef.current.autoRotate = next;
    }
  }, []);

  const resetCamera = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;

    if (!camera || !controls) return;

    camera.position.set(0, 0.5, 3);
    controls.target.set(0, 0, 0);
    controls.update();
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let destroyed = false;

    async function init(containerElement: HTMLDivElement) {
      try {
        setStatus("loading");
        setLoadPct(0);

        const width = containerElement.clientWidth || 480;
        const height = containerElement.clientHeight || 480;

        const scene = new THREE.Scene();
        scene.background = null;
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(
          45,
          width / height,
          0.1,
          100,
        );
        camera.position.set(0, 0.5, 3);
        cameraRef.current = camera;

        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        });

        renderer.setSize(width, height, false);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.2;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        rendererRef.current = renderer;
        containerElement.appendChild(renderer.domElement);

        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambient);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(5, 8, 5);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.set(1024, 1024);
        scene.add(dirLight);

        const fillLight = new THREE.DirectionalLight(0x8af6ff, 0.4);
        fillLight.position.set(-4, 2, -3);
        scene.add(fillLight);

        const rimLight = new THREE.DirectionalLight(0xfff0d0, 0.5);
        rimLight.position.set(0, -3, -4);
        scene.add(rimLight);

        const shadowGeo = new THREE.PlaneGeometry(6, 6);
        const shadowMat = new THREE.ShadowMaterial({ opacity: 0.18 });
        const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
        shadowPlane.rotation.x = -Math.PI / 2;
        shadowPlane.position.y = -0.8;
        shadowPlane.receiveShadow = true;
        scene.add(shadowPlane);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        controls.autoRotate = autoRotate;
        controls.autoRotateSpeed = rotateSpeed;
        controls.enableZoom = true;
        controls.minDistance = 1.5;
        controls.maxDistance = 6;
        controls.maxPolarAngle = Math.PI / 1.6;
        controls.minPolarAngle = 0.2;
        controlsRef.current = controls;

        const onStart = () => {
          if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);

          if (controlsRef.current && isAutoRotatingRef.current) {
            controlsRef.current.autoRotate = false;
          }
        };

        const onEnd = () => {
          if (isAutoRotatingRef.current) {
            resumeTimerRef.current = setTimeout(() => {
              if (controlsRef.current && isAutoRotatingRef.current) {
                controlsRef.current.autoRotate = true;
              }
            }, 1500);
          }
        };

        controls.addEventListener("start", onStart);
        controls.addEventListener("end", onEnd);

        const loader = new GLTFLoader();

        loader.load(
          modelPath,
          (gltf) => {
            if (destroyed) return;

            const model = gltf.scene;

            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z) || 1;
            const scale = 2.35 / maxDim;

            model.scale.setScalar(scale);
            model.position.sub(center.multiplyScalar(scale));
            model.position.y += 0.15;

            model.traverse((child) => {
              if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                mesh.castShadow = true;
                mesh.receiveShadow = true;
              }
            });

            scene.add(model);

            const fittedBox = new THREE.Box3().setFromObject(model);
            const fittedCenter = fittedBox.getCenter(new THREE.Vector3());
            const fittedSize = fittedBox.getSize(new THREE.Vector3());

            const maxSize =
              Math.max(fittedSize.x, fittedSize.y, fittedSize.z) || 1;
            const fitDistance =
              maxSize / (2 * Math.tan((camera.fov * Math.PI) / 360));


            camera.position.set(
              fittedCenter.x,
              fittedCenter.y + maxSize * 0.25,
              fittedCenter.z + fitDistance * 1.45,
            );

            camera.near = Math.max(fitDistance / 100, 0.01);
            camera.far = fitDistance * 100;
            camera.updateProjectionMatrix();

            controls.target.set(
              fittedCenter.x,
              fittedCenter.y + maxSize * 0.1,
              fittedCenter.z,
            );
            controls.update();

            setStatus("ready");
            setHint(true);
            setTimeout(() => setHint(false), 3000);
          },
          (xhr) => {
            if (xhr.total) {
              setLoadPct(Math.round((xhr.loaded / xhr.total) * 100));
            }
          },
          (error) => {
            console.error("GLB load error:", error);
            setStatus("error");
          },
        );

        const animate = () => {
          animFrameRef.current = requestAnimationFrame(animate);

          controls.update();
          renderer.render(scene, camera);
        };

        animate();

        const onResize = () => {
          if (!container || !rendererRef.current || !cameraRef.current) return;

          const w = container.clientWidth || 480;
          const h = container.clientHeight || 480;

          cameraRef.current.aspect = w / h;
          cameraRef.current.updateProjectionMatrix();
          rendererRef.current.setPixelRatio(
            Math.min(window.devicePixelRatio, 3),
          );
          rendererRef.current.setSize(w, h, false);
        };

        window.addEventListener("resize", onResize);

        return () => {
          window.removeEventListener("resize", onResize);
          controls.removeEventListener("start", onStart);
          controls.removeEventListener("end", onEnd);
        };
      } catch (error) {
        console.error("3D init error:", error);
        setStatus("error");
      }
    }

    let cleanupControls: (() => void) | undefined;

    init(container).then((cleanup) => {
      cleanupControls = cleanup;
    });

    return () => {
      destroyed = true;

      cleanupControls?.();

      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }

      if (resumeTimerRef.current) {
        clearTimeout(resumeTimerRef.current);
      }

      if (controlsRef.current) {
        controlsRef.current.dispose();
      }

      if (sceneRef.current) {
        sceneRef.current.traverse((object) => {
          const mesh = object as THREE.Mesh;

          if (mesh.geometry) {
            mesh.geometry.dispose();
          }

          if (mesh.material) {
            if (Array.isArray(mesh.material)) {
              mesh.material.forEach((material) => material.dispose());
            } else {
              mesh.material.dispose();
            }
          }
        });
      }

      if (rendererRef.current) {
        rendererRef.current.dispose();

        if (rendererRef.current.domElement.parentNode === container) {
          container.removeChild(rendererRef.current.domElement);
        }
      }

      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, [modelPath, autoRotate, rotateSpeed]);

  useEffect(() => {
    const style = document.createElement("style");

    style.textContent = `
      @keyframes fadeHint {
        0% { opacity: 1; transform: translateX(-50%) translateY(0); }
        70% { opacity: 1; transform: translateX(-50%) translateY(0); }
        100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
      }
    `;

    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <div style={styles.wrapper}>
      <div ref={mountRef} style={styles.canvas} />

      {status === "loading" && (
        <div style={styles.overlay}>
          <div style={styles.loaderBox}>
            <div style={styles.spinnerTrack}>
              <div
                style={{
                  ...styles.spinnerFill,
                  width: `${loadPct}%`,
                }}
              />
            </div>
            <p style={styles.loadText}>
              Loading {productName}... {loadPct}%
            </p>
          </div>
        </div>
      )}

      {status === "error" && (
        <div style={styles.overlay}>
          <div style={styles.errorBox}>
            <span style={{ fontSize: 32 }}>⚠️</span>
            <p style={styles.errorText}>Could not load 3D model.</p>
            <p style={styles.errorSub}>
              Check that <code style={styles.code}>{modelPath}</code> exists.
            </p>
          </div>
        </div>
      )}

      {hint && status === "ready" && (
        <div style={styles.hint}>
          <span style={styles.hintIcon}>↻</span> Drag to rotate · Scroll to zoom
        </div>
      )}

      {status === "ready" && (
        <div style={styles.controls}>
          <button
            type="button"
            onClick={toggleRotate}
            style={styles.btn}
            title={isRotating ? "Pause rotation" : "Resume rotation"}
          >
            {isRotating ? "⏸ Pause" : "▶ Rotate"}
          </button>

          <button
            type="button"
            onClick={resetCamera}
            style={styles.btn}
            title="Reset view"
          >
            ⌂ Reset
          </button>
        </div>
      )}

      <div style={styles.label}>{productName}</div>
    </div>
  );
}

const styles: { [key: string]: CSSProperties } = {
  wrapper: {
    position: "relative",
    width: "100%",
    height: "100%",
    background:
      "linear-gradient(145deg, #f0f4ff 0%, #fafafa 60%, #fff7ee 100%)",
    borderRadius: "20px",
    overflow: "hidden",
    boxShadow: "0 8px 40px rgba(0,0,0,0.12)",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    userSelect: "none",
  },
  canvas: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    cursor: "grab",
  },
  overlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(255,255,255,0.85)",
    backdropFilter: "blur(6px)",
    zIndex: 10,
  },
  loaderBox: {
    textAlign: "center",
    width: 220,
  },
  spinnerTrack: {
    width: "100%",
    height: 6,
    background: "#e0e0e0",
    borderRadius: 99,
    overflow: "hidden",
    marginBottom: 14,
  },
  spinnerFill: {
    height: "100%",
    background: "linear-gradient(90deg, #6c63ff, #ff6b6b)",
    borderRadius: 99,
    transition: "width 0.3s ease",
  },
  loadText: {
    fontSize: 14,
    color: "#555",
    margin: 0,
  },
  errorBox: {
    textAlign: "center",
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    fontWeight: 600,
    color: "#c0392b",
    margin: "12px 0 4px",
  },
  errorSub: {
    fontSize: 13,
    color: "#888",
    margin: 0,
  },
  code: {
    background: "#f0f0f0",
    padding: "2px 6px",
    borderRadius: 4,
    fontSize: 12,
    fontFamily: "monospace",
  },
  hint: {
    position: "absolute",
    top: 16,
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(0,0,0,0.55)",
    color: "#fff",
    fontSize: 12,
    padding: "6px 14px",
    borderRadius: 99,
    letterSpacing: "0.02em",
    pointerEvents: "none",
    animation: "fadeHint 3s ease forwards",
    zIndex: 5,
  },
  hintIcon: {
    marginRight: 4,
    fontSize: 14,
    display: "inline-block",
  },
  controls: {
    position: "absolute",
    bottom: 16,
    right: 16,
    display: "flex",
    gap: 8,
    zIndex: 5,
  },
  btn: {
    background: "rgba(255,255,255,0.9)",
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 10,
    padding: "7px 14px",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    backdropFilter: "blur(4px)",
    color: "#333",
    transition: "background 0.2s",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  },
  label: {
    position: "absolute",
    bottom: 20,
    left: 20,
    fontSize: 13,
    fontWeight: 600,
    color: "rgba(0,0,0,0.45)",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    zIndex: 5,
  },
};
