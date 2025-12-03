#!/bin/sh
set -e

echo "Starting ArcGIS Experience Builder..."

# Start client in background
cd /app/client
echo "Starting client..."
npm start &
CLIENT_PID=$!

# Start server in background
cd /app/server
echo "Starting server on port ${SERVER_PORT}..."
npm start -- --port ${SERVER_PORT} &
SERVER_PID=$!

# Function to handle shutdown
shutdown() {
    echo "Shutting down..."
    kill $CLIENT_PID $SERVER_PID 2>/dev/null
    wait $CLIENT_PID $SERVER_PID 2>/dev/null
    exit 0
}

# Trap signals
trap shutdown SIGTERM SIGINT

# Wait for both processes
echo "Both services started. Waiting..."
wait $SERVER_PID $CLIENT_PID
