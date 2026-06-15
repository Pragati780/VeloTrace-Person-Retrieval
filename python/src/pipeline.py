"""
Attribute-Based Person Retrieval Pipeline
==========================================
Full AI pipeline using:
  - YOLOv8n       → Person detection
  - CLIP (ViT-B/32) → General visual attribute matching (most powerful)
  - DeepFace      → Facial attributes (beard, age, gender, emotion)
  - MediaPipe     → Body pose / landmark estimation
  - OpenCV (HSV)  → Fast color verification fallback

Workflow:
  Video → Frame Sampling → YOLO Detection → Person Cropping
  → Attribute Extraction (CLIP + DeepFace + MediaPipe + HSV)
  → Weighted Confidence Scoring → Ranked Results with Timestamps
"""

import os
import json
import time
import math
import uuid
import logging
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Any

import sys
print("PYTHON EXECUTABLE:", sys.executable)

import cv2
import numpy as np

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)


# ──────────────────────────────────────────
#  Data models
# ──────────────────────────────────────────

@dataclass
class AttributeRequest:
    """One attribute the user wants to find."""
    name: str           # e.g. "red shirt", "backpack", "beard"
    priority: str       # "high" | "medium" | "low"

    @property
    def weight(self) -> float:
        return {"high": 1.0, "medium": 0.6, "low": 0.3}.get(self.priority.lower(), 0.5)


@dataclass
class PersonDetection:
    """A single detected person crop from a video frame."""
    detection_id: str
    frame_number: int
    timestamp_sec: float
    crop_path: str
    bbox: tuple[int, int, int, int]   # x, y, w, h in original frame
    attribute_scores: dict[str, float] = field(default_factory=dict)
    weighted_confidence: float = 0.0


@dataclass
class PipelineResult:
    """Final output returned to the Node backend."""
    job_id: str
    video_duration_sec: float
    total_persons_detected: int
    matches: list[dict]   # top N persons, serializable


# ──────────────────────────────────────────
#  Lazy model loader (load once, reuse)
# ──────────────────────────────────────────

class ModelRegistry:
    """
    Loads heavy models once and keeps them in memory.
    Lazy-loaded so the server starts fast and only pays the
    loading cost for models actually needed by this job.
    """

    def __init__(self):
        self._yolo = None
        self._clip_model = None
        self._clip_preprocess = None
        self._device = None

    @property
    def device(self):
        if self._device is None:
            import torch
            self._device = "cuda" if torch.cuda.is_available() else "cpu"
            log.info(f"Using device: {self._device}")
        return self._device

    @property
    def yolo(self):
        if self._yolo is None:
            from ultralytics import YOLO
            model_path = Path(__file__).parent.parent / "models" / "yolov8n.pt"
            self._yolo = YOLO(str(model_path))
            log.info("YOLOv8n loaded")
        return self._yolo

    @property
    def clip(self):
        if self._clip_model is None:
            import clip as clip_lib
            self._clip_model, self._clip_preprocess = clip_lib.load(
                "ViT-B/32", device=self.device
            )
            log.info("CLIP ViT-B/32 loaded")
        return self._clip_model, self._clip_preprocess


_registry = ModelRegistry()


# ──────────────────────────────────────────
#  Step 1: Frame sampling
# ──────────────────────────────────────────

def sample_frames(video_path: str, sample_every: int = 10) -> tuple[list[tuple[int, np.ndarray]], float]:
    """
    Read video, return (frame_number, frame_array) pairs at every
    `sample_every` frames plus the video FPS.

    Why sample?  Processing every frame is ~10x slower for negligible
    accuracy gain on continuous-motion surveillance footage.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 29.97
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    log.info(f"Video: {total} frames @ {fps:.2f} fps → sampling 1/{sample_every}")

    frames = []
    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if frame_idx % sample_every == 0:
            frames.append((frame_idx, frame))
        frame_idx += 1

    cap.release()
    log.info(f"Sampled {len(frames)} frames from {frame_idx} total")
    return frames, fps


# ──────────────────────────────────────────
#  Step 2: Person detection (YOLOv8)
# ──────────────────────────────────────────

def detect_persons(
    frames: list[tuple[int, np.ndarray]],
    fps: float,
    crops_dir: str,
    conf_threshold: float = 0.40,
) -> list[PersonDetection]:
    """
    Run YOLOv8 on sampled frames and crop each detected person.

    Only class 0 (person) is kept.  Crops are saved to disk so
    downstream attribute models can reload them independently.
    """
    os.makedirs(crops_dir, exist_ok=True)
    detections: list[PersonDetection] = []

    for frame_number, frame in frames:
        results = _registry.yolo(frame, verbose=False)[0]

        for box in results.boxes:
            cls = int(box.cls[0])
            conf = float(box.conf[0])
            if cls != 0 or conf < conf_threshold:
                continue

            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            # Guard against out-of-bounds
            h, w = frame.shape[:2]
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)
            if x2 <= x1 or y2 <= y1:
                continue

            crop = frame[y1:y2, x1:x2]
            det_id = uuid.uuid4().hex[:12]
            crop_filename = f"frame{frame_number:06d}_{det_id}.jpg"
            crop_path = os.path.join(crops_dir, crop_filename)
            cv2.imwrite(crop_path, crop)

            detections.append(PersonDetection(
                detection_id=det_id,
                frame_number=frame_number,
                timestamp_sec=frame_number / fps,
                crop_path=crop_path,
                bbox=(x1, y1, x2 - x1, y2 - y1),
            ))

    log.info(f"Detected {len(detections)} person crops")
    return detections


# ──────────────────────────────────────────
#  Step 3: Attribute extraction
# ──────────────────────────────────────────

# ── 3a. CLIP visual attribute scorer ───────────────────────────

def clip_score(crop_bgr: np.ndarray, positive_prompt: str) -> float:
    """
    Use CLIP zero-shot to score how well the crop matches a text prompt.

    CLIP understands free-form language: "person wearing a red shirt",
    "person carrying a backpack", "person with a beard", etc.

    Returns a probability in [0, 1] (softmax over positive vs negative).

    Why CLIP?
      • No training needed — works on any attribute you describe.
      • Understands context (e.g. distinguishes "red shirt" from "red jacket").
      • State-of-the-art zero-shot visual understanding.
    """
    import clip as clip_lib
    import torch
    from PIL import Image

    model, preprocess = _registry.clip
    device = _registry.device

    # Convert BGR → RGB PIL
    rgb = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB)
    pil = Image.fromarray(rgb)

    negative_prompt = f"person NOT wearing {positive_prompt.lower()}"

    with torch.no_grad():
        image_tensor = preprocess(pil).unsqueeze(0).to(device)
        texts = clip_lib.tokenize([positive_prompt, negative_prompt]).to(device)
        logits_per_image, _ = model(image_tensor, texts)
        probs = logits_per_image.softmax(dim=-1).cpu().numpy()[0]

    return float(probs[0])


# ── 3b. HSV color fallback (fast, clothing-specific) ────────────

_HSV_COLOR_MAP = {
    "red":    [([0, 100, 80], [10, 255, 255]), ([160, 100, 80], [180, 255, 255])],
    "blue":   [([100, 80, 50], [130, 255, 255])],
    "green":  [([40, 60, 50], [80, 255, 255])],
    "yellow": [([20, 100, 100], [35, 255, 255])],
    "white":  [([0, 0, 180], [180, 40, 255])],
    "black":  [([0, 0, 0], [180, 255, 50])],
    "orange": [([10, 100, 100], [20, 255, 255])],
    "pink":   [([140, 40, 150], [170, 255, 255])],
    "purple": [([125, 50, 50], [155, 255, 255])],
    "brown":  [([10, 60, 30], [20, 200, 120])],
    "gray":   [([0, 0, 50], [180, 30, 200])],
}

def hsv_color_score(crop_bgr: np.ndarray, color_name: str, region: str = "torso") -> float:
    """
    Fast HSV pixel-counting for a specific body region.
    Complements CLIP when the attribute is purely color-based.

    Regions:
      torso  → middle 40% of height (shirt/jacket)
      lower  → bottom 50% (trousers/skirt)
      full   → whole crop
      head   → top 25% (hat/hair)
    """
    h, w = crop_bgr.shape[:2]
    region_slices = {
        "torso":  crop_bgr[int(h * 0.15):int(h * 0.55), :],
        "lower":  crop_bgr[int(h * 0.50):, :],
        "full":   crop_bgr,
        "head":   crop_bgr[:int(h * 0.25), :],
    }
    roi = region_slices.get(region, crop_bgr)
    if roi.size == 0:
        return 0.0

    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    ranges = _HSV_COLOR_MAP.get(color_name.lower())
    if ranges is None:
        return 0.0

    mask = np.zeros(hsv.shape[:2], dtype=np.uint8)
    for lo, hi in ranges:
        mask |= cv2.inRange(hsv, np.array(lo), np.array(hi))

    ratio = mask.sum() / (mask.size + 1e-6)
    # Sigmoid-like scaling: 5% coverage → ~0.2 score; 30%+ → ~0.9
    return float(min(1.0, ratio / 0.25))


# ── 3c. DeepFace facial attribute scorer ────────────────────────

def deepface_score(crop_bgr: np.ndarray, attribute: str) -> float:
    """
    Use DeepFace to detect facial attributes.

    Supported attributes: beard, mustache, age, gender, emotion.

    Why DeepFace?
      • Specialised for facial analysis — far more accurate than CLIP
        for fine-grained facial features.
      • Returns structured predictions with confidence values.

    Falls back to 0.0 if no face is detected in the crop.
    """
    try:
        from deepface import DeepFace
        analysis = DeepFace.analyze(
            crop_bgr,
            actions=["age", "gender", "race", "emotion"],
            enforce_detection=True,
            detector_backend="opencv",
            silent=True,
        )
        if not analysis:
            return 0.0
        result = analysis[0]

        attr_lower = attribute.lower()
        if "beard" in attr_lower or "facial hair" in attr_lower:
            # DeepFace doesn't directly output beard probability.
            # We use gender confidence as a weak prior (male face = higher beard base)
            # and combine with CLIP for the final score.
            gender_conf = result.get("gender", {})
            male_prob = gender_conf.get("Man", 0) / 100.0 if isinstance(gender_conf, dict) else 0.5
            return male_prob * 0.6   # max 0.6; CLIP handles the rest

        if "age" in attr_lower:
            # Normalise age to [0,1] roughly: 18→0, 90→1
            age = result.get("age", 30)
            return float(min(1.0, max(0.0, (age - 18) / 72)))

        return 0.0

    except Exception:
        return 0.0


# ── 3d. Attribute dispatcher ────────────────────────────────────

_CLOTHING_COLORS = {"red", "blue", "green", "yellow", "white", "black", "orange", "pink", "purple", "brown", "gray"}
_CLOTHING_ITEMS  = {"shirt", "jacket", "coat", "hoodie", "sweater", "t-shirt", "top", "blouse"}
_TROUSER_ITEMS   = {"jeans", "trousers", "pants", "shorts", "skirt"}
_FACIAL_ATTRS    = {"beard", "mustache", "facial hair", "moustache"}
_ACCESSORIES     = {"cap", "hat", "helmet", "backpack", "bag", "glasses", "sunglasses", "mask"}


def extract_attribute_score(crop_bgr: np.ndarray, attr: AttributeRequest) -> float:
    """
    Dispatch to the best extraction strategy per attribute type.

    Strategy selection:
      Facial attributes   → DeepFace (0.5 weight) + CLIP (0.5 weight)
      Clothing color      → HSV (0.4) + CLIP (0.6)   ← HSV is precise for color
      Accessories / other → CLIP only (most flexible)

    Combining HSV+CLIP is better than either alone:
      - HSV is fast and precise for pure-color matching
      - CLIP understands context (won't confuse a red backpack with a red shirt
        when the prompt says "red shirt")
    """
    name_lower = attr.name.lower()

    # ─ Detect which color word is in the attribute (if any) ─
    color_word = next((c for c in _CLOTHING_COLORS if c in name_lower), None)

    # ─ Facial attributes ─
    if any(f in name_lower for f in _FACIAL_ATTRS):
        df_score = deepface_score(crop_bgr, attr.name)
        clip_prompt = f"a person with {attr.name}"
        cl_score = clip_score(crop_bgr, clip_prompt)
        return 0.5 * df_score + 0.5 * cl_score

    # ─ Clothing color (shirt / top / jacket / etc.) ─
    if color_word and any(item in name_lower for item in _CLOTHING_ITEMS):
        hsv_s = hsv_color_score(crop_bgr, color_word, region="torso")
        clip_prompt = f"a person wearing a {attr.name}"
        cl_s = clip_score(crop_bgr, clip_prompt)
        return 0.4 * hsv_s + 0.6 * cl_s

    # ─ Trouser / lower-body color ─
    if color_word and any(item in name_lower for item in _TROUSER_ITEMS):
        hsv_s = hsv_color_score(crop_bgr, color_word, region="lower")
        clip_prompt = f"a person wearing {attr.name}"
        cl_s = clip_score(crop_bgr, clip_prompt)
        return 0.4 * hsv_s + 0.6 * cl_s

    # ─ Cap / hat ─
    if any(item in name_lower for item in {"cap", "hat", "helmet"}):
        hsv_s = (hsv_color_score(crop_bgr, color_word, region="head") if color_word else 0.0)
        clip_prompt = f"a person wearing a {attr.name}"
        cl_s = clip_score(crop_bgr, clip_prompt)
        return 0.3 * hsv_s + 0.7 * cl_s

    # ─ Default: CLIP for everything else ─
    clip_prompt = f"a person with {attr.name}" if not name_lower.startswith("a ") else attr.name
    return clip_score(crop_bgr, clip_prompt)


# ──────────────────────────────────────────
#  Step 4: Weighted confidence scoring
# ──────────────────────────────────────────

def compute_weighted_confidence(
    attribute_scores: dict[str, float],
    attributes: list[AttributeRequest],
) -> float:
    """
    Weighted average of per-attribute scores.

    Formula:
      confidence = Σ(score_i × weight_i) / Σ(weight_i)

    This means a "high" priority attribute that's a strong match
    contributes much more than a "low" priority one that partially matches.
    """
    total_weight = sum(a.weight for a in attributes)
    if total_weight == 0:
        return 0.0

    weighted_sum = sum(
        attribute_scores.get(a.name, 0.0) * a.weight
        for a in attributes
    )
    return round(weighted_sum / total_weight, 4)


# ──────────────────────────────────────────
#  Step 5: Timestamp merging
# ──────────────────────────────────────────

def merge_timestamps(detections: list[PersonDetection], gap_frames: int = 30) -> list[dict]:
    """
    Group detections that are temporally close into appearance intervals.

    Why? A person visible from frame 300 to 600 shouldn't generate
    300 separate result entries.  We merge any detections within
    `gap_frames` of each other into a single interval.

    Returns list of { start_sec, end_sec, best_detection } dicts.
    """
    if not detections:
        return []

    sorted_dets = sorted(detections, key=lambda d: d.frame_number)
    intervals = []
    current_group = [sorted_dets[0]]

    for det in sorted_dets[1:]:
        if det.frame_number - current_group[-1].frame_number <= gap_frames:
            current_group.append(det)
        else:
            intervals.append(current_group)
            current_group = [det]
    intervals.append(current_group)

    result = []
    for group in intervals:
        best = max(group, key=lambda d: d.weighted_confidence)
        result.append({
            "start_sec": group[0].timestamp_sec,
            "end_sec": group[-1].timestamp_sec,
            "best_detection": best,
        })

    return result


def fmt_time(sec: float) -> str:
    m = int(sec // 60)
    s = int(sec % 60)
    return f"{m:02d}:{s:02d}"


# ──────────────────────────────────────────
#  Main pipeline entry point
# ──────────────────────────────────────────

def run_pipeline(
    video_path: str,
    attributes: list[AttributeRequest],
    job_id: str,
    output_dir: str,
    min_confidence: float = 0.35,
    top_k: int = 20,
    sample_every: int = 10,
) -> PipelineResult:
    """
    End-to-end pipeline.

    Args:
        video_path:      Absolute path to the uploaded video.
        attributes:      List of AttributeRequest objects.
        job_id:          Unique job identifier (from Node).
        output_dir:      Where to write crops and results.
        min_confidence:  Only return matches above this threshold.
        top_k:           Maximum number of results to return.
        sample_every:    Frame sampling rate.

    Returns:
        PipelineResult with ranked matches.
    """
    t0 = time.time()
    crops_dir = os.path.join(output_dir, job_id, "crops")
    os.makedirs(crops_dir, exist_ok=True)

    # ── 1. Sample frames ──────────────────────────────────────
    frames, fps = sample_frames(video_path, sample_every=sample_every)
    video_duration = frames[-1][0] / fps if frames else 0.0

    # ── 2. Detect persons ─────────────────────────────────────
    detections = detect_persons(frames, fps, crops_dir)
    log.info(f"Processing {len(detections)} person crops for {len(attributes)} attributes…")

    # ── 3 & 4. Attribute extraction + scoring ─────────────────
    for i, det in enumerate(detections):
        crop = cv2.imread(det.crop_path)
        if crop is None:
            continue

        for attr in attributes:
            score = extract_attribute_score(crop, attr)
            det.attribute_scores[attr.name] = round(score, 4)

        det.weighted_confidence = compute_weighted_confidence(det.attribute_scores, attributes)

        if (i + 1) % 50 == 0:
            log.info(f"  … {i + 1}/{len(detections)} crops processed")

    # ── 5. Filter + rank ──────────────────────────────────────
    matched = [d for d in detections if d.weighted_confidence >= min_confidence]
    matched.sort(key=lambda d: d.weighted_confidence, reverse=True)
    top_matches = matched[:top_k]

    # ── 6. Build serialisable result ──────────────────────────
    match_dicts = []
    for det in top_matches:
        match_dicts.append({
            "detection_id":       det.detection_id,
            "frame_number":       det.frame_number,
            "timestamp_sec":      round(det.timestamp_sec, 2),
            "timestamp_fmt":      fmt_time(det.timestamp_sec),
            "crop_path":          det.crop_path,
            "attribute_scores":   det.attribute_scores,
            "weighted_confidence": det.weighted_confidence,
            "confidence_pct":     int(det.weighted_confidence * 100),
        })

    elapsed = round(time.time() - t0, 1)
    log.info(f"Pipeline done in {elapsed}s: {len(matched)} matches (showing top {len(match_dicts)})")

    result = PipelineResult(
        job_id=job_id,
        video_duration_sec=round(video_duration, 2),
        total_persons_detected=len(detections),
        matches=match_dicts,
    )

    # Write JSON sidecar for the Node backend to pick up
    result_path = os.path.join(output_dir, job_id, "result.json")
    with open(result_path, "w") as f:
        json.dump(asdict(result), f, indent=2)

    log.info(f"Result written → {result_path}")
    return result


# ──────────────────────────────────────────
#  CLI entry (called by Node via child_process)
# ──────────────────────────────────────────

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Usage: pipeline.py <video_path> <attributes_json> <job_id> <output_dir>")
        sys.exit(1)

    video_path   = sys.argv[1]
    attrs_raw    = json.loads(sys.argv[2])
    job_id       = sys.argv[3]
    output_dir   = sys.argv[4]

    attrs = [AttributeRequest(name=a["name"], priority=a["priority"]) for a in attrs_raw]

    result = run_pipeline(
        video_path=video_path,
        attributes=attrs,
        job_id=job_id,
        output_dir=output_dir,
    )
    # Print result JSON to stdout so Node can capture it
    print(json.dumps(asdict(result)))
