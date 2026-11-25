#!/usr/bin/env bash
set -euo pipefail
#
# Print the Playwright chromium dependencies that the project's CI step
# (`npx playwright install --with-deps chromium`) installs on ubuntu24.04-x64,
# based on the cached browser package metadata in this environment.
#
# This is informational only — it does not install anything and does not
# require sudo or network access.

PLAYWRIGHT_CACHE_DIR="${PLAYWRIGHT_CACHE_DIR:-${HOME}/.cache/ms-playwright}"
HEADLESS_SHELL_DEB="${PLAYWRIGHT_CACHE_DIR}/chromium_headless_shell-1234/chrome-headless-shell-linux64/deb.deps"
CHROMIUM_DEB="${PLAYWRIGHT_CACHE_DIR}/chromium-1234/chrome-linux64/deb.deps"

if [ ! -f "$HEADLESS_SHELL_DEB" ]; then
  echo "ERROR: cannot find cached Playwright chromium headless shell deb.deps at:" >&2
  echo "  $HEADLESS_SHELL_DEB" >&2
  echo "The playwright-core browser cache is expected at $PLAYWRIGHT_CACHE_DIR." >&2
  echo "If browsers were downloaded to another location, set PLAYWRIGHT_CACHE_DIR." >&2
  exit 1
fi

echo "=== Playwright chromium headless shell dependencies (deb.deps) ==="
awk '{print $1}' "$HEADLESS_SHELL_DEB" | sort -u

if [ -f "$CHROMIUM_DEB" ]; then
  echo
  echo "=== Playwright chromium (full Chrome) dependencies (deb.deps) ==="
  awk '{print $1}' "$CHROMIUM_DEB" | sort -u
fi

echo
echo "=== Install command used by the project's CI ==="
echo "npx playwright install --with-deps chromium"

echo
echo "NOTE: On Ubuntu 24.04 the playwright-core dependency table maps many of"
echo "      the packages above to their t64 (multiarch) variants, e.g.:"
echo "        libasound2      -> libasound2t64"
echo "        libnspr4        -> libnspr4 (unchanged)"
echo "        libnss3         -> libnss3 (unchanged)"
echo "        libglib2.0-0    -> libglib2.0-0t64"
echo "      The CI step installs the correct t64 packages automatically."
