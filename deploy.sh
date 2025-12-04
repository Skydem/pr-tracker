#!/bin/bash
set -e

echo "=== PR Tracker Deployment ==="
echo ""

cd "$(dirname "$0")"

echo "[1/4] Building Docker image..."
docker compose build app

echo ""
echo "[2/4] Pushing schema changes to database..."
docker compose run --rm app npx prisma db push --skip-generate

echo ""
echo "[3/4] Restarting app container..."
docker compose up -d app

echo ""
echo "[4/4] Verifying deployment..."
sleep 2
if docker compose ps app | grep -q "Up"; then
    echo ""
    echo "=== Deployment successful ==="
    docker compose logs app --tail 5
else
    echo ""
    echo "=== Deployment failed - check logs ==="
    docker compose logs app --tail 20
    exit 1
fi
