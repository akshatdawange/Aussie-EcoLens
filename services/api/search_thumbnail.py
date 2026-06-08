import os
import boto3
from boto3.dynamodb.conditions import Key

from shared.response import success, error


dynamodb = boto3.resource("dynamodb")
TABLE_NAME = os.environ.get("TABLE_NAME", "EcoLensMain")
table = dynamodb.Table(TABLE_NAME)


def lambda_handler(event, context):
    """
    GET /files/by-thumbnail?thumbnailUrl=<url>

    Looks up a thumbnail URL and returns the corresponding full-size original file URL.
    """

    query_params = event.get("queryStringParameters") or {}
    thumbnail_url = query_params.get("thumbnailUrl")

    if not thumbnail_url:
        return error("Missing required query parameter: thumbnailUrl", 400)

    thumbnail_url = thumbnail_url.strip()

    try:
        response = table.query(
            IndexName="GSI2",
            KeyConditionExpression=Key("GSI2PK").eq(f"THUMB#{thumbnail_url}")
        )

        items = response.get("Items", [])

        if not items:
            return success({
                "found": False,
                "message": "No file found for the provided thumbnail URL."
            }, 404)

        item = items[0]

        return success({
            "found": True,
            "fileId": item.get("fileId"),
            "fileType": item.get("fileType"),
            "filename": item.get("filename"),
            "thumbnailUrl": item.get("thumbnailUrl"),
            "originalUrl": item.get("originalUrl"),
            "ownerSub": item.get("ownerSub"),
            "createdAt": item.get("createdAt")
        })

    except Exception as exc:
        return error(f"Failed to search by thumbnail URL: {str(exc)}", 500)