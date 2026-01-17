.PHONY: dev build release clean docs docs-dev docs-preview

dev:
	pnpm tauri dev

build:
	pnpm install --frozen-lockfile && pnpm tauri build

release:
	./scripts/release.sh

clean:
	rm -rf src-tauri/target/release/bundle

docs:
	pnpm docs:build

docs-dev:
	pnpm docs:dev

docs-preview:
	pnpm docs:preview
