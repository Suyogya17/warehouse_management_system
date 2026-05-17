const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const uploadsDir = __dirname;

async function convertAll() {
  const files = fs.readdirSync(uploadsDir).filter((f) =>
    /\.(jpg|jpeg|png)$/i.test(f)
  );

  console.log(`Found ${files.length} images...`);

  for (const file of files) {
    const inputPath = path.join(uploadsDir, file);
    const outputPath = inputPath.replace(/\.(jpg|jpeg|png)$/i, ".webp");

    try {
      await sharp(inputPath)
        .webp({ quality: 75 })
        .resize(800, 800, { fit: "inside", withoutEnlargement: true })
        .toFile(outputPath);

      console.log(`✓ ${file}`);
    } catch (err) {
      console.error(`✗ ${file}: ${err.message}`);
    }
  }

  console.log("All done!");
}

convertAll();