import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { aptPct, status, fmt, type Bloc } from "@/lib/batiment";

export type View = { type: "all" } | { type: "floor"; idx: number };
export type Angle = "iso" | "front" | "back" | "left" | "right";

const COLORS = { none: "#64748b", todo: "#dc2626", doing: "#f59e0b", done: "#16a34a" };
const W = 4, D = 4, H = 3, GAP = 0.5;
/** Espace commun : petit rectangle au centre du bâtiment. */
const CW = 1.6, CD = 3.2;

function label(text: string) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(248,250,252,0.96)"; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = "rgba(15,23,42,0.45)"; g.lineWidth = 8; g.strokeRect(4, 4, 248, 120);
  g.fillStyle = "#0f172a"; g.textAlign = "center"; g.textBaseline = "middle";
  const [a, b] = text.split("\n");
  // Réduit la police pour que « Espace commun » tienne dans la largeur du panneau.
  let size = 50;
  g.font = `bold ${size}px sans-serif`;
  const wide = Math.max(g.measureText(a ?? "").width, b ? g.measureText(b).width : 0);
  if (wide > 232) {
    size = Math.max(18, Math.floor(size * 232 / wide));
    g.font = `bold ${size}px sans-serif`;
  }
  g.fillText(a ?? "", 128, b ? 40 : 64); if (b) g.fillText(b, 128, 92);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function Label({ text, position, scale = 2.8 }: { text: string; position: [number, number, number]; scale?: number }) {
  const tex = useMemo(() => label(text), [text]);
  return <sprite position={position} scale={[scale, scale / 2, 1]}><spriteMaterial map={tex} depthTest={false} /></sprite>;
}

function Fit({ size, view, angle }: { size: THREE.Vector3; view: View; angle: Angle }) {
  const { camera } = useThree();
  useEffect(() => {
    const R = 0.5 * Math.hypot(size.x, size.y, size.z);
    const cy = size.y / 2;
    if (angle === "front") camera.position.set(0, cy, R * 3.2);
    else if (angle === "back") camera.position.set(0, cy, -R * 3.2);
    else if (angle === "left") camera.position.set(-R * 3.2, cy, 0);
    else if (angle === "right") camera.position.set(R * 3.2, cy, 0);
    else {
      const d = R * 2.9;
      // Vue de trois quarts presque frontale : l'espace commun central reste visible
      // entre la colonne de gauche et celle de droite.
      camera.position.set(d * 0.22, cy + d * 0.42, d * 0.9);
    }
    camera.lookAt(0, cy, 0);
  }, [camera, size, view, angle]);
  return null;
}

export function Building3D({ bloc, view, angle = "iso" }: { bloc: Bloc; view: View; angle?: Angle }) {
  const maxApts = Math.max(1, ...bloc.floors.map((f) => f.apts.filter((a) => !a.common).length));
  const hasCommon = bloc.floors.some((f) => f.apts.some((a) => a.common));

  // Espace commun : cœur central, deux colonnes d'appartements à gauche et à droite.
  // Sans espace commun : grille classique.
  let cols = 1;
  let rows = 1;
  if (!hasCommon) {
    cols = Math.ceil(Math.sqrt(maxApts));
    rows = Math.ceil(maxApts / cols);
  }
  const perSide = Math.max(1, Math.ceil(maxApts / 2));
  // Espace commun : petit rectangle au centre (largeur CW, profondeur CD).
  const sx = hasCommon ? 2 * (CW / 2 + GAP + W) + 2 * GAP : cols * (W + GAP) + GAP;
  const sz = hasCommon ? perSide * (D + GAP) + GAP : rows * (D + GAP) + GAP;

  // Position d'une case dans la grille classique (sans espace commun).
  const cell = (k: number) => ({
    x: -sx / 2 + GAP + W / 2 + (k % cols) * (W + GAP),
    z: -sz / 2 + GAP + D / 2 + Math.floor(k / cols) * (D + GAP),
  });

  const floors = view.type === "all" ? bloc.floors.map((f, i) => ({ f, i })) : bloc.floors.map((f, i) => ({ f, i })).filter((x) => x.i === view.idx);
  const size = useMemo(() => new THREE.Vector3(sx, floors.length * (H + 0.3), sz), [sx, sz, floors.length]);
  const target = useMemo(() => new THREE.Vector3(0, size.y / 2, 0), [size]);
  return (
    <Canvas gl={{ preserveDrawingBuffer: true, antialias: true }} camera={{ fov: 40 }} style={{ background: "#0b1220" }}>
      <Fit size={size} view={view} angle={angle} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[10, 20, 10]} intensity={1.4} />
      <directionalLight position={[-10, 8, -6]} intensity={0.4} />
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]}><planeGeometry args={[sx * 4, sz * 4]} /><meshStandardMaterial color="#1e293b" /></mesh>
      {floors.map(({ f }, k) => {
        const y = k * (H + 0.3);
        const plain = f.apts.filter((a) => !a.common);
        const left = plain.slice(0, Math.ceil(plain.length / 2));
        const right = plain.slice(Math.ceil(plain.length / 2));
        const place = (a: (typeof f.apts)[number], slot: number) => {
          if (!hasCommon) {
            const p = cell(slot);
            return { x: p.x, z: p.z };
          }
          if (a.common) return { x: 0, z: 0 };
          const li = left.indexOf(a);
          if (li >= 0) return { x: -(W / 2 + GAP + CW / 2), z: (li - (left.length - 1) / 2) * (D + GAP) };
          const ri = right.indexOf(a);
          return { x: W / 2 + GAP + CW / 2, z: (ri - (right.length - 1) / 2) * (D + GAP) };
        };
        let slot = 0;
        return (
          <group key={f.id} position={[0, y, 0]}>
            <mesh position={[0, 0.15, 0]}><boxGeometry args={[sx, 0.3, sz]} /><meshStandardMaterial color="#cbd5e1" /></mesh>
            {f.apts.map((a) => {
              const pos = place(a, a.common ? 0 : slot++);
              const p = aptPct(a);
              const small = a.common && hasCommon;
              return (
                <group key={a.id} position={[pos.x, 0.3 + H / 2, pos.z]}>
                  <mesh>
                    <boxGeometry args={small ? [CW, H, CD] : [W, H, D]} />
                    <meshStandardMaterial color={COLORS[status(p)]} transparent opacity={0.94} />
                  </mesh>
                  {view.type === "floor" && (
                    <Label
                      text={`${a.name}\n${fmt(p)}`}
                      scale={small ? 2.3 : 2.8}
                      position={[0, H / 2 + (small ? 2.1 : 0.9), 0]}
                    />
                  )}
                </group>
              );
            })}
            {view.type === "all" && <Label text={f.label} position={[-sx / 2 - 1.6, H / 2, sz / 2]} />}
          </group>
        );
      })}
      <OrbitControls target={target} makeDefault />
    </Canvas>
  );
}
