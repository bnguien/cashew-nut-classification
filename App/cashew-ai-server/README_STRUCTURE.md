# Cashew AI Server Structure

- `config/`: Django project config (`settings`, `urls`, `asgi`, `wsgi`).
- `apps/inference/`: inference domain app.
  - `serializers.py`: request validation for uploaded image.
  - `views.py`: `GET /api/health/`, `POST /api/predict/`.
  - `services/classifier.py`: inference logic (currently deterministic mock).
- `models/`: location to store trained model file (`best.pt`).
- `scripts/smoke_test.py`: local test client for predict endpoint.
- `.env.example`: runtime config template.

## API Contracts

- `GET /api/health/`
  - Response: `{ status, service, mock_mode, model_path, model_version }`
- `POST /api/predict/` (multipart/form-data)
  - Field: `image`
  - Response: `{ ok, grade, confidence, model_version, inference_ms, mock_mode }`

## Production Upgrade Path

1. Copy trained model to `models/best.pt`.
2. Set `.env`:
   - `MOCK_MODE=false`
   - `MODEL_PATH=./models/best.pt`
3. Replace `classify_image()` internals in `services/classifier.py` with real model inference.
