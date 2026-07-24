import styles from "./ConfidenceStamp.module.css";
import type { Confidence } from "../types/law";

const LABEL: Record<Confidence["level"], string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const DESCRIPTION: Record<Confidence["level"], string> = {
  high: "一次情報に明記されている事実です",
  medium: "一次情報から合理的に導ける内容です",
  low: "追加情報が必要な推定です",
};

export function ConfidenceStamp({ confidence }: { confidence: Confidence }) {
  return (
    <div className={styles.wrap}>
      <span className={`${styles.stamp} ${styles[confidence.level]}`} aria-hidden="true">
        {LABEL[confidence.level]}
      </span>
      <div className={styles.text}>
        <p className={styles.caption}>{DESCRIPTION[confidence.level]}</p>
        <p className={styles.reason}>{confidence.reason}</p>
      </div>
    </div>
  );
}
