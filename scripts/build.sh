#!/bin/bash
# Build: host src/index.ts → lib/index.js (+ lib/types) with the dsh checkout's
# tsc; client src/client/index.ts → lib/client.js (window.__ModuleLoader__
# bundle) with the checkout's tsdown; client typecheck with the checkout's
# @types/react. Requires DSH_CHECKOUT pointing at a dsh source checkout
# (auto-probe below).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# DSH_CHECKOUT 探测：环境变量 → 常见路径
CHECKOUT="${DSH_CHECKOUT:-}"
if [ -z "$CHECKOUT" ]; then
  for candidate in "$HOME/dsh-harness" "$HOME/dsh" "$HOME/.dsh/dsh-harness"; do
    if [ -d "$candidate/packages" ]; then CHECKOUT="$candidate"; break; fi
  done
fi
if [ -z "$CHECKOUT" ] || [ ! -d "$CHECKOUT/packages" ]; then
  echo "build: cannot locate the dsh checkout (set DSH_CHECKOUT)" >&2
  exit 1
fi

TSC="$CHECKOUT/node_modules/.bin/tsc"
TSDOWN="$CHECKOUT/node_modules/.bin/tsdown"
if [ ! -x "$TSC" ] && [ ! -f "$TSC.cmd" ] && [ ! -f "$TSC.CMD" ]; then
  echo "build: tsc not found at $TSC" >&2
  exit 1
fi
if [ ! -x "$TSDOWN" ] && [ ! -f "$TSDOWN.cmd" ] && [ ! -f "$TSDOWN.CMD" ]; then
  echo "build: tsdown not found at $TSDOWN" >&2
  exit 1
fi

link_pkg() {
  local link="$ROOT/node_modules/$1"
  local target="$2"
  if [ ! -e "$target" ]; then
    echo "build: dependency target missing: $target" >&2
    exit 1
  fi
  node -e "
    const fs = require('fs');
    const path = require('path');
    const link = path.resolve(process.argv[1]);
    const target = path.resolve(process.argv[2]);
    fs.rmSync(link, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  " "$link" "$target"
}

echo "=== Linking build dependencies (checkout: $CHECKOUT) ==="
mkdir -p node_modules/@types
node -e "
  const fs = require('fs');
  for (const p of ['node_modules/react', 'node_modules/@types/react', 'node_modules/@types/node']) {
    fs.rmSync(p, { recursive: true, force: true });
  }
"
# @types/node（host 编译类型；checkout 自带）
link_pkg @types/node "$CHECKOUT/node_modules/@types/node"
# react + @types/react（client bundle 的平台种子模块 + client 类型检查）
REACT_DIR=$(find "$CHECKOUT/node_modules/.pnpm" -maxdepth 1 -type d -iname 'react@*' 2>/dev/null | head -1)
if [ -n "$REACT_DIR" ]; then
  link_pkg react "$REACT_DIR/node_modules/react"
else
  echo "build: react not found under $CHECKOUT/node_modules/.pnpm" >&2
  exit 1
fi
REACT_TYPES_DIR=$(find "$CHECKOUT/node_modules/.pnpm" -maxdepth 1 -type d -iname '@types+react@*' 2>/dev/null | head -1)
if [ -n "$REACT_TYPES_DIR" ]; then
  link_pkg @types/react "$REACT_TYPES_DIR/node_modules/@types/react"
else
  echo "build: @types/react not found under $CHECKOUT/node_modules/.pnpm" >&2
  exit 1
fi

echo "=== Typechecking client (tsc --noEmit) ==="
"$TSC" -p tsconfig.client.json
echo "=== Compiling host src → lib ==="
"$TSC" -p tsconfig.json
echo "=== Bundling client src → lib/client.js (tsdown) ==="
"$TSDOWN"
echo "=== Build complete ==="
