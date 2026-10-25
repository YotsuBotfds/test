//! Decodes the blobs `prep` writes into `data/`. They are compiled into the
//! binary, so the wasm module is the whole dataset: nothing is fetched at runtime.

static QUAKES: &[u8] = include_bytes!("../../../data/quakes.bin");
static PLACES: &str = include_str!("../../../data/places.txt");
static COAST: &[u8] = include_bytes!("../../../data/coast.bin");
static PLATES: &[u8] = include_bytes!("../../../data/plates.bin");

#[derive(Clone, Copy)]
pub struct Quake {
    /// Seconds since `World::epoch`.
    pub t: u32,
    pub lat: f32,
    pub lon: f32,
    /// Kilometres below the surface.
    pub depth: f32,
    pub mag: f32,
}

pub struct World {
    /// Unix seconds of midnight UTC on the first day of the catalogue.
    pub epoch: u32,
    /// Sorted by time, oldest first.
    pub quakes: Vec<Quake>,
    pub places: Vec<&'static str>,
    pub coast: Vec<Vec<[f32; 2]>>,
    pub plates: Vec<Vec<[f32; 2]>>,
}

struct Reader<'a> {
    b: &'a [u8],
    at: usize,
}

impl Reader<'_> {
    fn take<const N: usize>(&mut self) -> [u8; N] {
        let out = self.b[self.at..self.at + N].try_into().unwrap();
        self.at += N;
        out
    }
    fn u32(&mut self) -> u32 {
        u32::from_le_bytes(self.take())
    }
    fn u16(&mut self) -> u16 {
        u16::from_le_bytes(self.take())
    }
    fn deg(&mut self) -> f32 {
        i16::from_le_bytes(self.take()) as f32 / 100.0
    }
    fn u8(&mut self) -> u8 {
        self.take::<1>()[0]
    }
}

fn lines(b: &[u8]) -> Vec<Vec<[f32; 2]>> {
    let mut r = Reader { b, at: 0 };
    (0..r.u32())
        .map(|_| (0..r.u32()).map(|_| [r.deg(), r.deg()]).collect())
        .collect()
}

pub fn load() -> World {
    let mut r = Reader { b: QUAKES, at: 0 };
    assert_eq!(&r.take::<4>(), b"RoF1");
    let epoch = r.u32();
    let quakes = (0..r.u32())
        .map(|_| {
            let q = Quake {
                t: r.u32(),
                lat: r.deg(),
                lon: r.deg(),
                depth: r.u16() as f32 / 10.0,
                mag: r.u8() as f32 / 10.0,
            };
            r.u8();
            q
        })
        .collect();
    World {
        epoch,
        quakes,
        places: PLACES.split('\n').collect(),
        coast: lines(COAST),
        plates: lines(PLATES),
    }
}
