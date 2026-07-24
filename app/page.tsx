import fs from "node:fs";
import path from "node:path";
import { LawCard } from "../components/LawCard";
import type { LawSummary } from "../types/law";
import styles from "./page.module.css";

function loadLaws(): LawSummary[] {
  const dir = path.resolve(process.cwd(), "data", "laws");

  if (!fs.existsSync(dir)) {
    return [];
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));

  return files
    .map((file) => {
      const raw = fs.readFileSync(path.join(dir, file), "utf-8");
      return JSON.parse(raw) as LawSummary;
    })
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export default function Home() {
  const laws = loadLaws();

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <p className={styles.wordmark}>LexCore</p>
        <p className={styles.tagline}>一次情報を、あなたが判断できる形に。</p>
      </header>

      {laws.length === 0 ? (
        <section className={styles.empty}>
          <p className={styles.emptyTitle}>まだ表示できる法令データがありません</p>
          <p className={styles.emptyBody}>
            <code>npx tsx scripts/fetch-egov.ts &lt;e-GovのURL&gt;</code> で法令を取得し、
            <code>npx tsx scripts/analyze-law.ts prompt &lt;law_id&gt;</code> と{" "}
            <code>validate &lt;law_id&gt;</code> を実行すると、ここに表示されます。
          </p>
        </section>
      ) : (
        <section className={styles.list}>
          {laws.map((law) => (
            <LawCard key={law.source_url} law={law} />
          ))}
        </section>
      )}
    </main>
  );
}
