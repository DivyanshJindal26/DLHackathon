"""
Evaluation metrics: match predictions to GT labels by 2D IoU, compute errors.
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


def match_and_evaluate(predictions: list[dict], ground_truth: list[dict], iou_threshold: float = 0.3) -> dict:
    """
    Greedy IoU matching between predictions and GT.
    Returns per-pair metrics and aggregate stats.
    """
    if not ground_truth:
        return {"matched": [], "false_positives": predictions, "false_negatives": [], "summary": {}}

    # Build IoU matrix (preds × GT)
    n_pred, n_gt = len(predictions), len(ground_truth)
    iou_matrix = np.zeros((n_pred, n_gt))
    for i, pred in enumerate(predictions):
        for j, gt in enumerate(ground_truth):
            iou_matrix[i, j] = _iou_2d(pred["bbox_2d"], gt["bbox_2d"])

    # Greedy matching — highest IoU pairs first
    matched_pred = set()
    matched_gt   = set()
    pairs = []
    for _ in range(min(n_pred, n_gt)):
        idx = np.unravel_index(np.argmax(iou_matrix), iou_matrix.shape)
        i, j = int(idx[0]), int(idx[1])
        if iou_matrix[i, j] < iou_threshold:
            break
        pred, gt = predictions[i], ground_truth[j]
        dist_err = round(abs(pred["distance_m"] - gt["distance_m"]), 2)
        pairs.append({
            "pred_class":    pred["class"],
            "gt_class":      gt["class"],
            "class_match":   pred["class"].lower() == gt["class"].lower(),
            "pred_dist":     pred["distance_m"],
            "gt_dist":       gt["distance_m"],
            "dist_error_m":  dist_err,
            "dist_error_pct": round(dist_err / max(gt["distance_m"], 0.1) * 100, 1),
            "iou_2d":        round(iou_matrix[i, j], 3),
            "pred_bbox":     pred["bbox_2d"],
            "gt_bbox":       gt["bbox_2d"],
        })
        matched_pred.add(i)
        matched_gt.add(j)
        iou_matrix[i, :] = -1
        iou_matrix[:, j] = -1

    false_positives = [predictions[i] for i in range(n_pred) if i not in matched_pred]
    false_negatives = [ground_truth[j] for j in range(n_gt) if j not in matched_gt]

    # Aggregate
    summary = {}
    if pairs:
        summary["mae_distance_m"]        = round(float(np.mean([p["dist_error_m"] for p in pairs])), 2)
        summary["mean_dist_error_pct"]   = round(float(np.mean([p["dist_error_pct"] for p in pairs])), 1)
        summary["mean_iou_2d"]           = round(float(np.mean([p["iou_2d"] for p in pairs])), 3)
        summary["class_accuracy"]        = round(sum(p["class_match"] for p in pairs) / len(pairs), 3)
        summary["recall"]                = round(len(pairs) / n_gt, 3)
        summary["precision"]             = round(len(pairs) / n_pred, 3) if n_pred else 0.0

    summary["matched"]         = len(pairs)
    summary["false_positives"] = len(false_positives)
    summary["false_negatives"] = len(false_negatives)

    return {
        "matched":         pairs,
        "false_positives": false_positives,
        "false_negatives": false_negatives,
        "summary":         summary,
    }
