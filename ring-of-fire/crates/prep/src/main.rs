//! Turns the raw USGS CSVs and GeoJSON layers in `data-raw/` into the compact
//! little-endian blobs in `data/` that the globe crate embeds with `include_bytes!`.
//!
//! quakes.bin : "RoF1", u32 epoch (unix s), u32 n, n × [u32 t, i16 lat·100, i16 lon·100, u16 depth·10, u8 mag·10, u8 0]
//! places.txt : one USGS place string per quake, '\n'-separated, same order
//! coast.bin / plates.bin : u32 lines, per line u32 n then n × [i16 lat·100, i16 lon·100]

use std::fs;
use std::path::Path;

struct Quake {
    t: i64,
    lat: f64,
    lon: f64,
    depth: f64,
    mag: f64,
    place: String,
}

fn split_csv(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut quoted = false;
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '"' if quoted && chars.peek() == Some(&'"') => {
                cur.push('"');
                chars.next();
            }
            '"' => quoted = !quoted,
            ',' if !quoted => out.push(std::mem::take(&mut cur)),
            _ => cur.push(c),
        }
    }
    out.push(cur);
    out
}

/// Days since 1970-01-01 for a proleptic Gregorian date (Howard Hinnant's algorithm).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

/// "2023-10-25T03:49:26.167Z" -> unix seconds.
fn parse_time(s: &str) -> i64 {
    let n = |a: usize, b: usize| s[a..b].parse::<i64>().unwrap();
    days_from_civil(n(0, 4), n(5, 7), n(8, 10)) * 86400 + n(11, 13) * 3600 + n(14, 16) * 60 + n(17, 19)
}

fn read_quakes(dir: &Path) -> Vec<Quake> {
    let mut files: Vec<_> = fs::read_dir(dir)
        .unwrap()
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|x| x == "csv"))
        .collect();
    files.sort();
    let mut quakes = Vec::new();
    for f in files {
        let text = fs::read_to_string(&f).unwrap();
        let mut lines = text.lines();
        let header = split_csv(lines.next().unwrap());
        let col = |name: &str| header.iter().position(|h| h == name).unwrap();
        let (ct, cla, clo, cd, cm, cp) =
            (col("time"), col("latitude"), col("longitude"), col("depth"), col("mag"), col("place"));
        for line in lines.filter(|l| !l.is_empty()) {
            let f = split_csv(line);
            let (Ok(mag), Ok(depth)) = (f[cm].parse::<f64>(), f[cd].parse::<f64>()) else {
                continue;
            };
            quakes.push(Quake {
                t: parse_time(&f[ct]),
                lat: f[cla].parse().unwrap(),
                lon: f[clo].parse().unwrap(),
                depth: depth.max(0.0),
                mag,
                place: f[cp].replace('\n', " "),
            });
        }
    }
    quakes.sort_by_key(|q| q.t);
    quakes.dedup_by(|a, b| a.t == b.t && a.lat == b.lat && a.lon == b.lon);
    quakes
}

fn q100(v: f64) -> [u8; 2] {
    ((v * 100.0).round() as i16).to_le_bytes()
}

fn write_lines(src: &Path, dst: &Path) -> usize {
    let json: serde_json::Value = serde_json::from_str(&fs::read_to_string(src).unwrap()).unwrap();
    let mut lines: Vec<Vec<(f64, f64)>> = Vec::new();
    for feat in json["features"].as_array().unwrap() {
        let geom = &feat["geometry"];
        let parts: Vec<&serde_json::Value> = match geom["type"].as_str().unwrap() {
            "LineString" => vec![&geom["coordinates"]],
            "MultiLineString" => geom["coordinates"].as_array().unwrap().iter().collect(),
            _ => continue,
        };
        for part in parts {
            let pts = part
                .as_array()
                .unwrap()
                .iter()
                .map(|p| (p[1].as_f64().unwrap(), p[0].as_f64().unwrap()))
                .collect::<Vec<_>>();
            if pts.len() >= 2 {
                lines.push(pts);
            }
        }
    }
    let mut out = Vec::new();
    out.extend((lines.len() as u32).to_le_bytes());
    let mut total = 0;
    for l in &lines {
        out.extend((l.len() as u32).to_le_bytes());
        for &(lat, lon) in l {
            out.extend(q100(lat));
            out.extend(q100(lon));
        }
        total += l.len();
    }
    fs::write(dst, out).unwrap();
    total
}

fn main() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let raw = root.join("data-raw");
    let data = root.join("data");
    fs::create_dir_all(&data).unwrap();

    let quakes = read_quakes(&raw);
    let epoch = quakes[0].t.div_euclid(86400) * 86400;
    let mut bin = b"RoF1".to_vec();
    bin.extend((epoch as u32).to_le_bytes());
    bin.extend((quakes.len() as u32).to_le_bytes());
    for q in &quakes {
        bin.extend(((q.t - epoch) as u32).to_le_bytes());
        bin.extend(q100(q.lat));
        bin.extend(q100(q.lon));
        bin.extend(((q.depth * 10.0).round().min(65535.0) as u16).to_le_bytes());
        bin.push((q.mag * 10.0).round() as u8);
        bin.push(0);
    }
    fs::write(data.join("quakes.bin"), &bin).unwrap();
    let places: Vec<&str> = quakes.iter().map(|q| q.place.as_str()).collect();
    fs::write(data.join("places.txt"), places.join("\n")).unwrap();

    let coast = write_lines(&raw.join("coast110.geojson"), &data.join("coast.bin"));
    let plates = write_lines(&raw.join("plates.json"), &data.join("plates.bin"));
    println!(
        "{} quakes ({} bytes), {} coast points, {} plate-boundary points",
        quakes.len(),
        bin.len(),
        coast,
        plates
    );
}
