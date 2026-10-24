#!/usr/bin/env python3
"""Builds tests/fixtures/resume-backend.{pdf,docx} from resume-backend.txt using only the stdlib.

Usage: python3 -I scripts/make-resume-fixtures.py
"""
import pathlib
import zipfile
from xml.sax.saxutils import escape

ROOT = pathlib.Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "tests" / "fixtures"
lines = (FIXTURES / "resume-backend.txt").read_text(encoding="utf-8").splitlines()


def make_docx(path: pathlib.Path) -> None:
    paras = "".join(
        f'<w:p><w:r><w:t xml:space="preserve">{escape(line)}</w:t></w:r></w:p>' for line in lines
    )
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{paras}</w:body></w:document>"
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        "</Types>"
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="word/document.xml"/></Relationships>'
    )
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", rels)
        z.writestr("word/document.xml", document)


def pdf_escape(s: str) -> str:
    s = s.encode("latin-1", "replace").decode("latin-1")
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def make_pdf(path: pathlib.Path) -> None:
    # Two pages of Helvetica text, 50 lines per page.
    pages = [lines[i : i + 50] for i in range(0, len(lines), 50)]
    objects: list[bytes] = []
    page_ids = []
    font_id = 3
    next_id = 4
    content_objs = []
    for page in pages:
        ops = ["BT", "/F1 10 Tf", "50 800 Td", "13 TL"]
        ops += [f"({pdf_escape(line)}) Tj T*" for line in page]
        ops.append("ET")
        stream = "\n".join(ops).encode("latin-1")
        content_id, page_id = next_id, next_id + 1
        next_id += 2
        content_objs.append(
            (content_id, b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream")
        )
        content_objs.append(
            (
                page_id,
                b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
                b"/Resources << /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>" % (font_id, content_id),
            )
        )
        page_ids.append(page_id)
    kids = " ".join(f"{p} 0 R" for p in page_ids).encode()
    objects = [
        (1, b"<< /Type /Catalog /Pages 2 0 R >>"),
        (2, b"<< /Type /Pages /Kids [" + kids + b"] /Count %d >>" % len(page_ids)),
        (3, b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
        *content_objs,
    ]
    objects.sort()
    out = bytearray(b"%PDF-1.4\n")
    offsets = {}
    for oid, body in objects:
        offsets[oid] = len(out)
        out += b"%d 0 obj\n" % oid + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    for oid, _ in objects:
        out += b"%010d 00000 n \n" % offsets[oid]
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref)
    path.write_bytes(bytes(out))


make_docx(FIXTURES / "resume-backend.docx")
make_pdf(FIXTURES / "resume-backend.pdf")
print("wrote", FIXTURES / "resume-backend.docx", FIXTURES / "resume-backend.pdf")
