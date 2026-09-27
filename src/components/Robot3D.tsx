import { useEffect, useRef, useState } from 'react';
import type { OrthoMindState } from './OrthoMindAvatar';

// Robot OrthoMind en 3D temps réel (Three.js), avec une animation « idle »
// procédurale façon écran de sélection de personnage : flottement, respiration,
// balancement, regard qui suit le pointeur et coups d'œil aléatoires.
// Three.js est chargé à la demande pour ne pas alourdir le premier affichage.

const MODEL_URL = '/models/orthomind-robot.glb';

interface Robot3DProps {
    state: OrthoMindState;
    onReady?: () => void;
    onError?: () => void;
}

const Robot3D = ({ state, onReady, onError }: Robot3DProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const stateRef = useRef<OrthoMindState>(state);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        let disposed = false;
        let frameId = 0;
        let cleanup: (() => void) | null = null;

        (async () => {
            try {
                const THREE = await import('three');
                const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
                const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
                const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
                if (disposed) return;

                const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                renderer.outputColorSpace = THREE.SRGBColorSpace;
                renderer.toneMapping = THREE.ACESFilmicToneMapping;
                renderer.toneMappingExposure = 1.05;
                renderer.setClearColor(0x000000, 0);
                container.appendChild(renderer.domElement);

                const scene = new THREE.Scene();
                const pmrem = new THREE.PMREMGenerator(renderer);
                const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
                scene.environment = envTexture;

                const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);

                // Éclairage : lumière principale + deux lumières de contour aux couleurs de la marque
                scene.add(new THREE.HemisphereLight(0xdbeafe, 0x0b1120, 0.6));
                const key = new THREE.DirectionalLight(0xffffff, 1.6);
                key.position.set(2, 3, 4);
                scene.add(key);
                const rimCyan = new THREE.PointLight(0x38bdf8, 12, 10);
                const rimViolet = new THREE.PointLight(0x8b5cf6, 12, 10);
                scene.add(rimCyan, rimViolet);

                const loader = new GLTFLoader();
                loader.setMeshoptDecoder(MeshoptDecoder);
                const gltf = await loader.loadAsync(MODEL_URL);
                if (disposed) return;

                // Normalisation : centre le modèle et le ramène à une hauteur de 2 unités
                const model = gltf.scene;
                const box = new THREE.Box3().setFromObject(model);
                const size = box.getSize(new THREE.Vector3());
                const center = box.getCenter(new THREE.Vector3());
                const scale = 2 / Math.max(size.y, size.x, 0.001);
                model.scale.setScalar(scale);
                model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);

                const pivot = new THREE.Group();
                pivot.add(model);
                scene.add(pivot);

                // Cadrage buste : la tête occupe le haut du cadre
                camera.position.set(0, 0.25, 4.3);
                camera.lookAt(0, 0.15, 0);

                const resize = () => {
                    const { clientWidth: w, clientHeight: h } = container;
                    if (!w || !h) return;
                    renderer.setSize(w, h, false);
                    camera.aspect = w / h;
                    camera.updateProjectionMatrix();
                };
                resize();
                const resizeObserver = new ResizeObserver(resize);
                resizeObserver.observe(container);

                // Pointeur : le robot tourne légèrement la tête vers la souris
                const pointer = { x: 0, y: 0 };
                const onPointerMove = (e: PointerEvent) => {
                    const rect = container.getBoundingClientRect();
                    const nx = (e.clientX - (rect.left + rect.width / 2)) / (window.innerWidth / 2);
                    const ny = (e.clientY - (rect.top + rect.height / 2)) / (window.innerHeight / 2);
                    pointer.x = Math.max(-1, Math.min(1, nx));
                    pointer.y = Math.max(-1, Math.min(1, ny));
                };
                window.addEventListener('pointermove', onPointerMove, { passive: true });

                // Pause quand le robot n'est pas visible
                let visible = true;
                const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
                io.observe(container);

                const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                const clock = new THREE.Clock();
                let glanceTarget = 0;
                let nextGlance = 4 + Math.random() * 4;
                let glanceUntil = 0;
                let spin = 0;

                const lerp = THREE.MathUtils.lerp;

                const tick = () => {
                    frameId = requestAnimationFrame(tick);
                    if (!visible) return; // requestAnimationFrame est déjà suspendu quand l'onglet est caché

                    const dt = Math.min(clock.getDelta(), 0.05);
                    const t = clock.elapsedTime;
                    const current = stateRef.current;
                    const motion = reducedMotion ? 0 : 1;

                    // Coups d'œil aléatoires, comme un personnage qui attend d'être sélectionné
                    if (t > nextGlance) {
                        glanceTarget = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.25);
                        glanceUntil = t + 1.1 + Math.random() * 0.8;
                        nextGlance = t + 6 + Math.random() * 5;
                    }
                    const glance = t < glanceUntil ? glanceTarget : 0;

                    let targetRotY = pointer.x * 0.45 + Math.sin(t * 0.35) * 0.16 + glance;
                    let targetRotX = pointer.y * 0.16 + Math.sin(t * 0.7) * 0.02;
                    let bob = Math.sin(t * 1.1) * 0.045;

                    if (current === 'thinking') {
                        // Réflexion : balancement ample et régulier (le dos du modèle,
                        // reconstruit depuis une vue de face, n'est jamais montré)
                        spin += dt;
                        targetRotY = Math.sin(spin * 1.6) * 0.6;
                        bob *= 0.5;
                    }
                    if (current === 'listening') targetRotX += 0.08;
                    if (current === 'speaking') targetRotX += Math.sin(t * 7) * 0.035;

                    const ease = 1 - Math.pow(0.001, dt);
                    pivot.rotation.y = lerp(pivot.rotation.y, targetRotY * motion, ease);
                    pivot.rotation.x = lerp(pivot.rotation.x, targetRotX * motion, 1 - Math.pow(0.001, dt));
                    pivot.rotation.z = Math.sin(t * 0.6) * 0.015 * motion;
                    pivot.position.y = bob * motion;
                    const breath = 1 + Math.sin(t * 1.6) * 0.006 * motion;
                    pivot.scale.set(1, breath, 1);

                    // Les lumières de contour tournent autour du robot et font vivre la visière
                    const speed = current === 'thinking' ? 2.4 : 0.6;
                    const pulse = current === 'thinking' ? 18 + Math.sin(t * 8) * 6 : 12;
                    rimCyan.position.set(Math.cos(t * speed) * 3, 1.2 + Math.sin(t * 0.9) * 0.4, Math.sin(t * speed) * 3);
                    rimViolet.position.set(Math.cos(t * speed + Math.PI) * 3, -0.4, Math.sin(t * speed + Math.PI) * 3);
                    rimCyan.intensity = pulse;
                    rimViolet.intensity = pulse;

                    renderer.render(scene, camera);
                };
                tick();

                setReady(true);
                onReady?.();

                cleanup = () => {
                    cancelAnimationFrame(frameId);
                    window.removeEventListener('pointermove', onPointerMove);
                    resizeObserver.disconnect();
                    io.disconnect();
                    scene.traverse((obj: any) => {
                        obj.geometry?.dispose?.();
                        const materials = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
                        materials.forEach((m: any) => {
                            Object.values(m).forEach((v: any) => v?.isTexture && v.dispose());
                            m.dispose();
                        });
                    });
                    envTexture.dispose();
                    pmrem.dispose();
                    renderer.dispose();
                    renderer.domElement.remove();
                };
                if (disposed) cleanup();
            } catch (err) {
                console.warn('[Robot3D] Rendu 3D indisponible, retour à l\'image :', err);
                if (!disposed) onError?.();
            }
        })();

        return () => {
            disposed = true;
            cancelAnimationFrame(frameId);
            cleanup?.();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <div ref={containerRef} className={`robot3d-canvas ${ready ? 'is-ready' : ''}`} aria-hidden="true" />;
};

export default Robot3D;
