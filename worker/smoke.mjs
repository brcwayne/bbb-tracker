const base = process.argv[2] ?? 'http://localhost:8787'

async function hit(path) {
  const res = await fetch(base + path)
  const body = await res.json()
  console.log(`\n${path} → ${res.status}`)
  console.log(JSON.stringify(body, null, 2))
  if (res.status !== 200 || body.error) {
    console.error('FAIL')
    process.exit(1)
  }
  return body
}

await hit('/health')
await hit('/fx/latest')
const p = await hit('/prices?symbols=THYAO.IS,GC=F,SPCX')
for (const [sym, v] of Object.entries(p.prices)) {
  if (v.error) {
    console.error(`symbol ${sym} failed: ${v.error}`)
    process.exit(1)
  }
}
console.log('\nsmoke OK')
