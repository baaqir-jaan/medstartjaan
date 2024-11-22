#!/bin/bash

# Kill processes running on the ports
echo "Stopping servers..."
lsof -ti:5173 | xargs kill -9 2>/dev/null
lsof -ti:8000 | xargs kill -9 2>/dev/null
echo "Servers stopped!"