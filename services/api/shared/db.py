import os
import boto3


dynamodb = boto3.resource("dynamodb")

TABLE_NAME = os.environ.get("TABLE_NAME", "EcoLensMain")
table = dynamodb.Table(TABLE_NAME)