#!/bin/bash

# Enhanced MentraOS - Git Ignore Verification Script
# =============================================================================
# This script tests the effectiveness of .gitignore patterns for dependencies,
# subrepos, and sensitive files to ensure maximum upstream protection.
# =============================================================================

set -e

echo "🔍 Git Ignore Verification Script"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Function to test if files/directories are ignored
test_ignored() {
    local test_name="$1"
    shift
    local files=("$@")

    echo -e "${BLUE}Testing: $test_name${NC}"

    local all_ignored=true
    for file in "${files[@]}"; do
        if git check-ignore "$file" > /dev/null 2>&1; then
            echo -e "  ✅ ${GREEN}$file${NC} - correctly ignored"
        else
            echo -e "  ❌ ${RED}$file${NC} - NOT IGNORED (CRITICAL!)"
            all_ignored=false
        fi
    done

    if $all_ignored; then
        echo -e "  ${GREEN}✅ PASSED: All files properly ignored${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "  ${RED}❌ FAILED: Some files not ignored${NC}"
        ((TESTS_FAILED++))
    fi
    echo ""
}

# Function to create test files/directories
create_test_structure() {
    echo -e "${YELLOW}🏗️  Creating test file structure...${NC}"

    # Create directories first
    mkdir -p test-node-modules/package
    mkdir -p test-deps/library
    mkdir -p test-vendor/external
    mkdir -p test-.git/hooks
    mkdir -p test-submodules/repo/.git
    mkdir -p .test-cache/temp
    mkdir -p dist/build
    mkdir -p coverage/reports
    mkdir -p .nyc_output/temp
    mkdir -p logs/app
    mkdir -p tmp/temp
    mkdir -p .docker/build
    mkdir -p .terraform/state
    mkdir -p .gradle/cache
    mkdir -p target/classes
    mkdir -p vendor/bundle
    mkdir -p __pycache__/cache
    mkdir -p .venv/lib
    mkdir -p .bundle/gems

    # Create test files
    echo "test dependency" > test-node-modules/package/index.js
    echo "test library" > test-deps/library/lib.js
    echo "test external" > test-vendor/external/vendor.js
    echo "git config" > test-.git/config
    echo "git head" > test-.git/HEAD
    echo "submodule config" > test-submodules/repo/.git/config
    echo "SECRET_KEY=abc123" > .test-env
    echo "TEST_API_KEY=xyz789" > .env.test
    echo "password=secret" > config.local.json
    echo "test log" > app.log
    echo "debug info" > debug.log
    echo "npm debug" > npm-debug.log
    echo "yarn error" > yarn-error.log
    echo "test output" > dist/bundle.js
    echo "coverage data" > coverage/lcov.info
    echo "nyc temp" > .nyc_output/temp.json
    echo "temp file" > tmp/tempfile.txt
    echo "docker file" > .docker/Dockerfile.local
    echo "terraform state" > .terraform/terraform.tfstate
    echo "gradle cache" > .gradle/cache.properties
    echo "java target" > target/classes/App.class
    echo "ruby gems" > vendor/bundle/gem.rb
    echo "python cache" > __pycache__/module.pyc
    echo "venv lib" > .venv/lib/python.so
    echo "bundle cache" > .bundle/config
    echo "redis dump" > dump.rdb
    echo "sqlite db" > database.sqlite
    echo "ssl cert" > certificate.pem
    echo "private key" > private.key
    echo "jwt token" > token.jwt

    echo -e "${GREEN}✅ Test structure created${NC}"
    echo ""
}

# Function to clean up test files
cleanup_test_structure() {
    echo -e "${YELLOW}🧹 Cleaning up test structure...${NC}"

    rm -rf test-node-modules test-deps test-vendor test-.git test-submodules
    rm -rf .test-cache dist coverage .nyc_output logs tmp .docker .terraform
    rm -rf .gradle target vendor __pycache__ .venv .bundle
    rm -f .test-env .env.test config.local.json app.log debug.log
    rm -f npm-debug.log yarn-error.log dump.rdb database.sqlite
    rm -f certificate.pem private.key token.jwt

    echo -e "${GREEN}✅ Test structure cleaned${NC}"
    echo ""
}

# Main verification function
run_verification() {
    echo -e "${BLUE}🚀 Starting Git Ignore Verification${NC}"
    echo "======================================"
    echo ""

    # Check if we're in a git repository
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        echo -e "${RED}❌ Not in a git repository. Please run 'git init' first.${NC}"
        exit 1
    fi

    # Create test structure
    create_test_structure

    # Test 1: Node.js Dependencies
    test_ignored "Node.js Dependencies" \
        "test-node-modules/" \
        "test-node-modules/package/" \
        "test-node-modules/package/index.js"

    # Test 2: General Dependencies
    test_ignored "General Dependencies" \
        "test-deps/" \
        "test-vendor/" \
        "test-deps/library/lib.js" \
        "test-vendor/external/vendor.js"

    # Test 3: Git Directories (Subrepos)
    test_ignored "Git Directories (Subrepos)" \
        "test-.git/" \
        "test-.git/config" \
        "test-.git/HEAD" \
        "test-submodules/repo/.git/" \
        "test-submodules/repo/.git/config"

    # Test 4: Environment Files
    test_ignored "Environment Files" \
        ".test-env" \
        ".env.test" \
        "config.local.json"

    # Test 5: Log Files
    test_ignored "Log Files" \
        "app.log" \
        "debug.log" \
        "npm-debug.log" \
        "yarn-error.log"

    # Test 6: Build Artifacts
    test_ignored "Build Artifacts" \
        "dist/" \
        "dist/bundle.js" \
        "coverage/" \
        "coverage/lcov.info" \
        ".nyc_output/" \
        ".nyc_output/temp.json"

    # Test 7: Temporary Files
    test_ignored "Temporary Files" \
        "tmp/" \
        "tmp/tempfile.txt" \
        ".test-cache/"

    # Test 8: Container & Infrastructure
    test_ignored "Container & Infrastructure Files" \
        ".docker/" \
        ".docker/Dockerfile.local" \
        ".terraform/" \
        ".terraform/terraform.tfstate"

    # Test 9: Language-Specific Build Artifacts
    test_ignored "Language-Specific Build Artifacts" \
        ".gradle/" \
        "target/" \
        "vendor/" \
        "__pycache__/" \
        ".venv/" \
        ".bundle/"

    # Test 10: Security Files
    test_ignored "Security Files" \
        "certificate.pem" \
        "private.key" \
        "token.jwt" \
        "dump.rdb" \
        "database.sqlite"

    # Clean up
    cleanup_test_structure

    # Final results
    echo "======================================"
    echo -e "${BLUE}📊 VERIFICATION RESULTS${NC}"
    echo "======================================"
    echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}🎉 ALL TESTS PASSED!${NC}"
        echo -e "${GREEN}✅ Your .gitignore provides maximum protection against:${NC}"
        echo -e "   • Dependencies (node_modules, vendor, etc.)"
        echo -e "   • Subrepos (git directories, submodules)"
        echo -e "   • Environment files and secrets"
        echo -e "   • Build artifacts and temporary files"
        echo -e "   • Log files and debug information"
        echo -e "   • Security-sensitive files"
        echo ""
        echo -e "${GREEN}🔒 Your repository is secure for upstream commits!${NC}"
        return 0
    else
        echo -e "${RED}⚠️  SOME TESTS FAILED!${NC}"
        echo -e "${RED}❌ Your .gitignore needs attention. Check the patterns above.${NC}"
        echo ""
        echo -e "${YELLOW}💡 Recommendations:${NC}"
        echo -e "   1. Review and update .gitignore patterns"
        echo -e "   2. Add missing exclusion patterns for failed tests"
        echo -e "   3. Test again with: ./scripts/verify-gitignore.sh"
        echo -e "   4. NEVER commit if tests are failing!"
        return 1
    fi
}

# Additional utility functions
show_git_status_check() {
    echo -e "${BLUE}🔍 Current Git Status Check${NC}"
    echo "=============================="

    # Check for common problematic patterns
    local problematic_files=$(git status --porcelain 2>/dev/null | grep -E "(node_modules|vendor|\.git/|deps/|\.env|\.log|dist/|build/|coverage/)" || true)

    if [ -z "$problematic_files" ]; then
        echo -e "${GREEN}✅ No problematic files in git status${NC}"
    else
        echo -e "${RED}⚠️  Found potentially problematic files:${NC}"
        echo "$problematic_files"
        echo ""
        echo -e "${YELLOW}💡 Consider adding these patterns to .gitignore${NC}"
    fi
    echo ""
}

show_large_files_check() {
    echo -e "${BLUE}📏 Large Files Check${NC}"
    echo "==================="

    # Find files larger than 1MB
    local large_files=$(find . -type f -size +1M 2>/dev/null | grep -v ".git/" | head -10 || true)

    if [ -z "$large_files" ]; then
        echo -e "${GREEN}✅ No large files found (>1MB)${NC}"
    else
        echo -e "${YELLOW}⚠️  Found large files (consider Git LFS):${NC}"
        for file in $large_files; do
            local size=$(du -h "$file" | cut -f1)
            echo "  $file ($size)"
        done
    fi
    echo ""
}

# Parse command line arguments
case "${1:-verify}" in
    "verify")
        run_verification
        ;;
    "status")
        show_git_status_check
        ;;
    "large")
        show_large_files_check
        ;;
    "all")
        run_verification
        show_git_status_check
        show_large_files_check
        ;;
    "help")
        echo "Git Ignore Verification Script"
        echo ""
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  verify (default)  - Run full .gitignore verification tests"
        echo "  status           - Check current git status for problematic files"
        echo "  large            - Check for large files that might need Git LFS"
        echo "  all              - Run all checks"
        echo "  help             - Show this help message"
        echo ""
        exit 0
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo "Use '$0 help' for usage information"
        exit 1
        ;;
esac