"""
Frustum-based LiDAR-camera fusion (Approach A — CPU baseline).
Projects all points once, then crops per-bbox to estimate 3D position.
Returns xyz in camera frame (x=right, y=down, z=forward) to match API/BEV convention.
"""
import numpy as np

from modules.calibration import project_points_to_image


def _lidar_to_cam_xyz(points_lidar: np.ndarray, calib: dict) -> np.ndarray:
    """Transform (M,4) LiDAR points to camera-frame (M,3) xyz."""
    Tr = calib["Tr_velo_to_cam"]
    R0 = calib["R0_rect"]
    pts = points_lidar[:, :3].astype(np.float64)
    hom = np.hstack([pts, np.ones((len(pts), 1))])
    cam = (R0 @ (Tr @ hom.T))[:3, :]  # (3, M)
    return cam.T  # (M, 3): x=right, y=down, z=fwd


def _frustum_points(
    projected: np.ndarray,
    points: np.ndarray,
    bbox: list,
    depth_min: float = 0.5,
    depth_max: float = 70.0,
) -> np.ndarray:
    """Return subset of points whose image projection falls inside bbox.
    Excludes ground plane points (LiDAR z < -1.0, i.e. below ego height).
    """
    x1, y1, x2, y2 = bbox
    u, v, depth = projected[:, 0], projected[:, 1], projected[:, 2]
    # LiDAR frame: z=up, ground is at z ≈ -1.65m; keep only above-ground points
    lidar_z = points[:, 2]
    mask = (
        (depth >= depth_min) & (depth <= depth_max)
        & (u >= x1) & (u <= x2)
        & (v >= y1) & (v <= y2)
        & (lidar_z > -1.0)   # exclude ground plane
    )
    return points[mask]


def fuse(
    detections_2d: list[dict],
    points: np.ndarray,
    calib: dict,
    img_shape: tuple,
) -> list[dict]:
    """
    Enrich 2D detections with 3D position and bounding box via frustum cropping.

    xyz and box_3d are in camera frame: x=right, y=down, z=forward.
    box_3d format: [cx, cy, cz, w, h, l, yaw] — flat 7-element list.
    """
    projected = project_points_to_image(points, calib, img_shape)  # (N, 3)

    result = []
    for det in detections_2d:
        x1, y1, x2, y2 = det["bbox_2d"]
        cluster_lidar = _frustum_points(projected, points, det["bbox_2d"])

        if len(cluster_lidar) < 3:
            # Heuristic: distance from apparent bbox height
            bbox_h = max(y2 - y1, 1)
            est_dist = round(max(2.0, 500.0 / bbox_h), 2)
            xyz = [0.0, 1.0, est_dist]
            box_3d = [0.0, 1.0, est_dist, 2.0, 1.5, 4.0, 0.0]
        else:
            # Transform cluster to camera frame for consistent xyz output
            cam_pts = _lidar_to_cam_xyz(cluster_lidar, calib)  # (M, 3)
            median_cam = np.median(cam_pts, axis=0)
            # Filter outliers using MAD on the depth axis (z = forward in camera frame).
            # MAD is robust when multiple objects contaminate the frustum.
            depth_vals = cam_pts[:, 2]
            mad_z = np.median(np.abs(depth_vals - median_cam[2])) + 0.01
            depth_mask = np.abs(depth_vals - median_cam[2]) <= max(3.0 * mad_z, 2.0)
            if depth_mask.sum() >= 3:
                cam_pts = cam_pts[depth_mask]
                median_cam = np.median(cam_pts, axis=0)
            min_cam = cam_pts.min(axis=0)
            max_cam = cam_pts.max(axis=0)
            dims = np.maximum(max_cam - min_cam, 0.3)
            center_cam = (min_cam + max_cam) / 2.0

            # xyz uses median (robust to outliers); distance_m matches xyz[2]
            xyz = [round(float(median_cam[i]), 2) for i in range(3)]
            est_dist = xyz[2]
            box_3d = [
                round(float(center_cam[0]), 3),
                round(float(center_cam[1]), 3),
                round(float(center_cam[2]), 3),
                round(float(dims[0]), 3),
                round(float(dims[1]), 3),
                round(float(dims[2]), 3),
                0.0,
            ]

        result.append({
            "class":      det["class"],
            "confidence": det["confidence"],
            "bbox_2d":    det["bbox_2d"],
            "distance_m": max(est_dist, 0.1),
            "xyz":        xyz,
            "box_3d":     box_3d,
        })

    result.sort(key=lambda d: d["distance_m"])
    return result
