#!/bin/bash

# Start backend
echo "Starting backend..."
python3 api.py &
echo "Backend started!"

# Wait a moment
sleep 2

# Start frontend
echo "Starting frontend..."
cd "React Frontend/physician-lookup-frontend" && npm run dev &
echo "Frontend started!"

echo "Both servers are running!"
echo "Frontend: http://localhost:5173"
echo "Backend: http://localhost:8000"

# Keep the script running
wait