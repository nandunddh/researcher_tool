import { FONT_STACKS } from "./site-schema";
import { readTheme, themeDefaults, type StudioTheme } from "./studio-theme";
import styles from "./react-editor.module.css";

export function ThemePanel({ config, disabled, onChange }: {
  config: unknown; disabled: boolean; onChange: (patch: Partial<StudioTheme>) => void;
}) {
  const theme = { ...themeDefaults, ...readTheme(config) };
  return <fieldset disabled={disabled} className={styles.themePanel}>
    <legend>Website theme</legend>
    <p className={styles.hint}>Applies to every page. Individual section and element styles take priority.</p>
    {(["accent", "ink"] as const).map(key => <label key={key}>
      {key === "accent" ? "Brand color" : "Text color"}
      <input type="color" value={theme[key]} onChange={e => onChange({ [key]: e.target.value })} />
    </label>)}
    {(["headingFont", "bodyFont"] as const).map(key => <label key={key}>
      {key === "headingFont" ? "Heading font" : "Body font"}
      <select value={theme[key]} onChange={e => onChange({ [key]: e.target.value })}>
        {Object.keys(FONT_STACKS).map(font => <option key={font} value={font}>{font[0].toUpperCase() + font.slice(1)}</option>)}
      </select>
    </label>)}
    <label>Button corners <span>{theme.radius} px</span>
      <input type="range" min={0} max={48} value={theme.radius} onChange={e => onChange({ radius: e.target.valueAsNumber })} />
    </label>
  </fieldset>;
}
