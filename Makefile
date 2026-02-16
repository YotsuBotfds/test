.PHONY: help build test dev check clean install lint validate cache audit

help:
	@echo "Survival App Build System"
	@echo "=========================="
	@echo ""
	@echo "Available targets:"
	@echo "  build          - Build the application (minify CSS, process assets)"
	@echo "  test           - Run the test suite"
	@echo "  dev            - Start development server (port 8000)"
	@echo "  check          - Check bundle sizes against budgets"
	@echo "  clean          - Remove build artifacts"
	@echo "  install        - Install dependencies"
	@echo "  lint           - Run ESLint on JavaScript files"
	@echo "  validate       - Validate HTML files"
	@echo "  cache          - Build with cache validation"
	@echo "  search-index   - Build the enriched search index with keywords"
	@echo "  all            - Run install, build, validate, and test"
	@echo "  help           - Show this help message"

build:
	npm run build

build-css:
	npm run build:css

test:
	npm test

dev:
	npm run dev

check:
	npm run check-sizes

validate:
	npm run build:validate

cache:
	npm run build:cache

lint:
	npx eslint js/ scripts/ tests/ --fix

audit:
	npm audit --production

search-index:
	node scripts/build-search-index.js

install:
	npm ci

clean:
	rm -rf dist/ build/ node_modules/
	find . -name "*.min.css" -delete
	find . -name "*.min.js" -delete

all: install build validate test check
	@echo ""
	@echo "Build process completed successfully!"

.DEFAULT_GOAL := help
