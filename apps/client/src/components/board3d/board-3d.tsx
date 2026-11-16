import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Line, Stars } from '@react-three/drei';
import * as THREE from 'three';
import {
  BLOCH_VECTORS,
  boardEdges,
  END_ZONE,
  POSITIONS,
  type BallPosition,
  type BlochVector,
  type Position,
  type Side,
  type TwoQubitState,
} from '@qa/engine';
import { en } from '../../i18n/en';
import { CARD_LABEL, KET } from '../../lib/format';
import type { MovePreview } from '../../lib/preview';
import { stateColors } from '../../theme/state-colors';
import { colors } from '../../theme/tokens';
import type { EdgeRef } from '../board/board-2d';
import {
  BOARD_RADIUS,
  cameraPose,
  DOME_RADIUS,
  edgeSegment,
  point3,
  swirlLayers,
  type CameraView,
  type Vec3,
} from './layout';
import type { AnimationPlayer } from '../../lib/anim/player';
import { restFrame } from '../../lib/anim/player';
import type { Frame, Spot } from '../../lib/anim/timeline';
import './board-3d.css';

export type Board3DProps = {
  ball: BallPosition;
  orientation: Side;
  playable?: readonly EdgeRef[];
  preview?: MovePreview | null;
  showLabels?: boolean;
  ballShape?: 'football' | 'heart' | 'star';
  swirl?: number;
  qubits?: TwoQubitState;
  camera?: CameraView;
  /** Side whose turn it is, for the ball cam. */
  active?: Side;
  reduceMotion?: boolean;
  /** Animation queue (visual-design §4); without it the board shows the server state. */
  player?: AnimationPlayer;
};

const EDGES = boardEdges();
const TOKEN_Y = DOME_RADIUS + 0.32;
const GOLD = colors.accentGold;
/** Keep board labels under the game's own overlays (Challenge, Result, hover cards). */
const LABEL_Z: [number, number] = [9, 0];

const matches = (a: Position, b: Position, directed: boolean, m: EdgeRef) =>
  (a === m.from && b === m.to) || (!directed && a === m.to && b === m.from);

const zoneOf = (p: Position): Side | null =>
  END_ZONE.BLUE === p ? 'BLUE' : END_ZONE.RED === p ? 'RED' : null;

// ---- camera ---------------------------------------------------------------------------------

function CameraRig({
  view,
  side,
  ball,
  active,
  instant,
}: {
  view: CameraView;
  side: Side;
  ball: BallPosition;
  active: Side;
  instant: boolean;
}) {
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3());
  const first = useRef(true);
  const pose = cameraPose(view, side, { ball, active });
  useFrame((_, dt) => {
    const want = new THREE.Vector3(...pose.position);
    const look = new THREE.Vector3(...pose.target);
    // Smooth camera moves between views; jump on the first frame.
    const k = first.current || instant ? 1 : 1 - Math.exp(-dt * 3.5);
    first.current = false;
    camera.position.lerp(want, k);
    target.current.lerp(look, k);
    camera.lookAt(target.current);
  });
  return null;
}

// ---- sky and swirl --------------------------------------------------------------------------

function MilkyWay() {
  const geo = useMemo(() => {
    const n = 2400;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const spread = (rnd() - 0.5) * (rnd() < 0.7 ? 6 : 16);
      const r = 60;
      // A tilted band across the sky; warm core, blue arms.
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = spread + Math.sin(a) * 18;
      pos.set([x, y, z], i * 3);
      const core = Math.abs(Math.cos(a)) > 0.8;
      col.set(core ? [1, 0.82, 0.6] : [0.55, 0.65, 1], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }, []);
  return (
    <points geometry={geo}>
      <pointsMaterial size={0.35} vertexColors transparent opacity={0.55} depthWrite={false} />
    </points>
  );
}

function Swirl({ brightness, motion }: { brightness: number; motion: boolean }) {
  // Measure the frame rate once; a slow machine gets fewer loops (P-5.1 plan).
  const [loops, setLoops] = useState(57);
  const sample = useRef({ t: 0, frames: 0, done: false });
  const layers = useMemo(() => swirlLayers(loops), [loops]);
  const groups = useRef<(THREE.Group | null)[]>([]);
  const speeds = [1.0, -0.6, 1.5];
  useFrame((state, dt) => {
    const s = sample.current;
    if (!s.done) {
      s.t += dt;
      s.frames++;
      if (s.t > 3) {
        s.done = true;
        if (s.frames / s.t < 45 && loops > 24) setLoops(24);
      }
    }
    if (!motion) return;
    groups.current.forEach((g, i) => {
      if (g) g.rotation.y += dt * 0.05 * speeds[i]!;
    });
    const pulse = 0.85 + 0.15 * Math.sin(state.clock.elapsedTime * 0.6);
    groups.current.forEach((g) => {
      const m = (g?.children[0] as THREE.LineSegments | undefined)?.material as
        THREE.LineBasicMaterial | undefined;
      if (m) m.opacity = 0.55 * (brightness / 100) * pulse;
    });
  });
  if (brightness <= 0) return null;
  return (
    <>
      {layers.map((l, i) => (
        <group key={`${loops}-${i}`} ref={(g) => (groups.current[i] = g)}>
          <lineSegments>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[l.positions, 3]} />
              <bufferAttribute attach="attributes-color" args={[l.colors, 3]} />
            </bufferGeometry>
            <lineBasicMaterial
              vertexColors
              transparent
              opacity={0.55 * (brightness / 100)}
              depthWrite={false}
            />
          </lineSegments>
        </group>
      ))}
    </>
  );
}

// ---- domes ----------------------------------------------------------------------------------

const DOME_GEO = new THREE.SphereGeometry(DOME_RADIUS, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2);
const EYE_GEO = new THREE.SphereGeometry(0.1, 16, 12);

function Dome({
  p,
  index,
  here,
  target,
  confused,
  motion,
  frames,
  ballPos,
}: {
  p: Position;
  index: number;
  here: boolean;
  target: boolean;
  confused: boolean;
  motion: boolean;
  frames: Frames;
  ballPos: React.MutableRefObject<THREE.Vector3>;
}) {
  const body = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const blinkAt = useRef(2 + index * 0.7);
  const [x, , z] = point3(p);
  const zone = zoneOf(p);
  const color = stateColors[p];
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const f = frames();
    const b = body.current;
    if (b) {
      b.position.y = motion ? 0.08 * Math.sin(t * 1.4 + index * 1.1) : 0;
      // Bouncy squash when the ball lands on this head (visual-design §3).
      const sq =
        f.landing === p && motion ? Math.sin(f.squash * Math.PI) * Math.exp(-f.squash * 2) : 0;
      b.scale.set(1 + 0.18 * sq, 1 - 0.28 * sq, 1 + 0.18 * sq);
    }
    const e = eyes.current;
    if (!e) return;
    // Everyone watches the ball while it flies; otherwise the eyes face the camera, and in the
    // fog they look around, confused.
    const flying = f.lift > 0.05 && f.visible;
    const look = flying ? ballPos.current : state.camera.position;
    e.lookAt(look.x, e.getWorldPosition(new THREE.Vector3()).y, look.z);
    if (confused && motion) e.rotation.y += Math.sin(t * 2.5 + index) * 0.5;
    let sy = 1;
    if (motion && t > blinkAt.current) {
      const k = t - blinkAt.current;
      sy = k < 0.12 ? 0.1 : 1;
      if (k > 0.12) blinkAt.current = t + 2 + ((index * 1.7 + t) % 3);
    }
    e.scale.y += (sy - e.scale.y) * Math.min(1, dt * 30);
  });
  const team = zone === 'BLUE' ? colors.teamBlueSoft : colors.teamRedSoft;
  // Labels go to the outside of the ring; the end-zone label above the ket.
  return (
    <group position={[x, 0, z]}>
      <group ref={body}>
        <mesh geometry={DOME_GEO}>
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={here || target ? 0.95 : 0.55}
            roughness={0.35}
            metalness={0.1}
          />
        </mesh>
        <group ref={eyes} position={[0, DOME_RADIUS * 0.55, 0]}>
          {here ? (
            <>
              <mesh
                position={[-0.2, 0, DOME_RADIUS * 0.72]}
                rotation={[0, 0, 0.6]}
                scale={[1.6, 0.35, 0.4]}
                geometry={EYE_GEO}
              >
                <meshBasicMaterial color="#fff" />
              </mesh>
              <mesh
                position={[0.2, 0, DOME_RADIUS * 0.72]}
                rotation={[0, 0, -0.6]}
                scale={[1.6, 0.35, 0.4]}
                geometry={EYE_GEO}
              >
                <meshBasicMaterial color="#fff" />
              </mesh>
            </>
          ) : (
            <>
              <mesh
                position={[-0.2, 0, DOME_RADIUS * 0.72]}
                scale={[0.75, 1.15, 0.5]}
                geometry={EYE_GEO}
              >
                <meshBasicMaterial color="#fff" />
              </mesh>
              <mesh
                position={[0.2, 0, DOME_RADIUS * 0.72]}
                scale={[0.75, 1.15, 0.5]}
                geometry={EYE_GEO}
              >
                <meshBasicMaterial color="#fff" />
              </mesh>
            </>
          )}
        </group>
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[DOME_RADIUS + 0.12, DOME_RADIUS + 0.2, 64]} />
        <meshBasicMaterial color={here ? GOLD : color} transparent opacity={here ? 1 : 0.75} />
      </mesh>
      {zone && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
          <ringGeometry args={[DOME_RADIUS + 0.38, DOME_RADIUS + 0.48, 64]} />
          <meshBasicMaterial color={team} />
        </mesh>
      )}
      {target && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[DOME_RADIUS + 0.6, DOME_RADIUS + 0.7, 64]} />
          <meshBasicMaterial color={GOLD} transparent opacity={0.9} />
        </mesh>
      )}
      <Html position={[0, -0.05, 0]} center zIndexRange={LABEL_Z} className="b3d-label-wrap">
        <div
          className={`b3d-ket${here ? ' has-ball' : ''}${target ? ' is-target' : ''}`}
          data-testid={`board-node-${p}`}
          style={{ ['--c' as string]: color }}
        >
          {KET[p]}
        </div>
      </Html>
      {zone && (
        <Html position={[0, 0, (zone === 'BLUE' ? -1 : 1) * 1.55]} center zIndexRange={LABEL_Z}>
          <div className="b3d-zone" style={{ color: team }}>
            {en.game.endzoneLabel(KET[p]!, zone)}
          </div>
        </Html>
      )}
    </group>
  );
}

// ---- edges ----------------------------------------------------------------------------------

function Edge({
  a,
  b,
  directed,
  gates,
  lit,
  playable,
  showLabel,
}: {
  a: Position;
  b: Position;
  directed: boolean;
  gates: readonly string[];
  lit: boolean;
  playable: boolean;
  showLabel: boolean;
}) {
  const { from, to } = edgeSegment(a, b);
  const y = 0.08;
  const p0: Vec3 = [from[0], y, from[2]];
  const p1: Vec3 = [to[0], y, to[2]];
  const dir = new THREE.Vector3(p1[0] - p0[0], 0, p1[2] - p0[2]).normalize();
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const ca = new THREE.Color(lit ? GOLD : stateColors[a]);
  const cb = new THREE.Color(lit ? GOLD : stateColors[b]);
  const mid = Math.hypot((p0[0] + p1[0]) / 2, (p0[2] + p1[2]) / 2) < 0.5;
  const t = mid ? 0.3 : 0.5;
  const label: Vec3 = [p0[0] + (p1[0] - p0[0]) * t, 0.35, p0[2] + (p1[2] - p0[2]) * t];
  return (
    <group>
      <Line
        points={[p0, p1]}
        vertexColors={[
          [ca.r, ca.g, ca.b],
          [cb.r, cb.g, cb.b],
        ]}
        lineWidth={lit ? 4.5 : playable ? 3 : 1.8}
        transparent
        opacity={lit ? 1 : playable ? 0.95 : 0.5}
      />
      {directed && (
        <mesh position={[p1[0] - dir.x * 0.12, y, p1[2] - dir.z * 0.12]} quaternion={quat}>
          <coneGeometry args={[0.11, 0.3, 16]} />
          <meshBasicMaterial color={lit ? GOLD : stateColors[b]} />
        </mesh>
      )}
      {showLabel && (
        <Html position={label} center zIndexRange={LABEL_Z}>
          <div className={`b3d-gate${lit ? ' is-lit' : playable ? ' is-playable' : ''}`}>
            {gates.map((g) => CARD_LABEL[g as keyof typeof CARD_LABEL]).join(', ')}
          </div>
        </Html>
      )}
    </group>
  );
}

// ---- ball, fog ------------------------------------------------------------------------------

type Frames = () => Frame;

/** World position of a spot: a dome top, or the board centre. */
function spotPoint(spot: Spot): Vec3 {
  return spot === 'CENTER' ? [0, 0, 0] : point3(spot);
}

function heartShape() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.25);
  s.bezierCurveTo(-0.45, 0.05, -0.25, 0.4, 0, 0.17);
  s.bezierCurveTo(0.25, 0.4, 0.45, 0.05, 0, -0.25);
  return s;
}
function starShape() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.32 : 0.14;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}

function Token({ shape }: { shape: 'football' | 'heart' | 'star' }) {
  const extrude = useMemo(
    () => ({
      depth: 0.12,
      bevelEnabled: true,
      bevelSize: 0.03,
      bevelThickness: 0.03,
      bevelSegments: 3,
    }),
    [],
  );
  if (shape === 'heart') {
    return (
      <mesh position={[0, 0, -0.06]}>
        <extrudeGeometry args={[heartShape(), extrude]} />
        <meshStandardMaterial color="#FF4F7B" emissive="#B0173F" emissiveIntensity={0.5} />
      </mesh>
    );
  }
  if (shape === 'star') {
    return (
      <mesh position={[0, 0, -0.06]}>
        <extrudeGeometry args={[starShape(), extrude]} />
        <meshStandardMaterial color="#FFD14D" emissive="#C08A00" emissiveIntensity={0.6} />
      </mesh>
    );
  }
  return (
    <group>
      <mesh scale={[0.34, 0.21, 0.21]}>
        <sphereGeometry args={[1, 32, 16]} />
        <meshStandardMaterial color="#8B4A22" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.2, 0]} scale={[0.22, 0.015, 0.03]}>
        <boxGeometry />
        <meshBasicMaterial color="#fff" />
      </mesh>
      {[-0.08, -0.03, 0.03, 0.08].map((lx) => (
        <mesh key={lx} position={[lx, 0.205, 0]} scale={[0.012, 0.012, 0.07]}>
          <boxGeometry />
          <meshBasicMaterial color="#fff" />
        </mesh>
      ))}
    </group>
  );
}

/**
 * The ball follows the animation frame: a hop along an arc, a shake before a measurement, a
 * bounce and spin on a touchdown (visual-design §4). Its test id always shows the server's
 * position, so tests never wait for an animation.
 */
function Ball({
  ball,
  shape,
  motion,
  frames,
  worldPos,
}: {
  ball: BallPosition;
  shape: 'football' | 'heart' | 'star';
  motion: boolean;
  frames: Frames;
  worldPos: React.MutableRefObject<THREE.Vector3>;
}) {
  const group = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const f = frames();
    const g = group.current;
    if (!g) return;
    const a = spotPoint(f.from);
    const b = spotPoint(f.to);
    // On a dome the ball rests on its head; at the centre it floats low above the board.
    const baseA = f.from === 'CENTER' ? 0.35 : TOKEN_Y;
    const baseB = f.to === 'CENTER' ? 0.35 : TOKEN_Y;
    const shake = f.shake * 0.07 * Math.sin(state.clock.elapsedTime * 70);
    g.position.set(
      a[0] + (b[0] - a[0]) * f.p + shake,
      baseA + (baseB - baseA) * f.p + f.lift,
      a[2] + (b[2] - a[2]) * f.p,
    );
    g.visible = f.visible;
    worldPos.current.copy(g.position);
    if (ring.current) {
      ring.current.visible = f.visible && f.lift < 0.05 && f.to !== 'CENTER';
      ring.current.position.y = DOME_RADIUS + 0.02 - g.position.y;
    }
    const s = spin.current;
    if (!s) return;
    const t = state.clock.elapsedTime;
    s.rotation.y = f.spin;
    if (!motion) return;
    if (shape === 'heart') s.scale.setScalar(1 + 0.12 * Math.max(0, Math.sin(t * 5)));
    else if (shape === 'star') s.rotation.y = f.spin + Math.sin(t * 1.5) * 0.4;
    else s.rotation.z = Math.sin(t * 2.4) * 0.15;
  });
  return (
    <>
      <group ref={group}>
        <group ref={spin}>
          <Token shape={shape} />
        </group>
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.18, 0.34, 48]} />
          <meshBasicMaterial color={GOLD} transparent opacity={0.65} />
        </mesh>
      </group>
      {ball !== 'FOG' && (
        <Html
          position={[...point3(ball).slice(0, 1), TOKEN_Y, point3(ball)[2]] as Vec3}
          center
          zIndexRange={LABEL_Z}
        >
          <span
            className="b3d-ball-marker"
            data-testid="ball"
            data-position={ball}
            aria-label="ball"
          />
        </Html>
      )}
    </>
  );
}

/** Nebula cloud over the board centre; grows and shrinks with the frame's fog amount. */
function Fog({ motion, frames, inFog }: { motion: boolean; frames: Frames; inFog: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const n = 700;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    let seed = 3;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const palette = [
      [0.64, 0.42, 1],
      [0.93, 0.16, 0.55],
      [0.15, 0.9, 0.97],
    ];
    for (let i = 0; i < n; i++) {
      const r = Math.pow(rnd(), 0.6) * BOARD_RADIUS * 0.8;
      const a = rnd() * Math.PI * 2;
      pos.set([Math.cos(a) * r, 0.2 + rnd() * 1.4, Math.sin(a) * r], i * 3);
      col.set(palette[i % 3]!, i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }, []);
  useFrame((state, dt) => {
    const pts = ref.current;
    if (!pts) return;
    const f = frames();
    pts.visible = f.fog > 0.01;
    pts.scale.setScalar(0.15 + 0.85 * f.fog);
    if (motion) pts.rotation.y += dt * 0.08;
    const m = pts.material as THREE.PointsMaterial;
    const pulse = motion ? 0.1 * Math.sin(state.clock.elapsedTime * 0.8) : 0;
    m.opacity = (0.45 + pulse) * f.fog;
  });
  return (
    <group>
      <points ref={ref} geometry={geo}>
        <pointsMaterial
          size={0.55}
          vertexColors
          transparent
          opacity={0.5}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      {inFog && (
        <Html position={[0, 1.2, 0]} center zIndexRange={LABEL_Z}>
          <span className="b3d-fog-label" data-testid="fog">
            fog
          </span>
        </Html>
      )}
    </group>
  );
}

// ---- Bloch spheres --------------------------------------------------------------------------

/** Bloch (x, y, z) → board space: +x at the board's |+⟩ (−z), z up, y completes the frame. */
const blochToWorld = ([bx, by, bz]: BlochVector | readonly number[]): Vec3 => [-by!, bz!, -bx!];

const UP = new THREE.Vector3(0, 1, 0);

/**
 * A glass Bloch sphere whose state vector follows the animation (visual-design §3–§4): it turns
 * about the gate's axis while the ball hops, and shrinks to the centre and pulses in the fog.
 */
function BlochSphere({
  position,
  radius,
  accent,
  label,
  pick,
  motion,
}: {
  position: Vec3;
  radius: number;
  accent: string;
  label: string;
  pick: () => readonly number[];
  motion: boolean;
}) {
  const shaft = useRef<THREE.Mesh>(null);
  const tip = useRef<THREE.Mesh>(null);
  const core = useRef<THREE.Mesh>(null);
  const axes: Vec3[] = [
    [radius * 1.15, 0, 0],
    [0, radius * 1.15, 0],
    [0, 0, radius * 1.15],
  ];
  useFrame((state) => {
    const w = blochToWorld(pick());
    const v = new THREE.Vector3(...w).multiplyScalar(radius);
    const len = v.length();
    const show = len > radius * 0.04;
    if (shaft.current) {
      shaft.current.visible = show;
      if (show) {
        shaft.current.quaternion.setFromUnitVectors(UP, v.clone().normalize());
        shaft.current.scale.set(1, len, 1);
        shaft.current.position.copy(v.clone().multiplyScalar(0.5));
      }
    }
    if (tip.current) {
      tip.current.visible = show;
      tip.current.position.copy(v);
    }
    if (core.current) {
      // Length 0 in the fog: a pulsing purple core instead of a vector.
      core.current.visible = len < radius * 0.5;
      const pulse = motion ? 1 + 0.25 * Math.sin(state.clock.elapsedTime * 4) : 1;
      core.current.scale.setScalar(pulse * (1 - len / radius));
    }
  });
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[radius, 32, 16]} />
        <meshStandardMaterial
          color="#598CFF"
          transparent
          opacity={0.12}
          roughness={0.1}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[radius * 1.001, 12, 8]} />
        <meshBasicMaterial color={accent} wireframe transparent opacity={0.18} />
      </mesh>
      {axes.map((a, i) => (
        <Line
          key={i}
          points={[a.map((c) => -c) as Vec3, a]}
          color="#cfd6ff"
          lineWidth={1}
          transparent
          opacity={0.35}
        />
      ))}
      {POSITIONS.map((p) => {
        const w = blochToWorld(BLOCH_VECTORS[p]).map((c) => c * radius) as Vec3;
        return (
          <mesh key={p} position={w}>
            <sphereGeometry args={[radius * 0.06, 12, 8]} />
            <meshBasicMaterial color={stateColors[p]} />
          </mesh>
        );
      })}
      <mesh ref={shaft}>
        <cylinderGeometry args={[radius * 0.025, radius * 0.025, 1, 10]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh ref={tip}>
        <sphereGeometry args={[radius * 0.09, 16, 12]} />
        <meshBasicMaterial color={GOLD} />
      </mesh>
      <mesh ref={core}>
        <sphereGeometry args={[radius * 0.12, 16, 12]} />
        <meshBasicMaterial color={colors.accentPurple} />
      </mesh>
      <Html position={[0, -radius - 0.25, 0]} center zIndexRange={LABEL_Z}>
        <div className="b3d-sphere-label">{label}</div>
      </Html>
    </group>
  );
}

const MAIN_SPHERE: Vec3 = [0, 2.6, 0];
const PARTNER_SPHERE: Vec3 = [1.9, 2.2, 0.6];

function Spheres({ frames, motion }: { frames: Frames; motion: boolean }) {
  const link = useRef<THREE.Mesh>(null);
  const a = new THREE.Vector3(...MAIN_SPHERE);
  const b = new THREE.Vector3(...PARTNER_SPHERE);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a);
  const quat = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
  useFrame((state) => {
    const m = link.current;
    if (!m) return;
    // A glowing link joins the spheres while they are entangled (visual-design §3).
    const k = frames().link;
    m.visible = k > 0.01;
    const pulse = motion ? 0.75 + 0.25 * Math.sin(state.clock.elapsedTime * 3) : 1;
    (m.material as THREE.MeshBasicMaterial).opacity = 0.8 * k * pulse;
  });
  return (
    <group>
      <BlochSphere
        position={MAIN_SPHERE}
        radius={0.85}
        accent="#598CFF"
        label={en.game.football}
        pick={() => frames().bloch}
        motion={motion}
      />
      <BlochSphere
        position={PARTNER_SPHERE}
        radius={0.42}
        accent={colors.accentCyan}
        label={en.game.partner}
        pick={() => frames().partner}
        motion={motion}
      />
      <mesh ref={link} position={mid} quaternion={quat}>
        <cylinderGeometry args={[0.035, 0.035, dir.length(), 10]} />
        <meshBasicMaterial color={colors.accentPurple} transparent opacity={0.8} />
      </mesh>
      {/* Beam and double-ring pad link the sphere to the board (visual-design §3). */}
      <Line
        points={[
          [0, 0.05, 0],
          [0, MAIN_SPHERE[1] - 0.85, 0],
        ]}
        color="#598CFF"
        lineWidth={1.2}
        transparent
        opacity={0.5}
      />
      {[0.35, 0.5].map((r) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[r, r + 0.03, 48]} />
          <meshBasicMaterial color="#598CFF" transparent opacity={0.6} />
        </mesh>
      ))}
    </group>
  );
}

// ---- board ----------------------------------------------------------------------------------

/**
 * 3D board (visual-design §1–§3, §5), same props and data as the 2D board. Positions come from
 * boardPoint() and edges from boardEdges(); the HTML labels carry the ui-spec §14 test ids.
 */
export default function Board3D({
  ball,
  orientation,
  playable = [],
  preview = null,
  showLabels = true,
  ballShape = 'football',
  swirl = 100,
  qubits,
  camera = 'GOAL',
  active,
  reduceMotion = false,
  player,
}: Board3DProps) {
  const motion = !reduceMotion;
  const rest = useMemo(() => restFrame(ball, qubits ?? null), [ball, qubits]);
  const frames: Frames = () => (player ? player.frame(performance.now()) : rest);
  const ballPos = useRef(new THREE.Vector3());
  const inFog = ball === 'FOG';
  const targets = new Set(preview?.targets ?? []);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <div className="board3d" data-orientation={orientation} data-camera={camera}>
      <Canvas
        dpr={[1, 2]}
        // The game stage is CSS-scaled; measure the unscaled box or the canvas shrinks twice.
        resize={{ offsetSize: true }}
        // 50° keeps the near end zone inside the frame in goal view (checked at 1920 × 1080).
        camera={{ fov: 50, near: 0.1, far: 400, position: [0, 14, 9.5] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        aria-label="Board"
      >
        <color attach="background" args={['#04050A']} />
        <ambientLight intensity={0.55} />
        <pointLight position={[0, 9, 4]} intensity={60} color="#bcd0ff" />
        <pointLight position={[0, 3, 0]} intensity={12} color={GOLD} />
        <CameraRig
          view={camera}
          side={orientation}
          ball={ball}
          active={active ?? orientation}
          instant={!motion}
        />
        <Stars
          radius={90}
          depth={40}
          count={3500}
          factor={3}
          saturation={0}
          fade
          speed={motion ? 0.4 : 0}
        />
        <MilkyWay />
        <Swirl brightness={swirl} motion={motion} />
        {EDGES.map((e, i) => (
          <Edge
            key={i}
            a={e.a}
            b={e.b}
            directed={e.directed}
            gates={e.gates}
            lit={preview?.edge ? matches(e.a, e.b, e.directed, preview.edge) : false}
            playable={playable.some((m) => matches(e.a, e.b, e.directed, m))}
            showLabel={showLabels}
          />
        ))}
        {POSITIONS.map((p, i) => (
          <Dome
            key={p}
            p={p}
            index={i}
            here={ball === p}
            target={targets.has(p)}
            confused={inFog}
            motion={motion}
            frames={frames}
            ballPos={ballPos}
          />
        ))}
        {preview && preview.targets.length > 0 && (
          <Html position={point3(preview.targets[0]!)} center zIndexRange={LABEL_Z}>
            <span
              className="b3d-target-marker"
              data-testid="preview-target"
              data-positions={preview.targets.join(' ')}
            />
          </Html>
        )}
        <Fog motion={motion} frames={frames} inFog={inFog} />
        <Ball ball={ball} shape={ballShape} motion={motion} frames={frames} worldPos={ballPos} />
        {qubits && <Spheres frames={frames} motion={motion} />}
      </Canvas>
      {!ready && <div className="board3d__loading">{en.common.loading}</div>}
    </div>
  );
}
