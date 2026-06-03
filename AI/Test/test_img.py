import cv2
from ultralytics import YOLO

# Load model đã train
model = YOLO("best_v1.pt")

# Đọc ảnh từ máy
img = cv2.imread("t1.jpg")  # đổi thành tên file của bạn

# Predict
results = model(img)

# Vẽ bounding box
annotated_frame = results[0].plot()

# Hiển thị
cv2.imshow("YOLO Detection", annotated_frame)
cv2.waitKey(0)
cv2.destroyAllWindows()