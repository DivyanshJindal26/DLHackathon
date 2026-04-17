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

# Distance color stops — matches frontend colorScale.js exactly
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


def annotate_image(image: np.ndarray, detections: list[dict], calib: dict,
                   ground_truth: list[dict] | None = None) -> str:
    """
    Draw distance-colored prediction bboxes on the camera image.
    If ground_truth provided, also draws GT boxes as dashed white outlines.
    Returns base64 PNG.
    """
    img = Image.fromarray(image.astype(np.uint8), "RGB")
    draw = ImageDraw.Draw(img)

    # Draw GT boxes first (underneath predictions)
    if ground_truth:
        for gt in ground_truth:
            x1, y1, x2, y2 = gt["bbox_2d"]
            # Dashed white rectangle — PIL doesn't support dash natively, draw segments
            dash, gap = 8, 4
            for x in range(x1, x2, dash + gap):
                draw.line([(x, y1), (min(x + dash, x2), y1)], fill=(255,255,255), width=2)
                draw.line([(x, y2), (min(x + dash, x2), y2)], fill=(255,255,255), width=2)
            for y in range(y1, y2, dash + gap):
                draw.line([(x1, y), (x1, min(y + dash, y2))], fill=(255,255,255), width=2)
                draw.line([(x2, y), (x2, min(y + dash, y2))], fill=(255,255,255), width=2)
            # GT label (bottom of box)
            gt_label = f"GT:{gt['class']} {gt.get('distance_m', 0):.1f}m"
            tw = draw.textlength(gt_label)
            draw.rectangle([x1, y2 + 1, x1 + tw + 6, y2 + 16], fill=(60, 60, 60, 200))
            draw.text((x1 + 3, y2 + 2), gt_label, fill=(220, 220, 220))

    # Draw prediction boxes
    for det in detections:
        x1, y1, x2, y2 = det["bbox_2d"]
        dist  = det.get("distance_m", 0.0)
        color = _distance_to_rgb(dist)

        alpha_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        fill_draw   = ImageDraw.Draw(alpha_layer)
        fill_draw.rectangle([x1, y1, x2, y2], fill=(*color, 35))
        img   = img.convert("RGBA")
        img   = Image.alpha_composite(img, alpha_layer)
        img   = img.convert("RGB")
        draw  = ImageDraw.Draw(img)

        draw.rectangle([x1, y1, x2, y2], outline=color, width=2)
        label = f"{det['class']} {dist:.1f}m"
        lx, ly = x1, max(y1 - 16, 0)
        tw = draw.textlength(label)
        draw.rectangle([lx, ly, lx + tw + 6, ly + 15], fill=(*color, 220))
        draw.text((lx + 3, ly + 2), label, fill=(10, 10, 10))

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def generate_bev(points: np.ndarray, detections: list[dict]) -> str:
    """Bird's-eye-view scatter plot of point cloud + detection boxes. Returns raw base64 PNG."""
    rng = np.random.default_rng(0)

    fig, ax = plt.subplots(figsize=(6, 6), facecolor="#020617")
    ax.set_facecolor("#020617")
    ax.set_xlim(-25, 25)
    ax.set_ylim(-5, 50)
    ax.set_aspect("equal")

    # Ground point cloud (subsample for speed)
    # KITTI LiDAR frame: X=forward, Y=left, Z=up
    # BEV convention (matches camera-frame xyz in detections): x=right, y=forward
    # So: bev_x = -LiDAR_Y (negate because LiDAR Y is left), bev_y = LiDAR_X
    n_show = min(len(points), 10_000)
    idx = rng.choice(len(points), n_show, replace=False)
    sub = points[idx]
    ax.scatter(-sub[:, 1], sub[:, 0], c=sub[:, 3], cmap="Blues",
               s=0.3, alpha=0.4, vmin=0, vmax=1)

    # Distance rings
    ring_data = [(10, "#ef4444"), (20, "#f97316"), (30, "#84cc16"), (40, "#22c55e")]
    theta = np.linspace(0, 2 * np.pi, 360)
    for r, c in ring_data:
        ax.plot(r * np.sin(theta), r * np.cos(theta), color=c, lw=0.6, ls="--", alpha=0.5)
        ax.text(0.5, r + 0.5, f"{r}m", color=c, fontsize=6, alpha=0.7,
                ha="center", fontfamily="monospace")

    # Ego vehicle
    ax.scatter([0], [0], marker="s", s=60, color="#3b82f6",
               edgecolors="#60a5fa", linewidths=1.5, zorder=5)

    # Detections
    for det in detections:
        xyz = det.get("xyz", [0, 0, 0])
        cx, cy, cz = xyz[0], xyz[1], xyz[2]
        col = [c / 255 for c in _class_color(det["class"])]

        box = det.get("box_3d")
        if box and len(box) == 7:
            bx, _, bz, bw, _, bl, yaw = box
            cos_y, sin_y = np.cos(yaw), np.sin(yaw)
            hw, hl = bw / 2, bl / 2
            corners = np.array([[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl], [-hw, -hl]])
            rx = corners[:, 0] * cos_y - corners[:, 1] * sin_y + bx
            rz = corners[:, 0] * sin_y + corners[:, 1] * cos_y + bz
            ax.plot(rx, rz, color=col, lw=1.2, alpha=0.85)

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
