import os
import unittest

# Tests intentionally exercise the deterministic fallback, without requiring an API key.
os.environ.pop("GEMINI_API_KEY", None)
from nlp_engine import analyze


class MobilityClassificationTests(unittest.TestCase):
    def test_indirect_waterlogging_impact_is_mobility(self):
        text = ("A huge amount of water has accumulated near Velachery railway station after "
                "continuous rainfall. School buses are unable to move properly, and people "
                "are struggling to cross the road.")
        result = analyze(text)
        self.assertTrue(result["relevant"])
        self.assertEqual(result["category"], "waterlogging")

    def test_heavy_rain_alone_is_not_automatically_mobility(self):
        result = analyze("Heavy rainfall has continued in Chennai since early morning.")
        self.assertFalse(result["relevant"])

    def test_flooded_road_and_vehicle_impact_is_mobility(self):
        result = analyze("Flooded road near Velachery. Cars and buses cannot pass.")
        self.assertTrue(result["relevant"])
        self.assertEqual(result["category"], "waterlogging")

    def test_home_water_leak_is_not_mobility(self):
        result = analyze("Water has accumulated inside my kitchen after a pipe leak.")
        self.assertFalse(result["relevant"])

    def test_regular_traffic_is_filtered(self):
        result = analyze("Traffic is moving normally on ECR today.")
        self.assertFalse(result["relevant"])

    def test_pothole_is_mobility(self):
        result = analyze("A deep pothole near Anna Nagar is damaging two-wheelers.")
        self.assertTrue(result["relevant"])
        self.assertEqual(result["category"], "road_damage")

    def test_selected_language_is_preserved_for_report_metadata(self):
        result = analyze("A flooded road is blocking buses near Velachery.", language_hint="Hindi")
        self.assertEqual(result["language"], "Hindi")

    def test_unknown_language_hint_falls_back_to_detection(self):
        result = analyze("Heavy traffic near Velachery", language_hint="Klingon")
        self.assertEqual(result["language"], "English")


if __name__ == "__main__":
    unittest.main(verbosity=2)
