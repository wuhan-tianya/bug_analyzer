/**
 * TypeScript type definitions for the test case viewer.
 */

// ─── API Response Types ─────────────────────────────────────────

export interface ImportResult {
  success: boolean;
  task_count: number;
  case_count: number;
  step_count: number;
  errors: string[];
}

export interface CaseItem {
  case_id: string;
}

export interface CaseListResponse {
  task_id: string;
  cases: CaseItem[];
}

export interface ImageSize {
  width: number;
  height: number;
}

export interface OperationStepDetail {
  step_base: string;
  step_num: number | null;
  step_id: number;
  yolo_image_url: string | null;
  annotated_image_url: string | null;
  raw_json: any | null;
  normalized_detections: PerceptionItem[] | null;
  image_size: ImageSize | null;
}

export interface AssertStepDetail {
  step_base: string;
  step_num: number | null;
  step_id: number;
  before_action_image_url: string | null;
  after_action_image_url: string | null;
  raw_json: any | null;
  perception_infos_pre: PerceptionItem[] | null;
  perception_infos_post: PerceptionItem[] | null;
  normalized_detections: PerceptionItem[] | null;
  image_size: ImageSize | null;
}

export interface StepGroup {
  step_base: string;
  step_num: number | null;
  operation: OperationStepDetail | null;
  assert_step: AssertStepDetail | null;
}

export interface StepsResponse {
  task_id: string;
  case_id: string;
  steps: StepGroup[];
}

// ─── Perception / Detection Types ───────────────────────────────

export interface PerceptionItem {
  content?: string;
  coords?: number[];
  confidence?: number;
  state?: string;
  id?: number | string;
  [key: string]: any;  // Allow additional fields
}
