import os
import base64
import json
import urllib.request
import urllib.error

import boto3
from boto3.dynamodb.conditions import Key

from shared.response import success, error
from shared.utils import parse_body


dynamodb = boto3.resource("dynamodb")
ssm = boto3.client("ssm")

TABLE_NAME = os.environ.get("TABLE_NAME", "EcoLensMain")
GCP_INFER_URL = os.environ.get("GCP_INFER_URL")
GCP_SHARED_SECRET = os.environ.get("GCP_SHARED_SECRET")

table = dynamodb.Table(TABLE_NAME)


def lambda_handler(event, context):
    """
    POST /search/by-image

    Testing request body option:
    {
        "detectedTags": {
            "koala": 1,
            "wombat": 1
        }
    }

    Future real request body option:
    {
        "imageBase64": "<base64 image bytes>",
        "contentType": "image/jpeg"
    }

    The uploaded query image must not be saved permanently.
    """

    body = parse_body(event)

    detected_tags = body.get("detectedTags") or body.get("detected_tags")

    if not detected_tags:
        image_base64 = body.get("imageBase64") or body.get("image_base64")
        content_type = body.get("contentType") or body.get("content_type") or "image/jpeg"

        if not image_base64:
            return error("Provide either 'detectedTags' for testing or 'imageBase64' for real image query.", 400)

        detected_tags = infer_tags_from_image(image_base64, content_type)

    required_tags = normalise_detected_tags(detected_tags)

    if not required_tags:
        return success({
            "detectedTags": {},
            "count": 0,
            "results": [],
            "message": "No species detected in query image."
        })

    try:
        results = search_files_by_detected_tags(required_tags)

        return success({
            "detectedTags": required_tags,
            "count": len(results),
            "results": results
        })

    except Exception as exc:
        return error(f"Failed to search by uploaded image: {str(exc)}", 500)


def normalise_detected_tags(detected_tags):
    if not isinstance(detected_tags, dict):
        return {}

    cleaned = {}

    for species, count in detected_tags.items():
        if not isinstance(species, str) or not species.strip():
            continue

        try:
            numeric_count = int(count)
        except (TypeError, ValueError):
            numeric_count = 1

        if numeric_count < 1:
            continue

        cleaned[species.lower().strip()] = numeric_count

    return cleaned


def search_files_by_detected_tags(required_tags):
    """
    Uses AND logic across all detected species.
    Example:
    {"koala": 1, "wombat": 1}
    means koala >= 1 AND wombat >= 1.
    """

    matching_sets = []

    for species, minimum_count in required_tags.items():
        response = table.query(
            IndexName="GSI1",
            KeyConditionExpression=Key("GSI1PK").eq(f"SPECIES#{species}")
        )

        species_matches = {}

        for item in response.get("Items", []):
            item_count = int(item.get("count", 0))

            if item_count >= minimum_count:
                file_id = item.get("fileId")

                if file_id:
                    species_matches[file_id] = {
                        "fileId": file_id,
                        "ownerSub": item.get("ownerSub"),
                        "originalUrl": item.get("originalUrl"),
                        "thumbnailUrl": item.get("thumbnailUrl"),
                        "matchedSpecies": {
                            species: item_count
                        }
                    }

        matching_sets.append(species_matches)

    if not matching_sets:
        return []

    common_file_ids = set(matching_sets[0].keys())

    for match_set in matching_sets[1:]:
        common_file_ids = common_file_ids.intersection(set(match_set.keys()))

    results = []

    for file_id in common_file_ids:
        merged_result = {
            "fileId": file_id,
            "ownerSub": None,
            "originalUrl": None,
            "thumbnailUrl": None,
            "matchedSpecies": {}
        }

        for match_set in matching_sets:
            item = match_set[file_id]
            merged_result["ownerSub"] = item.get("ownerSub")
            merged_result["originalUrl"] = item.get("originalUrl")
            merged_result["thumbnailUrl"] = item.get("thumbnailUrl")
            merged_result["matchedSpecies"].update(item.get("matchedSpecies", {}))

        results.append(merged_result)

    return results


def infer_tags_from_image(image_base64, content_type):
    """
    Calls Member C's GCP inference endpoint.
    This does not store the uploaded query image.
    """

    infer_url = GCP_INFER_URL or get_ssm_parameter("/ecolens/gcp/inferUrl")
    shared_secret = GCP_SHARED_SECRET or get_ssm_parameter("/ecolens/gcp/sharedSecret", decrypt=True)

    if not infer_url:
        raise Exception("GCP inference URL is not configured.")

    image_bytes = base64.b64decode(image_base64)

    request = urllib.request.Request(
        infer_url,
        data=image_bytes,
        method="POST",
        headers={
            "Content-Type": content_type,
            "X-EcoLens-Secret": shared_secret or ""
        }
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            response_body = response.read().decode("utf-8")
            parsed = json.loads(response_body)
            return parsed.get("counts", {})

    except urllib.error.HTTPError as exc:
        raise Exception(f"GCP inference failed with status {exc.code}")

    except urllib.error.URLError as exc:
        raise Exception(f"Could not reach GCP inference endpoint: {str(exc)}")


def get_ssm_parameter(name, decrypt=False):
    try:
        response = ssm.get_parameter(
            Name=name,
            WithDecryption=decrypt
        )
        return response["Parameter"]["Value"]
    except Exception:
        return None