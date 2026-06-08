import os
from datetime import datetime, timezone

import boto3

from shared.response import success, error
from shared.utils import parse_body, get_user_sub, get_user_email


dynamodb = boto3.resource("dynamodb")
sns = boto3.client("sns")

TABLE_NAME = os.environ.get("TABLE_NAME", "EcoLensMain")
SNS_TOPIC_ARN = os.environ.get("SNS_TOPIC_ARN")

table = dynamodb.Table(TABLE_NAME)


def lambda_handler(event, context):
    """
    Supports:
    GET /subscriptions
    POST /subscriptions
    DELETE /subscriptions

    POST request body example:
    {
        "email": "student@example.com",
        "species": ["koala", "wombat"]
    }
    """

    method = (
        event.get("requestContext", {})
        .get("http", {})
        .get("method")
    )

    if method == "GET":
        return get_subscription(event)

    if method == "POST":
        return create_or_update_subscription(event)

    if method == "DELETE":
        return delete_subscription(event)

    return error("Method not allowed.", 405)


def get_subscription(event):
    user_sub = get_user_sub(event)

    if not user_sub:
        return error("Unable to identify authenticated user.", 401)

    try:
        response = table.get_item(
            Key={
                "PK": f"USER#{user_sub}",
                "SK": "SUBSCRIPTION"
            }
        )

        item = response.get("Item")

        if not item:
            return success({
                "subscribed": False,
                "species": []
            })

        return success({
            "subscribed": True,
            "userSub": user_sub,
            "email": item.get("email"),
            "species": item.get("species", []),
            "subscriptionArn": item.get("subscriptionArn"),
            "createdAt": item.get("createdAt"),
            "updatedAt": item.get("updatedAt")
        })

    except Exception as exc:
        return error(f"Failed to get subscription: {str(exc)}", 500)


def create_or_update_subscription(event):
    user_sub = get_user_sub(event)
    token_email = get_user_email(event)

    if not user_sub:
        return error("Unable to identify authenticated user.", 401)

    body = parse_body(event)

    email = body.get("email") or token_email
    species = body.get("species") or body.get("watchedTags") or body.get("watched_tags")

    if not email:
        return error("Email is required. Provide email in body or Cognito token.", 400)

    if not isinstance(species, list) or not species:
        return error("'species' must be a non-empty list.", 400)

    cleaned_species = []

    for item in species:
        if isinstance(item, str) and item.strip():
            cleaned_species.append(item.lower().strip())

    cleaned_species = sorted(list(set(cleaned_species)))

    if not cleaned_species:
        return error("At least one valid species is required.", 400)

    now = datetime.now(timezone.utc).isoformat()

    try:
        subscription_arn = None

        if SNS_TOPIC_ARN:
            sns_response = sns.subscribe(
                TopicArn=SNS_TOPIC_ARN,
                Protocol="email",
                Endpoint=email,
                ReturnSubscriptionArn=True,
                Attributes={
                    "FilterPolicy": build_filter_policy(cleaned_species)
                }
            )
            subscription_arn = sns_response.get("SubscriptionArn")

        table.put_item(
            Item={
                "PK": f"USER#{user_sub}",
                "SK": "SUBSCRIPTION",
                "userSub": user_sub,
                "email": email,
                "species": cleaned_species,
                "subscriptionArn": subscription_arn or "PENDING_OR_NOT_CONFIGURED",
                "createdAt": now,
                "updatedAt": now
            }
        )

        return success({
            "message": "Subscription saved. If this is a new SNS email subscription, confirm it from your inbox.",
            "userSub": user_sub,
            "email": email,
            "species": cleaned_species,
            "subscriptionArn": subscription_arn or "PENDING_OR_NOT_CONFIGURED"
        })

    except Exception as exc:
        return error(f"Failed to create or update subscription: {str(exc)}", 500)


def delete_subscription(event):
    user_sub = get_user_sub(event)

    if not user_sub:
        return error("Unable to identify authenticated user.", 401)

    try:
        existing = table.get_item(
            Key={
                "PK": f"USER#{user_sub}",
                "SK": "SUBSCRIPTION"
            }
        ).get("Item")

        if existing:
            subscription_arn = existing.get("subscriptionArn")

            if subscription_arn and subscription_arn not in ["PendingConfirmation", "PENDING_OR_NOT_CONFIGURED"]:
                try:
                    sns.unsubscribe(SubscriptionArn=subscription_arn)
                except Exception:
                    pass

        table.delete_item(
            Key={
                "PK": f"USER#{user_sub}",
                "SK": "SUBSCRIPTION"
            }
        )

        return success({
            "message": "Subscription deleted.",
            "userSub": user_sub
        })

    except Exception as exc:
        return error(f"Failed to delete subscription: {str(exc)}", 500)


def build_filter_policy(species):
    """
    SNS filter policy expects JSON string.
    Member B should publish MessageAttributes with key 'species'.
    """
    species_values = ", ".join([f'"{item}"' for item in species])
    return f'{{"species": [{species_values}]}}'