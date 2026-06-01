import os
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Key

from shared.response import success, error
from shared.utils import parse_body


dynamodb = boto3.resource("dynamodb")
TABLE_NAME = os.environ.get("TABLE_NAME", "EcoLensMain")
table = dynamodb.Table(TABLE_NAME)


def lambda_handler(event, context):
    """
    POST /tags/bulk

    Request body example:
    {
        "op": 1,
        "files": ["demo-file-001", "demo-file-002"],
        "tags": ["koala", "dingo"]
    }

    op = 1 means add tags
    op = 0 means remove tags
    """

    body = parse_body(event)

    operation = body.get("op")
    files = body.get("files")
    tags = body.get("tags")

    if operation not in [0, 1]:
        return error("'op' must be 1 for add or 0 for remove.", 400)

    if not isinstance(files, list) or not files:
        return error("'files' must be a non-empty list of file IDs.", 400)

    if not isinstance(tags, list) or not tags:
        return error("'tags' must be a non-empty list of tag names.", 400)

    cleaned_tags = []

    for tag in tags:
        if isinstance(tag, str) and tag.strip():
            cleaned_tags.append(tag.lower().strip())

    if not cleaned_tags:
        return error("At least one valid tag is required.", 400)

    updated_files = []
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
            result = update_file_tags(file_id, cleaned_tags, operation)
            updated_files.append(result)

        except Exception as exc:
            failed_files.append({
                "fileId": file_id,
                "reason": str(exc)
            })

    return success({
        "operation": "add" if operation == 1 else "remove",
        "updatedCount": len(updated_files),
        "failedCount": len(failed_files),
        "updatedFiles": updated_files,
        "failedFiles": failed_files
    })


def update_file_tags(file_id, tags, operation):
    meta_response = table.get_item(
        Key={
            "PK": f"FILE#{file_id}",
            "SK": "META"
        }
    )

    meta_item = meta_response.get("Item")

    if not meta_item:
        raise Exception("META record not found.")

    current_tag_counts = meta_item.get("tagCounts", {}) or {}

    if operation == 1:
        return add_tags(file_id, meta_item, current_tag_counts, tags)

    return remove_tags(file_id, meta_item, current_tag_counts, tags)


def add_tags(file_id, meta_item, current_tag_counts, tags):
    now = datetime.now(timezone.utc).isoformat()

    for tag in tags:
        current_tag_counts[tag] = int(current_tag_counts.get(tag, 0)) + 1

        table.put_item(
            Item={
                "PK": f"FILE#{file_id}",
                "SK": f"SPECIES#{tag}",
                "species": tag,
                "count": int(current_tag_counts[tag]),
                "fileId": file_id,
                "ownerSub": meta_item.get("ownerSub"),
                "originalUrl": meta_item.get("originalUrl"),
                "thumbnailUrl": meta_item.get("thumbnailUrl"),
                "GSI1PK": f"SPECIES#{tag}",
                "GSI1SK": f"FILE#{file_id}"
            }
        )

    table.update_item(
        Key={
            "PK": f"FILE#{file_id}",
            "SK": "META"
        },
        UpdateExpression="SET tagCounts = :tagCounts, updatedAt = :updatedAt",
        ExpressionAttributeValues={
            ":tagCounts": current_tag_counts,
            ":updatedAt": now
        }
    )

    return {
        "fileId": file_id,
        "tagCounts": current_tag_counts
    }


def remove_tags(file_id, meta_item, current_tag_counts, tags):
    now = datetime.now(timezone.utc).isoformat()

    for tag in tags:
        if tag not in current_tag_counts:
            continue

        current_tag_counts.pop(tag, None)

        table.delete_item(
            Key={
                "PK": f"FILE#{file_id}",
                "SK": f"SPECIES#{tag}"
            }
        )

    table.update_item(
        Key={
            "PK": f"FILE#{file_id}",
            "SK": "META"
        },
        UpdateExpression="SET tagCounts = :tagCounts, updatedAt = :updatedAt",
        ExpressionAttributeValues={
            ":tagCounts": current_tag_counts,
            ":updatedAt": now
        }
    )

    return {
        "fileId": file_id,
        "tagCounts": current_tag_counts
    }