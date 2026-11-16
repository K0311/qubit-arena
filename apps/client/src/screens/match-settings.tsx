import type { BotLevel, Mode } from '@qa/engine';
import type { RoomSettings } from '@qa/protocol';
import { Panel } from '../components/ui/panel';
import { Stepper } from '../components/ui/stepper';
import { Toggle } from '../components/ui/toggle';
import { en } from '../i18n/en';
import { deckSummary, minutesSeconds, seconds } from '../lib/format';
import { BotLevelPicker } from './bot-level';

export type MatchConfig = {
  mode: Mode;
  targetScore: number;
  timeLimitMs: number;
  turnTimerMs: number;
  suddenDeath: boolean;
  deckCounts: Readonly<Record<string, number>>;
};

const MIN = 60_000;

/**
 * Match settings panel (ui-spec §6). Defaults come from the engine via the room the server
 * sends, so they always match rules.md §5. Bounds match the protocol's roomSettingsSchema.
 */
export function MatchSettings({
  config,
  botLevel,
  editable,
  onChange,
}: {
  config: MatchConfig;
  /** Room setting, not a rule (P-6.4); left out where no room exists. */
  botLevel?: BotLevel;
  editable: boolean;
  onChange?: (settings: RoomSettings) => void;
}) {
  return (
    <Panel title={en.room.settings} className="match-settings" data-testid="match-settings">
      {!editable && <p className="muted small">{en.room.hostOnly}</p>}
      <div className="settings-row">
        <span className="stepper__label">{en.room.gameMode}</span>
        <span className="settings-value">{en.modes[config.mode]}</span>
      </div>
      <Stepper
        label={en.room.targetScore}
        value={config.targetScore}
        min={1}
        max={21}
        disabled={!editable}
        onChange={(v) => onChange?.({ targetScore: v })}
        testId="setting-target"
      />
      <Stepper
        label={en.room.matchTimer}
        value={config.timeLimitMs}
        min={MIN}
        max={60 * MIN}
        step={MIN}
        format={minutesSeconds}
        disabled={!editable}
        onChange={(v) => onChange?.({ timeLimitMs: v })}
        testId="setting-match-timer"
      />
      <Stepper
        label={en.room.turnTimer}
        value={config.turnTimerMs}
        min={10_000}
        max={300_000}
        step={5_000}
        format={seconds}
        disabled={!editable}
        onChange={(v) => onChange?.({ turnTimerMs: v })}
        testId="setting-turn-timer"
      />
      <div className="settings-row">
        <span className="stepper__label">{en.room.deck}</span>
        <span className="settings-value ket small">{deckSummary(config.deckCounts)}</span>
      </div>
      <Toggle
        label={en.room.suddenDeath}
        checked={config.suddenDeath}
        disabled={!editable}
        onChange={(v) => onChange?.({ suddenDeath: v })}
      />
      {botLevel && (
        <div className="settings-row">
          <span className="stepper__label">{en.botLevel.label}</span>
          <BotLevelPicker
            value={botLevel}
            disabled={!editable}
            testId="setting-bot-level"
            onChange={(level) => onChange?.({ botLevel: level })}
          />
        </div>
      )}
    </Panel>
  );
}
