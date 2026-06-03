import io

import requests
from PIL import Image


def make_test_image_bytes() -> bytes:
    image = Image.new("RGB", (64, 64), color=(120, 180, 90))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    return buffer.getvalue()


if __name__ == "__main__":
    image_bytes = make_test_image_bytes()
    files = {"image": ("test.jpg", image_bytes, "image/jpeg")}
    response = requests.post("http://127.0.0.1:5000/api/predict/", files=files, timeout=10)
    print(response.status_code, response.text)
