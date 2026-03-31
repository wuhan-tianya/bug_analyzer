"""
Pydantic models for the API.
"""
from pydantic import BaseModel
from typing import Optional, Any


class ImportResult(BaseModel):
    success: bool
    task_count: int
    case_count: int
    step_count: int
    errors: list[str]


class CaseItem(BaseModel):
    case_id: str


class CaseListResponse(BaseModel):
    task_id: str
    cases: list[CaseItem]


class OperationStepDetail(BaseModel):
    step_base: str
    step_num: Optional[int] = None
    step_id: int
    # operation: base image with perception overlay
    yolo_image_url: Optional[str] = None
    # operation: labeled image (reference/fallback)
    annotated_image_url: Optional[str] = None
    raw_json: Optional[Any] = None
    normalized_detections: Optional[list[dict]] = None
    image_size: Optional[dict] = None


class AssertStepDetail(BaseModel):
    step_base: str
    step_num: Optional[int] = None
    step_id: int
    # assert: before action labeled image
    before_action_image_url: Optional[str] = None
    # assert: after action labeled image
    after_action_image_url: Optional[str] = None
    raw_json: Optional[Any] = None
    perception_infos_pre: Optional[list[dict]] = None
    perception_infos_post: Optional[list[dict]] = None
    normalized_detections: Optional[list[dict]] = None
    image_size: Optional[dict] = None


class StepGroup(BaseModel):
    step_base: str
    step_num: Optional[int] = None
    operation: Optional[OperationStepDetail] = None
    assert_step: Optional[AssertStepDetail] = None


class StepsResponse(BaseModel):
    task_id: str
    case_id: str
    steps: list[StepGroup]
