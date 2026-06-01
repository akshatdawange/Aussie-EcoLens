# Official AWS Lambda Python base image (Amazon Linux 2023) - wired for the Lambda runtime.
FROM public.ecr.aws/lambda/python:3.12

# OpenCV needs this shared library present at runtime.
RUN microdnf install -y mesa-libGL && microdnf clean all

# Install Python dependencies into the Lambda task root.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy the function code.
COPY app.py ./

# handler = <file>.<function>
CMD ["app.lambda_handler"]
