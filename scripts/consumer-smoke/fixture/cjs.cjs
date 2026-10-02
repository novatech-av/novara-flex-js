// `require()` of the ESM-only package, through Node's require(esm).
const sdk = require("novara-flex-js");
const { exercise } = require("./exercise.cjs");

exercise(sdk, "require").catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
