# Official AWS Lambda Python base image.
FROM public.ecr.aws/lambda/python:3.12

# Install deps (imageio-ffmpeg pulls in the ffmpeg binary).
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy function code.
COPY app.py ./

CMD ["app.lambda_handler"]
