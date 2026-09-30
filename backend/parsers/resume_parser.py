import logging
import pdfplumber
import docx
from docx.oxml.text.paragraph import CT_P
from docx.oxml.table import CT_Tbl
from docx.table import Table
from docx.text.paragraph import Paragraph

logger = logging.getLogger(__name__)

def detect_file_format(file_path: str) -> str:
    """Detect file format based on magic bytes."""
    with open(file_path, "rb") as f:
        header = f.read(8)
        
    if header.startswith(b"%PDF"):
        return "pdf"
    elif header.startswith(b"PK\x03\x04"):
        # PKZIP format, likely DOCX
        return "docx"
    elif header.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        # OLE format, likely DOC
        return "doc"
    elif header.startswith(b"{\\rtf"):
        return "rtf"
    else:
        # Fallback to checking extension or assuming txt
        if file_path.lower().endswith(".txt"):
            return "txt"
        return "unknown"

def extract_text_from_pdf(file_path: str) -> str:
    """Extract text from a PDF file using pdfplumber with layout preservation."""
    try:
        text = []
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                # Use layout=True to preserve visual alignment and multi-column ordering
                page_text = page.extract_text(layout=True)
                if page_text:
                    text.append(page_text)
        return "\n\n".join(text)
    except Exception as e:
        logger.error(f"Failed to extract text from PDF {file_path}: {e}")
        raise ValueError(f"PDF extraction failed: {e}")

def extract_text_from_docx(file_path: str) -> str:
    """Extract text from a DOCX file, preserving order of paragraphs and tables."""
    try:
        doc = docx.Document(file_path)
        text = []
        for child in doc.element.body:
            if isinstance(child, CT_P):
                p = Paragraph(child, doc)
                if p.text.strip():
                    text.append(p.text.strip())
            elif isinstance(child, CT_Tbl):
                table = Table(child, doc)
                for row in table.rows:
                    row_data = [cell.text.strip().replace("\n", " ") for cell in row.cells if cell.text.strip()]
                    if row_data:
                        text.append(" | ".join(row_data))
        return "\n\n".join(text)
    except Exception as e:
        logger.error(f"Failed to extract text from DOCX {file_path}: {e}")
        raise ValueError(f"DOCX extraction failed: {e}")

def parse_resume_file(file_path: str, format_type: str = None) -> str:
    """Entry point for parsing resume files into raw text."""
    # Detect the actual format via magic bytes, ignoring the provided extension
    actual_format = detect_file_format(file_path)
    
    if actual_format == "pdf":
        return extract_text_from_pdf(file_path)
    elif actual_format == "docx":
        return extract_text_from_docx(file_path)
    elif actual_format == "doc":
        raise ValueError("Legacy .doc format is not supported. Please save your resume as a PDF or DOCX file.")
    elif actual_format == "txt" or (format_type and format_type.lower() == "txt"):
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    else:
        raise ValueError("Unsupported or unrecognized resume format. Please use PDF, DOCX, or TXT.")
