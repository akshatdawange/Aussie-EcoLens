"""
thumbnail  (Member B)  —  triggered automatically when an IMAGE lands in 'originals'
------------------------------------------------------------------------------------
Creates a small, compressed preview and saves it to the thumbnails bucket.
Satisfies spec 4.2 "Building Image Thumbnails": resize SMALLER while KEEPING aspect
ratio, then COMPRESS to reduce file size. Uses OpenCV.

Runs as a container image because OpenCV is too big for a zip Lambda.
"""

import os
import urllib.parse

import cv2
import numpy as np
import boto3

s3 = boto3.client("s3")

THUMBNAILS_BUCKET = os.environ["THUMBNAILS_BUCKET"]
MAX_EDGE = int(os.environ.get("MAX_EDGE", "300"))      # longest side of the thumbnail (px)
JPEG_QUALITY = int(os.environ.get("JPEG_QUALITY", "80"))  # lower = smaller file
IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".bmp")


def make_thumbnail(image_bytes):
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("could not decode image")

    h, w = img.shape[:2]
    scale = MAX_EDGE / float(max(h, w))
    if scale < 1.0:  # only shrink, never enlarge — KEEPS aspect ratio (same scale both axes)
        new_size = (max(1, int(w * scale)), max(1, int(h * scale)))
        img = cv2.resize(img, new_size, interpolation=cv2.INTER_AREA)

    ok, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY])  # COMPRESS
    if not ok:
        raise ValueError("jpeg encode failed")
    return buf.tobytes()


def lambda_handler(event, context):
    for record in event.get("Records", []):
        bucket = record["s3"]["bucket"]["name"]
        key = urllib.parse.unquote_plus(record["s3"]["object"]["key"])

        if not key.lower().endswith(IMAGE_EXTS):
            print(f"Not an image, skipping: {key}")
            continue

        obj = s3.get_object(Bucket=bucket, Key=key)
        thumb_bytes = make_thumbnail(obj["Body"].read())

        # Same path formula the orchestrator uses, so thumbnailUrl in the DB matches.
        thumb_key = key.rsplit(".", 1)[0] + "_thumb.jpg"
        s3.put_object(
            Bucket=THUMBNAILS_BUCKET, Key=thumb_key,
            Body=thumb_bytes, ContentType="image/jpeg",
        )
        print(f"Wrote thumbnail s3://{THUMBNAILS_BUCKET}/{thumb_key} ({len(thumb_bytes)} bytes)")

    return {"ok": True}
