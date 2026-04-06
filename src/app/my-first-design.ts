import { loadEnvFile } from "node:process";

async function main() {
  loadEnvFile(".env.local");

  if (!process.env.STITCH_API_KEY) {
    throw new Error(
      "Missing STITCH_API_KEY. Add STITCH_API_KEY=... to .env.local, then rerun `npx tsx src/app/my-first-design.ts`.",
    );
  }

  const { stitch } = await import("@google/stitch-sdk");

  // 1. Create a project
  const project = await stitch.createProject("My First App");
  console.log(`Project created: ${project.id}`);

  // 2. Generate a screen
  const screen = await project.generate("A simple login page with email and password fields");
  console.log(`Screen generated: ${screen.id}`);

  // 3. Get your outputs
  const htmlUrl = await screen.getHtml();
  const imageUrl = await screen.getImage();

  console.log(`HTML:  ${htmlUrl}`);
  console.log(`Image: ${imageUrl}`);
}

void main();
