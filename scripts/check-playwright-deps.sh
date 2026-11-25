#!/usr/bin/env bash
set -euo pipefail

# Standalone verification of the Playwright chromium dependency set for the
# currently cached playwright-core (used by this project's e2e setup).
#
# This mirrors what `npx playwright install --with-deps chromium` would
# install on ubuntu24.04-x64 by reading the cached browser bundle's
# `deb.deps` and the playwright-core install command. It does not require
# sudo or network access; it only inspects the already-downloaded browser
# package metadata.
#
# Run from the project root:
#   bash scripts/check-playwright-deps.sh

set -euo pipefail

PLAYWRIGHT_CACHE_DIR="${PLAYWRIGHT_CACHE_DIR:-${HOME}/.cache/ms-playwright}"
HEADLESS_SHELL_DIR="${PLAYWRIGHT_CACHE_DIR}/chromium_headless_shell-1234/chrome-headless-shell-linux64"
CHROMIUM_DIR="${PLAYWRIGHT_CACHE_DIR}/chromium-1234/chrome-linux64"

if [ ! -f "$HEADLESS_SHELL_DIR/deb.deps" ]; then
  echo "ERROR: missing $HEADLESS_SHELL_DIR/deb.deps" >&2
  echo "Expected playwright-core chromium headless shell cache at:" >&2
  echo "  $HEADLESS_SHELL_DIR" >&2
  echo "If browsers were installed in a different cache dir, set PLAYWRIGHT_CACHE_DIR." >&2
  exit 1
fi

if [ ! -f "$CHROMIUM_DIR/deb.deps" ]; then
  echo "WARNING: missing $CHROMIUM_DIR/deb.deps; only headless shell deps will be printed." >&2
fi

echo "==> Playwright chromium headless shell dependencies (deb.deps)"
echo "$HEADLESS_SHELL_DIR/deb.deps" | awk '{print $1}' | sort -u

if [ -f "$CHROMIUM_DIR/deb.deps" ]; then
  echo
  echo "==> Playwright chromium (full chrome) dependencies (deb.deps)"
  echo "$CHROMIUM_DIR/deb.deps" | awk '{print $1}' | sort -u
fi

echo
echo "==> Playwright-core install command (node, chromium)"
node - <<'NODE'
const b = require('./node_modules/playwright-core/lib/coreBundle.js');
if (b && b.registry && b.registry.buildPlaywrightCLICommand) {
  console.log(b.registry.buildPlaywrightCLICommand('node', 'install chromium'));
} else {
  console.log('npx playwright install chromium');
}
NODE

echo
echo "NOTE: Ubuntu 24.04 ships t64 multiarch variants for some libraries"
echo "      (for example libasound2t64, libnss3, libglib2.0-0t64). The deb.deps"
echo "      above list the upstream package names; on ubuntu24.04-x64 the"
echo "      playwright-core dependency table maps those to the t64 packages."
echo "      A CI machine should install the t64 packages where applicable."
