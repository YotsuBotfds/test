#!/bin/bash
# Removes 7 orphaned stub/template files not indexed in guides.json
# Run from the survival-app directory: bash cleanup-orphans.sh

cd "$(dirname "$0")"

files=(
  "guides/advanced-tool-crafting.html"
  "guides/fire-building-techniques.html"
  "guides/medicinal-plants-guide.html"
  "guides/test-guide.html"
  "guides/water-filtration-systems.html"
  "guides/water-purification-methods.html"
  "guides/search-old.html"
)

for f in "${files[@]}"; do
  if [ -f "$f" ]; then
    rm "$f" && echo "Deleted $f"
  else
    echo "Already gone: $f"
  fi
done

echo "Done."
