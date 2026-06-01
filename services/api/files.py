import os
import boto3
from boto3.dynamodb.conditions import Key

from shared.response import success, error
from shared.utils import get_user_sub


dynamodb = boto3.resource("dynamodb")
TABLE_NAME = os.environ.get("TABLE_NAME", "EcoLensMain")
table = dynamodb.Table(TABLE_NAME)


def lambda_handler(event, context):
    """
    Supports:
    GET /files
    GET /files/{fileId}

    Query parameters:
    - scope=my    -> returns files uploaded by the authenticated user
    - scope=feed  -> returns global newest feed
    """

    http_method = (
        event.get("requestContext", {})
        .get("http", {})
        .get("method", "GET")
    )

    if http_method != "GET":
        return error("Method not allowed.", 405)

    path_params = event.get("pathParameters") or {}
    file_id = path_params.get("fileId")

    if file_id:
        return get_file_details(file_id)

    query_params = event.get("queryStringParameters") or {}
    scope = query_params.get("scope", "feed")

    if scope == "my":
        return get_my_files(event)

    return get_feed_files()


def get_file_details(file_id):
    try:
        response = table.get_item(
            Key={
                "PK": f"FILE#{file_id}",
                "SK": "META"
            }
        )

        item = response.get("Item")

        if not item:
            return success({
                "found": False,
                "message": "File not found."
            }, 404)

        return success({
            "found": True,
            "file": format_meta_item(item)
        })

    except Exception as exc:
        return error(f"Failed to get file details: {str(exc)}", 500)


def get_my_files(event):
    user_sub = get_user_sub(event)

    if not user_sub:
        return error("Unable to identify authenticated user.", 401)

    try:
        response = table.query(
            IndexName="GSI3",
            KeyConditionExpression=Key("GSI3PK").eq(f"USER#{user_sub}"),
            ScanIndexForward=False
        )

        files = [format_meta_item(item) for item in response.get("Items", [])]

        return success({
            "scope": "my",
            "count": len(files),
            "files": files
        })

    except Exception as exc:
        return error(f"Failed to list user files: {str(exc)}", 500)


def get_feed_files():
    try:
        response = table.query(
            IndexName="GSI4",
            KeyConditionExpression=Key("GSI4PK").eq("FEED"),
            ScanIndexForward=False
        )

        files = [format_meta_item(item) for item in response.get("Items", [])]

        return success({
            "scope": "feed",
            "count": len(files),
            "files": files
        })

    except Exception as exc:
        return error(f"Failed to list feed files: {str(exc)}", 500)


def format_meta_item(item):
    return {
        "fileId": item.get("fileId"),
        "ownerSub": item.get("ownerSub"),
        "fileType": item.get("fileType"),
        "filename": item.get("filename"),
        "originalUrl": item.get("originalUrl"),
        "thumbnailUrl": item.get("thumbnailUrl"),
        "tagCounts": item.get("tagCounts", {}),
        "createdAt": item.get("createdAt")
    }