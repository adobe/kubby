.PHONY: dev build release clean kill docs docs-dev docs-preview

dev:
	exec ./node_modules/.bin/tauri dev

build:
	pnpm install --frozen-lockfile && pnpm tauri build

release:
	./scripts/release.sh

clean:
	rm -rf src-tauri/target/release/bundle

kill:
	-killall kubby 2>/dev/null || true
	-killall Kubby 2>/dev/null || true
	-lsof -ti:1420 | xargs kill -9 2>/dev/null || true
	-pkill -9 -f "tauri dev" 2>/dev/null || true
	-pkill -9 -f "target/debug/kubby" 2>/dev/null || true
	-pkill -9 -f "vite" 2>/dev/null || true

docs:
	pnpm docs:build

docs-dev:
	pnpm docs:dev

docs-preview:
	pnpm docs:preview
