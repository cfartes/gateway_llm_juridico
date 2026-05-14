from pathlib import Path
import tempfile

from paddleocr import PaddleOCR

from app.services.document_parser import load_pillow_image


_ocr_client: PaddleOCR | None = None


def get_ocr_client() -> PaddleOCR:
    global _ocr_client
    if _ocr_client is None:
        _ocr_client = PaddleOCR(use_angle_cls=True, lang="en")
    return _ocr_client


def extract_ocr_text(filename: str, content: bytes) -> str:
    ext = Path(filename).suffix.lower()
    if ext not in {".png", ".jpg", ".jpeg", ".webp", ".tiff", ".tif", ".pdf"}:
        return ""

    temp_path = None
    try:
        image = load_pillow_image(content)
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_file:
            temp_path = Path(tmp_file.name)
        image.save(temp_path)

        ocr = get_ocr_client()
        result = ocr.ocr(str(temp_path), cls=True)
        lines: list[str] = []
        for chunk in result or []:
            for item in chunk:
                text = item[1][0]
                if text:
                    lines.append(text)
        return "\n".join(lines)
    except Exception:
        return ""
    finally:
        if temp_path and temp_path.exists():
            temp_path.unlink(missing_ok=True)

