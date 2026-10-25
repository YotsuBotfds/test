// Screenshot one section of the built page and report console errors.
//   node tools/shot.js <section-id> <out.png> [width=1440] [height=900] [port=8765] [waitMs=2500]
// Needs ./serve-dev.sh running on the port. Prints the colophon's render budget too.
const { chromium } = require("playwright");
const [id = "surface", out = "shot.png", w = "1440", h = "900", port = "8765", wait = "2500"] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch();
  const mobile = +w < 600;
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message));
  await page.goto(`http://localhost:${port}/index.html`);
  await page.waitForTimeout(800);
  await page.evaluate((id) => document.getElementById(id)?.scrollIntoView({ behavior: "instant", block: "start" }), id);
  await page.waitForTimeout(+wait);
  const el = await page.$(`#${id}`);
  if (el && !mobile) await el.screenshot({ path: out });
  else await page.screenshot({ path: out, fullPage: false });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  const budget = await page.evaluate(() => [...document.querySelectorAll("#budget tr")].map((r) => r.innerText.replace(/\t/g, " | ")).join("\n"));
  console.log(`saved ${out}; horizontal overflow ${overflow}px`);
  console.log("budget:\n" + budget);
  console.log("errors:", errs.length ? errs.join("\n") : "none");
  await browser.close();
})();
