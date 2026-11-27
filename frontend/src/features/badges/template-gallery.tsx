import { Badge } from "./badge";
import { BADGE_SIZES, SAMPLE_PERSON, type SponsorLogo } from "./badges";
import { TEMPLATES, applyTemplate, type BadgeDesign } from "./design";
import styles from "./badges.module.css";

/** Pick a starting design. Each template is drawn with the event's own texts and a sample person. */
export function TemplateGallery({ current, sponsors, onPick, onCancel }: { current: BadgeDesign; sponsors: SponsorLogo[]; onPick: (design: BadgeDesign) => void; onCancel?: () => void }) {
  const size = BADGE_SIZES[0];
  return (
    <section className={styles.gallery} aria-label="Badge templates">
      <header>
        <h2>Choose a badge template</h2>
        <p>Start from a design, then change anything: colours, type, sizes, what shows, your logo and pictures.</p>
        {onCancel && <div><button type="button" onClick={onCancel}>Keep my current design</button></div>}
      </header>
      <div className={styles.templates}>
        {TEMPLATES.map(t => {
          const design = applyTemplate(t.id, current);
          return (
            <button key={t.id} type="button" className={styles.template} data-current={current.template === t.id || undefined} onClick={() => onPick(design)}>
              <div className={styles.thumb} aria-hidden="true"><div><Badge design={design} person={SAMPLE_PERSON} size={size} sponsors={sponsors} /></div></div>
              <strong>{t.name}</strong>
              <small>{t.description}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}
