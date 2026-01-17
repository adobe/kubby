.PHONY: dev build release clean

dev:
	pnpm tauri dev

build:
	pnpm install --frozen-lockfile && pnpm tauri build

release:
	./scripts/release.sh

clean:
	rm -rf src-tauri/target/release/bundle
