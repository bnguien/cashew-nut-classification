"""
train_yolo.py — Script train YOLO model cho Cashew Grader.

Cách dùng:
  venv\Scripts\python scripts\train_yolo.py

Sau khi train xong, model tốt nhất sẽ ở:
  runs/detect/cashew_v1/weights/best.pt

Copy vào:
  models/best.pt
"""
from pathlib import Path
from ultralytics import YOLO

# ─── CONFIG ──────────────────────────────────────────────────────────────────

# Base model: n=nano(nhanh), s=small, m=medium, l=large, x=xlarge
BASE_MODEL   = "yolov8s.pt"

# Dataset config
DATASET_YAML = str(Path(__file__).resolve().parent.parent / "datasets" / "cashew.yaml")

# Train params
EPOCHS      = 100
IMGSZ       = 640
BATCH       = 16          # Giảm xuống 8 nếu OOM trên CPU
PATIENCE    = 20          # Early stopping nếu không cải thiện sau 20 epoch
WORKERS     = 4
DEVICE      = "cpu"       # "0" nếu có GPU CUDA, "mps" cho Apple Silicon
PROJECT     = "runs/detect"
NAME        = "cashew_v1"

# ─── TRAIN ───────────────────────────────────────────────────────────────────

def main():
    print(f"[TRAIN] Base model : {BASE_MODEL}")
    print(f"[TRAIN] Dataset    : {DATASET_YAML}")
    print(f"[TRAIN] Epochs     : {EPOCHS}  Batch: {BATCH}  Imgsz: {IMGSZ}")
    print(f"[TRAIN] Device     : {DEVICE}")
    print()

    model = YOLO(BASE_MODEL)

    results = model.train(
        data      = DATASET_YAML,
        epochs    = EPOCHS,
        imgsz     = IMGSZ,
        batch     = BATCH,
        patience  = PATIENCE,
        workers   = WORKERS,
        device    = DEVICE,
        project   = PROJECT,
        name      = NAME,
        exist_ok  = True,     # ghi đè nếu đã tồn tại
        cache     = False,    # True để cache ảnh vào RAM (cần nhiều RAM)
        augment   = True,     # built-in augment của Ultralytics
        verbose   = True,
    )

    best_path = Path(results.save_dir) / "weights" / "best.pt"
    print()
    print(f"[TRAIN] DONE! Best model: {best_path}")
    print()
    print("[NEXT STEPS]")
    print(f"  1. Kiểm tra metrics trong: {results.save_dir}")
    print(f"  2. Copy model vào server:")
    print(f"       copy \"{best_path}\" models\\best.pt")
    print(f"  3. Restart AI server để tải model mới")


if __name__ == "__main__":
    main()
