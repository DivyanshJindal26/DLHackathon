"""
KITTI calibration matrix parsing and LiDAR → image projection.
"""
import numpy as np


def parse_calib(calib_dict: dict) -> dict:
    """
    Convert raw KITTI calib string dict into numpy matrices.

    Returns:
        P2:              (3, 4) projection matrix
        R0_rect:         (4, 4) rectification rotation (extended)
        Tr_velo_to_cam:  (4, 4) velodyne-to-camera transform (extended)
    """
    P2 = np.array([float(x) for x in calib_dict["P2"].split()], dtype=np.float64).reshape(3, 4)

    R0 = np.array([float(x) for x in calib_dict["R0_rect"].split()], dtype=np.float64).reshape(3, 3)
    R0_rect = np.eye(4, dtype=np.float64)
    R0_rect[:3, :3] = R0

    Tr = np.array([float(x) for x in calib_dict["Tr_velo_to_cam"].split()], dtype=np.float64).reshape(3, 4)
    Tr_velo_to_cam = np.vstack([Tr, [0.0, 0.0, 0.0, 1.0]])

    return {"P2": P2, "R0_rect": R0_rect, "Tr_velo_to_cam": Tr_velo_to_cam}


def project_points_to_image(
    points: np.ndarray,
    calib: dict,
    img_shape: tuple,
) -> np.ndarray:
    """
    Project ALL LiDAR points to image plane without filtering.

    Returns (N, 3) array of [u, v, depth].
    Points behind the camera have depth <= 0.
    """
    P2 = calib["P2"]
    R0 = calib["R0_rect"]
    Tr = calib["Tr_velo_to_cam"]

    n = len(points)
    pts = points[:, :3].astype(np.float64)
    pts_hom = np.hstack([pts, np.ones((n, 1))])  # (N, 4)

    pts_cam = (Tr @ pts_hom.T)    # (4, N)
    pts_rect = (R0 @ pts_cam)     # (4, N)
    pts_img = (P2 @ pts_rect)     # (3, N)

    depth = pts_img[2, :]
    with np.errstate(invalid="ignore", divide="ignore"):
        u = np.where(depth > 0, pts_img[0, :] / depth, -1.0)
        v = np.where(depth > 0, pts_img[1, :] / depth, -1.0)

    return np.stack([u, v, depth], axis=1)  # (N, 3)


def project_lidar_to_image(
    points: np.ndarray,
    calib: dict,
    img_shape: tuple,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Project LiDAR points to image plane, returning only valid points.

    Returns (u, v, depth) arrays filtered to points inside the image with depth > 0.
    """
    H, W = img_shape[:2]
    uvd = project_points_to_image(points, calib, img_shape)
    u, v, depth = uvd[:, 0], uvd[:, 1], uvd[:, 2]
    mask = (depth > 0) & (u >= 0) & (u < W) & (v >= 0) & (v < H)
    return u[mask], v[mask], depth[mask]
