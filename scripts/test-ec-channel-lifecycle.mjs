import assert from "node:assert/strict";
import { ALL_EC_CHANNELS, EC_RETIRED_FROM, getEcChannelState, getOperationalEcChannels,
  getVisibleEcChannels, isEcChannelOperational } from "../lib/ec-channel-lifecycle.ts";

assert.equal(EC_RETIRED_FROM, "2026-10-01");
assert.equal(ALL_EC_CHANNELS.length, 7, "Historical channel definitions remain available");
for (const channel of ["mercari", "qoo10", "tiktok"]) {
  assert.equal(getEcChannelState(channel, "2026-09-30"), "active");
  assert.equal(getEcChannelState(channel, "2026-10-01"), "retired");
  assert.equal(getEcChannelState(channel, new Date("2026-09-30T14:59:59Z")), "active");
  assert.equal(getEcChannelState(channel, new Date("2026-09-30T15:00:00Z")), "retired",
    "The retirement boundary follows Japan time");
  assert.equal(isEcChannelOperational(channel, "not-a-month"), false);
  assert.equal(isEcChannelOperational(channel, new Date(NaN)), false);
}
assert.deepEqual(getVisibleEcChannels("2026-09"), [...ALL_EC_CHANNELS]);
assert.deepEqual(getVisibleEcChannels("2026-10"), ["amazon", "rakuten", "yahoo", "base", "makeshop"]);
assert.deepEqual(getOperationalEcChannels("2026-10"), ["amazon", "rakuten", "yahoo", "base"]);
for (const period of ["2026-09", "2026-10", "2027-01"]) {
  assert.equal(getEcChannelState("makeshop", period), "preparing");
  assert.equal(isEcChannelOperational("makeshop", period), false);
}
for (const channel of ["amazon", "rakuten", "yahoo", "base", "google", "meta"])
  assert.equal(isEcChannelOperational(channel, "2026-10"), true);
const now = Date.now;
try {
  Date.now = () => Date.parse("2026-10-01T00:00:00+09:00");
  assert.equal(isEcChannelOperational("qoo10"), false);
  assert.deepEqual(getVisibleEcChannels(), ["amazon", "rakuten", "yahoo", "base", "makeshop"]);
} finally { Date.now = now; }
console.log("EC lifecycle: historical views, October retirement, Japan-time boundary and preparing makeshop passed.");
