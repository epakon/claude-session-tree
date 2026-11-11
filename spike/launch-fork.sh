#!/bin/sh
# Usage: launch-fork.sh <session-uuid> <brief-file>
# Opens a new Terminal window running an interactive claude session, the way /fork will.
set -eu
session=$1
brief=$(cd "$(dirname "$2")" && pwd)/$(basename "$2")
repo=$(cd "$(dirname "$0")/.." && pwd)

launch="$repo/spike/out/launch-$session.sh"
mkdir -p "$repo/spike/out"
cat > "$launch" <<EOF
#!/bin/sh
cd '$repo'
exec claude --plugin-dir '$repo/spike/probe-plugin' --session-id '$session' "\$(cat '$brief')"
EOF
chmod +x "$launch"

osascript -e "tell application \"Terminal\" to do script \"sh '$launch'\"" -e 'tell application "Terminal" to activate'
echo "launched $launch"
