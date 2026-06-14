import { isPlausibleOptionLtp } from "./ltpPlausibility.js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(isPlausibleOptionLtp(470, 450, 470), "4% step down within 5% REST band should pass");
assert(
  !isPlausibleOptionLtp(470, 364.55, 470),
  "Flash to 364.55 vs REST 470 should fail",
);
assert(
  isPlausibleOptionLtp(470, 364.55, 365),
  "Should pass once REST anchor moves near the new price",
);
assert(!isPlausibleOptionLtp(100, 50, 100), "50% jump vs REST should fail");

console.log("ltpPlausibility.test.ts: all assertions passed");
