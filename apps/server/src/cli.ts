import { parseRunConfig } from "./config";
import { startServer } from "./server";

async function main() {
  try {
    const config = parseRunConfig(process.argv.slice(2));
    await startServer(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Failed to start WooTTY: ${message}`);
    process.exitCode = 1;
  }
}

void main();
