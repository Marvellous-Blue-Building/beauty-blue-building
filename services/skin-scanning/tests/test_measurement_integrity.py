"""Regression checks: missing evidence must never become a health score."""
import json
import importlib.util
from pathlib import Path
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch
import numpy as np
from app.metrics import MEASUREMENT_REGIONS, SkinSignals, _score, compute_metrics, measurement_report, raw_measures, region
from app.schemas import ScanReport
from app.beauty import skin


def fixture(amplitude=1.0):
    size = (40, 40)
    y, x = np.indices(size)
    detail = (np.sin(x * 0.9) + np.cos(y * 0.7)).astype(np.float32) * amplitude
    mask = np.ones(size, dtype=bool)
    signals = SkinSignals(log_lum=detail, fine=detail, mid=detail * 2,
        dark_spots=np.abs(detail), lab=np.zeros((*size, 3)),
        shine=np.zeros(size, dtype=bool), measurable=mask.copy(), skin=mask)
    zones = {name: mask.copy() for names in MEASUREMENT_REGIONS.values() for name in names}
    face = SimpleNamespace(image=np.full((*size, 3), 140, dtype=np.uint8), iod_px=160)
    return face, signals, zones


class MeasurementIntegrityTests(unittest.TestCase):
    def test_invalid_values_never_become_99(self):
        for value in [None, float('nan'), float('inf'), -1]:
            self.assertIsNone(_score(value, 1, 4))
        self.assertTrue(all(v is None for v in compute_metrics({}).values()))

    def test_empty_samples_are_missing_not_zero(self):
        face, signals, zones = fixture()
        signals.measurable[:] = False
        self.assertTrue(all(v is None for v in raw_measures(signals, zones).values()))
        result = measurement_report(face, signals, zones)
        self.assertEqual(result['measurementStatus'], 'unavailable')
        self.assertTrue(all(m['value'] is None for m in result['measurements']))

    def test_missing_region_does_not_use_other_skin(self):
        face, signals, zones = fixture()
        del zones['nose']
        self.assertFalse(region(zones, signals, 'nose').any())
        reading = measurement_report(face, signals, zones)['measurements'][-1]
        self.assertEqual(reading['reason'], 'missing_region')
        self.assertIsNone(reading['value'])
        self.assertEqual(reading['samplePixels'], 0)

    def test_each_required_region_must_be_present(self):
        face, signals, zones = fixture()
        del zones['left_cheek']
        reading = measurement_report(face, signals, zones)['measurements'][0]
        self.assertEqual(reading['reason'], 'missing_region')
        self.assertIsNone(reading['value'])

    def test_upscaled_photo_does_not_claim_fine_detail(self):
        face, signals, zones = fixture()
        face.iod_px = 80
        readings = measurement_report(face, signals, zones)['measurements']
        self.assertTrue(all(m['reason'] == 'low_resolution' for m in readings))

    def test_highlight_exclusion_can_make_region_unavailable(self):
        face, signals, zones = fixture()
        signals.measurable[:30] = False
        readings = measurement_report(face, signals, zones)['measurements']
        self.assertTrue(all(m['reason'] == 'insufficient_skin' for m in readings))
        self.assertTrue(all(m['coverage'] == .25 for m in readings))

    def test_clipped_warm_pixels_are_not_high_quality_skin(self):
        face, signals, zones = fixture()
        face.image[:, :, 2] = 255
        readings = measurement_report(face, signals, zones)['measurements']
        self.assertTrue(all(m['reason'] == 'overexposed' for m in readings))

    def test_nonfinite_measurement_is_not_serialized(self):
        face, signals, zones = fixture()
        signals.fine[:] = np.nan
        result = measurement_report(face, signals, zones)
        self.assertIsNone(result['measurements'][0]['value'])
        json.dumps(result, allow_nan=False)

    def test_measured_zero_is_not_missing_or_perfect_health(self):
        result = measurement_report(*fixture(0))
        self.assertEqual(result['measurementStatus'], 'complete')
        self.assertTrue(all(m['value'] == 0 for m in result['measurements']))
        self.assertIsNone(result['overall'])
        self.assertIsNone(result['hydration'])
        self.assertIsNone(result['elasticity'])

    def test_values_follow_pixels_and_repeat_deterministically(self):
        low = measurement_report(*fixture(.3))
        high = measurement_report(*fixture(2))
        self.assertEqual(low, measurement_report(*fixture(.3)))
        for a, b in zip(low['measurements'], high['measurements']):
            self.assertLess(a['value'], b['value'])
            self.assertEqual(a['samplePixels'], 1600)
            self.assertEqual(a['coverage'], 1)
        report = ScanReport(scanId='test', status='SUCCESS', createdAt=datetime.now(timezone.utc),
                            ragTriggerStatus='READY_FOR_RECOMMENDATION', **high)
        payload = json.loads(report.model_dump_json())
        self.assertEqual(payload['scoringVersion'], 3)
        self.assertIsNone(payload['overall'])

    def test_skin_type_and_findings_unknown_without_regions(self):
        with patch.object(skin, '_measure_photo', return_value=dict.fromkeys(skin.REGIONS)):
            report = skin.analyse(None)
        self.assertEqual(report['analysis']['key'], 'unknown')
        for area in report['analysis']['detail']:
            self.assertFalse(area['measured'])
            self.assertIsNone(area['pori_besar'])
            self.assertIsNone(area['warna_kulit_merata'])

    def test_matching_contract_accepts_null_and_does_not_boost_it(self):
        matching = Path(__file__).resolve().parents[2] / "matching-service" / "app"
        modules = {}
        for name in ("schemas", "dictionaries"):
            spec = importlib.util.spec_from_file_location("matching_" + name, matching / (name + ".py"))
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            modules[name] = module
        nullable = modules["schemas"].ScanMetrics(**compute_metrics({})).model_dump()
        self.assertTrue(all(value is None for value in nullable.values()))
        keywords = modules["dictionaries"].scan_metric_keywords
        self.assertEqual(keywords(nullable), [])
        self.assertEqual(keywords({}), [])
        self.assertEqual(keywords({"hydration": float("nan")}), [])
        self.assertIn("glycerin", keywords({"hydration": 50}))


if __name__ == '__main__':
    unittest.main()
