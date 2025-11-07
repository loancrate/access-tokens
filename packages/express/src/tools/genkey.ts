/* eslint-disable no-console */

import { generateKeySet } from "../generateKeySet";

(async () => {
  const keySet = await generateKeySet("1", "EdDSA");
  console.log(JSON.stringify(keySet, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
