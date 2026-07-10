/// <reference types="@cloudflare/workers-types" />

export type ZipObjectEntry = {
  name: string;
  objectKey: string;
  size: number;
};

export type ZipBytesEntry = {
  name: string;
  bytes: Uint8Array;
};

export type ZipEntry = ZipObjectEntry | ZipBytesEntry;

export function createZipStream(
  bucket: R2Bucket,
  entries: ZipEntry[],
): ReadableStream<Uint8Array> {
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  void writeZipArchive(bucket, entries, stream.writable).catch((error) => {
    console.error("Playlist ZIP stream failed", error);
  });
  return stream.readable;
}

async function writeZipArchive(
  bucket: R2Bucket,
  entries: ZipEntry[],
  writable: WritableStream<Uint8Array>,
): Promise<void> {
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const centralEntries: Array<{
    nameBytes: Uint8Array;
    crc: number;
    size: number;
    offset: number;
  }> = [];
  let offset = 0;

  const write = async (bytes: Uint8Array) => {
    await writer.write(bytes);
    offset += bytes.byteLength;
  };

  try {
    for (const entry of entries) {
      const nameBytes = encoder.encode(entry.name);
      const localOffset = offset;
      await write(buildZipLocalHeader(nameBytes));

      let crc = 0xffffffff;
      let size = 0;
      if ("bytes" in entry) {
        crc = updateCrc32(crc, entry.bytes);
        size = entry.bytes.byteLength;
        await write(entry.bytes);
      } else {
        const object = await bucket.get(entry.objectKey);
        if (!object) {
          throw new Error(`Track disappeared during ZIP export: ${entry.objectKey}`);
        }
        const reader = object.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          crc = updateCrc32(crc, value);
          size += value.byteLength;
          await write(value);
        }
      }

      const finalizedCrc = (crc ^ 0xffffffff) >>> 0;
      await write(buildZipDataDescriptor(finalizedCrc, size));
      centralEntries.push({
        nameBytes,
        crc: finalizedCrc,
        size,
        offset: localOffset,
      });
    }

    const centralOffset = offset;
    for (const entry of centralEntries) {
      await write(buildZipCentralHeader(entry));
    }
    const centralSize = offset - centralOffset;
    await write(buildZipEndRecord(centralEntries.length, centralSize, centralOffset));
    await writer.close();
  } catch (error) {
    await writer.abort(error).catch(() => undefined);
    throw error;
  }
}

export function calculateZipSize(entries: ZipEntry[]): number {
  const encoder = new TextEncoder();
  let size = 22;
  for (const entry of entries) {
    const nameLength = encoder.encode(entry.name).byteLength;
    const dataLength = "bytes" in entry ? entry.bytes.byteLength : entry.size;
    size += 30 + nameLength + dataLength + 16 + 46 + nameLength;
  }
  return size;
}

const ZIP_FLAGS = 0x0808;

function buildZipLocalHeader(nameBytes: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(30 + nameBytes.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, ZIP_FLAGS, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, 0, true);
  view.setUint32(18, 0, true);
  view.setUint32(22, 0, true);
  view.setUint16(26, nameBytes.byteLength, true);
  view.setUint16(28, 0, true);
  bytes.set(nameBytes, 30);
  return bytes;
}

function buildZipDataDescriptor(crc: number, size: number): Uint8Array {
  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x08074b50, true);
  view.setUint32(4, crc, true);
  view.setUint32(8, size, true);
  view.setUint32(12, size, true);
  return bytes;
}

function buildZipCentralHeader(entry: {
  nameBytes: Uint8Array;
  crc: number;
  size: number;
  offset: number;
}): Uint8Array {
  const bytes = new Uint8Array(46 + entry.nameBytes.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, ZIP_FLAGS, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, entry.crc, true);
  view.setUint32(20, entry.size, true);
  view.setUint32(24, entry.size, true);
  view.setUint16(28, entry.nameBytes.byteLength, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, entry.offset, true);
  bytes.set(entry.nameBytes, 46);
  return bytes;
}

function buildZipEndRecord(
  count: number,
  centralSize: number,
  centralOffset: number,
): Uint8Array {
  const bytes = new Uint8Array(22);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  view.setUint16(20, 0, true);
  return bytes;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function updateCrc32(crc: number, bytes: Uint8Array): number {
  let next = crc >>> 0;
  for (const byte of bytes) {
    next = CRC32_TABLE[(next ^ byte) & 0xff] ^ (next >>> 8);
  }
  return next >>> 0;
}

export function sanitizeArchiveEntryName(value: string): string {
  const sanitized = value
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "");
  return (sanitized || "track").slice(0, 180);
}
