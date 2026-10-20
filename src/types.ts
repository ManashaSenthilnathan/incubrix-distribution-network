export type SharedErrorCode =
  | 'DEST_SPEC_VIOLATION' | 'DEST_RULE_FREQUENCY_CAP' | 'CONNECTION_AUTH_EXPIRED'
  | 'PLATFORM_RATE_LIMIT' | 'PLATFORM_QUOTA_EXHAUSTED' | 'PLATFORM_CONTENT_REJECTED'
  | 'PLATFORM_UNAVAILABLE' | 'CONNECTOR_DISABLED' | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'INVALID_REQUEST' | 'NOT_FOUND' | 'INTERNAL_ERROR';

export interface Rendition {
  title: string;
  body: string;
  url?: string;
  isPromotional?: boolean;
  aiGenerated?: boolean;
  media?: string[];
}
export interface Destination {
  id: string;
  name: string;
  platform_key: string;
  base_url?: string;
  title_max_chars?: number;
  body_max_chars?: number;
  links_allowed?: boolean;
  frequency_cap?: number;
  self_promo_allowed?: boolean;
  disclosure_required?: boolean;
  automation_allowed?: boolean;
}
export interface Connection { token?: string; base_url?: string; simulation?: boolean; [key: string]: unknown }
export interface ConnectorResult { [key: string]: unknown }
export interface Job {
  job_id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  progress: number;
  created_at: string;
  updated_at: string;
  result?: Record<string, unknown>;
  error?: { code: string; message: string; retryable: boolean; details?: unknown };
}
