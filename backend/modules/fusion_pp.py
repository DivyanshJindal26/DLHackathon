"""
Full fused pipeline — HYBRID FUSION (3-tier).

Tier 1: IoM Native Corner Fusion + Center-Inside check  → HIGH CONF FUSION
Tier 2: YOLO-gated PP fallback on remaining unfused boxes → pp_gated
Tier 3: DBSCAN+OBB fallback on still-unfused YOLO boxes  → obb / prior

After all tiers: global 3D NMS by center distance to remove cross-tier dupes.
"""
import warnings
warnings.filterwarnings("ignore")

import numpy as np
import cv2
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.cluster import DBSCAN
from sklearn.decomposition import PCA

from modules.pointpillars import run_pointpillars

# ── YOLO ─────────────────────────────────────────────────────────────────────
_yolo_model = None

def _load_yolo():
    global _yolo_model
    try:
        from ultralytics import YOLO
        print("[fusion_pp] loading YOLOv8l...", flush=True)
        _yolo_model = YOLO("yolov8l.pt")
        print("[fusion_pp] YOLOv8l ready", flush=True)
    except Exception as exc:
        print(f"[fusion_pp] YOLO failed: {exc}", flush=True)

_load_yolo()


# ── Constants ─────────────────────────────────────────────────────────────────

TIER1_3D_CONF    = 0.40
TIER1_IOM        = 0.30
TIER2_3D_CONF    = 0.25
TIER2_IOU        = 0.25
TIER3_MIN_PTS    = 3
TIER3_MIN_CLUSTER = 10
YOLO_CONF        = 0.30

CLASSES_OF_INTEREST = {
    "car", "truck", "bus", "person", "pedestrian",
    "bicycle", "cyclist", "motorcycle",
}

CLASS_PRIORS = {
    "car":        np.array([4.5, 2.0, 1.7]),
    "truck":      np.array([7.0, 2.5, 3.0]),
    "bus":        np.array([10.0, 2.5, 3.5]),
    "person":     np.array([0.6, 0.6, 1.8]),
    "pedestrian": np.array([0.6, 0.6, 1.8]),
    "cyclist":    np.array([1.8, 0.6, 1.7]),
    "bicycle":    np.array([1.8, 0.6, 1.0]),
}

TIER_COLORS = {
    "PERFECT (IoM/Center Fused)":        (0, 255, 0),
    "HIGH (PP+OBB agree)":               (0, 255, 0),
    "HIGH (PP only, YOLO confirmed)":    (0, 200, 100),
    "MED (OBB only)":                    (0, 165, 255),
    "MED (OBB only — sparse LiDAR)":     (0, 165, 255),
}

CLASS_HEX = {
    "car":        "#2979ff",
    "pedestrian": "#00e676",
    "cyclist":    "#ffab00",
    "truck":      "#ff3d71",
    "bus":        "#e040fb",
    "person":     "#00e676",
    "bicycle":    "#ffab00",
    "motorcycle": "#ffab00",
}


# ── Geometry helpers ──────────────────────────────────────────────────────────

def box_lwh_center_to_corners(center, l, w, h, yaw):
    ca, sa = np.cos(yaw), np.sin(yaw)
    R  = np.array([[ca, -sa, 0], [sa, ca, 0], [0, 0, 1]])
    dx, dy, dz = l / 2, w / 2, h / 2
    local = np.array([
        [-dx, -dy, -dz], [dx, -dy, -dz], [dx,  dy, -dz], [-dx,  dy, -dz],
        [-dx, -dy,  dz], [dx, -dy,  dz], [dx,  dy,  dz], [-dx,  dy,  dz],
    ])
    return ((R @ local.T).T + center).astype(np.float32)


def lidar_to_img(pts_3d: np.ndarray, calib: dict):
    """Project (N,3) LiDAR points → (N,2) image coords, depth (N,), bool mask (N,)."""
    N = pts_3d.shape[0]
    pts_h = np.vstack([pts_3d.T, np.ones((1, N))])
    proj  = calib["T_velo_to_img"] @ pts_h
    depth = proj[2]
    in_front = depth > 0.1
    safe = np.where(depth != 0, depth, 1e-9)
    u = proj[0] / safe
    v = proj[1] / safe
    return np.column_stack([u, v]), depth, in_front


def iou_2d(box_a, box_b) -> float:
    xa1, ya1, xa2, ya2 = box_a
    xb1, yb1, xb2, yb2 = box_b
    xi1, yi1 = max(xa1, xb1), max(ya1, yb1)
    xi2, yi2 = min(xa2, xb2), min(ya2, yb2)
    inter = max(0, xi2 - xi1) * max(0, yi2 - yi1)
    area_a = (xa2 - xa1) * (ya2 - ya1)
    area_b = (xb2 - xb1) * (yb2 - yb1)
    return inter / (area_a + area_b - inter + 1e-6)


def compute_iom(box1, box2) -> float:
    """Intersection over Minimum area — robust for partially overlapping boxes."""
    x_left  = max(box1[0], box2[0]);  y_top    = max(box1[1], box2[1])
    x_right = min(box1[2], box2[2]);  y_bottom = min(box1[3], box2[3])
    if x_right < x_left or y_bottom < y_top:
        return 0.0
    inter    = (x_right - x_left) * (y_bottom - y_top)
    b1_area  = (box1[2] - box1[0]) * (box1[3] - box1[1])
    b2_area  = (box2[2] - box2[0]) * (box2[3] - box2[1])
    min_area = min(b1_area, b2_area)
    return inter / min_area if min_area > 0 else 0.0


def project_pts_to_image(points_xyz: np.ndarray, calib: dict, img_shape: tuple):
    h, w  = img_shape[:2]
    N     = points_xyz.shape[0]
    pts_h = np.vstack([points_xyz.T, np.ones((1, N))])
    proj  = calib["T_velo_to_img"] @ pts_h
    depth = proj[2]
    u     = proj[0] / (depth + 1e-9)
    v     = proj[1] / (depth + 1e-9)
    valid = (depth > 0.1) & (u >= 0) & (u < w) & (v >= 0) & (v < h)
    return u[valid], v[valid], depth[valid], valid


def project_box_corners_to_image(corners_3d: np.ndarray, calib: dict, img_shape: tuple):
    """Return (x1,y1,x2,y2) image bbox from 8 3D corners, or None."""
    uv, depth, in_front = lidar_to_img(corners_3d, calib)
    if np.sum(in_front) < 2:
        return None
    u, v   = uv[in_front, 0], uv[in_front, 1]
    h, w   = img_shape[:2]
    return (int(np.clip(u.min(), 0, w - 1)), int(np.clip(v.min(), 0, h - 1)),
            int(np.clip(u.max(), 0, w - 1)), int(np.clip(v.max(), 0, h - 1)))


# ── Box validation ────────────────────────────────────────────────────────────

def is_valid_box(det: dict) -> bool:
    l, w, h = det["dims"]
    cls = det["label"].lower()
    if cls in ("car", "vehicle"):
        if l < 2.5 or l > 8.0 or w < 1.2 or w > 3.0 or h < 1.0 or h > 2.5:
            return False
    if cls == "pedestrian":
        if h < 1.0 or h > 2.2 or l > 1.5 or w > 1.5:
            return False
    if cls == "cyclist":
        if h < 1.0 or h > 2.5:
            return False
    return True


# ── Tier 1: IoM + Center-Inside Fusion ───────────────────────────────────────

def apply_hybrid_fusion(pp_dets: list, yolo_boxes: list, calib: dict, img_shape: tuple):
    """
    Match each PP detection to a YOLO box via IoM or center-inside check.
    Class-aware: car↔car/truck/bus, ped↔person/pedestrian, cyc↔bicycle/motorcycle/cyclist.
    Each YOLO box can only be claimed once (state-tracked via 'fused' flag).

    Returns: fused_dets, unfused_pp, unfused_yolo
    """
    fused_dets = []
    unfused_pp = []

    for yb in yolo_boxes:
        yb.setdefault("fused", False)

    for det in pp_dets:
        uv, depth, in_front = lidar_to_img(det["corners"], calib)
        if np.sum(in_front) == 0:
            unfused_pp.append(det)
            continue

        valid_uv  = uv[in_front]
        proj_box2d = [valid_uv[:, 0].min(), valid_uv[:, 1].min(),
                      valid_uv[:, 0].max(), valid_uv[:, 1].max()]

        uv_ctr, _, in_front_c = lidar_to_img(np.array([det["center"]]), calib)
        cx, cy = (int(uv_ctr[0][0]), int(uv_ctr[0][1])) if in_front_c[0] else (-1, -1)

        is_fused = False
        for yb in yolo_boxes:
            if yb["fused"]:
                continue

            yo_cls  = yb["class"].lower()
            det_lbl = det["label"].lower()

            if "car" in det_lbl and yo_cls in ("car", "truck", "bus"):
                valid_cls = True
            elif "ped" in det_lbl and yo_cls in ("person", "pedestrian"):
                valid_cls = True
            elif "cyc" in det_lbl and yo_cls in ("bicycle", "motorcycle", "cyclist"):
                valid_cls = True
            else:
                valid_cls = False

            if not valid_cls:
                continue

            center_inside = (yb["x1"] <= cx <= yb["x2"]) and (yb["y1"] <= cy <= yb["y2"])
            iom = compute_iom(proj_box2d, [yb["x1"], yb["y1"], yb["x2"], yb["y2"]])

            if center_inside or iom > TIER1_IOM:
                yb["fused"] = True
                det.update({
                    "bbox_2d":         (yb["x1"], yb["y1"], yb["x2"], yb["y2"]),
                    "source":          "HIGH CONF FUSION",
                    "confidence_tier": "PERFECT (IoM/Center Fused)",
                    "color":           (0, 255, 0),
                })
                fused_dets.append(det)
                is_fused = True
                break

        if not is_fused:
            unfused_pp.append(det)

    unfused_yolo = [yb for yb in yolo_boxes if not yb["fused"]]
    return fused_dets, unfused_pp, unfused_yolo


# ── Tier 2: PP gating on remaining boxes ─────────────────────────────────────

def gate_pp_with_yolo(pp_dets: list, yolo_boxes: list, calib: dict, img_shape: tuple,
                      iou_thresh: float = TIER2_IOU, score_thresh: float = TIER2_3D_CONF) -> list:
    gated = []
    for det in pp_dets:
        if det["score"] < score_thresh or not is_valid_box(det):
            continue
        pp_rect = project_box_corners_to_image(det["corners"], calib, img_shape)
        if pp_rect is None:
            continue
        matched = any(
            iou_2d(pp_rect, (yb["x1"], yb["y1"], yb["x2"], yb["y2"])) >= iou_thresh
            for yb in yolo_boxes
        )
        if matched:
            det.update({"bbox_2d": pp_rect, "source": "pp_gated"})
            gated.append(det)
    return gated


# ── Tier 3: DBSCAN + OBB on remaining YOLO boxes ─────────────────────────────

def get_frustum_points(box2d, pts_xyz, u_all, v_all, valid_mask):
    x1, y1, x2, y2 = box2d
    in_box  = (u_all >= x1) & (u_all <= x2) & (v_all >= y1) & (v_all <= y2)
    indices = np.where(valid_mask)[0][in_box]
    return pts_xyz[indices]


def dbscan_cluster(pts: np.ndarray):
    if len(pts) < TIER3_MIN_PTS:
        return None
    db     = DBSCAN(eps=0.5, min_samples=TIER3_MIN_PTS).fit(pts)
    labels = db.labels_
    unique = [l for l in set(labels) if l != -1]
    if not unique:
        return None
    best = max(unique, key=lambda l: np.sum(labels == l))
    return pts[labels == best]


def fit_obb(pts: np.ndarray):
    if pts is None or len(pts) < 5:
        return None
    xy, z = pts[:, :2], pts[:, 2]
    pca   = PCA(n_components=2).fit(xy)
    angle = np.arctan2(pca.components_[0, 1], pca.components_[0, 0])
    c, s  = np.cos(-angle), np.sin(-angle)
    R     = np.array([[c, -s], [s, c]])
    xy_r  = (R @ xy.T).T

    xmin, ymin = xy_r.min(0);  xmax, ymax = xy_r.max(0)
    zmin, zmax = z.min(), z.max()
    cx, cy     = (xmin + xmax) / 2, (ymin + ymax) / 2
    center_xy  = np.array([R.T @ [cx, cy]])[0]

    corners_r = np.array([
        [xmin, ymin, zmin], [xmax, ymin, zmin], [xmax, ymax, zmin], [xmin, ymax, zmin],
        [xmin, ymin, zmax], [xmax, ymin, zmax], [xmax, ymax, zmax], [xmin, ymax, zmax],
    ])
    corners = np.zeros_like(corners_r)
    for i in range(8):
        corners[i, :2] = R.T @ corners_r[i, :2]
        corners[i, 2]  = corners_r[i, 2]

    return {
        "center":  np.array([center_xy[0], center_xy[1], (zmin + zmax) / 2]),
        "dims":    np.array([xmax - xmin, ymax - ymin, zmax - zmin]),
        "corners": corners,
        "angle":   angle,
        "source":  "obb",
    }


def fit_prior_box(pts, cls: str):
    if pts is None or len(pts) == 0:
        return None
    center = pts.mean(axis=0)
    dims   = CLASS_PRIORS.get(cls, CLASS_PRIORS["car"])
    l, w, h = dims
    corners = np.array([
        [center[0]-l/2, center[1]-w/2, center[2]],
        [center[0]+l/2, center[1]-w/2, center[2]],
        [center[0]+l/2, center[1]+w/2, center[2]],
        [center[0]-l/2, center[1]+w/2, center[2]],
        [center[0]-l/2, center[1]-w/2, center[2]+h],
        [center[0]+l/2, center[1]-w/2, center[2]+h],
        [center[0]+l/2, center[1]+w/2, center[2]+h],
        [center[0]-l/2, center[1]+w/2, center[2]+h],
    ])
    return {"center": center, "dims": dims, "corners": corners, "angle": 0.0, "source": "prior"}


def run_old_pipeline(yolo_boxes: list, pts_xyz: np.ndarray, calib: dict, img_shape: tuple) -> list:
    u_all, v_all, _, valid_mask = project_pts_to_image(pts_xyz, calib, img_shape)
    dets = []
    for yb in yolo_boxes:
        cls, conf = yb["class"], yb["conf"]
        x1, y1, x2, y2 = yb["x1"], yb["y1"], yb["x2"], yb["y2"]
        fpts    = get_frustum_points((x1, y1, x2, y2), pts_xyz, u_all, v_all, valid_mask)
        cluster = dbscan_cluster(fpts)
        box     = (fit_obb(cluster)
                   if cluster is not None and len(cluster) >= TIER3_MIN_CLUSTER
                   else fit_prior_box(fpts if fpts is not None and len(fpts) > 0 else None, cls))
        if box is None:
            continue
        dets.append({
            "label":   cls,
            "score":   conf,
            "center":  box["center"],
            "dims":    box["dims"],
            "corners": box["corners"],
            "angle":   box["angle"],
            "bbox_2d": (x1, y1, x2, y2),
            "source":  box["source"],
        })
    return dets


# ── Merge Tier 2 + Tier 3 ─────────────────────────────────────────────────────

def merge_fallback_detections(pp_dets: list, old_dets: list, dist_thresh: float = 3.0) -> list:
    final    = []
    used_old = set()

    for pp in pp_dets:
        match = next(
            (i for i, old in enumerate(old_dets)
             if i not in used_old and np.linalg.norm(pp["center"] - old["center"]) < dist_thresh),
            None,
        )
        if match is not None:
            pp.update({"confidence_tier": "HIGH (PP+OBB agree)", "color": (0, 255, 0)})
            used_old.add(match)
        else:
            pp.update({"confidence_tier": "HIGH (PP only, YOLO confirmed)", "color": (0, 200, 100)})
        final.append(pp)

    for i, old in enumerate(old_dets):
        if i not in used_old:
            old.update({"confidence_tier": "MED (OBB only)", "color": (0, 165, 255)})
            final.append(old)

    return final


# ── Global 3D NMS ─────────────────────────────────────────────────────────────

def nms_3d_global(detections: list, dist_thresh: float = 2.5) -> list:
    """Remove duplicate detections across all tiers by center distance, keeping highest-priority."""
    if not detections:
        return []

    for det in detections:
        src  = det.get("source", "")
        tier = det.get("confidence_tier", "")
        if "HIGH CONF FUSION" in src or "PERFECT" in tier:
            det["_priority"] = 3
        elif "pp_gated" in src or "PP+OBB" in tier:
            det["_priority"] = 2
        else:
            det["_priority"] = 1

    detections = sorted(detections,
                        key=lambda x: (x.get("_priority", 0), x.get("score", 0)),
                        reverse=True)
    keep = []
    while detections:
        current = detections.pop(0)
        keep.append(current)
        detections = [
            d for d in detections
            if np.linalg.norm(d["center"] - current["center"]) >= dist_thresh
        ]

    for d in keep:
        d.pop("_priority", None)
    return keep


# ── Rendering helpers ─────────────────────────────────────────────────────────

def project_3d_box_to_image(corners_3d, calib, img_shape):
    N     = 8
    pts_h = np.vstack([corners_3d.T, np.ones((1, N))])
    proj  = calib["T_velo_to_img"] @ pts_h
    dep   = proj[2]
    if np.all(dep <= 0):
        return None
    u = proj[0] / (dep + 1e-9)
    v = proj[1] / (dep + 1e-9)
    return np.stack([u, v], axis=1).astype(int)


# ── Public entry point ────────────────────────────────────────────────────────

def run_fused_pipeline(
    pts_raw:    np.ndarray,
    image_bgr:  np.ndarray,
    calib:      dict,
    score_thresh: float = TIER1_3D_CONF,
) -> tuple:
    """
    3-tier hybrid fusion pipeline.

    Args:
        pts_raw   : (N,4) raw LiDAR points (x,y,z,intensity)
        image_bgr : (H,W,3) BGR camera image
        calib     : dict with 'T_velo_to_img' = P2 @ R0_rect @ Tr_velo_to_cam

    Returns:
        img_lidar, img_boxes, serial_dets, scene_points, scene_point_colors, stats
    """
    pts_xyz   = pts_raw[:, :3].astype(np.float32)
    pts_xyz   = pts_xyz[pts_xyz[:, 2] > -1.5]
    pts_xyz   = pts_xyz[pts_xyz[:, 0] > 0]
    img_shape = image_bgr.shape

    # ── YOLO 2D ──────────────────────────────────────────────────────────────
    yolo_boxes = []
    if _yolo_model is not None:
        try:
            yolo_results = _yolo_model(image_bgr, verbose=False)[0]
            for box in yolo_results.boxes:
                cls  = yolo_results.names[int(box.cls)]
                conf = float(box.conf)
                if cls not in CLASSES_OF_INTEREST or conf < YOLO_CONF:
                    continue
                x1, y1, x2, y2 = map(int, box.xyxy[0].cpu().numpy())
                yolo_boxes.append({
                    "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                    "class": cls, "conf": conf,
                })
        except Exception as exc:
            print(f"[fusion_pp] YOLO error: {exc}", flush=True)

    # ── PP raw at Tier-1 threshold ────────────────────────────────────────────
    pp_raw = run_pointpillars(pts_xyz, score_thresh=TIER1_3D_CONF)

    # ── Tier 1: IoM + Center-Inside Fusion ───────────────────────────────────
    fused_dets, unfused_pp, unfused_yolo = apply_hybrid_fusion(
        pp_raw, yolo_boxes, calib, img_shape
    )

    # ── Tier 2: Gate remaining PP against remaining YOLO ─────────────────────
    pp_fallback = [p for p in unfused_pp if p["score"] >= TIER2_3D_CONF]
    pp_gated    = gate_pp_with_yolo(
        pp_fallback, unfused_yolo, calib, img_shape,
        iou_thresh=TIER2_IOU, score_thresh=TIER2_3D_CONF,
    )

    # ── Tier 3: DBSCAN+OBB on still-unfused YOLO ─────────────────────────────
    obb_dets = run_old_pipeline(unfused_yolo, pts_xyz, calib, img_shape)

    # ── Merge Tier 2+3, then global NMS ──────────────────────────────────────
    merged_fallback = merge_fallback_detections(pp_gated, obb_dets, dist_thresh=3.0)
    all_dets        = fused_dets + merged_fallback
    final_dets      = nms_3d_global(all_dets, dist_thresh=2.5)

    stats = {
        "yolo_n":         len(yolo_boxes),
        "pp_raw_n":       len(pp_raw),
        "tier1_fused_n":  len(fused_dets),
        "pp_gated_n":     len(pp_gated),
        "obb_n":          len(obb_dets),
        "final_n":        len(final_dets),
    }
    print(
        f"[fusion_pp] YOLO:{stats['yolo_n']}  PP_raw:{stats['pp_raw_n']}  "
        f"T1:{stats['tier1_fused_n']}  T2:{stats['pp_gated_n']}  "
        f"T3:{stats['obb_n']}  Final:{stats['final_n']}",
        flush=True,
    )

    # ── Draw img_lidar ────────────────────────────────────────────────────────
    img_lidar = image_bgr.copy()
    u_all, v_all, d_all, vmask = project_pts_to_image(pts_xyz, calib, img_shape)
    if len(d_all) > 0:
        d_norm = (d_all - d_all.min()) / (d_all.max() - d_all.min() + 1e-9)
        for i in range(len(u_all)):
            c = plt.cm.jet(float(d_norm[i]))
            cv2.circle(img_lidar, (int(u_all[i]), int(v_all[i])), 2,
                       (int(c[2] * 255), int(c[1] * 255), int(c[0] * 255)), -1)

    # ── Draw img_boxes ────────────────────────────────────────────────────────
    img_boxes = image_bgr.copy()
    for det in final_dets:
        color = det.get("color", (0, 255, 0))

        corners_2d = project_3d_box_to_image(det["corners"], calib, img_shape)
        if corners_2d is not None:
            edges = [
                (0, 1), (1, 2), (2, 3), (3, 0),
                (4, 5), (5, 6), (6, 7), (7, 4),
                (0, 4), (1, 5), (2, 6), (3, 7),
            ]
            for a, b in edges:
                p1, p2 = tuple(corners_2d[a]), tuple(corners_2d[b])
                if all(-500 < x < 3000 for x in p1 + p2):
                    cv2.line(img_boxes, p1, p2, color, 2)

        dist = float(np.linalg.norm(det["center"]))
        x1, y1, x2, y2 = det.get("bbox_2d", (0, 0, 0, 0))
        cv2.rectangle(img_boxes, (x1, y1), (x2, y2), color, 1)
        src = det.get("source", "")
        cv2.putText(img_boxes, f"{det['label']} {dist:.1f}m [{src}]",
                    (x1, y1 - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

    # ── Serialise for JSON ────────────────────────────────────────────────────
    serial_dets = []
    for det in final_dets:
        bbox    = det.get("bbox_2d", [0, 0, 0, 0])
        bbox_py = [int(float(v)) for v in bbox]
        serial_dets.append({
            "label":           det["label"],
            "score":           round(float(det["score"]), 3),
            "center":          [round(float(v), 3) for v in det["center"]],
            "dims":            [round(float(v), 3) for v in det["dims"]],
            "corners":         [[round(float(v), 3) for v in row]
                                for row in det["corners"].tolist()],
            "heading":         round(float(det.get("heading", det.get("angle", 0.0))), 4),
            "bbox_2d":         bbox_py,
            "source":          det.get("source", ""),
            "confidence_tier": det.get("confidence_tier", ""),
            "color_hex":       CLASS_HEX.get(det["label"].lower(), "#94a3b8"),
            "distance_m":      round(float(np.linalg.norm(det["center"])), 2),
        })

    # ── Scene point cloud for 3-D viewer ─────────────────────────────────────
    h, w = image_bgr.shape[:2]
    N    = pts_xyz.shape[0]
    pts_h = np.vstack([pts_xyz.T, np.ones((1, N))])
    proj  = calib["T_velo_to_img"] @ pts_h
    depths = proj[2]
    u = (proj[0] / (depths + 1e-9)).astype(int)
    v = (proj[1] / (depths + 1e-9)).astype(int)
    valid_mask = (depths > 0.1) & (u >= 0) & (u < w) & (v >= 0) & (v < h)

    pts_valid = pts_xyz[valid_mask]
    u_valid   = u[valid_mask]
    v_valid   = v[valid_mask]

    step     = 2
    pts_s    = pts_valid[::step]
    rgb_s    = image_bgr[v_valid[::step], u_valid[::step]][:, ::-1]

    scene_points = [
        [round(float(p[0]), 3), round(float(p[1]), 3), round(float(p[2]), 3)]
        for p in pts_s
    ]
    scene_point_colors = [[int(c[0]), int(c[1]), int(c[2])] for c in rgb_s]

    return img_lidar, img_boxes, serial_dets, scene_points, scene_point_colors, stats
