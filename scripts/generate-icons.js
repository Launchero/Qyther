// Generate app icons from SVG at proper resolutions
// Uses sharp for SVG -> PNG conversion, then creates ICO
// ESM: package.json sets "type": "module", so require()/__dirname are unavailable here.
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const sizes = [16, 32, 48, 64, 128, 256, 512];
const inputSvg = path.join(__dirname, '..', 'assets', 'icon.svg');
const buildDir = path.join(__dirname, '..', 'build');
const iconsDir = path.join(buildDir, 'icons');

// Create directories
if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

async function generateIcons() {
  const pngBuffers = [];

  for (const size of sizes) {
    const pngBuffer = await sharp(inputSvg)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    // Save individual PNG
    const pngPath = path.join(iconsDir, `icon-${size}x${size}.png`);
    fs.writeFileSync(pngPath, pngBuffer);
    console.log(`Created ${pngPath}`);

    // Collect for ICO (up to 256)
    if (size <= 256) {
      pngBuffers.push(pngBuffer);
    }
  }

  // Save 512 as the main app icon
  const mainIconPath = path.join(iconsDir, 'icon-512x512.png');
  const mainIconBuffer = await sharp(inputSvg)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  fs.copyFileSync(mainIconPath, path.join(buildDir, 'icon.png'));

  // Create ICO file with multiple resolutions
  // ICO format: header (6 bytes) + directory entries (16 bytes each) + image data
  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0); // Reserved
  icoHeader.writeUInt16LE(1, 2); // Type: 1 = ICO
  icoHeader.writeUInt16LE(pngBuffers.length, 4); // Number of images

  const directorySize = pngBuffers.length * 16;
  const icoDirectory = Buffer.alloc(directorySize);

  let offset = icoHeader.length + directorySize;
  const imageBuffers = [];

  for (let i = 0; i < pngBuffers.length; i++) {
    const size = sizes[i];
    const entryOffset = i * 16;
    icoDirectory.writeUInt8(size === 256 ? 0 : size, entryOffset); // Width (0 = 256)
    icoDirectory.writeUInt8(size === 256 ? 0 : size, entryOffset + 1); // Height
    icoDirectory.writeUInt8(0, entryOffset + 2); // Color palette
    icoDirectory.writeUInt8(0, entryOffset + 3); // Reserved
    icoDirectory.writeUInt16LE(1, entryOffset + 4); // Color planes
    icoDirectory.writeUInt16LE(32, entryOffset + 6); // Bits per pixel
    icoDirectory.writeUInt32LE(pngBuffers[i].length, entryOffset + 8); // Image size
    icoDirectory.writeUInt32LE(offset, entryOffset + 12); // Offset to image data

    imageBuffers.push(pngBuffers[i]);
    offset += pngBuffers[i].length;
  }

  const icoBuffer = Buffer.concat([icoHeader, icoDirectory, ...imageBuffers]);
  const icoPath = path.join(buildDir, 'icon.ico');
  fs.writeFileSync(icoPath, icoBuffer);
  console.log(`Created ${icoPath}`);

  // Also copy to build/icons/ for runtime use
  fs.copyFileSync(icoPath, path.join(iconsDir, 'icon.ico'));
  console.log(`Copied to ${path.join(iconsDir, 'icon.ico')}`);

  console.log('\nIcon generation complete!');
  console.log('Files created:');
  console.log(`  ${icoPath}`);
  console.log(`  ${path.join(buildDir, 'icon.png')}`);
  sizes.forEach(s => console.log(`  ${path.join(iconsDir, `icon-${s}x${s}.png`)}`));
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
