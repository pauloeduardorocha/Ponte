const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const flags = require("./language-flags.js"),
  { languages } = require("./languages.js");
test("every supported language has a bundled SVG flag without external resources", () => {
  for (const language of languages) {
    const code = flags[language.id];
    assert.ok(code, "Missing flag " + language.id);
    const svg = fs.readFileSync(__dirname + "/flags/" + code + ".svg", "utf8");
    assert.match(svg, /<svg/);
    assert.ok(
      !/<script|<foreignObject|(?:href|src)=["'](?:https?:|\/\/)/i.test(svg),
      "Unsafe SVG " + code,
    );
  }
  assert.ok(fs.existsSync(__dirname + "/flags/LICENSE"));
  assert.notEqual(flags["pt-BR"], flags["pt-PT"]);
});
