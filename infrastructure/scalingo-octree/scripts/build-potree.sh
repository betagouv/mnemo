#!/usr/bin/env bash
set -euo pipefail

potree_revision=d9387d52807bf8936fe98096b9992ea13b50ba94
potree_source="$(mktemp -d)"
trap 'rm -rf "$potree_source"' EXIT

git init "$potree_source"
git -C "$potree_source" remote add origin https://github.com/potree/PotreeConverter.git
git -C "$potree_source" fetch --depth 1 origin "$potree_revision"
git -C "$potree_source" checkout --detach FETCH_HEAD
cmake -S "$potree_source" -B "$potree_source/build" -DCMAKE_POLICY_VERSION_MINIMUM=3.5
cmake --build "$potree_source/build" --parallel 2
mkdir -p bin
cp "$potree_source/build/PotreeConverter" bin/PotreeConverter
cp "$potree_source/build/liblaszip.so" bin/liblaszip.so
cp scripts/potree-converter bin/potree-converter
chmod +x bin/potree-converter
