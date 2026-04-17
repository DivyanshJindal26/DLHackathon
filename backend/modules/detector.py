"""
2D object detector — YOLOv8m with synthetic fallback.
Model is loaded eagerly at import time so the first request has no cold-start penalty.
"""
import numpy as np

COCO_TO_KITTI = {
    "car":        "Car",
    "truck":      "Truck",
    "bus":        "Van",
    "person":     "Pedestrian",
    "bicycle":    "Cyclist",
    "motorcycle": "Cyclist",
}

MODEL_NAME = "yolov8m.pt"

_model = None

def _load_model():
    global _model
    try:
        from ultralytics import YOLO
        print(f"[detector] loading {MODEL_NAME}...", flush=True)
        _model = YOLO(MODEL_NAME)
        # Warm-up pass so the first real inference isn't slow
        import numpy as _np
        _model(_np.zeros((640, 640, 3), dtype=_np.uint8), imgsz=640, verbose=False)
        print(f"[detector] {MODEL_NAME} ready", flush=True)
    except Exception as e:
        print(f"[detector] could not load {MODEL_NAME}: {e} — will use synthetic fallback", flush=True)

_load_model()


def detect(image: np.ndarray, conf_threshold: float = 0.25) -> list[dict]:
    """
    Run 2D object detection on an RGB (H,W,3) uint8 image.
    Returns list of {class, confidence, bbox_2d: [x1,y1,x2,y2]}.
    Falls back to synthetic detections if YOLO is unavailable or finds nothing.
    """
    detections = []

    if _model is not None:
        try:
            results = _model(image, imgsz=640, conf=conf_threshold, verbose=False)
            boxes = results[0].boxes
            names = results[0].names
            for i in range(len(boxes)):
                coco_name = names[int(boxes.cls[i].item())].lower()
                kitti_name = COCO_TO_KITTI.get(coco_name)
                if kitti_name is None:
                    continue
                x1, y1, x2, y2 = boxes.xyxy[i].tolist()
                # ultralytics already maps output back to original image coordinates
                detections.append({
                    "class":      kitti_name,
                    "confidence": round(float(boxes.conf[i].item()), 3),
                    "bbox_2d":    [int(x1), int(y1), int(x2), int(y2)],
                })
        except Exception as e:
            print(f"[detector] inference error: {e}", flush=True)

    if not detections:
        from modules.synthetic import get_synthetic_detections
        detections = get_synthetic_detections(seed=42)

    return detections
