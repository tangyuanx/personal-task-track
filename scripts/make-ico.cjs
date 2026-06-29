const fs = require("node:fs");

const [, , output, ...inputs] = process.argv;

if (!output || inputs.length === 0) {
  console.error("Usage: node scripts/make-ico.cjs <output.ico> <png>...");
  process.exit(1);
}

const images = inputs.map((file) => {
  const data = fs.readFileSync(file);
  const size = readPngSize(data);
  return { data, file, ...size };
});

const headerSize = 6;
const entrySize = 16;
let offset = headerSize + images.length * entrySize;
const header = Buffer.alloc(offset);

header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);

images.forEach((image, index) => {
  const entryOffset = headerSize + index * entrySize;
  header.writeUInt8(image.width >= 256 ? 0 : image.width, entryOffset);
  header.writeUInt8(image.height >= 256 ? 0 : image.height, entryOffset + 1);
  header.writeUInt8(0, entryOffset + 2);
  header.writeUInt8(0, entryOffset + 3);
  header.writeUInt16LE(1, entryOffset + 4);
  header.writeUInt16LE(32, entryOffset + 6);
  header.writeUInt32LE(image.data.length, entryOffset + 8);
  header.writeUInt32LE(offset, entryOffset + 12);
  offset += image.data.length;
});

fs.writeFileSync(output, Buffer.concat([header, ...images.map((image) => image.data)]));

function readPngSize(data) {
  const isPng =
    data.length > 24 &&
    data.readUInt32BE(0) === 0x89504e47 &&
    data.readUInt32BE(4) === 0x0d0a1a0a &&
    data.toString("ascii", 12, 16) === "IHDR";
  if (!isPng) throw new Error("Expected PNG input.");
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
}
