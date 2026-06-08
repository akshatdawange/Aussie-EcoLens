# Python 3.11: onnx 1.16.x ships prebuilt wheels here and avoids the ml_dtypes/
# numpy>=2 requirement that onnx 1.19+ (the only 3.12 wheels) drags in, which
# clashes with megadetector's numpy<2.
FROM python:3.11-slim

# System libs needed by OpenCV / torch image stack used by MegaDetector
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Install onnx/onnx2torch separately with --no-deps: onnx wants protobuf>=3.20.2
# but megadetector caps it at <=3.20.1. protobuf 3.20.3 satisfies onnx's runtime
# floor and is API-compatible with what ultralytics-yolov5 needs.
RUN pip install --no-cache-dir --no-deps onnx==1.16.2 onnx2torch==1.5.15 protobuf==3.20.3

COPY main.py .
COPY labels.txt .

ENV PORT=8080
# Single worker: the torch models are large; one process per instance.
CMD exec uvicorn main:app --host 0.0.0.0 --port ${PORT}
