#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

VERSION=$(node -p "require('./package.json').version")
TAG="v${VERSION}"

echo -e "${YELLOW}🚀 Releasing kubby ${TAG}${NC}"

# Pre-flight checks
BRANCH=$(git branch --show-current)
[ "$BRANCH" != "main" ] && echo -e "${RED}Error: Must be on main branch${NC}" && exit 1
[ -n "$(git status --porcelain)" ] && echo -e "${RED}Error: Uncommitted changes${NC}" && exit 1
git rev-parse "$TAG" >/dev/null 2>&1 && echo -e "${RED}Error: Tag ${TAG} already exists${NC}" && exit 1

# Confirm
echo "This will build, tag ${TAG}, and publish to GitHub."
read -p "Continue? (y/N) " -n 1 -r
echo
[[ ! $REPLY =~ ^[Yy]$ ]] && exit 1

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
    --repo OneAdobe/kubby \
    --title "Release ${TAG}" \
    --generate-notes \
    "$DMG"

echo -e "${GREEN}✅ Released ${TAG}${NC}"
