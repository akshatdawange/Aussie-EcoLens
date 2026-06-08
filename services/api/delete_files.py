import os
from urllib.parse import urlparse, unquote

import boto3

from shared.response import success, error
from shared.utils import parse_body


dynamodb = boto3.resource("dynamodb")
s3 = boto3.client("s3")

TABLE_NAME = os.environ.get("TABLE_NAME", "EcoLensMain")
HASHES_TABLE_NAME = os.environ.get("HASHES_TABLE_NAME", "EcoLensHashes")

table = dynamodb.Table(TABLE_NAME)
hashes_table = dynamodb.Table(HASHES_TABLE_NAME)


def lambda_handler(event, context):
    """
    DELETE /files

    Request body example:
    {
        "files": ["demo-file-001", "demo-file-002"]
    }

    Deletes:
    - META item
    - SPECIES items
    - Original S3 object
    - Thumbnail S3 object
    - Video frame S3 objects, if present
    """

    body = parse_body(event)
    files = body.get("files")

    if not isinstance(files, list) or not files:
        return error("'files' must be a non-empty list of file IDs.", 400)

    deleted_files = []
    failed_files = []

    for file_id in files:
        if not isinstance(file_id, str) or not file_id.strip():
            failed_files.append({
                "fileId": file_id,
                "reason": "Invalid file ID."
            })
            continue

        file_id = file_id.strip()

        try:
            result = delete_single_file(file_id)
            deleted_files.append(result)

        except Exception as exc:
            failed_files.append({
                "fileId": file_id,
                "reason": str(exc)
            })

    return success({
        "deletedCount": len(deleted_files),
        "failedCount": len(failed_files),
        "deletedFiles": deleted_files,
        "failedFiles": failed_files
    })


def delete_single_file(file_id):
    meta_response = table.get_item(
        Key={
            "PK": f"FILE#{file_id}",
            "SK": "META"
        }
    )

    meta_item = meta_response.get("Item")

    if not meta_item:
        raise Exception("META record not found.")

    delete_s3_url(meta_item.get("originalUrl"))
    delete_s3_url(meta_item.get("thumbnailUrl"))

    frame_urls = meta_item.get("frameUrls") or meta_item.get("videoFrameUrls") or []

    for frame_url in frame_urls:
        delete_s3_url(frame_url)

    delete_species_items(file_id)
    
    deleted_hash_count = delete_hash_records(file_id)

    table.delete_item(
        Key={
            "PK": f"FILE#{file_id}",
            "SK": "META"
        }
    )

    return {
        "fileId": file_id,
        "deletedOriginal": bool(meta_item.get("originalUrl")),
        "deletedThumbnail": bool(meta_item.get("thumbnailUrl")),
        "deletedFrameCount": len(frame_urls),
        "deletedHashCount": deleted_hash_count
    }


def delete_species_items(file_id):
    response = table.query(
        KeyConditionExpression="PK = :pk AND begins_with(SK, :speciesPrefix)",
        ExpressionAttributeValues={
            ":pk": f"FILE#{file_id}",
            ":speciesPrefix": "SPECIES#"
        }
    )

    for item in response.get("Items", []):
        table.delete_item(
            Key={
                "PK": item["PK"],
                "SK": item["SK"]
            }
        )

def delete_hash_records(file_id):
    """
    Removes matching deduplication records from EcoLensHashes.

    EcoLensHashes is keyed by sha256, but stores fileId as an attribute.
    Since the table is small for this project, scanning by fileId is acceptable.
    """

    deleted_count = 0

    response = hashes_table.scan(
        FilterExpression="fileId = :fileId",
        ExpressionAttributeValues={
            ":fileId": file_id
        }
    )

    items = response.get("Items", [])

    for item in items:
        sha256_value = item.get("sha256")

        if not sha256_value:
            continue

        hashes_table.delete_item(
            Key={
                "sha256": sha256_value
            }
        )

        deleted_count += 1

    return deleted_count


def delete_s3_url(url):
    if not url:
        return

    parsed = urlparse(url)

    bucket = None
    key = None

    # Handles s3://bucket/key
    if parsed.scheme == "s3":
        bucket = parsed.netloc
        key = parsed.path.lstrip("/")

    # Handles https://bucket.s3.region.amazonaws.com/key
    elif parsed.scheme in ["http", "https"]:
        host_parts = parsed.netloc.split(".")

        if len(host_parts) >= 4 and host_parts[1] == "s3":
            bucket = host_parts[0]
            key = parsed.path.lstrip("/")

    if not bucket or not key:
        # If URL cannot be parsed as an S3 object, skip S3 deletion.
        return

    s3.delete_object(
        Bucket=bucket,
        Key=unquote(key)
    )