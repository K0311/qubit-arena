import { useMemo } from 'react';
import {
  boardEdges,
  boardPoint,
  END_ZONE,
  POSITIONS,
  type BallPosition,
  type BoardEdge,
  type Position,
  type Side,
} from '@qa/engine';
import { en } from '../../i18n/en';
import { CARD_LABEL, KET } from '../../lib/format';
import type { MovePreview } from '../../lib/preview';
import { colors } from '../../theme/tokens';
import { stateColors } from '../../theme/state-colors';
import './board.css';

/** Board radius and dome radius in SVG units (Blender ratio 4.6 : 0.72 ≈ 68 : 11). */
const R = 68;
const DOME = 12;
const EDGES = boardEdges();

export type EdgeRef = { readonly from: Position; readonly to: Position };

export type Board2DProps = {
  ball: BallPosition;
  /** Whose end zone sits at the top: the viewer's side; spectators use Blue (ui-spec §7.2). */
  orientation: Side;
  /** Edges reachable from the ball with a card in the viewer's hand. */
  playable?: readonly EdgeRef[];
  preview?: MovePreview | null;
  showLabels?: boolean;
};

const matches = (e: BoardEdge, m: EdgeRef) =>
  (e.a === m.from && e.b === m.to) || (!e.directed && e.a === m.to && e.b === m.from);

const zoneOf = (p: Position): Side | null =>
  END_ZONE.BLUE === p ? 'BLUE' : END_ZONE.RED === p ? 'RED' : null;

/**
 * 2D top view of the board (visual-design §2–§3, ui-spec §7.2). Every position comes from
 * boardPoint() and every edge from boardEdges(); nothing about the board is typed by hand.
 */
export function Board2D({
  ball,
  orientation,
  playable = [],
  preview = null,
  showLabels = true,
}: Board2DProps) {
  const flip = orientation === 'RED' ? -1 : 1;
  const pt = useMemo(() => {
    const out = {} as Record<Position, { x: number; y: number }>;
    for (const p of POSITIONS) {
      const b = boardPoint(p);
      // boardPoint has y up; SVG has y down. Red sees the board turned 180°.
      out[p] = { x: b.x * R * flip, y: -b.y * R * flip };
    }
    return out;
  }, [flip]);

  const inFog = ball === 'FOG';

  return (
    <svg
      className="board2d"
      viewBox="-160 -100 320 200"
      role="img"
      aria-label="Board"
      data-orientation={orientation}
    >
      <defs>
        <filter id="b-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="b-fog" x="-60%" y="-60%" width="220%" height="220%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="18" />
          <feGaussianBlur stdDeviation="5" />
        </filter>
        {POSITIONS.map((p) => (
          <radialGradient key={p} id={`b-dome-${p}`} cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="28%" stopColor={stateColors[p]} />
            <stop offset="100%" stopColor={stateColors[p]} stopOpacity="0.55" />
          </radialGradient>
        ))}
        {[...POSITIONS, 'gold' as const].map((p) => (
          <marker
            key={p}
            id={`b-arrow-${p}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill={p === 'gold' ? colors.accentGold : stateColors[p]} />
          </marker>
        ))}
        {EDGES.map((e, i) => (
          <linearGradient
            key={i}
            id={`b-edge-${i}`}
            gradientUnits="userSpaceOnUse"
            x1={pt[e.a].x}
            y1={pt[e.a].y}
            x2={pt[e.b].x}
            y2={pt[e.b].y}
          >
            <stop offset="0%" stopColor={stateColors[e.a]} />
            <stop offset="100%" stopColor={stateColors[e.b]} />
          </linearGradient>
        ))}
      </defs>

      <g className="board2d__swirl" aria-hidden="true">
        {[0, 1, 2].map((layer) => (
          <g key={layer} className={`board2d__swirl-layer board2d__swirl-layer--${layer}`}>
            {POSITIONS.map((p, k) => (
              <ellipse
                key={p}
                rx={R + 6 + ((k * 7 + layer * 5) % 13)}
                ry={R - 4 - ((k * 5 + layer * 3) % 9)}
                transform={`rotate(${k * 30 + layer * 17})`}
                stroke={stateColors[p]}
              />
            ))}
          </g>
        ))}
      </g>

      <g className="board2d__edges">
        {EDGES.map((e, i) => {
          const a = pt[e.a];
          const b = pt[e.b];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy);
          const ux = dx / len;
          const uy = dy / len;
          const gap = DOME + 3;
          const lit = preview?.edge ? matches(e, preview.edge) : false;
          const canPlay = playable.some((m) => matches(e, m));
          // Lines through the centre cross each other there, so their label sits near one end.
          const through = Math.hypot((a.x + b.x) / 2, (a.y + b.y) / 2) < 5;
          const t = through ? 0.3 : 0.5;
          const lx = a.x + dx * t - uy * 6;
          const ly = a.y + dy * t + ux * 6;
          return (
            <g
              key={i}
              className={`board2d__edge${canPlay ? ' is-playable' : ''}${lit ? ' is-preview' : ''}`}
              data-edge={`${e.a}-${e.b}`}
            >
              <line
                x1={a.x + ux * gap}
                y1={a.y + uy * gap}
                x2={b.x - ux * gap}
                y2={b.y - uy * gap}
                stroke={lit ? colors.accentGold : `url(#b-edge-${i})`}
                markerEnd={e.directed ? `url(#b-arrow-${lit ? 'gold' : e.b})` : undefined}
              />
              {showLabels && (
                <text x={lx} y={ly} className="board2d__edge-label">
                  {e.gates.map((g) => CARD_LABEL[g]).join(', ')}
                </text>
              )}
            </g>
          );
        })}
      </g>

      <g className="board2d__nodes">
        {POSITIONS.map((p, k) => {
          const { x, y } = pt[p];
          const zone = zoneOf(p);
          const team = zone === 'BLUE' ? colors.teamBlueSoft : colors.teamRedSoft;
          const isTarget = preview?.targets.includes(p) ?? false;
          const here = ball === p;
          const cls = [
            'board2d__node',
            here && 'has-ball',
            isTarget && 'is-target',
            inFog && 'is-confused',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <g key={p} transform={`translate(${x} ${y})`}>
              <g
                className={cls}
                data-testid={`board-node-${p}`}
                style={{ animationDelay: `${-k * 0.7}s` }}
              >
                <ellipse
                  className="board2d__ring"
                  cy={DOME * 0.55}
                  rx={DOME + 4}
                  ry={4.5}
                  stroke={here ? colors.accentGold : stateColors[p]}
                />
                {zone && (
                  <ellipse
                    className="board2d__ring board2d__ring--zone"
                    cy={DOME * 0.55}
                    rx={DOME + 8}
                    ry={7}
                    stroke={team}
                  />
                )}
                <circle
                  r={DOME}
                  fill={`url(#b-dome-${p})`}
                  filter={here || isTarget ? 'url(#b-glow)' : undefined}
                />
                <g className="board2d__eyes" style={{ animationDelay: `${(k * 1.3) % 4}s` }}>
                  {here ? (
                    <text className="board2d__happy" y={1.5}>
                      {'> <'}
                    </text>
                  ) : (
                    <>
                      <ellipse cx={-3.6} cy={-1.5} rx={1.7} ry={2.6} />
                      <ellipse cx={3.6} cy={-1.5} rx={1.7} ry={2.6} />
                    </>
                  )}
                </g>
                <text className="board2d__ket" y={DOME + 11}>
                  {KET[p]}
                </text>
              </g>
              {zone && (
                <text
                  className="board2d__zone-label"
                  y={y < 0 ? -DOME - 10 : DOME + 19}
                  fill={team}
                >
                  {en.game.endzoneLabel(KET[p]!, zone)}
                </text>
              )}
            </g>
          );
        })}
      </g>

      {preview && preview.targets.length > 0 && (
        <g data-testid="preview-target" data-positions={preview.targets.join(' ')}>
          {preview.targets.map((p) => (
            <circle key={p} className="board2d__target" cx={pt[p].x} cy={pt[p].y} r={DOME + 5} />
          ))}
        </g>
      )}

      {inFog ? (
        <g data-testid="fog" className="board2d__fog">
          <circle r={46} fill={colors.accentPurple} filter="url(#b-fog)" opacity={0.55} />
          <circle r={30} cx={10} cy={-6} fill="#ED298C" filter="url(#b-fog)" opacity={0.35} />
          <circle
            r={26}
            cx={-14}
            cy={8}
            fill={colors.accentCyan}
            filter="url(#b-fog)"
            opacity={0.25}
          />
        </g>
      ) : (
        <g
          data-testid="ball"
          data-position={ball}
          className="board2d__ball"
          style={{ transform: `translate(${pt[ball].x}px, ${pt[ball].y - DOME - 2}px)` }}
        >
          <ellipse className="board2d__ball-glow" cy={DOME + 2} rx={DOME + 3} ry={4} />
          <g className="board2d__football">
            <ellipse rx={8} ry={5} fill="#8B4A22" stroke="#4A230E" strokeWidth={0.8} />
            <path
              d="M-6,-1.6 Q0,-4 6,-1.6"
              stroke="#fff"
              strokeWidth={0.6}
              fill="none"
              opacity={0.7}
            />
            <line x1={-3} y1={0} x2={3} y2={0} stroke="#fff" strokeWidth={0.9} />
            {[-2, -0.7, 0.7, 2].map((lx) => (
              <line key={lx} x1={lx} y1={-1.2} x2={lx} y2={1.2} stroke="#fff" strokeWidth={0.6} />
            ))}
          </g>
        </g>
      )}
    </svg>
  );
}
