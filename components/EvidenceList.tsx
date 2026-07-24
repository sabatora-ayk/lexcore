import styles from "./EvidenceList.module.css";
import type { LawEvidence } from "../types/law";

const TYPE_LABEL: Record<LawEvidence["type"], string> = {
  explicit: "条文に明記",
  derived: "制度から整理",
};

export function EvidenceList({ evidence }: { evidence: LawEvidence[] }) {
  if (evidence.length === 0) {
    return <p className={styles.empty}>この項目を裏付ける根拠は見つかりませんでした。</p>;
  }

  return (
    <ul className={styles.list}>
      {evidence.map((ev) => (
        <li key={ev.id} className={styles.item}>
          <div className={styles.head}>
            <span className={styles.article}>{ev.article}</span>
            <span className={`${styles.typeTag} ${styles[ev.type]}`}>
              {TYPE_LABEL[ev.type]}
            </span>
          </div>
          <p className={styles.quote}>「{ev.source_text}」</p>
          <p className={styles.reason}>{ev.reason}</p>
        </li>
      ))}
    </ul>
  );
}
