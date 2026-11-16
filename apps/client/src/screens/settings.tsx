import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Panel } from '../components/ui/panel';
import { Stepper } from '../components/ui/stepper';
import { Toggle } from '../components/ui/toggle';
import { en } from '../i18n/en';
import { usePlayerName } from '../state/player-name';
import { useSettings, type Settings } from '../state/settings';

function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  testId?: string;
}) {
  return (
    <div className="settings-row" role="radiogroup" aria-label={label} data-testid={testId}>
      <span className="stepper__label">{label}</span>
      <div className="segmented">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            disabled={o.disabled}
            className={value === o.value ? 'is-on' : ''}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** ui-spec §12 Settings: personal, saved in localStorage, never part of the game state. */
export function SettingsScreen() {
  const navigate = useNavigate();
  const s = useSettings();
  const set = (patch: Partial<Settings>) => s.set(patch);
  const [name, setName] = usePlayerName();
  const [draft, setDraft] = useState(name);
  const t = en.settings;

  return (
    <main className="screen settings-screen">
      <header className="screen__header">
        <h1>{t.title}</h1>
        <Button variant="secondary" size="small" onClick={() => navigate(-1)}>
          {en.common.back}
        </Button>
      </header>
      <p className="muted">{t.note}</p>
      <div className="settings-grid">
        <Panel title={t.display}>
          <Choice
            label={t.board}
            value={s.board}
            options={[
              { value: '2D', label: t.board2d },
              { value: '3D', label: t.board3d, disabled: true },
            ]}
            onChange={(board) => set({ board })}
          />
          <Choice
            label={t.camera}
            value="goal"
            options={[{ value: 'goal', label: t.cameraGoal, disabled: true }]}
            onChange={() => undefined}
          />
          <Choice
            label={t.reduceMotion}
            value={s.reduceMotion}
            options={[
              { value: 'system', label: t.motionSystem },
              { value: 'on', label: t.motionOn },
            ]}
            onChange={(reduceMotion) => set({ reduceMotion })}
            testId="settings-motion"
          />
          <Stepper
            label={t.swirl}
            value={s.swirl}
            min={0}
            max={100}
            step={10}
            format={(v) => `${v} %`}
            onChange={(swirl) => set({ swirl })}
          />
          <Toggle
            label={t.labels}
            checked={s.showLabels}
            onChange={(showLabels) => set({ showLabels })}
          />
          <Toggle label={t.tips} checked={s.tips} onChange={(tips) => set({ tips })} />
        </Panel>
        <Panel title={t.gameplay}>
          <Choice
            label={t.speed}
            value={s.speed}
            options={[
              { value: 0.5, label: '0.5×' },
              { value: 1, label: '1×' },
              { value: 2, label: '2×' },
            ]}
            onChange={(speed) => set({ speed })}
          />
          <Choice
            label={t.ball}
            value={s.ball}
            options={[
              { value: 'football', label: t.football },
              { value: 'heart', label: t.heart },
              { value: 'star', label: t.star },
            ]}
            onChange={(ball) => set({ ball })}
            testId="settings-ball"
          />
        </Panel>
        <Panel title={t.account}>
          <form
            className="settings-row"
            onSubmit={(e) => {
              e.preventDefault();
              setName(draft);
            }}
          >
            <label className="stepper__label" htmlFor="settings-name">
              {t.displayName}
            </label>
            <input
              id="settings-name"
              value={draft}
              maxLength={24}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button size="small" type="submit" disabled={draft.trim() === name}>
              {en.badge.save}
            </Button>
          </form>
        </Panel>
      </div>
    </main>
  );
}
