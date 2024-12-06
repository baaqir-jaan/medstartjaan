#!/bin/bash

# Kill any existing processes on these ports
echo "Cleaning up existing processes..."
lsof -ti:8000,5173 | xargs kill -9 2>/dev/null

# Set the base directory (using quotes to handle spaces)
BASE_DIR="/Users/baaqiryusuf/Desktop/Medicare Revenue Data Calculator - Jaan"
FRONTEND_DIR="$BASE_DIR/React Frontend/physician-lookup-frontend"

# Function to check if a port is in use
check_port() {
    lsof -i:$1 >/dev/null 2>&1
    return $?
}

# Start the backend
echo "Starting backend server..."
cd "$BASE_DIR"
python3 "$BASE_DIR/cms_calc.py" &
BACKEND_PID=$!

# Wait for backend to start
echo "Waiting for backend to start..."
max_attempts=30
attempt=0
while ! check_port 8000; do
    sleep 1
    attempt=$((attempt + 1))
    if [ $attempt -eq $max_attempts ]; then
        echo "Backend failed to start"
        exit 1
    fi
done
echo "Backend started successfully"

# Start the frontend
echo "Starting frontend server..."
cd "$FRONTEND_DIR"

# Check if npm process starts successfully
npm run dev &
FRONTEND_PID=$!

# Wait for frontend to start
echo "Waiting for frontend to start..."
attempt=0
while ! check_port 5173; do
    sleep 1
    attempt=$((attempt + 1))
    if [ $attempt -eq $max_attempts ]; then
        echo "Frontend failed to start"
        kill $BACKEND_PID
        exit 1
    fi
done
echo "Frontend started successfully"

# Both servers are running
echo "Both servers are now running"
echo "Backend: http://localhost:8000"
echo "Frontend: http://localhost:5173"
echo "Press Ctrl+C to stop both servers"

# Cleanup on script exit
cleanup() {
    echo "Stopping servers..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    lsof -ti:8000,5173 | xargs kill -9 2>/dev/null
}
trap cleanup EXIT

# Wait for processes
wait $BACKEND_PID $FRONTEND_PID