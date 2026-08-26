const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const dashboard = read("main-dashboard.tsx");
const sidebar = read("components", "main-sidebar.tsx");

assert.match(dashboard, /lg:h-\[100dvh\][^\"]*lg:min-h-0[^\"]*lg:overflow-hidden/);
assert.match(dashboard, /hidden[^\"]*lg:h-full[^\"]*lg:min-h-0[^\"]*lg:shrink-0/);
assert.match(dashboard, /lg:h-full[^\"]*lg:min-h-0[^\"]*lg:flex-grow[^\"]*lg:overflow-auto/);
assert.match(sidebar, /flex h-full min-h-0 w-64 flex-col overflow-hidden/);
assert.match(sidebar, /min-h-0 flex-1 space-y-2 overflow-y-auto/);

console.log("Desktop shell keeps window scrolling locked and scrolls long content inside its panels.");
