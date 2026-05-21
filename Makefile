.PHONY: dev build release clean kill docs docs-dev docs-preview test-e2e-setup test-e2e license license-check

dev:
	exec ./node_modules/.bin/tauri dev

build:
	pnpm install --frozen-lockfile && pnpm tauri build

release:
	./scripts/release.sh

license:
	./scripts/license-headers.sh

license-check:
	./scripts/license-headers.sh --check

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

test-e2e-setup:
	./scripts/local-k8s/setup.sh

test-e2e:
	@echo "Building debug binary..."
	pnpm tauri build --debug
	@# Pre-flight checks
	@KUBECONFIG="$$(pwd)/scripts/local-k8s/config/kubeconfig.yaml"; \
	KUBBY_CONFIG="$$(pwd)/scripts/local-k8s/config/kubby_config.yaml"; \
	if [ ! -f "$$KUBECONFIG" ]; then \
		echo "Error: $$KUBECONFIG not found. Run 'make test-e2e-setup' first."; \
		exit 1; \
	fi; \
	if [ ! -f "$$KUBBY_CONFIG" ]; then \
		echo "Error: $$KUBBY_CONFIG not found. Run 'make test-e2e-setup' first."; \
		exit 1; \
	fi; \
	echo "KUBECONFIG=$$KUBECONFIG"; \
	echo "KUBBY_CONFIG=$$KUBBY_CONFIG"; \
	export KUBECONFIG; \
	export KUBBY_CONFIG; \
	echo "Verifying cluster connectivity..."; \
	if ! kubectl --kubeconfig "$$KUBECONFIG" cluster-info > /dev/null 2>&1; then \
		echo "Error: Cannot reach cluster. Is minikube running? Try: minikube start -p stellar-local"; \
		exit 1; \
	fi; \
	rm -f /tmp/kubby-e2e-shell /tmp/kubby-e2e-ai /tmp/kubby-e2e-editor; \
	echo "Launching app and running tests..."; \
	./src-tauri/target/debug/kubby > /tmp/kubby-e2e.log 2>&1 & APP_PID=$$!; \
	echo "App PID: $$APP_PID"; \
	for i in $$(seq 1 30); do \
		if curl -s http://127.0.0.1:4445/status > /dev/null 2>&1; then \
			echo "WebDriver ready on :4445"; \
			break; \
		fi; \
		if ! kill -0 $$APP_PID 2>/dev/null; then \
			echo "App exited unexpectedly. Logs:"; \
			cat /tmp/kubby-e2e.log; \
			exit 1; \
		fi; \
		sleep 1; \
	done; \
	pnpm test:e2e; \
	TEST_EXIT=$$?; \
	kill $$APP_PID 2>/dev/null; \
	if [ $$TEST_EXIT -ne 0 ]; then \
		echo "--- App logs ---"; \
		tail -50 /tmp/kubby-e2e.log; \
	fi; \
	exit $$TEST_EXIT
