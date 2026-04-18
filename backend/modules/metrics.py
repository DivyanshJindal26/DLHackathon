"""
Evaluation metrics aligned to notebook evaluation flow:
class-aware nearest matching by distance threshold with summary stats.
"""
import numpy as np


def _iou_2d(b1: list, b2: list) -> float:
    x1 = max(b1[0], b2[0]); y1 = max(b1[1], b2[1])
    x2 = min(b1[2], b2[2]); y2 = min(b1[3], b2[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    a1 = (b1[2] - b1[0]) * (b1[3] - b1[1])
    a2 = (b2[2] - b2[0]) * (b2[3] - b2[1])
    union = a1 + a2 - inter
    return inter / union if union > 0 else 0.0


def match_and_evaluate(predictions: list[dict], ground_truth: list[dict], dist_threshold: float = 3.0) -> dict:
    """
    Class-aware nearest-neighbor matching by absolute distance error.
    Returns per-pair metrics and aggregate stats.
    """
    if not ground_truth:
        return {"matched": [], "false_positives": predictions, "false_negatives": [], "summary": {}}

    # Build distance matrix (preds × GT), class-aware.
    n_pred, n_gt = len(predictions), len(ground_truth)
    dist_matrix = np.full((n_pred, n_gt), np.inf, dtype=np.float64)
    for i, pred in enumerate(predictions):
        for j, gt in enumerate(ground_truth):
            if str(pred.get("class", "")).lower() != str(gt.get("class", "")).lower():
                continue
            dist_matrix[i, j] = abs(float(pred.get("distance_m", 0.0)) - float(gt.get("distance_m", 0.0)))

    # Greedy nearest matching — lowest distance error first.
    matched_pred = set()
    matched_gt   = set()
    pairs = []
    for _ in range(min(n_pred, n_gt)):
        idx = np.unravel_index(np.argmin(dist_matrix), dist_matrix.shape)
        i, j = int(idx[0]), int(idx[1])
        if not np.isfinite(dist_matrix[i, j]) or dist_matrix[i, j] > dist_threshold:
            break
        pred, gt = predictions[i], ground_truth[j]
        dist_err = round(abs(float(pred.get("distance_m", 0.0)) - float(gt.get("distance_m", 0.0))), 2)
        iou = _iou_2d(pred.get("bbox_2d", [0, 0, 0, 0]), gt.get("bbox_2d", [0, 0, 0, 0]))
        pairs.append({
            "pred_class":    pred.get("class", "unknown"),
            "gt_class":      gt.get("class", "unknown"),
            "class_match":   str(pred.get("class", "")).lower() == str(gt.get("class", "")).lower(),
            "pred_dist":     float(pred.get("distance_m", 0.0)),
            "gt_dist":       float(gt.get("distance_m", 0.0)),
            "dist_error_m":  dist_err,
            "dist_error_pct": round(dist_err / max(float(gt.get("distance_m", 0.1)), 0.1) * 100, 1),
            "iou_2d":        round(iou, 3),
            "pred_bbox":     pred.get("bbox_2d", [0, 0, 0, 0]),
            "gt_bbox":       gt.get("bbox_2d", [0, 0, 0, 0]),
        })
        matched_pred.add(i)
        matched_gt.add(j)
        dist_matrix[i, :] = np.inf
        dist_matrix[:, j] = np.inf

    false_positives = [predictions[i] for i in range(n_pred) if i not in matched_pred]
    false_negatives = [ground_truth[j] for j in range(n_gt) if j not in matched_gt]

    # Aggregate
    summary = {}
    if pairs:
        summary["mae_distance_m"]      = round(float(np.mean([p["dist_error_m"] for p in pairs])), 2)
        summary["mean_dist_error_pct"] = round(float(np.mean([p["dist_error_pct"] for p in pairs])), 1)
        summary["mean_iou_2d"]         = round(float(np.mean([p["iou_2d"] for p in pairs])), 3)
        summary["class_accuracy"]      = round(sum(p["class_match"] for p in pairs) / len(pairs), 3)

    tp = len(pairs)
    fp = len(false_positives)
    fn = len(false_negatives)
    precision = (tp / (tp + fp)) if (tp + fp) > 0 else 0.0
    recall = (tp / (tp + fn)) if (tp + fn) > 0 else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
    accuracy = (tp / (tp + fp + fn)) if (tp + fp + fn) > 0 else 0.0

    summary["precision"] = round(float(precision), 3)
    summary["recall"] = round(float(recall), 3)
    summary["f1"] = round(float(f1), 3)
    summary["accuracy"] = round(float(accuracy), 3)
    summary["dist_threshold_m"] = float(dist_threshold)

    summary["matched"]         = tp
    summary["false_positives"] = fp
    summary["false_negatives"] = fn

    return {
        "matched":         pairs,
        "false_positives": false_positives,
        "false_negatives": false_negatives,
        "summary":         summary,
    }
