import { BOT_LEVELS, type BotLevel } from '@qa/engine';
import { en } from '../i18n/en';

/** Easy (random bot v1) / Hard (greedy bot, P-6.4; NORMAL in the protocol), as a two-button segmented control. */
export function BotLevelPicker({
  value,
  onChange,
  disabled = false,
  testId,
}: {
  value: BotLevel;
  onChange: (level: BotLevel) => void;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={en.botLevel.label}>
      {BOT_LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          role="radio"
          aria-checked={value === level}
          className={value === level ? 'is-on' : ''}
          disabled={disabled}
          data-testid={`${testId}-${level}`}
          title={en.botLevel.hint[level]}
          onClick={() => onChange(level)}
        >
          {en.botLevel[level]}
        </button>
      ))}
    </div>
  );
}
