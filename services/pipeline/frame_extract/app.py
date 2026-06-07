"""
frame_extract  (Member B)  —  handles VIDEO uploads
----------------------------------------------------
Invoked (fanned out) by the orchestrator when a file lands in 'originals'.
For each VIDEO it:
  1. Downloads the video to /tmp.
  2. Uses ffmpeg to extract 1 frame PER SECOND (spec 4.2: do NOT extract all frames).
  3. Runs the frames through Member C's model IN PARALLEL (thread pool) and aggregates
     the species (max count seen in any single second).
  4. Keeps the first frame as a poster; writes META (fileType=video, full video URL)
     + SPECIES rows to EcoLensMain.

Runs as a container image because it needs the ffmpeg binary.
"""

import os
import glob
import json
import datetime
import subprocess
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import boto3
import imageio_ffmpeg

s3 = boto3.client("s3")
ssm = boto3.client("ssm")
ddb = boto3.resource("dynamodb")
sns = boto3.client("sns")

FRAMES_BUCKET = os.environ["FRAMES_BUCKET"]
THUMBNAILS_BUCKET = os.environ["THUMBNAILS_BUCKET"]   # public bucket for the video poster
ORIGINALS_BUCKET = os.environ["ORIGINALS_BUCKET"]
MAIN_TABLE = os.environ["MAIN_TABLE"]
REGION = os.environ.get("AWS_REGION", "ap-southeast-2")
INFER_URL_PARAM = os.environ.get("GCP_INFER_URL_PARAM", "/ecolens/gcp/inferUrl")
SECRET_PARAM = os.environ.get("GCP_SECRET_PARAM", "/ecolens/gcp/sharedSecret")
TAGS_TOPIC_PARAM = os.environ.get("TAGS_TOPIC_PARAM", "/ecolens/sns/tagsTopicArn")
MAX_INFER_FRAMES = int(os.environ.get("MAX_INFER_FRAMES", "90"))   # bound very long videos
PARALLELISM = int(os.environ.get("INFER_PARALLELISM", "8"))         # concurrent calls to C

VIDEO_EXTS = (".mp4", ".mov", ".avi", ".mkv", ".webm")
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
_cache = {}


def _ssm_get(name, decrypt=False):
    if name in _cache:
        return _cache[name]
    try:
        v = ssm.get_parameter(Name=name, WithDecryption=decrypt)["Parameter"]["Value"]
    except Exception as exc:
        print(f"SSM get '{name}' failed: {exc}")
        v = None
    _cache[name] = v
    return v


def _infer_url():
    url = _ssm_get(INFER_URL_PARAM)
    if url and not url.rstrip("/").endswith("/infer"):
        url = url.rstrip("/") + "/infer"
    return url


def infer_frame(image_bytes):
    """Send one frame to Member C's model; return {species: count} or {} on failure."""
    url = _infer_url()
    if not url:
        return {}
    secret = _ssm_get(SECRET_PARAM, decrypt=True) or ""
    req = urllib.request.Request(
        url, data=image_bytes, method="POST",
        headers={"Content-Type": "image/jpeg", "X-EcoLens-Secret": secret},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8")).get("counts", {})
    except Exception as exc:
        print(f"infer failed for a frame: {exc}")
        return {}


def _infer_path(path):
    with open(path, "rb") as fh:
        return infer_frame(fh.read())


def s3_url(bucket, key):
    return f"https://{bucket}.s3.{REGION}.amazonaws.com/{urllib.parse.quote(key)}"


def publish_tags(counts, file_id, filename, file_type, preview_url):
    """Send an informative SNS email. The 'species' String.Array attribute lets D's
    subscription filter policies deliver only the species each user follows."""
    if not counts:
        return
    topic_arn = _ssm_get(TAGS_TOPIC_PARAM)
    if not topic_arn:
        print("No SNS topic ARN in SSM; skipping notification.")
        return
    species = sorted(counts.keys())   # already normalised (lowercase + trimmed)
    detected = "\n".join(f"  - {sp} (x{counts[sp]})" for sp in species)
    when = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    message = (
        f"A new {file_type} was added to Aussie EcoLens.\n\n"
        f"Species detected:\n{detected}\n\n"
        f"File name : {filename}\n"
        f"Type      : {file_type}\n"
        f"Added     : {when}\n"
        f"Preview   : {preview_url}\n\n"
        f"Log in to Aussie EcoLens to view, search, or download the full {file_type}.\n\n"
        f"You are receiving this because you subscribed to: {', '.join(species)}.\n"
        f"(reference id: {file_id})"
    )
    subject = (f"EcoLens: new {file_type} - {', '.join(species)}")[:100]  # SNS subject max 100 chars
    try:
        sns.publish(
            TopicArn=topic_arn, Subject=subject, Message=message,
            MessageAttributes={
                "species": {"DataType": "String.Array", "StringValue": json.dumps(species)}
            },
        )
        print(f"Published SNS notification for species: {species}")
    except Exception as exc:
        print(f"SNS publish failed: {exc}")


def process(bucket, key):
    if not key.lower().endswith(VIDEO_EXTS):
        print(f"Not a video, skipping: {key}")
        return

    parts = key.split("/")                       # sub / fileId / filename
    owner_sub = parts[0] if len(parts) >= 3 else "anonymous"
    file_id = parts[1] if len(parts) >= 3 else "unknown"
    filename = parts[-1]

    local = "/tmp/in" + os.path.splitext(key)[1]
    s3.download_file(bucket, key, local)

    os.makedirs("/tmp/frames", exist_ok=True)
    for old in glob.glob("/tmp/frames/*"):
        os.remove(old)

    # fps=1 -> exactly one frame per second (the marked requirement)
    subprocess.run([FFMPEG, "-i", local, "-vf", "fps=1", "/tmp/frames/%04d.jpg"], check=True)
    frames = sorted(glob.glob("/tmp/frames/*.jpg"))
    print(f"Extracted {len(frames)} frames (1/sec) from {filename}")

    # Keep the first frame as a poster for the UI (videos otherwise return the full URL).
    poster_url = None
    if frames:
        with open(frames[0], "rb") as fh:
            poster_bytes = fh.read()
        # Poster goes in the PUBLIC thumbnails bucket so A can show it in the gallery (like image thumbs).
        poster_key = f"{owner_sub}/{file_id}/poster.jpg"
        s3.put_object(Bucket=THUMBNAILS_BUCKET, Key=poster_key, Body=poster_bytes, ContentType="image/jpeg")
        poster_url = s3_url(THUMBNAILS_BUCKET, poster_key)

    # Run inference on the frames IN PARALLEL (big speed-up vs one-by-one).
    to_infer = frames[:MAX_INFER_FRAMES]
    aggregated = {}
    with ThreadPoolExecutor(max_workers=PARALLELISM) as pool:
        for counts in pool.map(_infer_path, to_infer):
            for species, count in counts.items():
                sp = (species or "").strip().lower()   # normalise to match D's filters
                if sp:
                    aggregated[sp] = max(aggregated.get(sp, 0), int(count))

    print(f"Aggregated video tags from {len(to_infer)} frames: {aggregated}")
    write_records(file_id, owner_sub, key, filename, aggregated, poster_url)
    publish_tags(aggregated, file_id, filename, "video", poster_url)


def write_records(file_id, owner_sub, key, filename, counts, poster_url):
    created = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    original_url = s3_url(ORIGINALS_BUCKET, key)
    thumb_url = poster_url or original_url
    table = ddb.Table(MAIN_TABLE)

    table.put_item(Item={
        "PK": f"FILE#{file_id}", "SK": "META",
        "fileId": file_id, "ownerSub": owner_sub, "fileType": "video",
        "filename": filename, "originalUrl": original_url, "thumbnailUrl": thumb_url,
        "tagCounts": counts, "createdAt": created,
        "GSI2PK": f"THUMB#{thumb_url}", "GSI2SK": f"FILE#{file_id}",
        "GSI3PK": f"USER#{owner_sub}", "GSI3SK": f"CREATED#{created}",
        "GSI4PK": "FEED", "GSI4SK": f"CREATED#{created}#{file_id}",
    })
    for species, count in counts.items():
        table.put_item(Item={
            "PK": f"FILE#{file_id}", "SK": f"SPECIES#{species}",
            "species": species, "count": int(count),
            "fileId": file_id, "ownerSub": owner_sub,
            "originalUrl": original_url, "thumbnailUrl": thumb_url,
            "GSI1PK": f"SPECIES#{species}", "GSI1SK": f"FILE#{file_id}",
        })
    print(f"Wrote video META + {len(counts)} SPECIES rows for file {file_id}")


def lambda_handler(event, context):
    for record in event.get("Records", []):
        bucket = record["s3"]["bucket"]["name"]
        key = urllib.parse.unquote_plus(record["s3"]["object"]["key"])
        try:
            process(bucket, key)
        except Exception as exc:
            print(f"ERROR processing {key}: {exc}")
            raise
    return {"ok": True}
