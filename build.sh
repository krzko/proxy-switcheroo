#!/bin/bash

# Build script for Firefox Proxy Switcheroo Extension
# This script compiles TypeScript to JavaScript with proper ES module extensions
# and prepares the extension for loading in Firefox
set -e

echo "🔧 Building Firefox Proxy Switcheroo Extension..."

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist build signed

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    pnpm install
fi

# Compile TypeScript
echo "⚙️  Compiling TypeScript..."
pnpm exec tsc

# Copy static assets
echo "📋 Copying static assets..."
mkdir -p extension/assets extension/vendor

# Copy HTML and CSS files to root extension directory (single source of truth)
cp extension/src/popup/popup.html extension/
cp extension/src/popup/popup.css extension/
cp extension/src/options/options.html extension/
cp extension/src/options/options.css extension/

# Copy vendor files
if [ -f "node_modules/webextension-polyfill/dist/browser-polyfill.min.js" ]; then
    cp node_modules/webextension-polyfill/dist/browser-polyfill.min.js extension/vendor/webextension-polyfill.js
    echo "✅ Copied webextension-polyfill.js"
else
    echo "⚠️  webextension-polyfill.js not found in node_modules, using placeholder"
fi

# Validate manifest
echo "🔍 Validating extension..."
pnpm exec web-ext lint --source-dir=extension || echo "⚠️  Linting warnings found"

# Build extension
echo "📦 Building extension package..."
pnpm exec web-ext build --source-dir=extension --artifacts-dir=build --overwrite-dest

echo "✅ Build completed successfully!"
echo "📁 Extension package created in: build/"
echo ""
echo "To test the extension:"
echo "  pnpm run dev        - Run in default Firefox"
echo "  pnpm run dev:nightly - Run in Firefox Nightly"
echo ""
echo "To install manually:"
echo "  1. Open Firefox"
echo "  2. Go to about:debugging"
echo "  3. Click 'This Firefox'"
echo "  4. Click 'Load Temporary Add-on'"
echo "  5. Select the manifest.json file in the extension/ directory"