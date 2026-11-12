const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Create a minimal valid ZIP archive in pure JS without external dependencies!
// A ZIP file consists of:
// [Local file header + File data] for each file
// [Central directory header] for each file
// [End of central directory record (EOCD)]

function createZip(files) {
  const fileRecords = [];
  let offset = 0;
  const parts = [];

  for (const file of files) {
    const data = Buffer.from(file.content, 'utf8');
    const nameBuf = Buffer.from(file.name, 'utf8');
    const crc = crc32(data);
    const compressed = zlib.deflateRawSync(data);

    // Local file header (30 bytes + name + compressed data)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4);         // version needed (2.0)
    localHeader.writeUInt16LE(0, 6);          // flags
    localHeader.writeUInt16LE(8, 8);          // compression: deflate
    localHeader.writeUInt16LE(0, 10);         // time
    localHeader.writeUInt16LE(0, 12);         // date
    localHeader.writeUInt32LE(crc, 14);       // crc32
    localHeader.writeUInt32LE(compressed.length, 18); // comp size
    localHeader.writeUInt32LE(data.length, 22);       // uncomp size
    localHeader.writeUInt16LE(nameBuf.length, 26);    // name len
    localHeader.writeUInt16LE(0, 28);                 // extra len

    fileRecords.push({
      nameBuf,
      crc,
      compressedLength: compressed.length,
      uncompressedLength: data.length,
      offset,
    });

    parts.push(localHeader, nameBuf, compressed);
    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralDirStart = offset;
  let centralDirSize = 0;

  for (const rec of fileRecords) {
    const cdHeader = Buffer.alloc(46);
    cdHeader.writeUInt32LE(0x02014b50, 0); // signature
    cdHeader.writeUInt16LE(20, 4);          // version made by
    cdHeader.writeUInt16LE(20, 6);          // version needed
    cdHeader.writeUInt16LE(0, 8);           // flags
    cdHeader.writeUInt16LE(8, 10);          // compression (deflate)
    cdHeader.writeUInt16LE(0, 12);          // time
    cdHeader.writeUInt16LE(0, 14);          // date
    cdHeader.writeUInt32LE(rec.crc, 16);    // crc32
    cdHeader.writeUInt32LE(rec.compressedLength, 20);
    cdHeader.writeUInt32LE(rec.uncompressedLength, 24);
    cdHeader.writeUInt16LE(rec.nameBuf.length, 28);
    cdHeader.writeUInt16LE(0, 30);          // extra len
    cdHeader.writeUInt16LE(0, 32);          // comment len
    cdHeader.writeUInt16LE(0, 34);          // disk start
    cdHeader.writeUInt16LE(0, 36);          // int attr
    cdHeader.writeUInt32LE(0, 38);          // ext attr
    cdHeader.writeUInt32LE(rec.offset, 42); // relative offset

    parts.push(cdHeader, rec.nameBuf);
    centralDirSize += cdHeader.length + rec.nameBuf.length;
  }

  // EOCD (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);                   // disk num
  eocd.writeUInt16LE(0, 6);                   // disk with CD
  eocd.writeUInt16LE(fileRecords.length, 8);  // entries on disk
  eocd.writeUInt16LE(fileRecords.length, 10); // total entries
  eocd.writeUInt32LE(centralDirSize, 12);     // size of CD
  eocd.writeUInt32LE(centralDirStart, 16);    // offset of CD
  eocd.writeUInt16LE(0, 20);                  // comment len

  parts.push(eocd);
  return Buffer.concat(parts);
}

// CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Minimal DOCX files
const docxFiles = [
  {
    name: '[Content_Types].xml',
    content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  },
  {
    name: '_rels/.rels',
    content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  },
  {
    name: 'word/document.xml',
    content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t></w:t></w:r></w:p></w:body></w:document>'
  }
];

// Minimal XLSX files
const xlsxFiles = [
  {
    name: '[Content_Types].xml',
    content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'
  },
  {
    name: '_rels/.rels',
    content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
  },
  {
    name: 'xl/_rels/workbook.xml.rels',
    content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
  },
  {
    name: 'xl/workbook.xml',
    content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'
  },
  {
    name: 'xl/worksheets/sheet1.xml',
    content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>'
  }
];

const templatesDir = path.join(__dirname, '..', 'templates');
if (!fs.existsSync(templatesDir)) {
  fs.mkdirSync(templatesDir, { recursive: true });
}

const docxBuf = createZip(docxFiles);
const xlsxBuf = createZip(xlsxFiles);

fs.writeFileSync(path.join(templatesDir, 'blank.docx'), docxBuf);
fs.writeFileSync(path.join(templatesDir, 'blank.xlsx'), xlsxBuf);

console.log('Created blank.docx:', docxBuf.length, 'bytes');
console.log('Created blank.xlsx:', xlsxBuf.length, 'bytes');
