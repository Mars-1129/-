#!/bin/sh
echo "=== DATABASE_URL ==="
env | grep -i database
echo "=== POSTGRES ==="
env | grep -i postgres
echo "=== REDIS ==="
env | grep -i redis
echo "=== NODE_PATH ==="
echo $NODE_PATH
echo "=== PRISMA DIR ==="
ls -la /workspace/prisma/ 2>/dev/null
echo "=== .env ==="
ls -la /workspace/.env 2>/dev/null
ls -la /workspace/apps/server-gateway/.env 2>/dev/null
ls -la /workspace/.env.example 2>/dev/null