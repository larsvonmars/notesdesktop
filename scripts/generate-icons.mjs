import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const sourceIcon = join(projectRoot, 'icons', 'web', 'icon-512.png');
const tauriIconsDir = join(projectRoot, 'src-tauri', 'icons');
const publicDir = join(projectRoot, 'public');

// Ensure directories exist
mkdirSync(tauriIconsDir, { recursive: true });
mkdirSync(publicDir, { recursive: true });

async function generateIcons() {
  console.log('Generating Tauri icons from:', sourceIcon);

  // Generate PNG icons for Tauri
  const tauriSizes = [
    { name: '32x32.png', size: 32 },
    { name: '128x128.png', size: 128 },
    { name: '128x128@2x.png', size: 256 },
    { name: 'icon.png', size: 512 },
  ];

  for (const { name, size } of tauriSizes) {
    const output = join(tauriIconsDir, name);
    await sharp(sourceIcon).resize(size, size).png().toFile(output);
    console.log(`  ✓ ${name} (${size}x${size})`);
  }

  // Generate ICO file (contains multiple sizes)
  // ICO format: we'll create a multi-size ICO using raw PNG embedding
  const icoSizes = [16, 24, 32, 48, 64, 256];
  const pngBuffers = [];

  for (const size of icoSizes) {
    const buf = await sharp(sourceIcon).resize(size, size).png().toBuffer();
    pngBuffers.push({ size, buffer: buf });
  }

  // Build ICO file
  const icoBuffer = buildIco(pngBuffers);
  writeFileSync(join(tauriIconsDir, 'icon.ico'), icoBuffer);
  console.log('  ✓ icon.ico (multi-size)');

  // Copy SVG placeholder - we'll skip SVG since we have PNG source
  // Tauri doesn't strictly require SVG

  // Generate web/public icons
  const webIcons = [
    { name: 'favicon.ico', type: 'ico' },
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-512.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
  ];

  for (const icon of webIcons) {
    if (icon.type === 'ico') {
      // Copy the ICO we already made
      writeFileSync(join(publicDir, icon.name), icoBuffer);
      console.log(`  ✓ public/${icon.name}`);
    } else {
      const output = join(publicDir, icon.name);
      await sharp(sourceIcon).resize(icon.size, icon.size).png().toFile(output);
      console.log(`  ✓ public/${icon.name} (${icon.size}x${icon.size})`);
    }
  }

  console.log('\nDone! All icons generated successfully.');
}

function buildIco(pngBuffers) {
  // ICO file format with PNG-encoded entries
  const numImages = pngBuffers.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = dirEntrySize * numImages;
  let offset = headerSize + dirSize;

  // ICO Header
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);       // Reserved
  header.writeUInt16LE(1, 2);       // Type: 1 = ICO
  header.writeUInt16LE(numImages, 4); // Number of images

  // Directory entries
  const dirEntries = Buffer.alloc(dirSize);
  const imageOffsets = [];

  for (let i = 0; i < numImages; i++) {
    const { size, buffer } = pngBuffers[i];
    const entryOffset = i * dirEntrySize;

    dirEntries.writeUInt8(size < 256 ? size : 0, entryOffset);      // Width
    dirEntries.writeUInt8(size < 256 ? size : 0, entryOffset + 1);  // Height
    dirEntries.writeUInt8(0, entryOffset + 2);                       // Color palette
    dirEntries.writeUInt8(0, entryOffset + 3);                       // Reserved
    dirEntries.writeUInt16LE(1, entryOffset + 4);                    // Color planes
    dirEntries.writeUInt16LE(32, entryOffset + 6);                   // Bits per pixel
    dirEntries.writeUInt32LE(buffer.length, entryOffset + 8);        // Image size
    dirEntries.writeUInt32LE(offset, entryOffset + 12);              // Image offset

    imageOffsets.push(offset);
    offset += buffer.length;
  }

  // Combine all buffers
  return Buffer.concat([
    header,
    dirEntries,
    ...pngBuffers.map(p => p.buffer)
  ]);
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
