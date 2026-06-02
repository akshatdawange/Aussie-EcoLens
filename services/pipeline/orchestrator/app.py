"""
orchestrator  (Member B)  —  triggered automatically when a file lands in 'originals'
-------------------------------------------------------------------------------------
For each uploaded IMAGE it:
  1. Works out owner + fileId from the S3 key  (sub/fileId/filename).
  2. Gets the animal tags from Member C's AI:
        - If /ecolens/gcp/inferUrl is set in SSM  -> call C's real /infer endpoint.
        - If not set, or the call fails           -> fall back to MOCK tags (so we are
                                                     never blocked while C finishes).
  3. Writes a META row + one SPECIES row per animal into Member D's EcoLensMain table,
     following the team contract (section 3a).

Videos are skipped here -> handled by the frame-extract function (Phase B6).
"""

import os
import json
import uuid
import datetime
import urllib.parse
import urllib.request

import boto3

s3 = boto3.client("s3")
ssm = boto3.client("ssm")
ddb = boto3.resource("dynamodb")
lambda_client = boto3.client("lambda")

MAIN_TABLE = os.environ["MAIN_TABLE"]
ORIGINALS_BUCKET = os.environ["ORIGINALS_BUCKET"]
THUMBNAILS_BUCKET = os.environ["THUMBNAILS_BUCKET"]
REGION = os.environ.get("AWS_REGION", "ap-southeast-2")
INFER_URL_PARAM = os.environ.get("GCP_INFER_URL_PARAM", "/ecolens/gcp/inferUrl")
SECRET_PARAM = os.environ.get("GCP_SECRET_PARAM", "/ecolens/gcp/sharedSecret")
THUMBNAIL_FN = os.environ.get("THUMBNAIL_FN", "")  # image thumbnail fan-out
FRAME_FN = os.environ.get("FRAME_FN", "")          # video frame-extract fan-out

IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".bmp")
MOCK_COUNTS = {"koala": 2, "wombat": 1}   # used only until Member C's AI is wired

_cache = {}


def _ssm_get(name, decrypt=False):
    """Read an SSM parameter; return None if it doesn't exist yet."""
    if name in _cache:
        return _cache[name]
    value = None
    try:
        value = ssm.get_parameter(Name=name, WithDecryption=decrypt)["Parameter"]["Value"]
    except ssm.exceptions.ParameterNotFound:
        value = None
    except Exception as exc:
        print(f"SSM get '{name}' failed: {exc}")
        value = None
    _cache[name] = value
    return value


def detect_species(bucket, key):
    """Call Member C's real AI if configured; otherwise return MOCK tags."""
    infer_url = _ssm_get(INFER_URL_PARAM)
    if not infer_url:
        print("GCP inferUrl not set in SSM yet -> using MOCK tags.")
        return MOCK_COUNTS

    # C stores the base Cloud Run URL; make sure we hit the /infer path.
    if not infer_url.rstrip("/").endswith("/infer"):
        infer_url = infer_url.rstrip("/") + "/infer"

    secret = _ssm_get(SECRET_PARAM, decrypt=True) or ""
    obj = s3.get_object(Bucket=bucket, Key=key)
    image_bytes = obj["Body"].read()
    content_type = obj.get("ContentType") or "image/jpeg"   # C expects image/jpeg
    req = urllib.request.Request(
        infer_url,
        data=image_bytes,
        method="POST",
        headers={"Content-Type": content_type, "X-EcoLens-Secret": secret},
    )
    try:
        # Short timeout: if C's endpoint is slow/unreachable, fail fast and fall back to mock
        # (so our pipeline still completes). The Lambda timeout (60s) is the outer safety net.
        with urllib.request.urlopen(req, timeout=15) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        counts = payload.get("counts", {})
        print(f"GCP AI returned: {counts}")
        return counts
    except Exception as exc:
        print(f"GCP infer call failed ({exc}) -> falling back to MOCK tags.")
        return MOCK_COUNTS


def s3_url(bucket, key):
    return f"https://{bucket}.s3.{REGION}.amazonaws.com/{urllib.parse.quote(key)}"


def process(bucket, key):
    if not key.lower().endswith(IMAGE_EXTS):
        print(f"Not an image, skipping (videos handled later): {key}")
        return

    parts = key.split("/")                       # sub / fileId / filename
    owner_sub = parts[0] if len(parts) >= 3 else "anonymous"
    file_id = parts[1] if len(parts) >= 3 else str(uuid.uuid4())
    filename = parts[-1]

    counts = detect_species(bucket, key)
    created = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    original_url = s3_url(ORIGINALS_BUCKET, key)
    thumb_key = key.rsplit(".", 1)[0] + "_thumb.jpg"
    thumb_url = s3_url(THUMBNAILS_BUCKET, thumb_key)

    table = ddb.Table(MAIN_TABLE)

    # --- META row: everything about one file ---
    table.put_item(Item={
        "PK": f"FILE#{file_id}", "SK": "META",
        "fileId": file_id, "ownerSub": owner_sub, "fileType": "image",
        "filename": filename, "originalUrl": original_url, "thumbnailUrl": thumb_url,
        "tagCounts": counts, "createdAt": created,
        "GSI2PK": f"THUMB#{thumb_url}", "GSI2SK": f"FILE#{file_id}",
        "GSI3PK": f"USER#{owner_sub}", "GSI3SK": f"CREATED#{created}",
        "GSI4PK": "FEED", "GSI4SK": f"CREATED#{created}#{file_id}",
    })

    # --- One SPECIES row per detected animal (so D can search by species) ---
    for species, count in counts.items():
        table.put_item(Item={
            "PK": f"FILE#{file_id}", "SK": f"SPECIES#{species}",
            "species": species, "count": int(count),
            "fileId": file_id, "ownerSub": owner_sub,
            "originalUrl": original_url, "thumbnailUrl": thumb_url,
            "GSI1PK": f"SPECIES#{species}", "GSI1SK": f"FILE#{file_id}",
        })

    print(f"Wrote META + {len(counts)} SPECIES rows for file {file_id}: {counts}")


def lambda_handler(event, context):
    # S3 allows only ONE trigger per event type, so we fan out: kick off the thumbnail
    # function in parallel, passing it the same S3 event.
    for fn in (THUMBNAIL_FN, FRAME_FN):
        if not fn:
            continue
        try:
            lambda_client.invoke(
                FunctionName=fn,
                InvocationType="Event",  # async - don't wait for it
                Payload=json.dumps(event).encode("utf-8"),
            )
            print(f"Fanned out to: {fn}")
        except Exception as exc:
            print(f"Could not invoke {fn}: {exc}")

    for record in event.get("Records", []):
        bucket = record["s3"]["bucket"]["name"]
        key = urllib.parse.unquote_plus(record["s3"]["object"]["key"])
        try:
            process(bucket, key)
        except Exception as exc:
            print(f"ERROR processing {key}: {exc}")
            raise
    return {"ok": True}
