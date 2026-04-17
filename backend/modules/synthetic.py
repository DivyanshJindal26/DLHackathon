"""
Synthetic KITTI-format scene generator.
Produces bin_bytes, png_bytes, and calib_text without any real sensor data.

KITTI coordinate conventions:
  LiDAR frame:  x=forward, y=left,  z=up
  Camera frame: x=right,   y=down,  z=forward
  API xyz:      camera frame (z=forward) so BEVPlot.jsx renders correctly
"""
import io
import random
import base64

import numpy as np
from PIL import Image, ImageDraw

IMG_W, IMG_H = 1242, 375

CALIB_TEXT = """\
P2: 7.215377e+02 0.000000e+00 6.095593e+02 4.485728e+01 0.000000e+00 7.215377e+02 1.728540e+02 2.163791e-01 0.000000e+00 0.000000e+00 1.000000e+00 2.745884e-03
R0_rect: 9.999239e-01 9.837760e-03 -7.445048e-03 -9.869795e-03 9.999421e-01 -4.278459e-03 7.402527e-03 4.351614e-03 9.999631e-01
Tr_velo_to_cam: 7.533745e-03 -9.999714e-01 -6.166020e-04 -4.069766e-03 1.480249e-02 7.280733e-04 -9.998902e-01 -7.631618e-02 9.998621e-01 7.523790e-03 1.480755e-02 -2.717806e-01
"""

CLASSES = ["Car", "Car", "Car", "Pedestrian", "Pedestrian", "Cyclist", "Van", "Truck"]

CLASS_COLORS = {
    "Car":        (96,  165, 250),
    "Pedestrian": (52,  211, 153),
    "Cyclist":    (251, 191, 36),
    "Van":        (167, 139, 250),
    "Truck":      (244, 114, 182),
}


def _parse_calib_matrices():
    P2 = np.array([float(x) for x in
        "7.215377e+02 0.000000e+00 6.095593e+02 4.485728e+01 "
        "0.000000e+00 7.215377e+02 1.728540e+02 2.163791e-01 "
        "0.000000e+00 0.000000e+00 1.000000e+00 2.745884e-03".split()
    ], dtype=np.float64).reshape(3, 4)
    R0 = np.array([float(x) for x in
        "9.999239e-01 9.837760e-03 -7.445048e-03 "
        "-9.869795e-03 9.999421e-01 -4.278459e-03 "
        "7.402527e-03 4.351614e-03 9.999631e-01".split()
    ], dtype=np.float64).reshape(3, 3)
    R0_rect = np.eye(4); R0_rect[:3, :3] = R0
    Tr = np.array([float(x) for x in
        "7.533745e-03 -9.999714e-01 -6.166020e-04 -4.069766e-03 "
        "1.480249e-02 7.280733e-04 -9.998902e-01 -7.631618e-02 "
        "9.998621e-01 7.523790e-03 1.480755e-02 -2.717806e-01".split()
    ], dtype=np.float64).reshape(3, 4)
    Tr_velo_to_cam = np.vstack([Tr, [0, 0, 0, 1]])
    return P2, R0_rect, Tr_velo_to_cam


_P2, _R0, _Tr = _parse_calib_matrices()
_Tr_inv = np.linalg.inv(_Tr)
_R0_inv = np.linalg.inv(_R0)


def _cam_to_lidar(cx, cy, cz):
    """Transform camera-frame (x=right,y=down,z=fwd) to LiDAR frame (x=fwd,y=left,z=up)."""
    cam_pt = np.array([cx, cy, cz, 1.0])
    rect_pt = _R0_inv @ cam_pt
    lidar_pt = _Tr_inv @ rect_pt
    return float(lidar_pt[0]), float(lidar_pt[1]), float(lidar_pt[2])


def _project_lidar_to_image(lx, ly, lz):
    """Project a LiDAR (x=fwd,y=left,z=up) point to image (u,v,depth)."""
    pt = np.array([lx, ly, lz, 1.0])
    cam = _Tr @ pt
    rect = _R0 @ cam
    img = _P2 @ rect
    depth = float(img[2])
    if depth <= 0:
        return None
    return float(img[0] / depth), float(img[1] / depth), depth


def _project_box_to_bbox2d(lx, ly, lz, half_extents_lidar):
    """
    Project a LiDAR-frame box to image bbox.
    half_extents_lidar: (hx, hy, hz) in LiDAR frame (x=fwd, y=left, z=up).
    Returns [x1,y1,x2,y2] clamped to image, or None if not visible.
    """
    hx, hy, hz = half_extents_lidar
    corners = [
        (lx + dx, ly + dy, lz + dz)
        for dx in (-hx, hx)
        for dy in (-hy, hy)
        for dz in (-hz, hz)
    ]
    us, vs = [], []
    for (px, py, pz) in corners:
        res = _project_lidar_to_image(px, py, pz)
        if res is not None:
            us.append(res[0])
            vs.append(res[1])
    if not us:
        return None
    x1 = max(0, int(min(us)) - 4)
    y1 = max(0, int(min(vs)) - 4)
    x2 = min(IMG_W - 1, int(max(us)) + 4)
    y2 = min(IMG_H - 1, int(max(vs)) + 4)
    if x2 <= x1 or y2 <= y1:
        return None
    return [x1, y1, x2, y2]


def _color(cls: str):
    return CLASS_COLORS.get(cls, (148, 163, 184))


def _build_objects(rng: random.Random, n: int) -> list[dict]:
    """
    Generate synthetic objects with positions in both LiDAR and camera frame.
    Bboxes are computed via real projection so frustum fusion can match them.
    """
    objects = []
    attempts = 0
    while len(objects) < n and attempts < n * 8:
        attempts += 1
        cls = rng.choice(CLASSES)

        # Camera-frame position: cx=lateral, cy=height, cz=forward
        cz = round(rng.uniform(8, 40), 1)       # forward distance (keep ≥8m to avoid huge bboxes)
        # Constrain lateral range so object stays fully in camera FoV
        max_cx = min(8.0, cz * 0.4)
        cx = round(rng.uniform(-max_cx, max_cx), 2)
        cy = round(rng.uniform(0.5, 2.0), 2)    # below camera center (y=down)

        conf = round(rng.uniform(0.55, 0.99), 2)

        # Box dims in camera frame
        if cls in ("Car", "Van", "Truck"):
            cam_hw, cam_hh, cam_hd = 1.0, 0.75, 2.2   # half-width, half-height, half-depth
        elif cls == "Cyclist":
            cam_hw, cam_hh, cam_hd = 0.5, 0.9, 0.9
        else:
            cam_hw, cam_hh, cam_hd = 0.4, 0.9, 0.4

        # Transform center to LiDAR frame for point cloud generation
        lx, ly, lz = _cam_to_lidar(cx, cy, cz)

        # Project box corners to image — use LiDAR frame half extents
        # (swap axes: cam x≈lidar y, cam y≈lidar -z, cam z≈lidar x)
        hl_fwd = cam_hd    # cam z → lidar x (forward)
        hl_lat = cam_hw    # cam x → lidar y (left)
        hl_up  = cam_hh    # cam y (down) → lidar -z (up) → symmetric ok
        bbox_2d = _project_box_to_bbox2d(lx, ly, lz, (hl_fwd, hl_lat, hl_up))
        if bbox_2d is None:
            continue

        bw = round(cam_hw * 2 + rng.uniform(0, 0.2), 2)
        bh = round(cam_hh * 2 + rng.uniform(0, 0.2), 2)
        bl = round(cam_hd * 2 + rng.uniform(0, 0.4), 2)
        yaw = round(rng.uniform(-0.3, 0.3), 3)

        objects.append({
            "class":      cls,
            "confidence": conf,
            "distance_m": cz,
            "bbox_2d":    bbox_2d,
            "xyz":        [cx, cy, cz],      # camera frame for API/BEV
            "xyz_lidar":  [lx, ly, lz],      # LiDAR frame for point cloud
            "box_3d":     [cx, cy, cz, bw, bh, bl, yaw],
        })

    objects.sort(key=lambda d: d["distance_m"])
    return objects


def get_synthetic_detections(seed: int = 42, n: int = 6) -> list[dict]:
    """Pre-computed 2D detections with projected bboxes (detector fallback)."""
    rng = random.Random(seed)
    objs = _build_objects(rng, n)
    return [
        {
            "class":      o["class"],
            "confidence": o["confidence"],
            "bbox_2d":    o["bbox_2d"],
        }
        for o in objs
    ]


def _make_point_cloud(objects: list[dict], seed: int) -> bytes:
    rng = np.random.default_rng(seed)

    # Ground plane in LiDAR frame (x=fwd, y=left, z=up)
    n_ground = 80_000
    gx = rng.uniform(2, 50, n_ground).astype(np.float32)    # forward
    gy = rng.uniform(-15, 15, n_ground).astype(np.float32)  # lateral
    gz = np.full(n_ground, -1.65, dtype=np.float32)          # ground level (sensor ~1.65m above)
    gi = rng.uniform(0.05, 0.3, n_ground).astype(np.float32)
    ground = np.stack([gx, gy, gz, gi], axis=1)

    clusters = [ground]
    for obj in objects:
        lx, ly, lz = obj["xyz_lidar"]
        n_pts = 300
        px = rng.normal(lx, 0.4, n_pts).astype(np.float32)
        py = rng.normal(ly, 0.3, n_pts).astype(np.float32)
        pz = rng.normal(lz, 0.2, n_pts).astype(np.float32)
        pi = rng.uniform(0.4, 0.9, n_pts).astype(np.float32)
        clusters.append(np.stack([px, py, pz, pi], axis=1))

    points = np.concatenate(clusters, axis=0)
    return points.astype(np.float32).tobytes()


def _make_image(objects: list[dict]) -> bytes:
    img = Image.new("RGB", (IMG_W, IMG_H), color=(30, 30, 40))
    draw = ImageDraw.Draw(img)

    for y in range(IMG_H // 2):
        t = y / (IMG_H // 2)
        draw.line([(0, y), (IMG_W, y)], fill=(int(15+30*t), int(15+35*t), int(25+50*t)))

    road_top = IMG_H // 2
    for y in range(road_top, IMG_H):
        t = (y - road_top) / (IMG_H - road_top)
        shade = int(45 + 20 * t)
        draw.line([(0, y), (IMG_W, y)], fill=(shade, shade, shade - 5))

    for x in range(0, IMG_W, 80):
        draw.rectangle([x, IMG_H * 2 // 3, x + 40, IMG_H * 2 // 3 + 4], fill=(220, 220, 180))

    draw.line([(0, road_top), (IMG_W, road_top)], fill=(60, 65, 80), width=1)

    for obj in objects:
        x1, y1, x2, y2 = obj["bbox_2d"]
        color = _color(obj["class"])
        alpha_fill = Image.new("RGBA", img.size, (0, 0, 0, 0))
        fill_draw = ImageDraw.Draw(alpha_fill)
        fill_draw.rectangle([x1, y1, x2, y2], fill=(*color, 40))
        img = img.convert("RGBA")
        img = Image.alpha_composite(img, alpha_fill)
        img = img.convert("RGB")
        draw = ImageDraw.Draw(img)
        draw.rectangle([x1, y1, x2, y2], outline=color, width=2)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def generate_synthetic_scene(num_objects: int = 6, seed: int = 42) -> tuple[bytes, bytes, str]:
    """
    Returns (bin_bytes, png_bytes, calib_text) for a synthetic driving scene.
    Formats match KITTI conventions; bboxes are geometrically consistent with LiDAR clusters.
    """
    rng = random.Random(seed)
    objects = _build_objects(rng, num_objects)
    bin_bytes = _make_point_cloud(objects, seed)
    png_bytes = _make_image(objects)
    return bin_bytes, png_bytes, CALIB_TEXT
