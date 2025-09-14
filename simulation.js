async function main() {
  console.log("We started the program");
  const result = await fetch("https://play.pokemonshowdown.com/data/abilities.js");
  const data = await result.text();
  console.log("Fetched data:", data);
}

main();