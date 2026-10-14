# One shared image for every backend service (fl-server, hospital nodes, api)
# -- they all need the same requirements.txt and source tree; docker-compose.yml
# picks which process to run per service via `command:`.
FROM python:3.11-slim

WORKDIR /app/backend
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
