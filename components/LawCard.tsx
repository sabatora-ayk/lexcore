import styles from "./LawCard.module.css";
import { EvidenceList } from "./EvidenceList";
import { ConfidenceStamp } from "./ConfidenceStamp";
import type { LawSummary } from "../types/law";

interface ImpactSection {
  key: string;
  label: string;
  text: string;
  evidence: LawSummary["affected_evidence"];
  confidence: LawSummary["affected_confidence"];
}

export function LawCard({ law }: { law: LawSummary }) {
  const sections: ImpactSection[] = [
    {
      key: "affected",
      label: "対象者",
      text: law.affected,
      evidence: law.affected_evidence,
      confidence: law.affected_confidence,
    },
    {
      key: "impact_household",
      label: "家計への影響",
      text: law.impact_household,
      evidence: law.impact_household_evidence,
      confidence: law.impact_household_confidence,
    },
    {
      key: "impact_sme",
      label: "中小企業への影響",
      text: law.impact_sme,
      evidence: law.impact_sme_evidence,
      confidence: law.impact_sme_confidence,
    },
  ];

  const visibleSections = sections.filter((s) => s.text.trim().length > 0);

  return (
    <article className={styles.card}>
      {/* 1. 元の制度 */}
      <header className={styles.section}>
        <p className={styles.eyebrow}>📜 元の制度</p>
        <h2 className={styles.title}>{law.title}</h2>
      </header>

      {/* 2. ポイント整理（AI）— 「AI要約」ではなく整理役であることを明示 */}
      <section className={styles.section}>
        <p className={styles.eyebrow}>ポイント整理（AI）</p>
        <ul className={styles.summaryList}>
          {law.summary3
            .split("\n")
            .filter((line) => line.trim().length > 0)
            .map((line, i) => (
              <li key={i}>{line}</li>
            ))}
        </ul>
      </section>

      {/* 3. あなたへの影響 */}
      <section className={styles.section}>
        <p className={styles.eyebrow}>あなたへの影響</p>
        {visibleSections.length === 0 ? (
          <p className={styles.noImpact}>
            この法令から、対象者・家計・中小企業への直接的な影響を示す根拠は
            見つかりませんでした。
          </p>
        ) : (
          <div className={styles.impactGrid}>
            {visibleSections.map((s) => (
              <div key={s.key} className={styles.impactItem}>
                <p className={styles.impactLabel}>{s.label}</p>
                <p className={styles.impactText}>{s.text}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 4. 根拠 + 5. 信頼度（項目ごとに対応させて表示） */}
      {visibleSections.map((s) => (
        <section key={s.key} className={styles.section}>
          <p className={styles.eyebrow}>根拠（{s.label}）</p>
          <EvidenceList evidence={s.evidence} />
          <div className={styles.stampRow}>
            <ConfidenceStamp confidence={s.confidence} />
          </div>
        </section>
      ))}

      {law.effective_date.trim().length > 0 && (
        <section className={styles.section}>
          <p className={styles.eyebrow}>施行日</p>
          <p className={styles.impactText}>{law.effective_date}</p>
          <EvidenceList evidence={law.effective_date_evidence} />
        </section>
      )}

      {/* 6. 一次情報リンク（必ず原典へ戻れる導線） */}
      <footer className={styles.footer}>
        <a href={law.source_url} target="_blank" rel="noopener noreferrer" className={styles.sourceLink}>
          一次情報を見る（e-Gov法令検索） →
        </a>
      </footer>
    </article>
  );
}
