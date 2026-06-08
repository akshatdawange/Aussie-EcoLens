import os
import json
import boto3
from boto3.dynamodb.conditions import Key

from shared.response import success, error
from shared.utils import parse_body


dynamodb = boto3.resource("dynamodb")
TABLE_NAME = os.environ.get("TABLE_NAME", "EcoLensMain")
table = dynamodb.Table(TABLE_NAME)


def lambda_handler(event, context):
    """
    POST /search/tag-counts

    Request body example:
    {
        "koala": 3,
        "wombat": 2
    }

    Returns files that contain ALL requested species with counts
    greater than or equal to the requested minimum counts.
    """

    body = parse_body(event)

    if not body:
        return error("Request body must contain at least one species and count.", 400)

    required_tags = {}

    for species, minimum_count in body.items():
        if not isinstance(species, str) or not species.strip():
            return error("Each species name must be a non-empty string.", 400)

        try:
            count = int(minimum_count)
        except (TypeError, ValueError):
            return error(f"Count for species '{species}' must be a number.", 400)

        if count < 1:
            return error(f"Count for species '{species}' must be at least 1.", 400)

        required_tags[species.lower().strip()] = count

    try:
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
            return success({"results": []})

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

        return success({
            "query": required_tags,
            "count": len(results),
            "results": results
        })

    except Exception as exc:
        return error(f"Failed to search by tag counts: {str(exc)}", 500)