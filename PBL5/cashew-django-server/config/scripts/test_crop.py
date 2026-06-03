"""
Test script: Crop cashew from green conveyor belt background.
Algorithm:
  1. Convert to HSV
  2. Create mask for NON-green pixels (= cashew + shadow)
  3. Morphological cleanup
  4. Find largest contour bounding box
  5. Add padding & crop to square
  6. Resize to target (240x240)
"""
import sys
import os
from pathlib import Path

# Add project root so we can import settings if needed
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import cv2
import numpy as np
from PIL import Image

# ── Configuration ──
TARGET_SIZE = 240
PADDING_RATIO = 0.25        # 25% padding around detected cashew
MIN_CONTOUR_AREA_RATIO = 0.005  # min 0.5% of image area to be valid

# HSV range for GREEN belt (dark green in these images)
GREEN_H_LOW, GREEN_H_HIGH = 30, 90
GREEN_S_LOW = 25
GREEN_V_LOW = 25


def crop_cashew_from_green(
    image_bgr: np.ndarray,
    target_size: int = TARGET_SIZE,
    padding_ratio: float = PADDING_RATIO,
    debug: bool = False,
) -> np.ndarray:
    """
    Detect and crop the cashew nut from a green conveyor belt image.
    
    Returns: cropped & resized image (target_size x target_size, BGR)
    """
    h, w = image_bgr.shape[:2]
    img_area = h * w
    
    # 1. Convert to HSV
    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    
    # 2. Create mask for GREEN pixels (belt)
    green_mask = cv2.inRange(
        hsv,
        np.array([GREEN_H_LOW, GREEN_S_LOW, GREEN_V_LOW]),
        np.array([GREEN_H_HIGH, 255, 255]),
    )
    
    # 3. Invert → foreground = cashew + shadow + mechanical parts
    fg_mask = cv2.bitwise_not(green_mask)
    
    # 4. Focus on center region (ignore mechanical parts at edges)
    # Create a soft center-weighted mask (elliptical)
    center_mask = np.zeros((h, w), dtype=np.uint8)
    cx, cy = w // 2, h // 2
    # Ellipse covering ~70% of image
    axes = (int(w * 0.40), int(h * 0.40))
    cv2.ellipse(center_mask, (cx, cy), axes, 0, 0, 360, 255, -1)
    # Slight dilation to not cut cashew at edges
    center_mask = cv2.dilate(center_mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)))
    
    # Combine: foreground AND center-ish region
    combined = cv2.bitwise_and(fg_mask, center_mask)
    
    # 5. Morphological cleanup
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel, iterations=2)
    combined = cv2.morphologyEx(combined, cv2.MORPH_OPEN, kernel, iterations=1)
    
    # 6. Find contours, pick largest
    contours, _ = cv2.findContours(combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours:
        # Fallback: center crop
        return _center_crop_resize(image_bgr, target_size)
    
    # Filter by minimum area
    valid = [c for c in contours if cv2.contourArea(c) > img_area * MIN_CONTOUR_AREA_RATIO]
    if not valid:
        return _center_crop_resize(image_bgr, target_size)
    
    largest = max(valid, key=cv2.contourArea)
    x, y, bw, bh = cv2.boundingRect(largest)
    
    # 7. Add padding
    pad_x = int(bw * padding_ratio)
    pad_y = int(bh * padding_ratio)
    x1 = max(0, x - pad_x)
    y1 = max(0, y - pad_y)
    x2 = min(w, x + bw + pad_x)
    y2 = min(h, y + bh + pad_y)
    
    # 8. Make it square (expand the shorter side)
    crop_w = x2 - x1
    crop_h = y2 - y1
    side = max(crop_w, crop_h)
    
    # Re-center the square crop
    center_x = (x1 + x2) // 2
    center_y = (y1 + y2) // 2
    half = side // 2
    
    sq_x1 = max(0, center_x - half)
    sq_y1 = max(0, center_y - half)
    sq_x2 = min(w, sq_x1 + side)
    sq_y2 = min(h, sq_y1 + side)
    
    # Adjust if we hit image borders
    if sq_x2 - sq_x1 < side:
        sq_x1 = max(0, sq_x2 - side)
    if sq_y2 - sq_y1 < side:
        sq_y1 = max(0, sq_y2 - side)
    
    cropped = image_bgr[sq_y1:sq_y2, sq_x1:sq_x2]
    
    # 9. Resize to target
    result = cv2.resize(cropped, (target_size, target_size), interpolation=cv2.INTER_AREA)
    
    if debug:
        return result, combined, (sq_x1, sq_y1, sq_x2, sq_y2)
    
    return result


def _center_crop_resize(image_bgr: np.ndarray, target_size: int) -> np.ndarray:
    """Fallback: take center 60% and resize."""
    h, w = image_bgr.shape[:2]
    margin_x = int(w * 0.2)
    margin_y = int(h * 0.2)
    crop = image_bgr[margin_y:h - margin_y, margin_x:w - margin_x]
    return cv2.resize(crop, (target_size, target_size), interpolation=cv2.INTER_AREA)


def crop_cashew_pil(pil_image: Image.Image, target_size: int = TARGET_SIZE) -> Image.Image:
    """PIL interface for Django integration."""
    bgr = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
    result_bgr = crop_cashew_from_green(bgr, target_size=target_size)
    result_rgb = cv2.cvtColor(result_bgr, cv2.COLOR_BGR2RGB)
    return Image.fromarray(result_rgb)


# ── Test ──
if __name__ == "__main__":
    img_dir = Path(__file__).resolve().parent.parent / "media" / "cashew_images" / "20260427"
    out_dir = Path(__file__).resolve().parent / "crop_results"
    out_dir.mkdir(exist_ok=True)
    
    files = sorted(img_dir.glob("*.jpg"))[:10]  # Test first 10
    
    print(f"Testing {len(files)} images...")
    print(f"Output -> {out_dir}\n")
    
    for f in files:
        img = cv2.imread(str(f))
        if img is None:
            print(f"  SKIP (cannot read): {f.name}")
            continue
        
        result, mask, bbox = crop_cashew_from_green(img, debug=True)
        
        # Save cropped result
        cv2.imwrite(str(out_dir / f"crop_{f.name}"), result)
        
        # Save debug visualization
        debug_img = img.copy()
        x1, y1, x2, y2 = bbox
        cv2.rectangle(debug_img, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.imwrite(str(out_dir / f"debug_{f.name}"), debug_img)
        
        # Save mask
        cv2.imwrite(str(out_dir / f"mask_{f.name}"), mask)
        
        h, w = img.shape[:2]
        crop_area = (x2 - x1) * (y2 - y1)
        ratio = crop_area / (h * w) * 100
        print(f"  OK {f.name}: bbox=({x1},{y1})-({x2},{y2}) crop={ratio:.0f}% of original")
    
    print(f"\nDone! Check results in: {out_dir}")
