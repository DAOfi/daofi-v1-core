async function main() {
  const MAX_DECIMALS: number =  (10 ** 5)
  const maxS: number = 1000000
  // adjust these params for your curve
  const startingPrice: number = 1.00
  const slopeN: number = 1e6 // 1 - 1e6
  const slopeD: number = 1e6 // don't change
  const n: number = 1 // 1 - 10

  // quote price y = m(base sold x)^n
  // given starting price y, solve for x
  // base sold x = (quote price y/m)^(1/n)
  const s0: number = Math.floor(((startingPrice / (slopeN / slopeD)) ** (1/n)) * MAX_DECIMALS) / MAX_DECIMALS
  console.log('s0:', s0)
  // quote price y = mx^n, where x = amount of base sold
  // quote reserve y' = (m/(n+1)) * (x^(n+1))
  for (let x: number = s0; x < maxS; ++x) {
    const price: number = Math.floor(((slopeN / slopeD) * (x ** n)) * MAX_DECIMALS) / MAX_DECIMALS
    const reserve: number = Math.floor((((slopeN / slopeD) / (n + 1)) * (x ** (n + 1))) * MAX_DECIMALS) / MAX_DECIMALS
    const s: number = Math.floor(x * MAX_DECIMALS) / MAX_DECIMALS
    console.log(`supply = ${s}, price = ${price}, reserve = ${reserve}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  });
