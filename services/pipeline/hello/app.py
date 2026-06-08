def lambda_handler(event, context):
    """The simplest possible Lambda: returns a hello message.
    Its only job is to prove that our deploy pipeline works end-to-end."""
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "text/plain"},
        "body": "hello from Member B - the pipeline works!",
    }
