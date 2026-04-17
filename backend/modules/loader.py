"""
KITTI scene loader — converts raw file bytes into numpy arrays.
"""
import io

import numpy as np
from PIL import Image


def parse_calib_text(text: str) -> dict:
    """
    Parse KITTI calibration file text.
    Returns dict keyed by field name (P2, R0_rect, Tr_velo_to_cam, etc.)
    with space-separated float strings as values.
    """
    calib = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        calib[key.strip()] = val.strip()
    return calib


def load_scene(bin_bytes: bytes, img_bytes: bytes, calib_bytes: bytes) -> dict:
    """
    Parse raw KITTI file bytes into usable numpy arrays.

    Returns:
        points: (N, 4) float32 — x, y, z, intensity
        image:  (H, W, 3) uint8 — RGB
        calib:  dict of raw string values keyed by KITTI field name
    """
    points = np.frombuffer(bin_bytes, dtype=np.float32).reshape(-1, 4)
    image = np.array(Image.open(io.BytesIO(img_bytes)).convert("RGB"), dtype=np.uint8)
    calib_text = calib_bytes.decode("utf-8", errors="replace")
    calib = parse_calib_text(calib_text)
    return {"points": points, "image": image, "calib": calib}
