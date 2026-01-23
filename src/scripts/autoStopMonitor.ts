export const AUTO_STOP_SCRIPT = `#!/bin/sh
set -e

TIMEOUT_MINUTES="\${1:-5}"
SSH_PORT="\${2:-22}"

# Convert minutes to seconds
TIMEOUT_SECONDS=$((TIMEOUT_MINUTES * 60))

# PID file to prevent multiple instances
PIDFILE="/var/run/acm-auto-stop.pid"

if [ -f "$PIDFILE" ]; then
    PID=$(cat "$PIDFILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "Auto-stop monitor already running (PID $PID)"
        exit 0
    fi
fi

echo $$ > "$PIDFILE"

echo "Starting auto-stop monitor (Timeout: \${TIMEOUT_MINUTES}m, Port: \${SSH_PORT})"

# Grace period: Wait 2 minutes before first check to allow services to start
sleep 120

LAST_ACTIVITY=$(date +%s)

while true; do
    sleep 60

    CURRENT_TIME=$(date +%s)
    
    # Check for established SSH connections
    # We use netstat if available, otherwise assume active to be safe (or try ss/lsof)
    if command -v netstat >/dev/null 2>&1; then
        # Check for ESTABLISHED connections on port 22
        # -an means all, numeric
        # grep ":$SSH_PORT " matches the local address port
        CONNECTIONS=$(netstat -an | grep ":$SSH_PORT " | grep "ESTABLISHED" | wc -l)
    elif command -v ss >/dev/null 2>&1; then
        CONNECTIONS=$(ss -tn state established "( dport = :$SSH_PORT )" | grep -v "Recv-Q" | wc -l)
    else
        # Fallback: check if any sshd process is running as a child of another sshd (indicating a session)
        # This is rough but works on some systems where net tools are missing
        # A better fallback might be to do nothing or warn
        echo "Warning: netstat/ss not found, cannot monitor connections. Auto-stop disabled."
        rm "$PIDFILE"
        exit 1
    fi

    if [ "$CONNECTIONS" -gt 0 ]; then
        LAST_ACTIVITY=$CURRENT_TIME
    fi

    ELAPSED=$((CURRENT_TIME - LAST_ACTIVITY))

    if [ "$ELAPSED" -ge "$TIMEOUT_SECONDS" ]; then
        echo "No SSH activity for $TIMEOUT_MINUTES minutes. Stopping container..."
        rm "$PIDFILE"
        # Try to shutdown gracefully
        if command -v shutdown >/dev/null 2>&1; then
            shutdown -h now
        else
            # Fallback to init 0 or poweroff
            poweroff || halt || init 0
        fi
        exit 0
    fi
done
`;
