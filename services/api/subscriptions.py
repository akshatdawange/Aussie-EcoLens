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
            filter_policy = build_filter_policy(cleaned_species)

            existing_subscription_arn = find_existing_email_subscription(email)

            if existing_subscription_arn:
                subscription_arn = existing_subscription_arn

                if subscription_arn != "PendingConfirmation":
                    sns.set_subscription_attributes(
                        SubscriptionArn=subscription_arn,
                        AttributeName="FilterPolicy",
                        AttributeValue=filter_policy
                    )
            else:
                sns_response = sns.subscribe(
                    TopicArn=SNS_TOPIC_ARN,
                    Protocol="email",
                    Endpoint=email,
                    ReturnSubscriptionArn=True,
                    Attributes={
                        "FilterPolicy": filter_policy
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

def find_existing_email_subscription(email):
    """
    Returns the existing SNS subscription ARN for this email if it is already
    subscribed to the topic. Returns None if not found.
    """

    if not SNS_TOPIC_ARN:
        return None

    next_token = None

    while True:
        kwargs = {
            "TopicArn": SNS_TOPIC_ARN
        }

        if next_token:
            kwargs["NextToken"] = next_token

        response = sns.list_subscriptions_by_topic(**kwargs)

        for subscription in response.get("Subscriptions", []):
            if (
                subscription.get("Protocol") == "email"
                and subscription.get("Endpoint") == email
            ):
                return subscription.get("SubscriptionArn")

        next_token = response.get("NextToken")

        if not next_token:
            break

    return None