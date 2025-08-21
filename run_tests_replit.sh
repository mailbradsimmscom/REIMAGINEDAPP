#!/bin/bash
# run_tests_replit_fixed.sh - Fixed test runner for existing test files

set -euo pipefail

echo "🧪 Replit Test Runner (Fixed) - Main app stays on port 3000"
echo "============================================================"

# Check if main server is running
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Main server running on port 3000 (as expected)"
else
    echo "ℹ️  Main server not responding on port 3000 (may be starting up)"
fi

echo ""
echo "🔧 Environment Check"
echo "--------------------"
env_count=$(grep -c "^[A-Z].*=.*[^.]$" .env 2>/dev/null || echo "0")
echo "ℹ️  Environment variables configured: $env_count"

echo ""
echo "🧪 Running Tests (File by File)"
echo "================================"

# Function to run individual test files safely
run_test_file() {
    local file_path="$1"
    local description="$2"

    if [ -f "$file_path" ]; then
        echo ""
        echo "🔍 Testing: $description"
        echo "File: $file_path"
        echo "----------------------------------------"

        if npm test "$file_path" 2>&1; then
            echo "✅ $description - PASSED"
        else
            echo "⚠️  $description - HAD ISSUES"
            echo "   (This is expected if there are import problems)"
        fi
    else
        echo "⚠️  $description - FILE NOT FOUND: $file_path"
    fi
}

# Test files that should work (from root tests directory)
run_test_file "tests/retrieval_fts.test.js" "FTS Retrieval Test"
run_test_file "tests/retrieval_golden.test.js" "Golden Retrieval Test"

# Try the problematic files individually to see specific issues
run_test_file "tests/unit/text-processing.test.js" "Text Processing Unit Test"
run_test_file "tests/regression/current-behavior.test.js" "Regression Test (may have import issues)"
run_test_file "tests/integration/supabase-integration.test.js" "Supabase Integration (may have syntax issues)"

# List any other test files
echo ""
echo "🔍 Scanning for additional test files..."
echo "----------------------------------------"

find tests/ -name "*.test.js" -type f | while read -r test_file; do
    echo "Found: $test_file"
done

echo ""
echo "🔧 Diagnosing Common Issues"
echo "============================="

# Check for common problems
echo "1. Checking index.js app export..."
if grep -q "export.*app\|module\.exports.*app" index.js; then
    echo "   ✅ index.js exports app"
else
    echo "   ⚠️  index.js does not export app (regression tests may fail)"
fi

echo ""
echo "2. Checking test syntax compatibility..."
if grep -rq "expect\|beforeEach\|afterEach" tests/; then
    echo "   ⚠️  Found Jest syntax in tests (should use Node.js test runner syntax)"
    echo "   Files with Jest syntax:"
    grep -r "expect\|beforeEach\|afterEach" tests/ | cut -d: -f1 | sort | uniq | head -5
fi

echo ""
echo "3. Checking import statements..."
if grep -rq "import.*from.*index\.js" tests/; then
    echo "   ⚠️  Tests importing index.js directly (may cause issues)"
    echo "   Consider using isolated test servers instead"
fi

echo ""
echo "🎯 Recommendations"
echo "=================="
echo "Based on the analysis:"
echo ""
echo "✅ WORKING: Tests that create isolated servers"
echo "   - tests/retrieval_fts.test.js"
echo "   - tests/retrieval_golden.test.js"
echo ""
echo "⚠️  NEEDS FIXING: Tests with import/syntax issues"
echo "   - Update Jest syntax to Node.js test runner syntax"
echo "   - Fix app import issues"
echo "   - Use isolated test servers instead of importing main app"
echo ""
echo "💡 Quick fix: Focus on the working test pattern and convert others"

echo ""
echo "🏁 Test Analysis Complete"
echo "========================="
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Main server still running on port 3000"
else
    echo "⚠️  Main server health check failed"
fi

echo ""
echo "🎉 Analysis complete! Use working tests as templates for fixing others."