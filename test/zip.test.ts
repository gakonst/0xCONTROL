import { describe, expect, test } from "bun:test";

import {
  calculateZipSize,
  createZipStream,
  sanitizeArchiveEntryName,
  updateCrc32,
  type ZipEntry,
} from "../worker/zip";

describe("playlist ZIP export", () => {
  test("streams a valid-sized ZIP with ordered UTF-8 entries", async () => {
    const encoder = new TextEncoder();
    const entries: ZipEntry[] = [
      { name: "01 Artist - First.mp3", bytes: encoder.encode("first audio") },
      { name: "02 Björk - Jóga.flac", bytes: encoder.encode("second audio") },
    ];

    const archive = new Uint8Array(
      await new Response(createZipStream({} as R2Bucket, entries)).arrayBuffer(),
    );
    const view = new DataView(archive.buffer);
    const endOffset = archive.byteLength - 22;

    expect(archive.byteLength).toBe(calculateZipSize(entries));
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(endOffset, true)).toBe(0x06054b50);
    expect(view.getUint16(endOffset + 10, true)).toBe(2);
    expect(new TextDecoder().decode(archive)).toContain("01 Artist - First.mp3");
    expect(new TextDecoder().decode(archive)).toContain("02 Björk - Jóga.flac");
  });

  test("uses the standard incremental CRC32 result", () => {
    const bytes = new TextEncoder().encode("hello");
    const crc = (updateCrc32(0xffffffff, bytes) ^ 0xffffffff) >>> 0;
    expect(crc).toBe(0x3610a686);
  });

  test("sanitizes path separators and reserved filename characters", () => {
    expect(sanitizeArchiveEntryName('../A/B:*?"<>| Track.mp3')).toBe(
      "-A-B------- Track.mp3",
    );
  });
});
