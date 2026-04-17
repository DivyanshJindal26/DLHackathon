"""
Visualization: annotated camera image + bird's-eye-view plot, both as base64 PNG.
"""
import base64
import io

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image, ImageDraw

IMG_W, IMG_H = 1242, 375

_STOPS = [
    (0,  (239, 68,  68)),
    (5,  (249, 115, 22)),
    (10, (245, 158, 11)),
    (20, (132, 204, 22)),
    (35, (34,  197, 94)),
]

CLASS_COLORS_PIL = {
    "Car":        (96,  165, 250),
    "Pedestrian": (52,  211, 153),
    "Cyclist":    (251, 191, 36),
    "Van":        (167, 139, 250),
    "Truck":      (244, 114, 182),
}

# Corner index pairs for all 12 edges of a cuboid
# Corners: 0-3 = front face, 4-7 = back face
_FRONT_EDGES = [(0, 1), (1, 2), (2, 3), (3, 0)]
_BACK_EDGES  = [(4, 5), (5, 6), (6, 7), (7, 4)]
_SIDE_EDGES  = [(0, 4), (1, 5), (2, 6), (3, 7)]


def _distance_to_rgb(dist_m: float) -> tuple:
    d = max(0.0, float(dist_m))
    for i in range(len(_STOPS) - 1):
        lo_d, lo_c = _STOPS[i]
        hi_d, hi_c = _STOPS[i + 1]
        if d <= hi_d:
            t = (d - lo_d) / (hi_d - lo_d)
            return tuple(int(lo_c[j] + (hi_c[j] - lo_c[j]) * t) for j in range(3))
    return _STOPS[-1][1]


def _class_color(cls: str) -> tuple:
    return CLASS_COLORS_PIL.get(cls, (148, 163, 184))


def _fig_to_base64(fig) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=120, facecolor="#020617")
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode()


# ── 3-D box projection helpers ─────────────────────────────────────────────

def box3d_corners_cam(box_3d: list) -> np.ndarray:
    """
    Compute 8 corners of the 3-D box in camera frame (x=right, y=down, z=fwd).
    box_3d: [cx, cy, cz, w, h, l, yaw]  — yaw rotates around Y axis.

    Corner ordering:
        0: right-bottom-front  1: left-bottom-front
        2: left-top-front      3: right-top-front
        4: right-bottom-back   5: left-bottom-back
        6: left-top-back       7: right-top-back
    """
    cx, cy, cz, w, h, l, yaw = box_3d
    hw, hh, hl = w / 2.0, h / 2.0, l / 2.0

    local = np.array([
        [ hw,  hh,  hl],
        [-hw,  hh,  hl],
        [-hw, -hh,  hl],
        [ hw, -hh,  hl],
        [ hw,  hh, -hl],
        [-hw,  hh, -hl],
        [-hw, -hh, -hl],
        [ hw, -hh, -hl],
    ], dtype=np.float64)

    cy_, sy_ = np.cos(yaw), np.sin(yaw)
    R = np.array([
        [ cy_, 0, sy_],
        [   0, 1,   0],
        [-sy_, 0, cy_],
    ], dtype=np.float64)

    return local @ R.T + np.array([cx, cy, cz], dtype=np.float64)


def project_box3d(box_3d: list, P2: np.ndarray) -> np.ndarray | None:
    """
    Project 3-D box to image plane.
    Returns (8, 2) float array of (u, v) pixel coords, or None if any corner
    is behind the camera (depth ≤ 0).
    """
    corners = box3d_corners_cam(box_3d)          # (8, 3)
    hom = np.hstack([corners, np.ones((8, 1))])  # (8, 4)
    proj = (P2 @ hom.T)                          # (3, 8)
    depth = proj[2]
    if (depth <= 0.1).any():
        return None
    pts = np.stack([proj[0] / depth, proj[1] / depth], axis=1)
    return pts  # (8, 2)


def _draw_box3d_pil(draw: ImageDraw.Draw, pts2d: np.ndarray, color: tuple,
                    front_w: int = 2, back_w: int = 1) -> None:
    """Draw 12-edge wireframe on a PIL ImageDraw context."""
    def pt(i):
        return (int(round(pts2d[i, 0])), int(round(pts2d[i, 1])))

    for i, j in _FRONT_EDGES:
        draw.line([pt(i), pt(j)], fill=color, width=front_w)
    for i, j in _BACK_EDGES:
        draw.line([pt(i), pt(j)], fill=color, width=back_w)
    for i, j in _SIDE_EDGES:
        draw.line([pt(i), pt(j)], fill=color, width=back_w)


def annotate_image(image: np.ndarray, detections: list[dict], calib: dict,
                   ground_truth: list[dict] | None = None) -> str:
    """
    Draw 3-D bounding box wireframes on the camera image.
    Falls back to a 2-D rectangle if 3-D projection fails (corner behind camera).
    GT boxes are drawn as dashed white 2-D outlines.
    Returns base64 PNG.
    """
    P2 = calib.get("P2")
    img  = Image.fromarray(image.astype(np.uint8), "RGB")
    draw = ImageDraw.Draw(img)

    # GT boxes (dashed 2-D rectangles)
    if ground_truth:
        for gt in ground_truth:
            x1, y1, x2, y2 = gt["bbox_2d"]
            dash, gap = 8, 4
            for x in range(x1, x2, dash + gap):
                draw.line([(x, y1), (min(x + dash, x2), y1)], fill=(255, 255, 255), width=2)
                draw.line([(x, y2), (min(x + dash, x2), y2)], fill=(255, 255, 255), width=2)
            for y in range(y1, y2, dash + gap):
                draw.line([(x1, y), (x1, min(y + dash, y2))], fill=(255, 255, 255), width=2)
                draw.line([(x2, y), (x2, min(y + dash, y2))], fill=(255, 255, 255), width=2)
            gt_label = f"GT:{gt['class']} {gt.get('distance_m', 0):.1f}m"
            tw = draw.textlength(gt_label)
            draw.rectangle([x1, y2 + 1, x1 + tw + 6, y2 + 16], fill=(60, 60, 60))
            draw.text((x1 + 3, y2 + 2), gt_label, fill=(220, 220, 220))

    # Prediction 3-D wireframes
    for det in detections:
        dist  = det.get("distance_m", 0.0)
        color = _distance_to_rgb(dist)
        box3d = det.get("box_3d")
        drawn_3d = False

        if box3d and len(box3d) == 7 and P2 is not None:
            pts2d = project_box3d(box3d, P2)
            if pts2d is not None:
                _draw_box3d_pil(draw, pts2d, color, front_w=2, back_w=1)
                drawn_3d = True

        if not drawn_3d:
            # Fallback: 2-D rectangle from bbox_2d
            x1, y1, x2, y2 = det["bbox_2d"]
            draw.rectangle([x1, y1, x2, y2], outline=color, width=2)

        # Label — anchor to top of the front-face or bbox
        if drawn_3d and pts2d is not None:
            label_x = int(min(pts2d[:4, 0]))
            label_y = int(min(pts2d[:4, 1])) - 16
        else:
            x1, y1, _, _ = det["bbox_2d"]
            label_x, label_y = x1, max(y1 - 16, 0)

        label = f"{det['class']} {dist:.1f}m"
        tw    = draw.textlength(label)
        label_y = max(label_y, 0)
        draw.rectangle([label_x, label_y, label_x + tw + 6, label_y + 15], fill=(*color, 220))
        draw.text((label_x + 3, label_y + 2), label, fill=(10, 10, 10))

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def generate_bev(points: np.ndarray, detections: list[dict]) -> str:
    """Bird's-eye-view scatter + oriented box footprints. Returns base64 PNG."""
    rng = np.random.default_rng(0)

    fig, ax = plt.subplots(figsize=(6, 6), facecolor="#020617")
    ax.set_facecolor("#020617")
    ax.set_xlim(-25, 25)
    ax.set_ylim(-5, 50)
    ax.set_aspect("equal")

    n_show = min(len(points), 10_000)
    idx    = rng.choice(len(points), n_show, replace=False)
    sub    = points[idx]
    ax.scatter(-sub[:, 1], sub[:, 0], c=sub[:, 3], cmap="Blues",
               s=0.3, alpha=0.4, vmin=0, vmax=1)

    ring_data = [(10, "#ef4444"), (20, "#f97316"), (30, "#84cc16"), (40, "#22c55e")]
    theta = np.linspace(0, 2 * np.pi, 360)
    for r, c in ring_data:
        ax.plot(r * np.sin(theta), r * np.cos(theta), color=c, lw=0.6, ls="--", alpha=0.5)
        ax.text(0.5, r + 0.5, f"{r}m", color=c, fontsize=6, alpha=0.7,
                ha="center", fontfamily="monospace")

    ax.scatter([0], [0], marker="s", s=60, color="#3b82f6",
               edgecolors="#60a5fa", linewidths=1.5, zorder=5)

    for det in detections:
        xyz = det.get("xyz", [0, 0, 0])
        cx, cy, cz = xyz[0], xyz[1], xyz[2]
        col = [c / 255 for c in _class_color(det["class"])]

        box = det.get("box_3d")
        if box and len(box) == 7:
            bx, _, bz, bw, _, bl, yaw = box
            cos_y, sin_y = np.cos(yaw), np.sin(yaw)
            hw, hl = bw / 2, bl / 2
            # Footprint corners in camera XZ plane (= BEV XY)
            local = np.array([[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl], [-hw, -hl]])
            rx = local[:, 0] * cos_y + local[:, 1] * sin_y + bx
            rz = -local[:, 0] * sin_y + local[:, 1] * cos_y + bz
            ax.plot(rx, rz, color=col, lw=1.2, alpha=0.85)
            # Front face highlight
            ax.plot(rx[:2], rz[:2], color=col, lw=2.0, alpha=1.0)

        ax.scatter([cx], [cz], color=col, s=18, zorder=4,
                   edgecolors="black", linewidths=0.4)

    for spine in ax.spines.values():
        spine.set_edgecolor("#334155")
    ax.tick_params(colors="#475569", labelsize=6)
    ax.set_xlabel("X (m)", color="#64748b", fontsize=7)
    ax.set_ylabel("Z forward (m)", color="#64748b", fontsize=7)
    ax.grid(True, color="#1e293b", lw=0.5, alpha=0.6)
    fig.tight_layout(pad=0.4)

    return _fig_to_base64(fig)
