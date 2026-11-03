import yaml
import sys
from pathlib import Path

def test_workflow():
    workflow_path = Path(".github/workflows/release.yml")
    assert workflow_path.exists(), f"{workflow_path} must exist"

    with open(workflow_path, "r", encoding="utf-8") as f:
        wf = yaml.safe_load(f)

    matrix = wf["jobs"]["release"]["strategy"]["matrix"]["os"]
    assert "windows-latest" in matrix
    assert "macos-latest" in matrix
    assert "ubuntu-22.04" in matrix
    print("Workflow syntax and matrix verified successfully!")

if __name__ == "__main__":
    test_workflow()
