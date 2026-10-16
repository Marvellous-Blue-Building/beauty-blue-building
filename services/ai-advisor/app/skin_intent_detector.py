import re
from typing import List, Dict, Optional, Tuple

class SkinAnalysisIntentDetector:
    """
    Detector to identify user intents related to skin scanning and progress tracking.
    Based on the conversational knowledge base for Face Scanning Analysis.
    """

    INTENTS = {
        "FACE_SCAN_START": {
            "name": "Start face scan",
            "keywords": [
                "face scan", "face scanning", "scan my face", "scan face", "scan my skin", 
                "skin scan", "skin scanning", "skin scanner", "facial scan", "facial skin scan", 
                "analyze my face", "analyse my face", "analyze my skin", "analyse my skin", 
                "face analysis", "skin analysis", "facial analysis", "skin check", "check my skin", 
                "check my face", "inspect my skin", "assess my skin", "start scan", "begin scan", 
                "scan now", "start face analysis", "start skin analysis", "take a skin scan", 
                "take a face scan", "do a skin check", "run skin analysis", "ai skin analysis", 
                "ai face scan", "face scanner", "skin assessment", "skin condition scan", 
                "facial assessment", "scan selfie", "analyze selfie", "use camera to analyze skin", 
                "check skin from photo", "skin analysis from photo", "face scan feature", 
                "skin scan feature", "scan wajah", "pemindaian wajah", "pindai wajah", "pindai kulit", 
                "scan kulit", "pemindaian kulit", "analisis wajah", "analisa wajah", "analisis kulit", 
                "analisa kulit", "cek wajah", "cek kulit", "periksa kulit", "pemeriksaan kulit", 
                "kondisi kulit wajah", "deteksi kondisi kulit", "deteksi kulit wajah", 
                "penilaian kulit", "penilaian kondisi kulit", "evaluasi kulit", "tes kulit wajah", 
                "tes kondisi kulit", "kamera analisis kulit", "scan muka", "analisis muka", 
                "cek muka", "foto untuk analisis kulit", "analisis dari foto", "analisis pakai selfie", 
                "scan pakai kamera", "mulai scan", "mulai pemindaian", "mulai analisis", 
                "mulai analisa kulit", "buka scan wajah", "buka analisis kulit", "coba skin scanner", 
                "fitur scan kulit", "fitur analisis wajah", "ai analisis kulit", "pemindai kulit",
                "pemindai wajah", "kondisi muka", "kondisi wajah sekarang", "lihat kondisi kulit",
                "cek kesehatan kulit wajah", "scanning", "test kulit", "tes kulit"
            ]
        },
        "SKIN_PROGRESS_VIEW": {
            "name": "View progress",
            "keywords": [
                "skin progress", "track my skin", "track skin progress", "skin tracking", 
                "progress tracker", "skin journey", "skin diary", "skin history", "scan history", 
                "past scans", "previous scans", "old results", "progress over time", "skin trend", 
                "improvement", "getting better", "getting worse", "no change", "progress report", 
                "monthly progress", "weekly progress", "skin timeline", "history by date", 
                "riwayat kulit", "riwayat scan", "riwayat analisis kulit", "lacak perkembangan kulit", 
                "pantau kondisi kulit", "tracking kulit", "perkembangan kulit wajah", "progres kulit", 
                "perjalanan kulit", "jurnal kulit", "catatan kulit", "hasil scan sebelumnya", 
                "hasil scan terdahulu", "perubahan kondisi kulit", "tren kondisi kulit", 
                "perkembangan dari waktu ke waktu", "apakah kulit saya membaik",
                "apakah kulit saya memburuk", "laporan perkembangan kulit", "timeline kulit",
                "riwayat berdasarkan tanggal", "pantau progres skincare", "track progress",
                "progress", "progres"
            ]
        },
        "SKIN_PROGRESS_COMPARE": {
            "name": "Compare scans",
            "keywords": [
                "compare results", "compare scans", "before and after", "before-after skin", 
                "compare two scans", "compare dates", "compare photos", "side by side", 
                "previous vs current", "old vs new", "last week vs this week", "last month vs this month", 
                "scan comparison", "photo comparison", "perbandingan scan", "bandingkan dua hasil", 
                "bandingkan foto", "sebelum dan sesudah", "hasil lama dan baru", 
                "scan sebelumnya vs sekarang", "minggu lalu vs sekarang", "bulan lalu vs bulan ini", 
                "perbandingan berdampingan", "bandingkan berdasarkan tanggal"
            ]
        },
        "SKIN_PROGRESS_TREND": {
            "name": "Ask about trends",
            "keywords": [
                "is my skin improving", "is my skin getting better", "is my skin getting worse", 
                "any improvement", "any progress", "has anything changed", "skin getting clearer", 
                "acne decreasing", "redness reducing", "skin looks worse", "progress status", 
                "improvement trend", "no progress", "unchanged", "membaik", "makin baik", 
                "makin parah", "memburuk", "ada perkembangan", "ada perubahan", "kulit makin bersih", 
                "jerawat berkurang", "kemerahan berkurang", "tidak ada perubahan", "belum ada progres", 
                "progresnya bagaimana", "kondisi kulit makin bagus", "kulit tambah bermasalah", 
                "hasilnya efektif atau tidak"
            ]
        }
    }

    def detect(self, text: str) -> Tuple[Optional[str], float]:
        """
        Detects the single best-matching intent of the given text.
        Returns a tuple of (intent_id, confidence_score).
        """
        all_matches = self.detect_all(text)
        if not all_matches:
            return None, 0.0
        return all_matches[0]

    def detect_all(self, text: str) -> List[Tuple[str, float]]:
        """
        Detects every intent the text matches — a message can genuinely call
        for more than one (e.g. "scan kulit saya terus lihat progress" names
        both FACE_SCAN_START and SKIN_PROGRESS_VIEW), so this doesn't pick a
        single "best" intent and discard the rest. Returns (intent_id,
        confidence_score) pairs sorted by descending confidence.
        """
        text = text.lower()
        scores: Dict[str, float] = {}

        for intent_id, data in self.INTENTS.items():
            score = 0.0
            for keyword in data["keywords"]:
                if keyword in text:
                    # Simple scoring: longer keywords give more weight
                    score += len(keyword) / 10.0
            if score > 0.0:
                scores[intent_id] = score

        # Normalize score to 0.0 - 1.0 range (approximate)
        return sorted(
            ((intent_id, min(score / 5.0, 1.0)) for intent_id, score in scores.items()),
            key=lambda pair: pair[1],
            reverse=True,
        )

    def analyze_user_request(self, text: str) -> Dict:
        """
        High level analysis of user request.
        """
        intent, confidence = self.detect(text)
        return {
            "intent": intent,
            "confidence": confidence,
            "is_skin_related": intent is not None,
            "category": "scanning" if intent in ["FACE_SCAN_START"] else "tracking" if intent else None
        }
