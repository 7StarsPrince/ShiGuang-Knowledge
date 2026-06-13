'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as THREE from 'three';

const TYPE_COLORS: Record<string, string> = {
  article: '#10b981',
  speech: '#3b82f6',
  paper: '#f59e0b',
  tag: '#6b7280',
  topic: '#a78bfa',
  'topic-root': '#e879f9',
  entity: '#22d3ee',
};

const TYPE_LABELS: Record<string, string> = {
  article: '文章',
  speech: '演讲',
  paper: '论文',
  tag: '标签',
  topic: '话题',
  'topic-root': '一级话题',
  entity: '实体',
};

const SHIP_SPEED = 48;
const BULLET_SPEED = 600;
const FIRE_INTERVAL = 160;
const BULLET_LIFE = 2.5;
const TYPE_SCORES: Record<string, number> = {
  article: 3,
  speech: 3,
  paper: 3,
  entity: 1,
  tag: 1,
  topic: 5,
  'topic-root': 10,
};

export default function KnowledgeGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [hoverNode, setHoverNode] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const [score, setScore] = useState(0);
  const [lastHit, setLastHit] = useState<{ name: string; points: number } | null>(null);
  const dataRef = useRef<any>(null);
  const highlightSet = useRef<Set<string>>(new Set());
  const router = useRouter();

  // Spaceship state
  const shipRef = useRef<THREE.Group | null>(null);
  const bulletsRef = useRef<THREE.Mesh[]>([]);
  const sparksRef = useRef<THREE.Mesh[]>([]);
  const keysRef = useRef<Record<string, boolean>>({});
  const shipVelocityRef = useRef(new THREE.Vector3());
  const shipForwardRef = useRef(new THREE.Vector3(0, 0, -1));
  const shipRollRef = useRef(0);
  const pitchVelRef = useRef(0);
  const yawVelRef = useRef(0);
  const rollVelRef = useRef(0);
  const moveVelRef = useRef(new THREE.Vector3());
  const lastFireTimeRef = useRef(0);
  const [laserMode, setLaserMode] = useState(false);
  const laserModeRef = useRef(false);
  const shipVisibleRef = useRef(true);
  const [shipVisible, setShipVisible] = useState(true);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const viewModeRef = useRef<'2d' | '3d'>('2d');
  const rafIdRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const listenersRef = useRef<{ keydown?: (e: KeyboardEvent) => void; keyup?: (e: KeyboardEvent) => void; resize?: () => void }>({});
  const hActiveRef = useRef(false);
  const lActiveRef = useRef(false);
  const tActiveRef = useRef(false);
  const targetNodeRef = useRef<any>(null);
  const targetTransitionRef = useRef(0);

  // Alignment state
  const aligningRef = useRef(false);
  const alignmentProgressRef = useRef(0);

  // Camera state
  const mouseControlRef = useRef(false);
  const restoreCameraRef = useRef(false);
  const chaseCameraRef = useRef(false);

  const savedView2dRef = useRef<{ center: { x: number; y: number }; zoom: number } | null>(null);

  // Engine glow refs
  const rearGlowLeftRef = useRef<THREE.Mesh | null>(null);
  const rearGlowRightRef = useRef<THREE.Mesh | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let fg: any;

    Promise.all([
      viewMode === '2d' ? import('force-graph') : import('3d-force-graph'),
      fetch('/api/graph').then(r => r.json()),
    ]).then(([fgModule, data]) => {
      if (!containerRef.current) return;
      dataRef.current = data;
      setLoading(false);

      const counts: Record<string, number> = {};
      data.nodes.forEach((node: any) => {
        counts[node.type] = (counts[node.type] || 0) + 1;
      });
      setTypeCounts(counts);

      const linkCounts: Record<string, number> = {};
      data.links.forEach((link: any) => {
        const s = link.source.id ?? link.source;
        const t = link.target.id ?? link.target;
        linkCounts[s] = (linkCounts[s] || 0) + 1;
        linkCounts[t] = (linkCounts[t] || 0) + 1;
      });
      data.nodes.forEach((node: any) => {
        node.val = node.type === 'tag'
          ? Math.min((linkCounts[node.id] || 1) * 0.8, 6)
          : Math.min((linkCounts[node.id] || 1) * 1.2 + 2, 8);
      });

      const ForceGraph = (fgModule as any).default || fgModule;
      const is2d = viewMode === '2d';
      fg = is2d
        ? ForceGraph()(containerRef.current)
            .graphData(data)
            .backgroundColor('rgba(0,0,0,0)')
            .linkWidth(0.4)
            .linkColor((link: any) => {
              if (highlightSet.current.size === 0) return 'rgba(245,200,80,0.12)';
              const s = link.source.id ?? link.source;
              const t = link.target.id ?? link.target;
              if (highlightSet.current.has(s) || highlightSet.current.has(t)) return 'rgba(245,200,80,0.6)';
              return 'rgba(245,200,80,0.04)';
            })
            .nodeRelSize(1.8)
            .nodeVal((node: any) => (node.val || 3) * 0.3)
            .nodeColor((node: any) => {
              const dimmed = highlightSet.current.size > 0 && !highlightSet.current.has(node.id);
              return dimmed ? 'rgba(100,116,139,0.15)' : (TYPE_COLORS[node.type] || '#666');
            })
            .nodeLabel('name')
            .onNodeHover((node: any) => {
              if (!containerRef.current) return;
              containerRef.current.style.cursor = node ? 'pointer' : 'default';
              if (!node || !dataRef.current) {
                highlightSet.current = new Set();
                setHoverNode(null);
              } else {
                const connected = new Set<string>();
                connected.add(node.id);
                dataRef.current.links.forEach((link: any) => {
                  const s = link.source.id ?? link.source;
                  const t = link.target.id ?? link.target;
                  if (s === node.id) connected.add(t);
                  if (t === node.id) connected.add(s);
                });
                highlightSet.current = connected;
                setHoverNode(node);
              }
              if (typeof fg.refresh === 'function') fg.refresh();
            })
            .onNodeClick((node: any) => {
              if (node.type === 'tag' || node.type === 'entity') return;
              const prefix = node.type === 'speech' ? 'speeches' : node.type === 'paper' ? 'papers' : 'articles';
              const id = node.id.split('-').slice(1).join('-');
              router.push(`/${prefix}/${id}`);
            })
            .d3AlphaDecay(0.02)
            .d3VelocityDecay(0.3)
            .enableNodeDrag(true)
            .enableZoomPanInteraction(true)
            .warmupTicks(50)
            .cooldownTicks(200)
            .onNodeDrag((node: any) => {
              if (fgRef.current) fgRef.current.centerAt(node.x, node.y, 0);
            })
            .onZoomEnd((transform: any) => {
              if (viewModeRef.current !== '2d' || !fgRef.current) return;
              // Stop auto-restore once the user interacts with the view.
              savedView2dRef.current = null;
            })
        : ForceGraph()(containerRef.current)
            .graphData(data)
            .backgroundColor('rgba(0,0,0,0)')
            .showNavInfo(false)
            .linkWidth(0.4)
            .linkColor((link: any) => {
              if (highlightSet.current.size === 0) return 'rgba(245,200,80,0.12)';
              const s = link.source.id ?? link.source;
              const t = link.target.id ?? link.target;
              if (highlightSet.current.has(s) || highlightSet.current.has(t)) return 'rgba(245,200,80,0.6)';
              return 'rgba(245,200,80,0.04)';
            })
            .linkDirectionalParticles(0)
            .nodeThreeObject((node: any) => {
              const color = TYPE_COLORS[node.type] || '#666';
              const dimmed = highlightSet.current.size > 0 && !highlightSet.current.has(node.id);
              const opacity = dimmed ? 0.15 : 0.9;
              const size = Math.max((node.val || 3) * 0.5, 1);
              const isRootTopic = node.type === 'topic-root';

              const group = new THREE.Group();

              if (isRootTopic) {
                const geo = new THREE.OctahedronGeometry(size * 1.8, 0);
                const mat = new THREE.MeshPhongMaterial({
                  color: new THREE.Color(color),
                  transparent: true,
                  opacity,
                  emissive: new THREE.Color(color),
                  emissiveIntensity: 0.4,
                  flatShading: true,
                });
                group.add(new THREE.Mesh(geo, mat));
              } else {
                const geo = new THREE.SphereGeometry(size, 16, 12);
                const mat = new THREE.MeshPhongMaterial({
                  color: new THREE.Color(color),
                  transparent: true,
                  opacity,
                  emissive: new THREE.Color(color),
                  emissiveIntensity: 0.3,
                });
                group.add(new THREE.Mesh(geo, mat));

                if (!dimmed) {
                  const coreGeo = new THREE.SphereGeometry(size * 0.4, 8, 6);
                  const coreMat = new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 0.6,
                  });
                  group.add(new THREE.Mesh(coreGeo, coreMat));
                }
              }

              if (!dimmed) {
                const canvas = document.createElement('canvas');
                canvas.width = 256;
                canvas.height = 64;
                const ctx = canvas.getContext('2d')!;
                ctx.font = 'bold 24px sans-serif';
                ctx.fillStyle = '#c8d4e0';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(node.name.slice(0, 16), 128, 32);
                const texture = new THREE.CanvasTexture(canvas);
                const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.85 });
                const sprite = new THREE.Sprite(spriteMat);
                sprite.scale.set(12, 3, 1);
                sprite.position.y = isRootTopic ? size * 3 : size * 2.2;
                group.add(sprite);
              }

              (group.userData as any).nodeId = node.id;
              (group.userData as any).nodeData = node;

              return group;
            })
            .onNodeHover((node: any) => {
              if (!containerRef.current) return;
              containerRef.current.style.cursor = node ? 'pointer' : 'default';

              if (!node || !dataRef.current) {
                highlightSet.current = new Set();
                setHoverNode(null);
              } else {
                const connected = new Set<string>();
                connected.add(node.id);
                dataRef.current.links.forEach((link: any) => {
                  const s = link.source.id ?? link.source;
                  const t = link.target.id ?? link.target;
                  if (s === node.id) connected.add(t);
                  if (t === node.id) connected.add(s);
                });
                highlightSet.current = connected;
                setHoverNode(node);
              }
              if (typeof fg.refresh === 'function') fg.refresh();
            })
            .onNodeClick((node: any) => {
              if (node.type === 'tag' || node.type === 'entity') return;
              const prefix = node.type === 'speech' ? 'speeches' : node.type === 'paper' ? 'papers' : 'articles';
              const id = node.id.split('-').slice(1).join('-');
              router.push(`/${prefix}/${id}`);
            })
            .d3AlphaDecay(0.02)
            .d3VelocityDecay(0.3)
            .enableNodeDrag(false)
            .warmupTicks(50)
            .cooldownTicks(200);

      fgRef.current = fg;

      if (!is2d) {
        // Try loading saved camera position; fall back to auto-framing.
        fetch('/api/settings/camera?mode=3d')
          .then(r => r.json())
          .then(saved => {
            if (saved && saved.position && saved.target && fgRef.current) {
              const p = saved.position;
              const t = saved.target;
              const apply = () => {
                if (!fgRef.current || !shipRef.current) return;
                fgRef.current.cameraPosition({ x: p.x, y: p.y, z: p.z }, { x: t.x, y: t.y, z: t.z }, 0);
                const controls = fgRef.current.controls();
                if (controls && controls.target) {
                  controls.target.set(t.x, t.y, t.z);
                  if (saved.up) {
                    const up = saved.up;
                    fgRef.current.camera().up.set(up.x, up.y, up.z);
                  }
                  if (saved.fov && fgRef.current.camera() && typeof fgRef.current.camera().fov === 'number') {
                    fgRef.current.camera().fov = saved.fov;
                  }
                  controls.update();
                }
                if (saved.shipPosition) {
                  const sp = saved.shipPosition;
                  shipRef.current.position.set(sp.x, sp.y, sp.z);
                }
                if (saved.shipQuaternion) {
                  const sq = saved.shipQuaternion;
                  shipRef.current.quaternion.set(sq.x, sq.y, sq.z, sq.w);
                  shipForwardRef.current.set(0, 0, -1).applyQuaternion(shipRef.current.quaternion).normalize();
                }
                if (saved.shipForward) {
                  const f = saved.shipForward;
                  shipForwardRef.current.set(f.x, f.y, f.z).normalize();
                }
                if (saved.shipRoll !== undefined) {
                  shipRollRef.current = saved.shipRoll;
                }
                if (saved.pitchVel !== undefined) pitchVelRef.current = saved.pitchVel;
                if (saved.yawVel !== undefined) yawVelRef.current = saved.yawVel;
                if (saved.rollVel !== undefined) rollVelRef.current = saved.rollVel;
                if (saved.moveVel) {
                  const mv = saved.moveVel;
                  moveVelRef.current.set(mv.x, mv.y, mv.z);
                }
              };
              apply();
              requestAnimationFrame(apply);
              setTimeout(apply, 50);
              setTimeout(apply, 300);
              // Keep the saved static view until the user starts flying.
              chaseCameraRef.current = false;
              mouseControlRef.current = false;
            } else {
              // After layout settles, frame all nodes in view.
              setTimeout(() => {
                if (!fgRef.current || !dataRef.current) return;
                const nodes = dataRef.current.nodes as any[];
                if (!nodes.length) return;
                const box = new THREE.Box3();
                nodes.forEach((n: any) => {
                  if (typeof n.x === 'number' && typeof n.y === 'number' && typeof n.z === 'number') {
                    box.expandByPoint(new THREE.Vector3(n.x, n.y, n.z));
                  }
                });
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3()).length();
                const distance = Math.max(size * 1.4, 250);
                fgRef.current.cameraPosition({ x: center.x, y: center.y + distance * 0.35, z: center.z + distance }, center, 1500);
                setTimeout(() => { chaseCameraRef.current = true; }, 1600);
              }, 1200);
            }
          });

        const controls = fg.controls();
        if (controls) {
          controls.enableZoom = true;
          controls.enablePan = false;
          controls.addEventListener('start', () => { mouseControlRef.current = true; });
          controls.addEventListener('end', () => { mouseControlRef.current = false; });
        }

        createSpaceship(fg);
        setupControls();
        startLoop();

        const originalDestructor = fg._destructor?.bind(fg);
        fg._destructor = () => {
          cleanupSpaceship();
          originalDestructor?.();
        };
      } else {
        // 2D mode: load saved zoom/center if available.
        fetch('/api/settings/camera?mode=2d')
          .then(r => r.json())
          .then(saved => {
            if (saved && saved.mode === '2d' && saved.center && typeof saved.zoom === 'number' && fgRef.current) {
              savedView2dRef.current = { center: saved.center, zoom: saved.zoom };
              const s = savedView2dRef.current;
              const restore2dView = () => {
                if (!fgRef.current || !containerRef.current) return;
                const width = containerRef.current.clientWidth || 800;
                const height = containerRef.current.clientHeight || 600;
                fgRef.current.centerAt(s.center.x, s.center.y, 0);
                fgRef.current.zoom(s.zoom, 0);
              };
              restore2dView();
              requestAnimationFrame(restore2dView);
              setTimeout(restore2dView, 50);
              setTimeout(restore2dView, 300);
              setTimeout(restore2dView, 800);
              setTimeout(restore2dView, 1500);
            }
          })
          .catch(() => {});
      }
    });

    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      cleanupSpaceship();
      fg?._destructor?.();
    };
  }, [router, viewMode]);

  function createSpaceship(fg: any) {
    const scene = fg.scene() as THREE.Scene;
    const group = new THREE.Group();

    const hullMat = new THREE.MeshPhongMaterial({
      color: 0xddeeff,
      emissive: 0x224466,
      emissiveIntensity: 0.25,
      shininess: 100,
      transparent: true,
      opacity: 0.96,
    });
    const accentMat = new THREE.MeshPhongMaterial({
      color: 0x88aacc,
      emissive: 0x112233,
      emissiveIntensity: 0.2,
      shininess: 80,
    });
    const darkMat = new THREE.MeshPhongMaterial({
      color: 0x334455,
      emissive: 0x111111,
      emissiveIntensity: 0.15,
      shininess: 60,
    });
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.85,
    });
    const blueGlowMat = new THREE.MeshBasicMaterial({
      color: 0x44ccff,
      transparent: true,
      opacity: 0.75,
    });

    const engineRadius = 0.55;

    // Main saucer (large front disc)
    const saucerGeo = new THREE.SphereGeometry(3.0, 48, 24);
    const saucer = new THREE.Mesh(saucerGeo, hullMat);
    saucer.scale.set(1, 0.18, 1);
    saucer.position.set(0, 0, -2.0);
    group.add(saucer);

    // Short central cabin cylinder (rear lower center), same radius as nacelles
    const cabinGeo = new THREE.CylinderGeometry(engineRadius, engineRadius, 4.2, 24);
    const cabin = new THREE.Mesh(cabinGeo, accentMat);
    cabin.rotation.x = Math.PI / 2;
    cabin.position.set(0, -0.3, 2.4);
    group.add(cabin);

    // Cabin front dome
    const cabinFrontGeo = new THREE.SphereGeometry(engineRadius, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const cabinFront = new THREE.Mesh(cabinFrontGeo, hullMat);
    cabinFront.rotation.x = -Math.PI / 2;
    cabinFront.position.set(0, -0.3, 0.3);
    group.add(cabinFront);

    // Cabin rear dome
    const cabinRearGeo = new THREE.SphereGeometry(engineRadius, 24, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const cabinRear = new THREE.Mesh(cabinRearGeo, darkMat);
    cabinRear.rotation.x = -Math.PI / 2;
    cabinRear.position.set(0, -0.3, 4.5);
    group.add(cabinRear);

    // Forward connecting strut (cabin -> saucer)
    const forwardStrutGeo = new THREE.BoxGeometry(0.5, 0.25, 2.2);
    const forwardStrut = new THREE.Mesh(forwardStrutGeo, accentMat);
    forwardStrut.position.set(0, -0.1, -0.65);
    forwardStrut.rotation.x = -Math.PI / 16;
    group.add(forwardStrut);

    // Two long engine nacelles (rear upper left and upper right), pointing backward
    const nacelleGeo = new THREE.CylinderGeometry(engineRadius, engineRadius, 6.0, 20);
    const nacelleLeft = new THREE.Mesh(nacelleGeo, darkMat);
    nacelleLeft.rotation.x = Math.PI / 2;
    nacelleLeft.position.set(-2.4, 1.4, 5.0);
    group.add(nacelleLeft);

    const nacelleRight = nacelleLeft.clone();
    nacelleRight.position.set(2.4, 1.4, 5.0);
    group.add(nacelleRight);

    // Nacelle front caps (blue bussard collectors)
    const capGeo = new THREE.SphereGeometry(engineRadius + 0.01, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    const capLeft = new THREE.Mesh(capGeo, blueGlowMat);
    capLeft.rotation.x = -Math.PI / 2;
    capLeft.position.set(-2.4, 1.4, 2.0);
    group.add(capLeft);

    const capRight = capLeft.clone();
    capRight.position.set(2.4, 1.4, 2.0);
    group.add(capRight);

    // Nacelle rear glows
    const rearGlowGeo = new THREE.CircleGeometry(engineRadius - 0.08, 20);
    const rearGlowMat = new THREE.MeshBasicMaterial({
      color: 0x44ccff,
      transparent: true,
      opacity: 0.85,
    });
    const rearGlowLeft = new THREE.Mesh(rearGlowGeo, rearGlowMat);
    rearGlowLeft.rotation.x = Math.PI / 2;
    rearGlowLeft.position.set(-2.4, 1.4, 8.0);
    group.add(rearGlowLeft);

    const rearGlowRight = rearGlowLeft.clone();
    rearGlowRight.position.set(2.4, 1.4, 8.0);
    group.add(rearGlowRight);
    rearGlowLeftRef.current = rearGlowLeft;
    rearGlowRightRef.current = rearGlowRight;

    // Pylons: from rear sides of cabin up/forward to front of nacelles
    const pylonWidth = 0.35;
    const pylonHeight = 0.18;
    const cabinRearZ = 2.4 + 4.2 / 2;   // 4.5
    const nacelleFrontZ = 5.0 - 6.0 / 2; // 2.0

    const leftStart = new THREE.Vector3(-0.55, -0.3, cabinRearZ);
    const leftEnd = new THREE.Vector3(-2.4, 1.4 - 0.55, nacelleFrontZ);
    const leftPylon = new THREE.Mesh(
      new THREE.BoxGeometry(pylonWidth, pylonHeight, leftStart.distanceTo(leftEnd)),
      accentMat
    );
    leftPylon.position.copy(leftStart).add(leftEnd).multiplyScalar(0.5);
    leftPylon.lookAt(leftEnd);
    group.add(leftPylon);

    const rightStart = new THREE.Vector3(0.55, -0.3, cabinRearZ);
    const rightEnd = new THREE.Vector3(2.4, 1.4 - 0.55, nacelleFrontZ);
    const rightPylon = new THREE.Mesh(
      new THREE.BoxGeometry(pylonWidth, pylonHeight, rightStart.distanceTo(rightEnd)),
      accentMat
    );
    rightPylon.position.copy(rightStart).add(rightEnd).multiplyScalar(0.5);
    rightPylon.lookAt(rightEnd);
    group.add(rightPylon);

    // Impulse engine glow (rear of saucer)
    const impulseGeo = new THREE.CircleGeometry(0.4, 20);
    const impulse = new THREE.Mesh(impulseGeo, glowMat);
    impulse.rotation.x = Math.PI / 2;
    impulse.position.set(0, 0.05, -4.85);
    group.add(impulse);

    // Registry label
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 80;
    const ctx = canvas.getContext('2d')!;
    ctx.font = 'bold 32px sans-serif';
    ctx.fillStyle = '#00d4ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur = 12;
    ctx.fillText('拾光号', 128, 40);
    const texture = new THREE.CanvasTexture(canvas);
    const labelMat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.95 });
    const label = new THREE.Sprite(labelMat);
    label.scale.set(10, 3.1, 1);
    label.position.set(0, 3.0, -1.5);
    group.add(label);

    // Scale the whole ship down a bit
    group.scale.setScalar(0.75);

    // Position: screen center (in graph world coordinates)
    const { width, height } = fg.renderer().domElement;
    const centerScreen = fg.screen2GraphCoords(width / 2 - 11300, height / 2, 160);
    group.position.set(centerScreen.x, centerScreen.y, centerScreen.z);
    shipForwardRef.current.set(0, 0, -1).applyQuaternion(group.quaternion).normalize();

    // Save center position for reference in case canvas resizes
    (group.userData as any).centerPosition = group.position.clone();

    scene.add(group);
    shipRef.current = group;

    // Handle resize to keep ship centered
    const resizeHandler = () => {
      if (!shipRef.current || !fgRef.current) return;
      const { width: w, height: h } = fgRef.current.renderer().domElement;
      const center = fgRef.current.screen2GraphCoords(w / 2 - 11300, h / 2, 160);
      shipRef.current.position.set(center.x, center.y, center.z);
    };
    window.addEventListener('resize', resizeHandler);
    listenersRef.current.resize = resizeHandler as any;
  }

  function setupControls() {
    const handleKeyDown = (e: KeyboardEvent) => {
      console.log('[keydown]', e.code, e.key);
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

      const key = e.key.toLowerCase();
      const code = e.code;
      const arrowKeys = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
      if (['w', 'a', 's', 'd', ' ', 'x', 'h', 'l', 't'].includes(key) || code === 'Space' || arrowKeys.includes(key)) {
        e.preventDefault();
      }
      keysRef.current[key] = true;

      if (viewModeRef.current !== '3d') return;

      // Resume chase camera when the user starts flying from a saved static view.
      const isMovementKey = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key) || code === 'Space';
      if (isMovementKey) {
        chaseCameraRef.current = true;
      }

      if ((code === 'Space') && viewModeRef.current === '3d') {
        fireBullet();
      }

      if ((key === 'x' || code === 'KeyX') && viewModeRef.current === '3d') {
        startAlignment();
        restoreCameraRef.current = true;
        mouseControlRef.current = false;
        chaseCameraRef.current = true;
      }

      if ((code === 'KeyH' || key === 'h') && !hActiveRef.current && viewModeRef.current === '3d') {
        hActiveRef.current = true;
        const next = !shipVisibleRef.current;
        shipVisibleRef.current = next;
        setShipVisible(next);
        if (shipRef.current) shipRef.current.visible = next;
      }

      if ((code === 'KeyL' || key === 'l') && !lActiveRef.current && viewModeRef.current === '3d') {
        lActiveRef.current = true;
        const next = !laserModeRef.current;
        laserModeRef.current = next;
        setLaserMode(next);
      }

      if ((code === 'KeyT' || key === 't') && !tActiveRef.current && viewModeRef.current === '3d') {
        tActiveRef.current = true;
        const nodes = dataRef.current?.nodes || [];
        const validNodes = nodes.filter((n: any) => typeof n.x === 'number' && typeof n.y === 'number' && typeof n.z === 'number');
        if (validNodes.length > 0) {
          targetNodeRef.current = validNodes[Math.floor(Math.random() * validNodes.length)];
          targetTransitionRef.current = 0;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
      if (e.key.toLowerCase() === 'x') {
        aligningRef.current = false;
        alignmentProgressRef.current = 0;
      }
      if (e.code === 'KeyH' || e.key.toLowerCase() === 'h') {
        hActiveRef.current = false;
      }
      if (e.code === 'KeyL' || e.key.toLowerCase() === 'l') {
        lActiveRef.current = false;
      }
      if (e.code === 'KeyT' || e.key.toLowerCase() === 't') {
        tActiveRef.current = false;
      }
    };

    listenersRef.current.keydown = handleKeyDown;
    listenersRef.current.keyup = handleKeyUp;
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
  }

  function startLoop() {
    lastTimeRef.current = performance.now();

    const tick = (time: number) => {
      const delta = Math.min((time - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = time;
      updateShip(delta);
      updateBullets(delta);
      updateSparks(delta);
      updateCamera();
      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);
  }

  function startAlignment() {
    if (aligningRef.current) return;
    aligningRef.current = true;
    alignmentProgressRef.current = 0;
  }

  function applyAlignment(delta: number) {
    if (!aligningRef.current) return;

    const ship = shipRef.current;
    if (!ship) return;

    // Compute direction from ship to galaxy center (0,0,0)
    const targetDir = new THREE.Vector3(0, 0, 0).sub(ship.position).normalize();

    alignmentProgressRef.current += delta * 1.5;
    const t = Math.min(alignmentProgressRef.current, 1);

    const currentForward = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion).normalize();
    const newForward = new THREE.Vector3().lerpVectors(currentForward, targetDir, t).normalize();

    const targetQuaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, -1),
      newForward
    );
    ship.quaternion.copy(targetQuaternion);
    shipForwardRef.current.copy(newForward);

    if (t >= 1) {
      aligningRef.current = false;
      alignmentProgressRef.current = 0;
    }
  }

  function updateShip(delta: number) {
    const ship = shipRef.current;
    const fg = fgRef.current;
    if (!ship || !fg) return;

    if (aligningRef.current) {
      applyAlignment(delta);
      shipVelocityRef.current.multiplyScalar(0.9);
      ship.position.add(shipVelocityRef.current);
      return;
    }

    // T key auto-aim transition: smoothly rotate ship toward a random node
    if (targetNodeRef.current) {
      const shipPos = ship.position.clone();
      const target = targetNodeRef.current;
      const targetPos = new THREE.Vector3(
        typeof target.x === 'number' ? target.x : 0,
        typeof target.y === 'number' ? target.y : 0,
        typeof target.z === 'number' ? target.z : 0
      );
      const targetDir = targetPos.clone().sub(shipPos).normalize();
      if (targetDir.lengthSq() > 0.0001) {
        targetTransitionRef.current += delta * 3.5;
        const t = Math.min(targetTransitionRef.current, 1);
        const currentForward = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion).normalize();
        const newForward = new THREE.Vector3().lerpVectors(currentForward, targetDir, t).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), newForward);
        ship.quaternion.copy(q);
        shipForwardRef.current.copy(newForward);
        if (t >= 1) {
          targetNodeRef.current = null;
          targetTransitionRef.current = 0;
        }
      } else {
        targetNodeRef.current = null;
        targetTransitionRef.current = 0;
      }
    }

    // Rotation: arrow keys for pitch / yaw relative to ship orientation
    const TURN_ACCEL = 2.0;
    const TURN_MAX = 1.6;
    const PITCH_ACCEL = 1.8;
    const PITCH_MAX = 1.4;
    const TURN_DAMP = 4.0;
    const MAX_PITCH_ANGLE = (Math.PI * 45) / 180; // ±45° pitch limit

    // Reconstruct baseQuat from the current quaternion by removing the stored roll.
    // ship.quaternion = rollQ * baseQuat  =>  baseQuat = rollQ.inverse() * ship.quaternion
    const currentForward = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion).normalize();
    const unrollQ = new THREE.Quaternion().setFromAxisAngle(currentForward, -shipRollRef.current);
    let baseQuat = ship.quaternion.clone().premultiply(unrollQ).normalize();

    // Apply pitch/yaw on the unrolled base orientation.
    const baseRight = new THREE.Vector3(1, 0, 0).applyQuaternion(baseQuat).normalize();
    const baseUp = new THREE.Vector3(0, 1, 0).applyQuaternion(baseQuat).normalize();

    const pitchInput = (keysRef.current['arrowup'] ? 1 : 0) - (keysRef.current['arrowdown'] ? 1 : 0);
    const yawInput = (keysRef.current['arrowleft'] ? 1 : 0) - (keysRef.current['arrowright'] ? 1 : 0);

    // Compute current pitch angle (angle between forward and the horizontal plane).
    const baseForward = new THREE.Vector3(0, 0, -1).applyQuaternion(baseQuat).normalize();
    const currentPitch = Math.asin(Math.max(-1, Math.min(1, baseForward.y)));

    // Clamp pitch velocity to prevent exceeding the pitch limit.
    if (pitchInput > 0 && currentPitch >= MAX_PITCH_ANGLE) {
      pitchVelRef.current = Math.min(pitchVelRef.current, 0);
    }
    if (pitchInput < 0 && currentPitch <= -MAX_PITCH_ANGLE) {
      pitchVelRef.current = Math.max(pitchVelRef.current, 0);
    }

    pitchVelRef.current += pitchInput * PITCH_ACCEL * delta;
    yawVelRef.current += yawInput * TURN_ACCEL * delta;

    pitchVelRef.current = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, pitchVelRef.current));
    yawVelRef.current = Math.max(-TURN_MAX, Math.min(TURN_MAX, yawVelRef.current));

    // Decelerate when no input
    if (pitchInput === 0) pitchVelRef.current *= Math.max(0, 1 - TURN_DAMP * delta);
    if (yawInput === 0) yawVelRef.current *= Math.max(0, 1 - TURN_DAMP * delta);

    const qPitch = new THREE.Quaternion().setFromAxisAngle(baseRight, pitchVelRef.current * delta);
    baseQuat.premultiply(qPitch);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(baseUp, yawVelRef.current * delta);
    baseQuat.premultiply(qYaw);
    baseQuat.normalize();

    // Hard clamp after applying rotation to stay within limits.
    const clampedForward = new THREE.Vector3(0, 0, -1).applyQuaternion(baseQuat).normalize();
    let clampedPitch = Math.asin(Math.max(-1, Math.min(1, clampedForward.y)));
    if (clampedPitch > MAX_PITCH_ANGLE) clampedPitch = MAX_PITCH_ANGLE;
    if (clampedPitch < -MAX_PITCH_ANGLE) clampedPitch = -MAX_PITCH_ANGLE;
    if (Math.abs(clampedPitch - Math.asin(Math.max(-1, Math.min(1, clampedForward.y)))) > 0.001) {
      // Build a new forward with clamped pitch while preserving yaw.
      const horizontalForward = clampedForward.clone();
      horizontalForward.y = 0;
      if (horizontalForward.lengthSq() < 0.0001) {
        horizontalForward.set(0, 0, clampedForward.z >= 0 ? 1 : -1);
      }
      horizontalForward.normalize();
      const yaw = Math.atan2(horizontalForward.x, -horizontalForward.z);
      const newForward = new THREE.Vector3(
        Math.sin(yaw) * Math.cos(clampedPitch),
        Math.sin(clampedPitch),
        -Math.cos(yaw) * Math.cos(clampedPitch)
      );
      baseQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), newForward);
    }

    // A/D horizontal strafing with roll (bank angle limited to ±45°)
    const rollingLeft = keysRef.current['a'] && !keysRef.current['d'];
    const rollingRight = keysRef.current['d'] && !keysRef.current['a'];
    const rollAngle = Math.PI / 4;
    const ROLL_ACCEL = 8.0;
    const ROLL_MAX = 5.0;
    const ROLL_DAMP = 10.0;

    // Target roll: A = left bank (-45°), D = right bank (+45°).
    const targetRoll = rollingLeft ? -rollAngle : rollingRight ? rollAngle : 0;

    // Spring-like behavior: accelerate toward target, damp velocity near target or on release.
    const rollError = targetRoll - shipRollRef.current;
    rollVelRef.current += rollError * ROLL_ACCEL * delta;
    rollVelRef.current = Math.max(-ROLL_MAX, Math.min(ROLL_MAX, rollVelRef.current));
    rollVelRef.current *= Math.max(0, 1 - ROLL_DAMP * delta);

    shipRollRef.current += rollVelRef.current * delta;
    shipRollRef.current = Math.max(-rollAngle, Math.min(rollAngle, shipRollRef.current));

    // Re-apply roll around the (possibly re-oriented) forward axis.
    const newForward = new THREE.Vector3(0, 0, -1).applyQuaternion(baseQuat).normalize();
    const rollQ = new THREE.Quaternion().setFromAxisAngle(newForward, shipRollRef.current);
    ship.quaternion.copy(baseQuat).premultiply(rollQ).normalize();

    shipForwardRef.current.set(0, 0, -1).applyQuaternion(ship.quaternion).normalize();

    // Translation: W/S forward/back relative to ship; A/D horizontal world-side strafe.
    const forward = shipForwardRef.current.clone();
    const worldRight = new THREE.Vector3(1, 0, 0);

    const moveInput = new THREE.Vector3();
    if (keysRef.current['w']) moveInput.add(forward);
    if (keysRef.current['s']) moveInput.sub(forward);
    if (keysRef.current['d']) moveInput.add(worldRight);
    if (keysRef.current['a']) moveInput.sub(worldRight);

    const MOVE_ACCEL = 120;
    const MOVE_DAMP = 4.0;

    if (moveInput.lengthSq() > 0.001) {
      moveInput.normalize();
      const targetAcc = moveInput.multiplyScalar(MOVE_ACCEL * delta);
      moveVelRef.current.add(targetAcc);
      const maxSpeed = SHIP_SPEED;
      if (moveVelRef.current.length() > maxSpeed) {
        moveVelRef.current.normalize().multiplyScalar(maxSpeed);
      }
    } else {
      moveVelRef.current.multiplyScalar(Math.max(0, 1 - MOVE_DAMP * delta));
    }

    const moving = moveVelRef.current.lengthSq() > 0.001;
    shipVelocityRef.current.copy(moveVelRef.current).multiplyScalar(delta);

    if (moving) {
      // Engine glow pulse while moving
      const time = Date.now() * 0.008;
      const pulse = 0.7 + 0.3 * Math.sin(time);
      if (rearGlowLeftRef.current) (rearGlowLeftRef.current.material as THREE.MeshBasicMaterial).opacity = pulse;
      if (rearGlowRightRef.current) (rearGlowRightRef.current.material as THREE.MeshBasicMaterial).opacity = pulse;
    } else {
      if (rearGlowLeftRef.current) (rearGlowLeftRef.current.material as THREE.MeshBasicMaterial).opacity = 0.85;
      if (rearGlowRightRef.current) (rearGlowRightRef.current.material as THREE.MeshBasicMaterial).opacity = 0.85;
    }

    ship.position.add(shipVelocityRef.current);

    // Subtle idle bob
    if (!moving) {
      ship.position.y += Math.sin(Date.now() * 0.003) * 0.015;
    }
  }

  function toggleViewMode() {
    setViewMode(prev => {
      const next = prev === '3d' ? '2d' : '3d';
      viewModeRef.current = next;
      return next;
    });
  }

  function fireBullet() {
    const now = Date.now();
    if (now - lastFireTimeRef.current < FIRE_INTERVAL) return;
    lastFireTimeRef.current = now;

    const ship = shipRef.current;
    const fg = fgRef.current;
    if (!ship || !fg) return;

    const scene = fg.scene() as THREE.Scene;
    const forward = shipForwardRef.current.clone();
    const startPos = ship.position.clone().add(forward.clone().multiplyScalar(laserModeRef.current ? 58.5 : 3.5));

    let bullet: THREE.Mesh;
    if (laserModeRef.current) {
      // Laser beam: long thin red cylinder aligned with ship forward
      const laserGeo = new THREE.CylinderGeometry(0.8, 0.8, 60, 8);
      const laserMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      bullet = new THREE.Mesh(laserGeo, laserMat);
      bullet.position.copy(startPos);
      // Make the cylinder's long axis (Y-up by default) point along ship forward (Z-back in ship local).
      // The ship's local forward is -Z, which in world space is shipForwardRef.current.
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), forward);
      bullet.quaternion.copy(q);
    } else {
      const bulletGeo = new THREE.SphereGeometry(0.45, 10, 8);
      const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffee00 });
      bullet = new THREE.Mesh(bulletGeo, bulletMat);
      bullet.position.copy(startPos);
      // Add glow ring
      const glowGeo = new THREE.RingGeometry(0.5, 0.9, 12);
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.lookAt(startPos.clone().add(forward));
      bullet.add(glow);
    }

    (bullet.userData as any).velocity = forward.multiplyScalar(BULLET_SPEED);
    (bullet.userData as any).life = BULLET_LIFE;

    scene.add(bullet);
    bulletsRef.current.push(bullet);
    playFireSound(laserModeRef.current);
  }

  function updateBullets(delta: number) {
    const fg = fgRef.current;
    if (!fg || viewModeRef.current !== '3d' || typeof fg.scene !== 'function') return;
    const scene = fg.scene() as THREE.Scene;
    const nodes = dataRef.current?.nodes || [];

    bulletsRef.current = bulletsRef.current.filter(bullet => {
      const vel = (bullet.userData as any).velocity as THREE.Vector3;
      bullet.position.add(vel.clone().multiplyScalar(delta));
      (bullet.userData as any).life -= delta;

      // Collision with knowledge nodes (data coordinates)
      const bulletPos = bullet.position;
      let hit = false;
      const hitRadius = laserModeRef.current ? 5.0 : 1.2;
      for (const node of nodes) {
        if (!node.x && !node.y && !node.z) continue;
        const nodePos = new THREE.Vector3(node.x, node.y, node.z);
        const dist = bulletPos.distanceTo(nodePos);
        const nodeSize = (node.val || 3) * 0.6 + hitRadius;
        if (dist < nodeSize) {
          const points = TYPE_SCORES[node.type] || 0;
          if (points > 0) {
            setScore(s => s + points);
            setLastHit({ name: node.name, points });
            setTimeout(() => setLastHit(null), 1200);
          }
          playExplosionSound();
          createExplosion(nodePos, TYPE_COLORS[node.type] || 0xffffff, nodeSize * 1.5);
          scene.remove(bullet);
          hit = true;
          break;
        }
      }
      if (hit) return false;

      // Fallback: collision with visual node meshes (world positions may differ
      // from force-graph layout coordinates during transitions)
      scene.traverse((object) => {
        if (hit) return;
        if ((object.userData as any).nodeId) {
          const nodeData = (object.userData as any).nodeData;
          const visualPos = new THREE.Vector3();
          object.getWorldPosition(visualPos);
          const dist = bulletPos.distanceTo(visualPos);
          const nodeSize = (nodeData?.val || 3) * 0.6 + hitRadius + 0.2;
          if (dist < nodeSize) {
            hit = true;
            const points = TYPE_SCORES[nodeData?.type] || 0;
            if (points > 0) {
              setScore(s => s + points);
              setLastHit({ name: nodeData?.name, points });
              setTimeout(() => setLastHit(null), 1200);
            }
            playExplosionSound();
            createExplosion(visualPos, TYPE_COLORS[nodeData?.type] || 0xffffff, nodeSize * 1.5);
            scene.remove(bullet);
          }
        }
      });
      if (hit) return false;

      if ((bullet.userData as any).life <= 0) {
        scene.remove(bullet);
        return false;
      }
      return true;
    });
  }

  function playFireSound(isLaser: boolean) {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const now = ctx.currentTime;
      if (isLaser) {
        // Laser: sustained piercing high tone (sine) with quick fade
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2200, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.18);
      } else {
        // Bullet: short percussive blip (square)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.1);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
      }
    } catch {
      // ignore audio errors
    }
  }

  function playExplosionSound() {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const duration = 0.35;
      const sampleRate = ctx.sampleRate;
      const buffer = ctx.createBuffer(1, sampleRate * duration, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + duration);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start();
      noise.stop(ctx.currentTime + duration);
    } catch {
      // ignore audio errors
    }
  }

  function createExplosion(pos: THREE.Vector3, color: number | string, radius: number) {
    const fg = fgRef.current;
    if (!fg) return;
    const scene = fg.scene() as THREE.Scene;
    const particleCount = 18;
    const c = new THREE.Color(color);

    // Expanding shockwave ring with red-yellow radial gradient
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx2d = canvas.getContext('2d')!;
    const gradient = ctx2d.createRadialGradient(64, 64, 8, 64, 64, 60);
    gradient.addColorStop(0, 'rgba(255, 255, 100, 1)');
    gradient.addColorStop(0.4, 'rgba(255, 200, 0, 1)');
    gradient.addColorStop(0.75, 'rgba(255, 80, 0, 1)');
    gradient.addColorStop(1, 'rgba(255, 0, 0, 1)');
    ctx2d.fillStyle = gradient;
    ctx2d.fillRect(0, 0, 128, 128);
    const shockTexture = new THREE.CanvasTexture(canvas);
    shockTexture.colorSpace = THREE.SRGBColorSpace;

    const ringGeo = new THREE.RingGeometry(0.1, 0.3, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      map: shockTexture,
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(pos);
    ring.lookAt(pos.clone().add(new THREE.Vector3(Math.random(), Math.random(), Math.random())));
    (ring.userData as any).type = 'shockwave';
    (ring.userData as any).life = 10;
    (ring.userData as any).initialLife = 10;
    (ring.userData as any).maxScale = radius * 100;
    scene.add(ring);
    sparksRef.current.push(ring);

    // Flying particles
    for (let i = 0; i < particleCount; i++) {
      const geo = new THREE.SphereGeometry(0.15 + Math.random() * 0.2, 6, 6);
      const mat = new THREE.MeshBasicMaterial({
        color: c.clone().lerp(new THREE.Color(0xffffff), Math.random() * 0.4),
        transparent: true,
        opacity: 0.95,
      });
      const spark = new THREE.Mesh(geo, mat);
      spark.position.copy(pos);
      const dir = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      ).normalize();
      const speed = 6 + Math.random() * 12;
      (spark.userData as any).velocity = dir.multiplyScalar(speed);
      (spark.userData as any).life = 0.4 + Math.random() * 0.5;
      (spark.userData as any).initialLife = (spark.userData as any).life;
      (spark.userData as any).type = 'particle';
      scene.add(spark);
      sparksRef.current.push(spark);
    }

    // Bright flash core
    const coreGeo = new THREE.SphereGeometry(radius * 0.4, 12, 12);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.copy(pos);
    (core.userData as any).velocity = new THREE.Vector3();
    (core.userData as any).life = 0.25;
    (core.userData as any).initialLife = 0.25;
    (core.userData as any).type = 'flash';
    scene.add(core);
    sparksRef.current.push(core);
  }

  function createSpark(pos: THREE.Vector3, velocity: THREE.Vector3, color: number | string, life: number) {
    const fg = fgRef.current;
    if (!fg) return;
    const scene = fg.scene() as THREE.Scene;

    const geo = new THREE.SphereGeometry(0.25 + Math.random() * 0.25, 6, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0.9,
    });
    const spark = new THREE.Mesh(geo, mat);
    spark.position.copy(pos);
    (spark.userData as any).velocity = velocity;
    (spark.userData as any).life = life;
    (spark.userData as any).initialLife = life;

    scene.add(spark);
    sparksRef.current.push(spark);
  }

  function updateSparks(delta: number) {
    const fg = fgRef.current;
    if (!fg || viewModeRef.current !== '3d' || typeof fg.scene !== 'function') return;
    const scene = fg.scene() as THREE.Scene;

    sparksRef.current = sparksRef.current.filter(spark => {
      const type = (spark.userData as any).type as string | undefined;
      const life = (spark.userData as any).life as number;
      const initialLife = (spark.userData as any).initialLife as number;
      const lifeRatio = life / initialLife;

      if (type === 'shockwave') {
        const maxScale = (spark.userData as any).maxScale as number;
        const t = 1 - lifeRatio;
        spark.scale.setScalar(1 + t * (maxScale - 1));
        (spark.material as THREE.MeshBasicMaterial).opacity = Math.max(0, lifeRatio * 0.8);
      } else if (type === 'flash') {
        spark.scale.setScalar(1 + (1 - lifeRatio) * 2);
        (spark.material as THREE.MeshBasicMaterial).opacity = Math.max(0, lifeRatio);
      } else {
        const vel = (spark.userData as any).velocity as THREE.Vector3;
        spark.position.add(vel.clone().multiplyScalar(delta));
        vel.multiplyScalar(0.96);
        (spark.material as THREE.MeshBasicMaterial).opacity = Math.max(0, lifeRatio);
        spark.scale.setScalar(1 + (1 - lifeRatio) * 1.5);
      }

      (spark.userData as any).life -= delta;

      if ((spark.userData as any).life <= 0) {
        scene.remove(spark);
        return false;
      }
      return true;
    });
  }

  function updateCamera() {
    const ship = shipRef.current;
    const fg = fgRef.current;
    if (!ship || !fg) return;

    const camera = fg.camera() as THREE.Camera;
    const controls = fg.controls() as any;
    if (!controls || !controls.target) return;

    // When user controls the camera with mouse, do not force the chase view.
    if (mouseControlRef.current && !restoreCameraRef.current) return;

    // Only chase the ship with the camera after user has started flying it.
    if (!chaseCameraRef.current) return;

    if (!ship.visible) return;

    const shipForward = shipForwardRef.current.clone().normalize();
    const shipUp = new THREE.Vector3(0, 1, 0).applyQuaternion(ship.quaternion).normalize();
    const shipRight = new THREE.Vector3(1, 0, 0).applyQuaternion(ship.quaternion).normalize();

    // Camera up stays world-up so the view does not roll with the ship.
    const cameraUp = new THREE.Vector3(0, 1, 0);

    // Build an orbit frame from ship forward and world up, but when the ship is near
    // vertical, fall back to ship's own up to avoid gimbal-like flips.
    let right = new THREE.Vector3().crossVectors(cameraUp, shipForward).normalize();
    if (right.lengthSq() < 0.001) {
      right.copy(shipRight);
    }
    const actualUp = new THREE.Vector3().crossVectors(shipForward, right).normalize();
    if (actualUp.lengthSq() < 0.001) {
      actualUp.copy(shipUp);
    }

    const distance = 120;
    const height = 32;
    const targetCamPos = ship.position
      .clone()
      .sub(shipForward.clone().multiplyScalar(distance))
      .add(actualUp.clone().multiplyScalar(height));

    if (restoreCameraRef.current) {
      controls.target.copy(ship.position);
      camera.position.copy(targetCamPos);
      camera.up.copy(cameraUp);
      restoreCameraRef.current = false;
    } else {
      controls.target.copy(ship.position);
      camera.position.copy(targetCamPos);
      camera.up.copy(cameraUp);
    }
    controls.update();
  }

  function saveCameraView() {
    const fg = fgRef.current;
    if (!fg) return;

    if (viewModeRef.current === '2d') {
      const transform = (fg as any).__zoom || { k: 1, x: 0, y: 0 };
      const payload = {
        zoom: transform.k,
        center: { x: -transform.x / transform.k, y: -transform.y / transform.k },
        mode: '2d',
      };
      fetch('/api/settings/camera?mode=2d', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(r => r.json()).then(res => {
        if (res.success) {
          alert('初始视角已保存');
        } else {
          alert('保存失败：' + (res.error || '未知错误'));
        }
      }).catch(e => alert('保存失败：' + String(e)));
      return;
    }

    const ship = shipRef.current;
    if (!ship) return;
    const camera = fg.camera() as THREE.Camera;
    const controls = fg.controls() as any;
    if (!camera || !controls || !controls.target) return;
    const payload = {
      mode: '3d',
      position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
      up: { x: camera.up.x, y: camera.up.y, z: camera.up.z },
      fov: (camera as any).fov,
      shipPosition: { x: ship.position.x, y: ship.position.y, z: ship.position.z },
      shipQuaternion: { x: ship.quaternion.x, y: ship.quaternion.y, z: ship.quaternion.z, w: ship.quaternion.w },
      shipForward: { x: shipForwardRef.current.x, y: shipForwardRef.current.y, z: shipForwardRef.current.z },
      shipRoll: shipRollRef.current,
      pitchVel: pitchVelRef.current,
      yawVel: yawVelRef.current,
      rollVel: rollVelRef.current,
      moveVel: { x: moveVelRef.current.x, y: moveVelRef.current.y, z: moveVelRef.current.z },
    };
    fetch('/api/settings/camera?mode=3d', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(r => r.json()).then(res => {
      if (res.success) {
        alert('初始视角已保存');
      } else {
        alert('保存失败：' + (res.error || '未知错误'));
      }
    }).catch(e => alert('保存失败：' + String(e)));
  }

  function cleanupSpaceship() {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (listenersRef.current.keydown) window.removeEventListener('keydown', listenersRef.current.keydown);
    if (listenersRef.current.keyup) window.removeEventListener('keyup', listenersRef.current.keyup);
    if (listenersRef.current.resize) window.removeEventListener('resize', listenersRef.current.resize);

    const fg = fgRef.current;
    if (!fg || typeof fg.scene !== 'function') return;
    const scene = fg.scene() as THREE.Scene;

    if (shipRef.current) {
      scene.remove(shipRef.current);
      shipRef.current = null;
    }
    bulletsRef.current.forEach(b => scene.remove(b));
    bulletsRef.current = [];
    sparksRef.current.forEach(s => scene.remove(s));
    sparksRef.current = [];
  }

  return (
    <div className="relative flex flex-col h-full rounded-xl overflow-hidden" style={{ background: '#0a1119' }}>
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/25 shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-white">知识星系</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">拖拽旋转 · 滚轮缩放 · 点击节点查看详情</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleViewMode}
            className="pointer-events-auto px-2 py-1 bg-slate-700/60 hover:bg-slate-600/60 rounded text-[10px] text-slate-200 font-medium transition-colors"
          >
            {viewMode === '3d' ? '切换 2D' : '切换 3D'}
          </button>
          <button
            type="button"
            onClick={saveCameraView}
            className="pointer-events-auto px-2 py-1 bg-sky-600 hover:bg-sky-500 rounded text-[10px] text-white font-medium transition-colors"
          >
            设为初始视角
          </button>
          <div className="flex items-center gap-3 text-[10px] text-slate-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />文章({typeCounts.article || 0})</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />演讲({typeCounts.speech || 0})</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />论文({typeCounts.paper || 0})</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-500 inline-block" />标签({typeCounts.tag || 0})</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />实体({typeCounts.entity || 0})</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-400 inline-block" />话题({typeCounts.topic || 0})</span>
            <span className="flex items-center gap-1"><span className="text-fuchsia-400 inline-block text-[9px]">&#9670;</span>一级话题({typeCounts['topic-root'] || 0})</span>
          </div>
        </div>
      </div>
      <div className="absolute bottom-4 right-4 z-20 pointer-events-none" style={{ display: viewMode === '2d' ? 'none' : 'block' }}>
        <div className="bg-[#0a1119]/80 border border-slate-600/30 rounded-lg px-3 py-2 shadow-xl flex items-center gap-2">
          <span className="text-[10px] text-slate-400">积分</span>
          <span className="text-lg font-bold text-amber-400 leading-none">{score}</span>
          {lastHit && (
            <span className="text-[10px] text-sky-300 animate-pulse">
              +{lastHit.points} {lastHit.name.slice(0, 12)}
            </span>
          )}
        </div>
      </div>
      {loading && (
        <div className="flex-1 flex items-center justify-center min-h-0">
          <span className="text-xs text-slate-500 animate-pulse">构建 3D 知识星系中...</span>
        </div>
      )}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none" style={{ display: viewMode === '2d' ? 'none' : 'block' }}>
        <div className="bg-[#0a1119]/80 border border-slate-600/30 rounded-lg px-3 py-2 text-[10px] text-slate-300 shadow-xl whitespace-nowrap">
          <span className="font-semibold text-sky-400 mr-2">拾光号控制台</span>
          <span className="text-slate-400 mr-3"><kbd className="px-1 py-0.5 bg-slate-700/60 rounded text-slate-200">W</kbd><kbd className="px-1 py-0.5 bg-slate-700/60 rounded text-slate-200 ml-1">A</kbd><kbd className="px-1 py-0.5 bg-slate-700/60 rounded text-slate-200 ml-1">S</kbd><kbd className="px-1 py-0.5 bg-slate-700/60 rounded text-slate-200 ml-1">D</kbd> 平移</span>
          <span className="text-slate-400 mr-3"><kbd className="px-1 py-0.5 bg-slate-700/60 rounded text-slate-200">↑</kbd><kbd className="px-1 py-0.5 bg-slate-700/60 rounded text-slate-200 ml-1">↓</kbd><kbd className="px-1 py-0.5 bg-slate-700/60 rounded text-slate-200 ml-1">←</kbd><kbd className="px-1 py-0.5 bg-slate-700/60 rounded text-slate-200 ml-1">→</kbd> 转向</span>
          <span className="text-slate-400 mr-3"><kbd className="px-1 py-0.5 bg-slate-700/60 rounded text-slate-200">Space</kbd> {laserMode ? '激光' : '发射'}</span>
          <span className="text-slate-400 mr-3"><kbd className="px-1 py-0.5 bg-slate-700/60 rounded text-slate-200">T</kbd> 随机瞄准</span>
          <span className="text-slate-400 mr-3"><kbd className="px-1 py-0.5 bg-slate-700/60 rounded text-slate-200">X</kbd> 矫正航向</span>
          <span className="text-slate-400 mr-3"><kbd className="px-1 py-0.5 bg-slate-700/60 rounded text-slate-200">H</kbd> {shipVisible ? '隐藏飞船' : '显示飞船'}</span>
          <span className="text-slate-400 mr-3"><kbd className="px-1 py-0.5 bg-slate-700/60 rounded text-slate-200">L</kbd> {laserMode ? '普通武器' : '激光武器'}</span>
        </div>
      </div>
      <div ref={containerRef} className="w-full flex-1 min-h-0" style={{ height: loading ? 0 : undefined }} />
      {hoverNode && (
        <div className="absolute top-[5.5rem] left-4 bg-[#0a1119]/95 border border-slate-500/40 rounded-lg px-3 py-2 pointer-events-none shadow-xl z-10">
          <div className="text-xs text-slate-200 max-w-[220px] truncate">{hoverNode.name}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">{TYPE_LABELS[hoverNode.type] || hoverNode.type}</div>
        </div>
      )}
    </div>
  );
}
