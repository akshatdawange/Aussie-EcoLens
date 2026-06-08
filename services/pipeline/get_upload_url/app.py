"""
get_upload_url  (Member B)  —  POST /uploads/presign
-----------------------------------------------------
Step 1 of the upload flow. The browser calls this BEFORE uploading.

Body (JSON):  { "filename": "koala.jpg", "sha256": "<hex>",
                "contentType": "image/jpeg", "fileType": "image" }

What it does:
  1. Work out who the user is (from the Cognito login token — for now defaults to
     "anonymous" until Member A wires up Cognito).
  2. DEDUP: try to record the file's sha256 fingerprint in EcoLensHashes.
        - fingerprint already exists  -> duplicate, return the existing file info.
        - fingerprint is new          -> hand back a presigned URL to upload to S3.
"""

import json
import os
import uuid

import boto3
from botocore.exceptions import ClientError

s3 = boto3.client("s3")
ddb = boto3.resource("dynamodb")

ORIGINALS_BUCKET = os.environ["ORIGINALS_BUCKET"]
HASHES_TABLE = os.environ["HASHES_TABLE"]
PRESIGN_TTL_SECONDS = 600  # the permission slip is valid for 10 minutes


def _response(status, body):
    """Build an API Gateway response with CORS headers so the browser is happy."""
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "POST,OPTIONS",
        },
        "body": json.dumps(body),
    }


def _get_user_sub(event):
    """Pull the Cognito user id from the login token if present, else 'anonymous'."""
    try:
        return event["requestContext"]["authorizer"]["claims"]["sub"]
    except (KeyError, TypeError):
        return "anonymous"


def lambda_handler(event, context):
    # Read and validate the request body.
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _response(400, {"error": "Body must be valid JSON."})

    filename = body.get("filename")
    sha256 = body.get("sha256")
    content_type = body.get("contentType", "application/octet-stream")

    if not filename or not sha256:
        return _response(400, {"error": "filename and sha256 are required."})

    sub = _get_user_sub(event)
    file_id = str(uuid.uuid4())
    key = f"{sub}/{file_id}/{filename}"   # S3 key format from the team contract
    table = ddb.Table(HASHES_TABLE)

    # ---- Deduplication: only write the fingerprint if it does NOT already exist ----
    try:
        table.put_item(
            Item={"sha256": sha256, "key": key, "fileId": file_id, "ownerSub": sub},
            ConditionExpression="attribute_not_exists(sha256)",
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            existing = table.get_item(Key={"sha256": sha256}).get("Item", {})
            return _response(200, {
                "duplicate": True,
                "message": "This file was already uploaded.",
                "fileId": existing.get("fileId"),
                "key": existing.get("key"),
            })
        raise  # any other DynamoDB error: let it surface in the logs

    # ---- New file: create the 10-minute presigned upload URL ----
    upload_url = s3.generate_presigned_url(
        ClientMethod="put_object",
        Params={"Bucket": ORIGINALS_BUCKET, "Key": key, "ContentType": content_type},
        ExpiresIn=PRESIGN_TTL_SECONDS,
    )

    return _response(200, {
        "duplicate": False,
        "uploadUrl": upload_url,
        "key": key,
        "fileId": file_id,
        "bucket": ORIGINALS_BUCKET,
        # The browser must PUT with EXACTLY this Content-Type and nothing else,
        # or S3 rejects it with SignatureDoesNotMatch.
        "requiredHeaders": {"Content-Type": content_type},
    })
