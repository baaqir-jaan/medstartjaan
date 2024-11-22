#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# Define paths
BACKEND_PATH="/Users/baaqiryusuf/Desktop/Medicare Revenue Data Calculator"
FRONTEND_PATH="/Users/baaqiryusuf/Desktop/Medicare Revenue Data Calculator/React Frontend/physician-lookup-frontend"

# Function to start backend
start_backend() {
    echo -e "${BLUE}Starting Python backend...${NC}"
    cd "$BACKEND_PATH"
    python3 api.py &
    echo -e "${GREEN}Backend started at http://localhost:8000${NC}"
}

# Function to start frontend
start_frontend() {
    echo -e "${BLUE}Starting React frontend...${NC}"
    cd "$FRONTEND_PATH"
    npm run dev &
    echo -e "${GREEN}Frontend started at http://localhost:5173${NC}"
}

# Function to stop all servers
stop_servers() {
    echo -e "${BLUE}Stopping all servers...${NC}"
    lsof -ti:8000 | xargs kill -9 2>/dev/null
    lsof -ti:5173 | xargs kill -9 2>/dev/null
    echo -e "${GREEN}All servers stopped${NC}"
}

# Start both servers
start_both() {
    start_backend
    sleep 2
    start_frontend
    echo -e "\n${GREEN}Both servers are running!${NC}"
    echo -e "Frontend: http://localhost:5173"
    echo -e "Backend: http://localhost:8000"
    echo -e "\n${BLUE}Press Ctrl+C to stop both servers${NC}"
}

# Cleanup on exit
trap "stop_servers" EXIT

# Start everything
start_both

# Keep script running
wait