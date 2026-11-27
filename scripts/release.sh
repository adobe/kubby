#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

REPO="adobe/kubby"
VERSION=$(node -p "require('./package.json').version")
TAG="v${VERSION}"

echo -e "${YELLOW}🚀 Releasing kubby ${TAG}${NC}"

# Pre-flight checks
BRANCH=$(git branch --show-current)
[ "$BRANCH" != "main" ] && echo -e "${RED}Error: Must be on main branch${NC}" && exit 1
git rev-parse "$TAG" >/dev/null 2>&1 && echo -e "${RED}Error: Tag ${TAG} already exists${NC}" && exit 1
GH_USER=$(gh api user --jq .login 2>/dev/null || true)
if [ "$(gh api "repos/${REPO}" --jq .permissions.push 2>/dev/null)" != "true" ]; then
    echo -e "${RED}Error: gh account '${GH_USER}' cannot publish releases to ${REPO}. Switch with: gh auth switch -u <account>${NC}"
    exit 1
fi

# Apply / refresh license headers and auto-commit any drift before tagging
echo -e "${YELLOW}📝 Updating license headers...${NC}"
./scripts/license-headers.sh
if [ -n "$(git status --porcelain)" ]; then
    if [ -n "$(git status --porcelain | grep -v -E '^.. (LICENSE_HEADER\.md|src/|src-tauri/src/|e2e/|scripts/|docs/\.vitepress/)')" ]; then
        echo -e "${RED}Error: Uncommitted changes outside of license-header scope. Commit or stash first.${NC}"
        git status --short
        exit 1
    fi
    echo -e "${YELLOW}📝 Committing license header updates...${NC}"
    git add -A
    git commit -m "chore: refresh license headers for ${TAG}"
fi

# Confirm
echo "This will build, tag ${TAG}, and publish to GitHub."
read -p "Continue? (Y/n) " -n 1 -r
echo
[[ $REPLY == ^[Nn]$ ]] && exit 1

# Build
echo -e "${YELLOW}🔨 Building...${NC}"
pnpm install --frozen-lockfile
pnpm tauri build

# Find DMG
DMG=$(find src-tauri/target/release/bundle/dmg -name "*.dmg" | head -1)
[ -z "$DMG" ] && echo -e "${RED}Error: No DMG found${NC}" && exit 1
echo -e "${GREEN}✓ Built: ${DMG}${NC}"

# Tag and release
git tag -a "$TAG" -m "Release ${TAG}"
git push upstream "$TAG"

gh release create "$TAG" \
    --repo "$REPO" \
    --title "Release ${TAG}" \
    --generate-notes \
    "$DMG"

echo -e "${GREEN}✅ Released ${TAG}${NC}"

# Build and deploy docs
echo -e "${YELLOW}📚 Building documentation...${NC}"
pnpm docs:build

echo -e "${YELLOW}📤 Deploying docs to GitHub Pages...${NC}"
DOCS_DIST="docs/.vitepress/dist"

# Create a temporary directory for gh-pages deployment
TEMP_DIR=$(mktemp -d)
cp -r "${DOCS_DIST}/"* "${TEMP_DIR}/"

# Switch to gh-pages branch, update, and push
git worktree add --detach gh-pages-deploy gh-pages 2>/dev/null || {
    # If gh-pages branch doesn't exist, create it as orphan
    git worktree add --detach gh-pages-deploy
    cd gh-pages-deploy
    git checkout --orphan gh-pages
    git rm -rf . 2>/dev/null || true
    cd ..
}

cd gh-pages-deploy
git rm -rf . 2>/dev/null || true
cp -r "${TEMP_DIR}/"* .
git add .
KUBBY_VERSION_HOOK=1 git commit -m "docs: deploy for ${TAG}"
git push upstream HEAD:gh-pages --force
cd ..

# Cleanup
git worktree remove gh-pages-deploy --force
rm -rf "${TEMP_DIR}"

echo -e "${GREEN}✅ Docs deployed to GitHub Pages${NC}"
echo -e "${GREEN}📖 View at: https://adobe.github.io/kubby/${NC}"
