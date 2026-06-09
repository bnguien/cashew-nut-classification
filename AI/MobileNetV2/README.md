# Phân loại Hạt điều bằng MobileNetV2

## 1. Giới thiệu bài toán
Bài toán đặt ra là phân loại chất lượng hạt điều thành 3 lớp:
* **broken** (hạt bị vỡ)
* **defect** (hạt bị lỗi, hỏng, mốc)
* **whole** (hạt nguyên vẹn, đạt chuẩn)

Mục tiêu là tự động hóa quy trình phân loại trong dây chuyền sản xuất nông nghiệp công nghệ cao, nâng cao năng suất và độ chính xác so với phương pháp thủ công.

## 2. Công nghệ / Thư viện sử dụng (Requirements)
Để huấn luyện và đánh giá mô hình, các thư viện và công nghệ chính sau đây được sử dụng:
* **Python 3.9+**
* **Google Colab** (môi trường GPU T4)
* **TensorFlow / Keras 2.x** (xây dựng, huấn luyện mô hình)
* **Albumentations** (tăng cường dữ liệu - data augmentation mạnh mẽ)
* **OpenCV (cv2)** (tiền xử lý ảnh, crop bounding box từ nhãn YOLO)
* **Scikit-learn** (Stratified K-Fold Cross Validation, đánh giá số liệu metrics)
* **Matplotlib, Seaborn** (vẽ biểu đồ loss/accuracy, confusion matrix, precision-recall curve)
* **Pandas, NumPy** (xử lý dữ liệu dạng bảng và ma trận)

## 3. Link Dataset
Bộ dữ liệu được sử dụng: [Roboflow Cashew Classifier Dataset](https://universe.roboflow.com/bao-ngan-nguyen-thi/vision-based-cashew-classifier).

## 4. Kiến trúc mô hình
Mô hình kết hợp kỹ thuật Transfer Learning và Attention Mechanism, cụ thể:
1. **Backbone (Feature Extractor)**: Sử dụng **MobileNetV2** (pre-trained trên ImageNet) với các trọng số được đóng băng để trích xuất đặc trưng hình ảnh hiệu quả và nhanh chóng.
2. **Attention Block**: Tích hợp khối **Squeeze-and-Excitation (SE) Block** với tỷ lệ reduction ratio = 16 để tinh chỉnh trọng số các kênh đặc trưng quan trọng.
3. **Classification Head**:
   * Global Average Pooling 2D.
   * Lớp Dense kết nối đầy đủ (128 hoặc 256 units tùy kết quả tối ưu của Random Search) kèm chuẩn hóa L2 (L2 Regularization).
   * Lớp Batch Normalization và ReLU Activation.
   * Dropout layer (tỷ lệ 0.2 - 0.4) giúp hạn chế Overfitting.
   * Lớp Dense Output (3 classes) với hàm kích hoạt Softmax.

## 5. Hướng dẫn chạy code
Toàn bộ quá trình thực nghiệm được triển khai trong notebook [MobileNetV2_PBL5_v1.ipynb](MobileNetV2_PBL5_v1.ipynb) theo các bước:

1. **Chuẩn bị và tiền xử lý dữ liệu**:
   * Kết nối Google Drive và giải nén file dataset chứa ảnh và nhãn dạng YOLO.
   * Chạy cell crop ảnh hạt điều từ ảnh gốc dựa trên Bounding Box từ nhãn YOLO, lưu trữ thành dataset phân loại riêng biệt cho 3 lớp (giữ nguyên tỷ lệ split 78:11:11 gốc).
2. **Huấn luyện thử nghiệm & Tìm siêu tham số tối ưu (Hyperparameters Tuning)**:
   * Sử dụng **Random Search** kết hợp **5-Fold Cross Validation** trên tập Pool (Train + Valid - chiếm 89% dữ liệu) để tìm bộ tham số tốt nhất (gồm Learning Rate, Dropout Rate, Hidden Units).
   * Lưu Checkpoint Random Search về Drive phòng trường hợp mất runtime.
3. **Huấn luyện truyền thống đối chiếu**:
   * Chạy huấn luyện truyền thống (Traditional Training) với Top 2 cấu hình tốt nhất trên tập Train (78%) và Valid (11%) độc lập để đối chiếu số lượng epoch tối ưu từ Cross Validation.
4. **Huấn luyện mô hình cuối cùng (Final Model)**:
   * Huấn luyện mô hình cuối cùng trên toàn bộ tập Pool (Train + Valid - 89%) với siêu tham số tốt nhất tìm được.
   * Đánh giá mô hình cuối cùng trên tập Test (11%) độc lập bằng cách vẽ biểu đồ Loss, Accuracy, Confusion Matrix, Precision-Recall Curve và Phân bố độ tin cậy (Confidence Distribution).
5. **Chuyển đổi sang TFLite để triển khai nhúng**:
   * Chuyển đổi mô hình `.keras` sang định dạng **TensorFlow Lite (`.tflite`)** sử dụng phương pháp Dynamic Range Quantization nhằm giảm kích thước model (~12MB) và tăng tốc độ suy luận (Latency/Throughput) trên các phần cứng nhúng (như Raspberry Pi hoặc ESP32-CAM).
   * Đo đạc benchmark hiệu năng (RAM, CPU, Latency, Throughput) giữa mô hình Keras gốc và mô hình TFLite trên môi trường CPU.
