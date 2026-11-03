import yaml
import sys
from pathlib import Path

def verify_workflow():
    workflow_path = Path(".github/workflows/release.yml")
    if not workflow_path.exists():
        print(f"Error: {workflow_path} does not exist", file=sys.stderr)
        sys.exit(1)

    with open(workflow_path, "r", encoding="utf-8") as f:
        wf = yaml.safe_load(f)

    # 1. Triggers
    triggers = wf.get("on") or wf.get(True) or {}
    has_tag_trigger = False
    if "push" in triggers and "tags" in triggers["push"]:
        tags = triggers["push"]["tags"]
        if any("v*" in str(t) for t in tags):
            has_tag_trigger = True
    assert has_tag_trigger, "Workflow must trigger on tag push v*"
    assert "workflow_dispatch" in triggers, "Workflow must support workflow_dispatch"

    # 2. Matrix
    release_job = wf.get("jobs", {}).get("release")
    assert release_job is not None, "Job 'release' must exist"
    matrix = release_job.get("strategy", {}).get("matrix", {})
    os_list = matrix.get("os", [])
    assert "windows-latest" in os_list, "Matrix must include windows-latest"
    assert "macos-latest" in os_list, "Matrix must include macos-latest"
    assert "ubuntu-22.04" in os_list, "Matrix must include ubuntu-22.04"

    # 3. Steps inspection across the workflow or within release job
    content = workflow_path.read_text(encoding="utf-8")
    
    # Custom Windows installer check
    assert "HoshiCP-Setup.exe" in content, "Must generate HoshiCP-Setup.exe"
    assert "crates/installer" in content or "hoshicp-installer" in content, "Must build crates/installer"

    # Artifacts check
    assert "HoshiCP-windows-x64.zip" in content, "Must produce HoshiCP-windows-x64.zip"
    assert "HoshiCP.dmg" in content or ".dmg" in content, "Must package macOS DMG"
    assert "HoshiCP.AppImage" in content or ".AppImage" in content, "Must package Linux AppImage"

    # Updater & Release check
    assert "latest.json" in content, "Must produce latest.json for auto-updater"
    assert "TAURI_SIGNING_PRIVATE_KEY" in content, "Must reference TAURI_SIGNING_PRIVATE_KEY for bundle signing"

    print("Workflow matrix verified")
    print("All release pipeline requirements verified successfully!")

if __name__ == "__main__":
    verify_workflow()
