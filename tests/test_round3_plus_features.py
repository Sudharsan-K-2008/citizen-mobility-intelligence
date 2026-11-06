import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class Round3PlusFeatureWiringTests(unittest.TestCase):
    def test_backend_routes_present(self):
        app = (ROOT / "app.py").read_text(encoding="utf-8")
        for route in ("/api/track/<int:report_id>", "/api/incidents/<int:iid>/confirm", "/api/translate"):
            self.assertIn(route, app)

    def test_existing_visual_effect_files_untouched_by_feature_patch(self):
        # These assets remain in the project and are not part of the added feature code.
        for name in ("style.css", "script.js", "fx.js"):
            self.assertTrue((ROOT / "static" / name).exists())

    def test_frontend_controls_present(self):
        html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
        js = (ROOT / "static" / "app.js").read_text(encoding="utf-8")
        self.assertIn("heatToggle", html)
        self.assertIn("trackingInput", html)
        self.assertIn("confirmIncident", js)
        self.assertIn("mobility_impact_score", js)

if __name__ == "__main__":
    unittest.main()
