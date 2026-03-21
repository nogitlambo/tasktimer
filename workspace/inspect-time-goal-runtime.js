/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");

const path = "src/app/tasktimer/tasktimerClient.ts";
const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);

for (const [start, end] of [
  [7088, 7150],
  [5524, 5540],
  [9258, 9366],
]) {
  console.log(`--- ${start}-${end} ---`);
  for (let i = start; i <= end; i += 1) {
    console.log(`${i}:${lines[i - 1]}`);
  }
}
