# LiDAR + Camera Fusion for 3D Perception

A full-stack system that fuses Velodyne LiDAR point clouds with RGB camera frames to produce 3D object detections, distance estimates, and bird's-eye view visualisations in real time. Built for the DL Hackathon PS5 on the KITTI dataset.

---

## What this does

Most autonomous vehicle perception systems treat LiDAR and camera as separate inputs. This project fuses them using a three-tier hybrid pipeline so that each modality compensates for the other's weaknesses.

The camera branch runs YOLOv8 to detect objects in the 2D image. The LiDAR branch runs PointPillars to produce raw 3D bounding box candidates from the point cloud. The fusion layer then decides which source to trust for each detection:

- **Tier 1 — IoM native corner fusion.** For each PointPillars box that projects cleanly onto a YOLOv8 box (measured by Intersection over Minimum area, so partially-visible objects still match), the two are merged into a single high-confidence detection. The "center-inside" check catches occluded cases where the 3D box centroid falls inside the 2D detection even when the projected corners don't overlap well.

- **Tier 2 — YOLO-gated PP fallback.** PointPillars boxes that passed a minimum confidence threshold but didn't find a strong IoM match are still kept if any YOLO box is nearby enough (IoU check), preventing high-quality 3D detections from being discarded just because the camera view was ambiguous.

- **Tier 3 — DBSCAN + OBB fallback.** YOLO detections that never got a PointPillars match go through a frustum crop of the point cloud, DBSCAN clustering, and an oriented bounding box fit via PCA. This gives a coarser 3D estimate but ensures nothing visible to the camera is dropped entirely.

After all three tiers, a global 3D NMS pass removes cross-tier duplicates by center distance, and the final detection list is returned with a confidence tier label on each object (HIGH / MED / LOW).

---

## Architecture

```
.bin (Velodyne) + .png (camera) + calib.txt
        |
  ┌─────┴──────┐
  |            |
loader      loader
  |            |
Point       YOLOv8l         <-- detector.py
Cloud       2D boxes
  |            |
  └─────┬──────┘
        |
  PointPillars              <-- pointpillars.py
  3D box candidates
        |
  Hybrid fusion             <-- fusion_pp.py
  (Tier1 / Tier2 / Tier3)
        |
  Global 3D NMS
        |
  ┌─────┬──────┬─────┐
  |     |      |     |
JSON  BEV   Annot.  3D
dets  img   image  pts
        |
  FastAPI server            <-- server.py  :8000
        |
  React frontend            <-- /frontend  :5173
```

---

## Repository layout

```
.
├── backend/
│   ├── modules/
│   │   ├── loader.py           load .bin + .png + calib; return numpy arrays
│   │   ├── calibration.py      parse P2, R0_rect, Tr_velo_to_cam; project LiDAR -> image
│   │   ├── detector.py         YOLOv8l wrapper (ultralytics)
│   │   ├── fusion_pp.py        3-tier hybrid fusion + global NMS
│   │   ├── pointpillars.py     PointPillars inference via OpenPCDet
│   │   ├── visualizer.py       annotated image + white-background BEV (base64 PNG)
│   │   ├── bulk.py             ZIP dataset processor with SSE streaming
│   │   ├── synthetic.py        generates a synthetic KITTI-format scene for demo
│   │   ├── chroma_store.py     ChromaDB scene storage for chat context
│   │   ├── label_parser.py     parse KITTI ground-truth label files
│   │   └── metrics.py          precision/recall/IoU against ground truth
│   ├── chat_router.py          /chat endpoint; proxies to OpenRouter; runs tool-use loop
│   ├── server.py               FastAPI app; all endpoints
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── App.jsx
│       ├── store/
│       │   └── appStore.js     Zustand global state
│       ├── api/
│       │   └── inferApi.js     fetch wrappers; SSE stream reader for bulk
│       ├── hooks/
│       │   └── useChatbot.js   chatbot logic; builds scene context for LLM
│       └── components/
│           ├── layout/         Header
│           ├── upload/         UploadPanel, BulkUploadPanel
│           ├── tabs/           CameraTab, LidarBevTab, Scene3DTab, MetricsTab
│           ├── timeline/       FrameScrubber (bulk time-series scrubbing)
│           ├── bulk/           BulkResultsGallery
│           ├── chatbot/        ChatPanel, MessageBubble
│           └── DetectionSidebar.jsx
├── OpenPCDet/                  OpenPCDet submodule (PointPillars weights + inference)
├── pointpillar_7728.pth        pretrained PointPillars checkpoint (KITTI)
├── single.py                   reference notebook: single-frame fusion
├── temporal.py                 reference notebook: raw KITTI temporal fusion
├── PIPELINE.md                 detailed design document
└── README.md
```

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/infer` | Single-frame inference. Multipart: `bin_file`, `image_file`, `calib_file`, optional `label_file`. |
| POST | `/infer-bulk` | ZIP dataset. Streams SSE events: `start`, `progress`, `encoding`, `done`. |
| POST | `/infer-scene/{id}` | Run inference on a scene stored under `KITTI_DATA_DIR`. |
| GET  | `/scenes` | List available scene directories. |
| POST | `/query` | Keyword filter over last-seen detections. |
| POST | `/chat` | Agentic chatbot; full tool-use loop via OpenRouter. |

### Single-frame response

```json
{
  "camera_image":   "<base64 PNG>",
  "lidar_image":    "<base64 PNG>",
  "lidar_bev":      "<base64 PNG>",
  "scene_points":   [[x, y, z], ...],
  "detections": [
    {
      "label":           "car",
      "score":           0.91,
      "confidence_tier": "HIGH",
      "distance_m":      14.2,
      "bbox_2d":         [120, 200, 340, 380],
      "center":          [14.1, 0.3, 0.8],
      "box_3d":          [x, y, z, l, w, h, yaw]
    }
  ],
  "pipeline_stats": {
    "yolo_n": 6,
    "pp_raw_n": 9,
    "tier1_fused_n": 4,
    "pp_gated_n": 2,
    "obb_n": 1,
    "final_n": 7
  },
  "inference_time_ms": 38.4,
  "num_points": 112540
}
```

### Bulk streaming

The `/infer-bulk` endpoint returns a `text/event-stream` response. Each line is a `data:` SSE event:

```
data: {"type": "start",    "total": 42}
data: {"type": "progress", "current": 1, "total": 42, "frame_id": "000000"}
data: {"type": "progress", "current": 2, "total": 42, "frame_id": "000001"}
...
data: {"type": "encoding"}
data: {"type": "done",     "frames": [...], "video_annotated_mp4": "...", "video_lidar_mp4": "...", "video_bev_mp4": "..."}
```

The frontend reads this stream incrementally and updates a progress bar in real time. Video fields are base64 H.264 MP4 encoded with ffmpeg (fallback: OpenCV avc1/mp4v).

---

## KITTI ZIP formats

Two ZIP structures are supported. The code auto-detects which one you're using.

**Object detection format** (per-frame calibration):

```
dataset.zip
└── [optional root folder]/
    ├── velodyne/
    │   ├── 000000.bin
    │   └── 000001.bin
    ├── image_2/
    │   ├── 000000.png
    │   └── 000001.png
    └── calib/
        ├── 000000.txt
        └── 000001.txt
```

**KITTI raw format** (date-level calibration):

```
dataset.zip
└── 2011_09_26/
    ├── calib_cam_to_cam.txt
    ├── calib_velo_to_cam.txt
    └── 2011_09_26_drive_0001_sync/
        ├── velodyne_points/data/
        │   ├── 0000000000.bin
        │   └── 0000000001.bin
        └── image_02/data/
            ├── 0000000000.png
            └── 0000000001.png
```

---

## AI chatbot

The chat panel is context-aware. What it knows depends on what you've loaded:

- **Single frame**: full pipeline stats, every detection with label, confidence tier, distance, 3D center, and fusion source.
- **Bulk time-series**: global class breakdown (count, avg/min/max distance across all frames), a compact per-frame summary, and full detail for whichever frame is currently selected on the timeline scrubber.
- **Bulk independent**: only the currently-viewed frame (treating frames as unrelated snapshots).

The backend proxies all LLM calls to OpenRouter so your API key never touches the browser. The model is configurable via `OPENROUTER_MODEL` in `.env`.

---

## Running locally

### Prerequisites

- Python 3.10+
- Node.js 18+
- ffmpeg on your PATH (for H.264 video encoding in bulk mode — optional but recommended)
- A GPU is helpful but not required; YOLOv8 and PointPillars will fall back to CPU

### 1. Clone the repo

```bash
git clone https://github.com/DivyanshJindal26/DLHackathon --recurse-submodules
cd DLHackathon
```

If you already cloned without `--recurse-submodules`:

```bash
git submodule update --init --recursive
```

### 2. Install OpenPCDet

PointPillars inference depends on OpenPCDet. Install it from the submodule:

```bash
cd OpenPCDet
pip install -r requirements.txt
python setup.py develop
cd ..
```

### 3. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

pip install -r requirements.txt
```

Copy the example env file and fill in your OpenRouter key:

```bash
cp .env.example .env
```

`.env` contents:

```
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=x-ai/grok-3-mini-beta
APP_URL=http://localhost:5173
FRONTEND_URL=http://localhost:5173
KITTI_DATA_DIR=data/kitti
```

Make sure `pointpillar_7728.pth` is in the project root (it should already be there if you cloned the repo). Then start the server:

```bash
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

The Vite dev server proxies `/api/*` to `http://localhost:8000` so no CORS config is needed during development.

### 5. Using the app

**Single frame**: upload a `.bin`, `.png`, and `calib.txt` from any KITTI scene using the left sidebar. Hit Run. Results appear across the Camera, LiDAR, 3D Scene, and Metrics tabs.

**Bulk dataset**: switch to the Dataset tab, drop a KITTI ZIP (either format described above), pick Time Series or Independent mode, and hit Process Dataset. A progress bar tracks each frame as it processes. After completion you get a frame gallery and, in time-series mode, three playable MP4 videos: annotated camera, LiDAR overlay, and bird's-eye view.

**Chat**: the chat panel in the bottom-right is always available. It has full context about whatever is currently loaded.

---

## Calibration projection chain

```
LiDAR point (x, y, z, 1)
    -> Tr_velo_to_cam   (4x4, LiDAR to camera coordinates)
    -> R0_rect          (4x4, rectification rotation)
    -> P2               (3x4, intrinsic projection for camera 2)
    -> (u, v, depth)    (pixel coordinates + depth)
```

Both KITTI formats are normalised to the same internal dict (`P2`, `R0_rect`, `Tr_velo_to_cam`) before entering the pipeline. The raw format's `P_rect_02`, `R_rect_00`, and `R`/`T` fields are mapped automatically by `normalize_calib_dict` in `loader.py`.

---

## Pipeline timing

Measured on an RTX 3060. CPU-only will be slower, particularly for PointPillars.

| Step | Typical time |
|------|-------------|
| Data load + calibration | ~3 ms |
| YOLOv8l inference | ~12 ms |
| Frustum crop | ~2 ms |
| PointPillars | ~18 ms |
| Hybrid fusion + NMS | ~3 ms |
| BEV + visualisation | ~6 ms |
| Total | ~44 ms |

---

## Dependencies

**Backend**

| Package | Purpose |
|---------|---------|
| fastapi + uvicorn | HTTP server and async runtime |
| ultralytics | YOLOv8 inference |
| OpenPCDet | PointPillars 3D object detection |
| opencv-python | image decoding, BEV rendering, video encoding |
| scikit-learn | DBSCAN clustering, PCA for OBB |
| numpy | all point cloud math |
| matplotlib | BEV scatter plot generation |
| chromadb | scene vector store for chat context |
| openai | OpenRouter API client |
| python-dotenv | env file loading |

**Frontend**

| Package | Purpose |
|---------|---------|
| React 19 | UI framework |
| Vite | dev server and bundler |
| Tailwind CSS | styling |
| Zustand | global state |
| Plotly.js | 3D point cloud viewer |
| clsx | conditional classnames |
