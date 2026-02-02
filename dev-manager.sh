#!/bin/bash

# Local Development Helper Script for Chat App

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored messages
print_status() {
    echo -e "${2}$1${NC}"
}

print_status "========================================" "$BLUE"
print_status "  Chat App - Local Dev Manager" "$BLUE"
print_status "========================================" "$BLUE"
echo ""

# Check if servers are running
check_servers() {
    print_status "Checking server status..." "$YELLOW"
    echo ""

    # Check Worker
    if curl -s http://localhost:8787/api/history > /dev/null 2>&1; then
        print_status "✅ Worker Server: RUNNING (http://localhost:8787)" "$GREEN"
    else
        print_status "❌ Worker Server: STOPPED" "$RED"
    fi

    # Check Pages
    if curl -s http://localhost:8788 > /dev/null 2>&1; then
        print_status "✅ Pages Server: RUNNING (http://localhost:8788)" "$GREEN"
    else
        print_status "❌ Pages Server: STOPPED" "$RED"
    fi

    echo ""
}

# Start servers
start_servers() {
    print_status "Starting development servers..." "$YELLOW"
    echo ""

    # Start Worker
    print_status "Starting Worker Server..." "$BLUE"
    cd chat-app/worker
    nohup npx wrangler dev --port 8787 > /tmp/worker.log 2>&1 &
    echo $! > /tmp/worker.pid
    print_status "✓ Worker started on http://localhost:8787" "$GREEN"

    # Wait for worker to be ready
    sleep 3

    # Start Pages
    print_status "Starting Pages Server..." "$BLUE"
    cd ../
    nohup npx wrangler pages dev public --port 8788 > /tmp/pages.log 2>&1 &
    echo $! > /tmp/pages.pid
    print_status "✓ Pages started on http://localhost:8788" "$GREEN"

    echo ""
    print_status "Waiting for servers to be ready..." "$YELLOW"
    sleep 5
    echo ""

    check_servers

    echo ""
    print_status "Logs:" "$YELLOW"
    print_status "  Worker: tail -f /tmp/worker.log" "$BLUE"
    print_status "  Pages:  tail -f /tmp/pages.log" "$BLUE"
    echo ""
    print_status "Application URL: http://localhost:8788" "$GREEN"
}

# Stop servers
stop_servers() {
    print_status "Stopping development servers..." "$YELLOW"
    echo ""

    # Stop Worker
    if [ -f /tmp/worker.pid ]; then
        PID=$(cat /tmp/worker.pid)
        if kill $PID 2>/dev/null; then
            print_status "✓ Worker Server stopped" "$GREEN"
        else
            print_status "⚠ Worker Server was not running" "$YELLOW"
        fi
        rm /tmp/worker.pid
    else
        print_status "⚠ Worker PID file not found" "$YELLOW"
    fi

    # Stop Pages
    if [ -f /tmp/pages.pid ]; then
        PID=$(cat /tmp/pages.pid)
        if kill $PID 2>/dev/null; then
            print_status "✓ Pages Server stopped" "$GREEN"
        else
            print_status "⚠ Pages Server was not running" "$YELLOW"
        fi
        rm /tmp/pages.pid
    else
        print_status "⚠ Pages PID file not found" "$YELLOW"
    fi

    echo ""
    check_servers
}

# Restart servers
restart_servers() {
    stop_servers
    sleep 2
    start_servers
}

# Show logs
show_logs() {
    print_status "Choose logs to view:" "$YELLOW"
    echo "1) Worker logs"
    echo "2) Pages logs"
    echo "3) Both logs (side by side)"
    read -p "Enter choice (1-3): " choice

    case $choice in
        1)
            tail -f /tmp/worker.log
            ;;
        2)
            tail -f /tmp/pages.log
            ;;
        3)
            tail -f /tmp/worker.log &
            WORKER_PID=$!
            tail -f /tmp/pages.log
            kill $WORKER_PID 2>/dev/null
            ;;
        *)
            print_status "Invalid choice" "$RED"
            ;;
    esac
}

# Database operations
db_operations() {
    print_status "Database Operations:" "$YELLOW"
    echo "1) View Worker messages"
    echo "2) View Pages messages"
    echo "3) Add test message (Worker DB)"
    echo "4) Clear all messages (Worker DB)"
    read -p "Enter choice (1-4): " choice

    case $choice in
        1)
            echo ""
            print_status "Worker Database Messages:" "$BLUE"
            cd chat-app/worker
            npx wrangler d1 execute chat-history --local --command="SELECT * FROM messages ORDER BY timestamp DESC LIMIT 10"
            ;;
        2)
            echo ""
            print_status "Pages Database Messages:" "$BLUE"
            cd chat-app
            npx wrangler d1 execute chat-history --local --command="SELECT * FROM messages ORDER BY timestamp DESC LIMIT 10"
            ;;
        3)
            echo ""
            read -p "Enter username: " username
            read -p "Enter message: " message
            cd chat-app/worker
            timestamp=$(date +%s)000
            npx wrangler d1 execute chat-history --local --command="INSERT INTO messages (username, message, timestamp) VALUES ('$username', '$message', $timestamp)"
            print_status "✓ Message added" "$GREEN"
            ;;
        4)
            echo ""
            read -p "Are you sure? (yes/no): " confirm
            if [ "$confirm" = "yes" ]; then
                cd chat-app/worker
                npx wrangler d1 execute chat-history --local --command="DELETE FROM messages"
                print_status "✓ All messages cleared" "$GREEN"
            else
                print_status "Operation cancelled" "$YELLOW"
            fi
            ;;
        *)
            print_status "Invalid choice" "$RED"
            ;;
    esac
}

# Reset databases
reset_databases() {
    print_status "Resetting databases..." "$YELLOW"
    echo ""
    read -p "Are you sure you want to reset ALL databases? (yes/no): " confirm

    if [ "$confirm" = "yes" ]; then
        cd chat-app
        print_status "Resetting Worker Database..." "$BLUE"
        cd worker
        npx wrangler d1 execute chat-history --local --command="DROP TABLE IF EXISTS messages"
        npx wrangler d1 execute chat-history --local --file=../database/migrations/0001_init.sql
        print_status "✓ Worker Database reset" "$GREEN"

        echo ""
        print_status "Resetting Pages Database..." "$BLUE"
        cd ../
        npx wrangler d1 execute chat-history --local --command="DROP TABLE IF EXISTS messages"
        npx wrangler d1 execute chat-history --local --file=./database/migrations/0001_init.sql
        print_status "✓ Pages Database reset" "$GREEN"

        echo ""
        print_status "Databases reset successfully!" "$GREEN"
    else
        print_status "Operation cancelled" "$YELLOW"
    fi
}

# Open application
open_app() {
    if which xdg-open > /dev/null 2>&1; then
        xdg-open http://localhost:8788
    elif which open > /dev/null 2>&1; then
        open http://localhost:8788
    else
        print_status "Please open http://localhost:8788 in your browser" "$YELLOW"
    fi
}

# Main menu
show_menu() {
    echo ""
    print_status "Available Commands:" "$YELLOW"
    echo "1) Start Servers"
    echo "2) Stop Servers"
    echo "3) Restart Servers"
    echo "4) Check Status"
    echo "5) View Logs"
    echo "6) Database Operations"
    echo "7) Reset Databases"
    echo "8) Open Application"
    echo "9) Exit"
    echo ""
}

# Main loop
main() {
    while true; do
        show_menu
        read -p "Enter command (1-9): " choice

        case $choice in
            1)
                start_servers
                ;;
            2)
                stop_servers
                ;;
            3)
                restart_servers
                ;;
            4)
                check_servers
                ;;
            5)
                show_logs
                ;;
            6)
                db_operations
                ;;
            7)
                reset_databases
                ;;
            8)
                open_app
                ;;
            9)
                print_status "Goodbye!" "$GREEN"
                exit 0
                ;;
            *)
                print_status "Invalid choice. Please try again." "$RED"
                ;;
        esac
    done
}

# Run main function
main
