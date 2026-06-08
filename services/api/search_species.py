import os
import boto3
from boto3.dynamodb.conditions import Key

from shared.response import success, error
from shared.utils import parse_body


dynamodb = boto3.resource("dynamodb")
TABLE_NAME = os.environ.get("TABLE_NAME", "EcoLensMain")
table = dynamodb.Table(TABLE_NAME)


def lambda_handler(event, context):
    """
    POST /search/species

    Request body example:
    {
        "species": ["dingo"]
    }

    Returns files containing at least one requested species.
    """

    body = parse_body(event)

    species_list = body.get("species")

    if not species_list:
        return error("Request body must include a non-empty 'species' list.", 400)

    if isinstance(species_list, str):
        species_list = [species_list]

    if not isinstance(species_list, list):
        return error("'species' must be a list of species names.", 400)

    results_by_file = {}

    try:
        for species in species_list:
            if not isinstance(species, str) or not species.strip():
                return error("Each species name must be a non-empty string.", 400)

            species_name = species.lower().strip()

            response = table.query(
                IndexName="GSI1",
                KeyConditionExpression=Key("GSI1PK").eq(f"SPECIES#{species_name}")
            )

            for item in response.get("Items", []):
                file_id = item.get("fileId")

                if not file_id:
                    continue

                if file_id not in results_by_file:
                    results_by_file[file_id] = {
                        "fileId": file_id,
                        "ownerSub": item.get("ownerSub"),
                        "originalUrl": item.get("originalUrl"),
                        "thumbnailUrl": item.get("thumbnailUrl"),
                        "matchedSpecies": {}
                    }

                results_by_file[file_id]["matchedSpecies"][species_name] = int(item.get("count", 0))

        results = list(results_by_file.values())

        return success({
            "query": {
                "species": species_list
            },
            "count": len(results),
            "results": results
        })

    except Exception as exc:
        return error(f"Failed to search by species: {str(exc)}", 500)