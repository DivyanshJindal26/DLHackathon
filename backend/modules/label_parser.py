"""
Parse KITTI ground-truth label files into the same detection format
the rest of the pipeline expects — bypasses YOLOv8 entirely.

KITTI label format (space-separated per line):
  type trunc occ alpha  left top right bottom  height width length  x y z  rot_y
"""


def parse_label_file(label_bytes: bytes) -> list[dict]:
    """
    Parse a KITTI label .txt file and return a list of detections.
    Output format matches what fuse() and visualizer expect:
      { class, confidence, bbox_2d, distance_m, xyz, box_3d }
    """
    detections = []
    text = label_bytes.decode("utf-8", errors="ignore")

    for line in text.strip().splitlines():
        parts = line.strip().split()
        if len(parts) < 15:
            continue

        obj_type = parts[0]
        if obj_type == "DontCare":
            continue

        truncated = float(parts[1])
        occluded  = int(parts[2])

        left   = float(parts[4])
        top    = float(parts[5])
        right  = float(parts[6])
        bottom = float(parts[7])

        height = float(parts[8])
        width  = float(parts[9])
        length = float(parts[10])

        x     = float(parts[11])   # lateral (camera frame)
        y     = float(parts[12])   # vertical (camera frame, positive down)
        z     = float(parts[13])   # forward distance

        rot_y = float(parts[14])

        # Confidence: GT labels get 1.0 minus a small penalty for truncation/occlusion
        confidence = round(1.0 - 0.1 * truncated - 0.1 * occluded, 2)

        detections.append({
            "class":      obj_type,
            "confidence": confidence,
            "bbox_2d":    [int(left), int(top), int(right), int(bottom)],
            "distance_m": round(z, 2),
            "xyz":        [round(x, 3), round(y, 3), round(z, 3)],
            "box_3d":     [round(x, 3), round(y, 3), round(z, 3),
                           round(width, 3), round(height, 3), round(length, 3),
                           round(rot_y, 4)],
        })

    return detections
