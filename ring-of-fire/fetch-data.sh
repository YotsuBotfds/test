#!/usr/bin/env bash
# Pulls 3 years of M4.5+ earthquakes from the USGS catalog plus two reference
# layers (Natural Earth coastlines, Bird 2002 plate boundaries) into data-raw/.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p data-raw
END=${END:-$(date -u +%Y-%m-%d)}
END_Y=${END%%-*}; MD=${END#*-}
for y in 0 1 2; do
  s=$((END_Y - 3 + y)); e=$((END_Y - 2 + y))
  curl -sS -o "data-raw/q$y.csv" "https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv&starttime=$s-$MD&endtime=$e-$MD&minmagnitude=4.5&eventtype=earthquake&orderby=time-asc&limit=20000"
done
curl -sS -o data-raw/coast110.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_coastline.geojson
curl -sS -o data-raw/plates.json https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json
