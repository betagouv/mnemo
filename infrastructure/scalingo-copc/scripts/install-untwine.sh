#!/usr/bin/env bash
set -euo pipefail

micromamba_url=https://api.anaconda.org/download/conda-forge/micromamba/2.9.0/linux-64/micromamba-2.9.0-0.tar.bz2
micromamba_sha256=8761c382127e6363bd9e0a2451aa3ef90d071a79133f736e2f759a3bf13040dd
install_dir="$(pwd)/bin"
archive_dir="$(mktemp -d)"
trap 'rm -rf "$archive_dir"' EXIT

curl --fail --location --silent --show-error "$micromamba_url" --output "$archive_dir/micromamba.tar.bz2"
printf '%s  %s\n' "$micromamba_sha256" "$archive_dir/micromamba.tar.bz2" | sha256sum --check --status
tar -xjf "$archive_dir/micromamba.tar.bz2" -C "$archive_dir" bin/micromamba
mkdir -p "$install_dir"
cp "$archive_dir/bin/micromamba" "$install_dir/micromamba"
chmod +x "$install_dir/micromamba"
MAMBA_ROOT_PREFIX="$archive_dir/cache" "$install_dir/micromamba" create --yes \
  --prefix "$install_dir/pdal-env" --channel conda-forge --strict-channel-priority \
  'untwine=1.5.1'
"$install_dir/pdal-env/bin/untwine" --help >/dev/null
cp scripts/untwine bin/untwine
chmod +x bin/untwine
