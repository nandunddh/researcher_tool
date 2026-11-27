import type { CSSProperties } from "react";
import { FONT_STACKS, safeImage } from "@/features/studio/site-schema";
import { ROLE_COLORS, type BadgeSize, type Person, type SponsorLogo } from "./badges";
import type { BadgeDesign } from "./design";
import { initials } from "@/features/studio/people";
import styles from "./badges.module.css";

/** One badge at real size (millimetres), drawn entirely from the design. Used for the gallery, the editor preview and printing. */
/** Up to this many sponsor logos fit along the bottom of a badge. */
const MAX_SPONSORS = 5;

export function Badge({ design, person, size, qr, sponsors = [] }: { design: BadgeDesign; person: Person; size: BadgeSize; qr?: string; sponsors?: SponsorLogo[] }) {
  const role = design.roleColors[person.role] ?? ROLE_COLORS[person.role] ?? ROLE_COLORS.Attendee;
  const photo = design.show.photo ? safeImage(person.photo) : undefined;
  const logo = design.show.logo ? safeImage(design.logo) : undefined;
  const background = safeImage(design.backgroundImage);
  const s = design.sizes;
  const vars = {
    width: `${size.width}mm`, height: `${size.height}mm`,
    "--role": role, "--bg": design.colors.background, "--ink": design.colors.text, "--muted": design.colors.muted,
    "--head": design.colors.header || role, "--head-ink": design.colors.headerText,
    "--heading-font": FONT_STACKS[design.fonts.heading], "--body-font": FONT_STACKS[design.fonts.body],
    "--s-title": s.title / 100, "--s-subtitle": s.subtitle / 100, "--s-name": s.name / 100, "--s-org": s.organization / 100, "--s-detail": s.detail / 100, "--s-role": s.role / 100,
    ...(background ? { backgroundImage: `url("${background.replace(/"/g, "%22")}")` } : {}),
  } as CSSProperties;
  const label = design.labels[person.role] || person.role;
  const lines = {
    name: <h3 key="name">{person.name}</h3>,
    organization: design.show.organization && person.organization ? <p key="organization" className={styles.org}>{person.organization}</p> : null,
    detail: design.show.detail && person.detail ? <p key="detail" className={styles.detail}>{person.detail}</p> : null,
  };
  const showHeader = (design.show.title && design.title) || (design.show.subtitle && design.subtitle) || logo;
  return (
    <article className={styles.badge} style={vars} data-fill={design.fill} data-header={design.header} data-band={design.band}
      data-align={design.align} data-qr={design.qr} data-photo={design.photo} data-hasqr={design.show.qr && qr ? "" : undefined}>
      <header data-empty={showHeader ? undefined : ""}>
        {logo && <img className={styles.logo} src={logo} alt="" />}
        <div>
          {design.show.title && design.title && <strong>{design.title}</strong>}
          {design.show.subtitle && design.subtitle && <span>{design.subtitle}</span>}
        </div>
      </header>
      <div className={styles.who}>
        {photo ? <img className={styles.photo} src={photo} alt="" />
          // The large-picture layout keeps its shape without a photo: the person's initials fill the space.
          : design.show.photo && design.photo === "large" && <span className={`${styles.photo} ${styles.initials}`} aria-hidden="true">{initials(person.name)}</span>}
        {design.order.map(line => lines[line])}
        {design.show.role && design.band !== "bottom" && <span className={styles.rolePill}>{label}</span>}
      </div>
      {design.show.qr && qr && <img className={styles.qr} src={qr} alt="" />}
      {design.show.sponsors && sponsors.length > 0 && (
        <div className={styles.sponsors}>{sponsors.slice(0, MAX_SPONSORS).map(s => <img key={s.logo} src={s.logo} alt={s.name} />)}</div>
      )}
      {design.show.role && design.band === "bottom" && <footer>{label}</footer>}
    </article>
  );
}
