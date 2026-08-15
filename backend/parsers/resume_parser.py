import logging
import pdfplumber
import docx

logger = logging.getLogger(__name__)

def extract_text_from_pdf(file_path: str) -> str:
    """Extract text from a PDF file using pdfplumber."""
    try:
        text = []
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text.append(page_text)
        return "\n\n".join(text)
    except Exception as e:
        logger.error(f"Failed to extract text from PDF {file_path}: {e}")
        raise ValueError(f"PDF extraction failed: {e}")

def extract_text_from_docx(file_path: str) -> str:
    """Extract text from a DOCX file using python-docx."""
    try:
        doc = docx.Document(file_path)
        text = [para.text for para in doc.paragraphs if para.text.strip()]
        return "\n\n".join(text)
    except Exception as e:
        logger.error(f"Failed to extract text from DOCX {file_path}: {e}")
        raise ValueError(f"DOCX extraction failed: {e}")

def parse_resume_file(file_path: str, format_type: str) -> str:
    """Entry point for parsing resume files into raw text."""
    if format_type.lower() == "pdf":
        return extract_text_from_pdf(file_path)
    elif format_type.lower() in ["docx", "doc"]:
        return extract_text_from_docx(file_path)
    elif format_type.lower() == "txt":
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    else:
        raise ValueError(f"Unsupported resume format: {format_type}")
