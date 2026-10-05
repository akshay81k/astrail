from pathlib import Path
import pytest

def test_no_fabricated_metrics():
    report_path = Path(__file__).parent.parent / "reports" / "evaluation.md"
    if not report_path.exists():
        pytest.skip("evaluation.md not generated yet")
        
    with open(report_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    assert "NOT COMPUTED" in content, "Report must properly flag missing pipeline components"
    assert "0.94" not in content, "Report contains hardcoded fabricated metrics"
    assert "15.4" not in content, "Report contains hardcoded fabricated metrics"
