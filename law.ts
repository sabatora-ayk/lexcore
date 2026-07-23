// TASK-001で確定したスキーマの実装（ADR-001準拠）
// Phase 2でRuleへ移行するまでは、この型がLexCoreのAI解析結果の正とする(ADR-002)

export type EvidenceType = "explicit" | "derived";

export interface SourceRange {
  start: number;
  end: number;
}

export interface LawEvidence {
  id: string; // UUID。ADR-001「Evidence ID設計」準拠
  article: string; // 例: "第12条"
  source_text: string; // 短い引用・要約。原文の長文転載は禁止
  reason: string; // この条文がなぜ判断根拠になるのか
  type: EvidenceType; // explicit: 条文に直接記載 / derived: AIによる整理・軽微な推論
  source_range?: SourceRange; // 将来拡張。Phase 0では未使用
}

export interface Confidence {
  // AIの自信度ではなく、一次情報からの推論距離を表す(ADR-001)
  level: "high" | "medium" | "low";
  reason: string;
}

export interface LawSummary {
  title: string;
  summary3: string;

  affected: string;
  affected_evidence: LawEvidence[];
  affected_confidence: Confidence;

  impact_household: string;
  impact_household_evidence: LawEvidence[];
  impact_household_confidence: Confidence;

  impact_sme: string;
  impact_sme_evidence: LawEvidence[];
  impact_sme_confidence: Confidence;

  effective_date: string;
  effective_date_evidence: LawEvidence[];

  source_url: string;
  related_laws: string[];
  created_at: string;
}
