// TASK-007: 取得元に依存しない共通データ構造
// AI解析（TASK-003/004）はこの型のみを入力とし、取得元固有の実装に依存しない

export type DocumentType =
  | "law"
  | "bill"
  | "gazette"
  | "minutes"
  | "press_release";

export interface SourceDocument {
  source: string; // 例: "e-gov"
  source_url: string;
  title: string;
  published_at?: string;
  effective_date?: string;
  document_type: DocumentType;
  raw_text: string;
}
