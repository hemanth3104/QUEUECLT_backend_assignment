#!/usr/bin/env bash
set -euo pipefail

echo "[1/6] Clean slate"
rm -f data/queue.db || true

echo "[2/6] Start workers"
queuectl worker start --count 2
sleep 1
queuectl status

echo "[3/6] Enqueue a success job"
queuectl enqueue '{"command":"echo Hello; sleep 1; echo Done"}' --id job-ok

echo "[4/6] Enqueue a failing job (command not found) with 2 retries"
queuectl enqueue '{"command":"does_not_exist_123"}' --id job-bad --max-retries 2

echo "[5/6] Wait while workers process (10s)"
sleep 10

echo "[6/6] Inspect status and DLQ"
queuectl status
echo "=== PENDING ==="
queuectl list --state pending
echo "=== FAILED ==="
queuectl list --state failed
echo "=== DEAD ==="
queuectl list --state dead

echo "Logs for job-ok:"
queuectl logs job-ok || true

echo "Retry DLQ job-bad:"
queuectl dlq retry job-bad || true
sleep 5
queuectl status