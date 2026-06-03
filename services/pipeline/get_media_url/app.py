"""
get_media_url  (Member B)  —  GET /media-url?key=<object-key>
-------------------------------------------------------------
Cognito-protected. Returns a short-lived presigned URL to fetch a FULL-SIZE original
(image or video) from the private originals bucket. Used by A for click-to-enlarge /
video playback, so the originals bucket can stay private (only thumbnails are public).
"""

import json
import os

import boto3

s3 = boto3.client("s3")
ORIGINALS_BUCKET = os.environ["ORIGINALS_BUCKET"]
TTL = int(os.environ.get("MEDIA_URL_TTL", "300"))  # presigned URL valid for 5 minutes


def _response(status, body):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,OPTIONS",
        },
        "body": json.dumps(body),
    }


def lambda_handler(event, context):
    params = event.get("queryStringParameters") or {}
    key = params.get("key")
    if not key:
        return _response(400, {"error": "query parameter 'key' is required"})

    url = s3.generate_presigned_url(
        ClientMethod="get_object",
        Params={"Bucket": ORIGINALS_BUCKET, "Key": key},
        ExpiresIn=TTL,
    )
    return _response(200, {"url": url, "expiresIn": TTL})
