#!/bin/bash
# Home Mind Update Script
# Checks for updates, shows what changed, and lets the user decide whether to update.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "Home Mind Update"
echo "================"
echo ""

# Make sure we're on main
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "ERROR: Not on main branch (currently on '$CURRENT_BRANCH')"
    echo "Switch to main first: git checkout main"
    exit 1
fi

# Check for uncommitted changes that would block a pull
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    echo "ERROR: You have uncommitted changes. Commit or stash them first."
    git status --short
    exit 1
fi

# Fetch latest from origin
echo "Checking for updates..."
git fetch origin main --quiet

LOCAL_HEAD=$(git rev-parse HEAD)
REMOTE_HEAD=$(git rev-parse origin/main)

if [ "$LOCAL_HEAD" = "$REMOTE_HEAD" ]; then
    echo "Already up to date."
    exit 0
fi

# Show what's new
COMMIT_COUNT=$(git rev-list --count "$LOCAL_HEAD".."$REMOTE_HEAD")
echo ""
echo "Updates available ($COMMIT_COUNT commit(s)):"
echo "----------------------------------------------"
git log --oneline --no-decorate "$LOCAL_HEAD".."$REMOTE_HEAD"
echo "----------------------------------------------"
echo ""

# Show which files changed
echo "Files changed:"
git diff --stat "$LOCAL_HEAD".."$REMOTE_HEAD"
echo ""

# Ask user whether to proceed
read -r -p "Apply update and redeploy? [y/N] " response
case "$response" in
    [yY][eE][sS]|[yY])
        ;;
    *)
        echo "Update cancelled."
        exit 0
        ;;
esac

echo ""
echo "Pulling changes..."
git pull origin main --ff-only

echo ""
echo "Deploying..."
"$SCRIPT_DIR/deploy.sh"
