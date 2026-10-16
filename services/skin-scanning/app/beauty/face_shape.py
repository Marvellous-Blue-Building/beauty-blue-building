"""Face shape analysis.

Six ratios are measured on every frame that passes the gates (head straight,
neutral expression, mouth closed), the median is placed within the population,
read onto three axes and matched to the nearest of seven shapes. The look guide
says which of five makeup looks needs the least adjustment for that shape.

The population norms and the look notes are placeholders until real scans
and stylists have set them.

The scan's front burst gives a handful of frames, so the minimum is
MIN_FRAMES.
"""

import math
from dataclasses import dataclass

import numpy as np

from app.beauty.vision import FaceFrame

# ---- landmarks (MediaPipe 478-point mesh; right / left are the subject's) ----
FOREHEAD_R, FOREHEAD_L = 54, 284
CHEEK_R, CHEEK_L = 234, 454
GONION_R, GONION_L = 172, 397
RAMUS_R, RAMUS_L = 132, 361
CHIN_SIDE_R, CHIN_SIDE_L = 148, 377
CHIN = 152
BROW_MID_R, BROW_MID_L = 105, 334
BROW_TAIL_R, BROW_TAIL_L = 70, 300
NOSE_TIP, FOREHEAD = 1, 10
EYE_OUTER_R, EYE_OUTER_L = 33, 263
UPPER_LIP_INNER, LOWER_LIP_INNER = 13, 14

THIRDS_SCALE = 1.5  # brow to chin is two of the face's three thirds
COVERED_FOREHEAD_SCALE = 1.18  # uncalibrated

# ---- gates ----
MAX_YAW_ASYMMETRY = 0.18
MAX_YAW_DEGREES = 10.0
MAX_ROLL_DEGREES = 10.0
# A level head reads 18-19.5 degrees on this mesh's forehead-chin depth line,
# so the window is centred there.
PITCH_NEUTRAL_DEGREES = 18.0
# Real webcam scans landed just outside 15, and the measurements are 3D distances,
# so a moderate nod barely moves them: 20, the same as the web clients' live
# check (apps/web/lib/scan/pose-steps.ts, public/widget-loader.js).
PITCH_WINDOW_DEGREES = 20.0
MAX_MOUTH_OPEN = 0.04

# A second, looser tier: when too few frames pass the gates above, frames
# within these are used instead and the result is marked approximate rather
# than refused.
RELAXED_YAW_DEGREES, RELAXED_ROLL_DEGREES, RELAXED_PITCH_WINDOW = 14.0, 13.0, 30.0
RELAXED_YAW_ASYMMETRY = 0.25
# Its expression limits. Raised brows, a slight smile or a blink barely move
# the six measurements (none is taken from the brows unless the head is
# covered); an open mouth does, so that stays close to the strict limit.
RELAXED_MOUTH_OPEN, RELAXED_JAW_OPEN = 0.05, 0.25
RELAXED_SMILE, RELAXED_BLINK, RELAXED_BROW_RAISE = 0.5, 0.7, 0.75

# Expression limits for a neutral face (MediaPipe blendshape scores)
MAX_JAW_OPEN, MAX_SMILE, MAX_BLINK, MAX_BROW_RAISE = 0.2, 0.35, 0.4, 0.5

MIN_FRAMES = 4
MAX_RELATIVE_SPREAD = 0.035


@dataclass
class HeadPose:
    yaw: float
    pitch: float
    roll: float
    yaw_asymmetry: float


@dataclass
class Measurements:
    proportion: float
    forehead_ratio: float
    jaw_ratio: float
    gonial_angle: float
    chin_taper: float


def _point(p: np.ndarray, i: int, hw: float) -> np.ndarray:
    return np.array([p[i, 0], p[i, 1] * hw, p[i, 2]])


def _distance(p, a, b, hw) -> float:
    return float(np.linalg.norm(_point(p, a, hw) - _point(p, b, hw)))


def _angle(p, vertex, a, b, hw) -> float:
    va = _point(p, a, hw) - _point(p, vertex, hw)
    vb = _point(p, b, hw) - _point(p, vertex, hw)
    la, lb = np.linalg.norm(va), np.linalg.norm(vb)
    if la <= 1e-9 or lb <= 1e-9:
        return 180.0
    return math.degrees(math.acos(max(-1.0, min(1.0, float(va @ vb / (la * lb))))))


def _degrees(opposite: float, adjacent: float) -> float:
    return 90.0 if adjacent <= 1e-6 else math.degrees(math.atan2(opposite, adjacent))


def head_pose(frame: FaceFrame) -> HeadPose | None:
    """Head pose: yaw from nose offset and edge depth, pitch from the
    forehead-chin depth line, roll from the eye line."""
    p, hw = frame.landmarks, frame.height / frame.width
    nose, right, left = p[NOSE_TIP, 0], p[CHEEK_R, 0], p[CHEEK_L, 0]
    span = abs(left - right)
    if span <= 1e-5:
        return None
    to_right, to_left = abs(nose - right), abs(left - nose)
    asymmetry = abs(to_right - to_left) / (to_right + to_left)
    yaw = _degrees(abs(p[CHEEK_L, 2] - p[CHEEK_R, 2]), span)
    height = abs(p[CHIN, 1] - p[FOREHEAD, 1]) * hw
    if height <= 1e-5:
        return None
    pitch = _degrees(p[CHIN, 2] - p[FOREHEAD, 2], height)
    ex = p[EYE_OUTER_L, 0] - p[EYE_OUTER_R, 0]
    ey = (p[EYE_OUTER_L, 1] - p[EYE_OUTER_R, 1]) * hw
    roll = math.degrees(math.atan2(abs(ey), abs(ex)))
    return HeadPose(yaw=yaw, pitch=pitch, roll=roll, yaw_asymmetry=asymmetry)


def pose_allows_reading(pose: HeadPose) -> bool:
    """Not turned and not tilted (nodding not judged) -- the colour scan's rule."""
    return (
        pose.yaw_asymmetry <= MAX_YAW_ASYMMETRY
        and pose.yaw <= MAX_YAW_DEGREES
        and pose.roll <= MAX_ROLL_DEGREES
    )


def pose_allows_shape(pose: HeadPose) -> bool:
    return pose_allows_reading(pose) and abs(pose.pitch - PITCH_NEUTRAL_DEGREES) <= PITCH_WINDOW_DEGREES


def pose_allows_relaxed(pose: HeadPose) -> bool:
    return (
        pose.yaw_asymmetry <= RELAXED_YAW_ASYMMETRY
        and pose.yaw <= RELAXED_YAW_DEGREES
        and pose.roll <= RELAXED_ROLL_DEGREES
        and abs(pose.pitch - PITCH_NEUTRAL_DEGREES) <= RELAXED_PITCH_WINDOW
    )


def is_neutral(
    frame: FaceFrame,
    mouth_open: float = MAX_MOUTH_OPEN,
    jaw_open: float = MAX_JAW_OPEN,
    smile: float = MAX_SMILE,
    blink: float = MAX_BLINK,
    brow_raise: float = MAX_BROW_RAISE,
) -> bool:
    p = frame.landmarks
    face_height = abs(p[CHIN, 1] - p[FOREHEAD, 1])
    if face_height <= 1e-5 or abs(p[LOWER_LIP_INNER, 1] - p[UPPER_LIP_INNER, 1]) / face_height > mouth_open:
        return False
    b = frame.blendshapes
    if not b:
        return True
    if b.get("jawOpen", 0) > jaw_open:
        return False
    if 0.5 * (b.get("mouthSmileLeft", 0) + b.get("mouthSmileRight", 0)) > smile:
        return False
    if max(b.get("eyeBlinkLeft", 0), b.get("eyeBlinkRight", 0)) > blink:
        return False
    brows = max(b.get("browInnerUp", 0), 0.5 * (b.get("browOuterUpLeft", 0) + b.get("browOuterUpRight", 0)))
    return brows <= brow_raise


def is_neutral_relaxed(frame: FaceFrame) -> bool:
    return is_neutral(frame, RELAXED_MOUTH_OPEN, RELAXED_JAW_OPEN, RELAXED_SMILE, RELAXED_BLINK, RELAXED_BROW_RAISE)


def measure(frame: FaceFrame, head_covered: bool) -> Measurements | None:
    """Six ratios, so the camera distance cancels out."""
    p, hw = frame.landmarks, frame.height / frame.width
    cheek = _distance(p, CHEEK_R, CHEEK_L, hw)
    jaw = _distance(p, GONION_R, GONION_L, hw)
    if cheek <= 1e-4 or jaw <= 1e-4:
        return None
    forehead = (
        _distance(p, BROW_TAIL_R, BROW_TAIL_L, hw) * COVERED_FOREHEAD_SCALE
        if head_covered
        else _distance(p, FOREHEAD_R, FOREHEAD_L, hw)
    )
    chin = _distance(p, CHIN_SIDE_R, CHIN_SIDE_L, hw)
    brow_mid = 0.5 * (_point(p, BROW_MID_R, hw) + _point(p, BROW_MID_L, hw))
    length = THIRDS_SCALE * float(np.linalg.norm(_point(p, CHIN, hw) - brow_mid))
    angle = 0.5 * (
        _angle(p, GONION_R, RAMUS_R, CHIN_SIDE_R, hw) + _angle(p, GONION_L, RAMUS_L, CHIN_SIDE_L, hw)
    )
    return Measurements(length / cheek, forehead / cheek, jaw / cheek, angle, chin / jaw)


# ---- population norms (placeholders) ----
NORMS = {
    "proportion": (1.21, 1.28, 1.35),
    "forehead_ratio": (0.77, 0.80, 0.83),
    "jaw_ratio": (0.75, 0.78, 0.81),
    "gonial_angle": (136.0, 140.0, 144.0),
    "chin_taper": (0.31, 0.35, 0.39),
}


def _percentile(value: float, norm: tuple[float, float, float]) -> float:
    p25, p50, p75 = norm
    spread = (p50 - p25) if value < p50 else (p75 - p50)
    if spread <= 1e-6:
        return 0.0 if value < p50 else 1.0 if value > p50 else 0.5
    z = (value - p50) / (spread / 0.6745)
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


# ---- axes ----
SHORT_BELOW, LONG_ABOVE = 0.25, 0.75
DEFINED_BELOW, SOFT_ABOVE = 0.30, 0.70
EVEN_ABOVE, LEAD_BY, ANGLE_WEIGHT = 0.65, 0.30, 0.65


@dataclass
class Axes:
    proportion: float
    forehead: float
    jaw: float
    definition: float
    chin: float

    @property
    def proportion_band(self) -> str:
        return "short" if self.proportion < SHORT_BELOW else "long" if self.proportion > LONG_ABOVE else "medium"

    @property
    def jaw_band(self) -> str:
        softness = 1 - self.definition
        return "soft" if softness > SOFT_ABOVE else "defined" if softness < DEFINED_BELOW else "medium"

    @property
    def widest(self) -> str:
        f, j = self.forehead, self.jaw
        if f >= EVEN_ABOVE and j >= EVEN_ABOVE and abs(f - j) < LEAD_BY:
            return "even"
        if f - j >= LEAD_BY and f > 0.5:
            return "forehead"
        if j - f >= LEAD_BY and j > 0.5:
            return "jaw"
        return "cheekbone"

    @property
    def widest_position(self) -> float:
        return min(1.0, max(0.0, 0.5 + 0.5 * (self.jaw - self.forehead)))


def axes_from(m: Measurements) -> Axes:
    jaw = _percentile(m.jaw_ratio, NORMS["jaw_ratio"])
    sharpness = 1 - _percentile(m.gonial_angle, NORMS["gonial_angle"])
    return Axes(
        proportion=_percentile(m.proportion, NORMS["proportion"]),
        forehead=_percentile(m.forehead_ratio, NORMS["forehead_ratio"]),
        jaw=jaw,
        definition=ANGLE_WEIGHT * sharpness + (1 - ANGLE_WEIGHT) * jaw,
        chin=_percentile(m.chin_taper, NORMS["chin_taper"]),
    )


# ---- classifier ----
SHAPES = ["oval", "round", "square", "long", "heart", "diamond", "triangle"]
# (proportion, forehead, jaw, definition)
PROTOTYPES = {
    "oval": (0.50, 0.50, 0.45, 0.35),
    "round": (0.12, 0.50, 0.55, 0.20),
    "square": (0.20, 0.80, 0.82, 0.85),
    "long": (0.88, 0.72, 0.70, 0.55),
    "heart": (0.50, 0.85, 0.20, 0.25),
    "diamond": (0.50, 0.15, 0.18, 0.35),
    "triangle": (0.50, 0.20, 0.85, 0.80),
}
DEFINITION_WEIGHT, SIGMA, CLOSE_RATIO = 0.8, 0.22, 0.75


def rank(axes: Axes) -> list[tuple[str, float]]:
    weights = []
    for shape in SHAPES:
        p, f, j, d = PROTOTYPES[shape]
        d2 = (
            (axes.proportion - p) ** 2
            + (axes.forehead - f) ** 2
            + (axes.jaw - j) ** 2
            + DEFINITION_WEIGHT * (axes.definition - d) ** 2
        )
        weights.append((shape, math.exp(-d2 / (2 * SIGMA * SIGMA))))
    total = sum(w for _, w in weights)
    scored = [(s, w / total if total > 0 else 1 / len(SHAPES)) for s, w in weights]
    return sorted(scored, key=lambda sw: (-sw[1], SHAPES.index(sw[0])))


# ---- words (Bahasa Indonesia) ----
SHAPE_NAME = {
    "oval": "Oval", "round": "Bulat", "square": "Kotak", "long": "Panjang",
    "heart": "Hati", "diamond": "Diamond", "triangle": "Segitiga",
}
SHAPE_DESCRIPTION = {
    "oval": "Panjang wajahmu sedikit melebihi lebarnya, tulang pipi menjadi bagian terlebar, dan garis rahangmu lembut.",
    "round": "Panjang dan lebar wajahmu hampir seimbang, tulang pipi menjadi bagian terlebar, dan garis rahangmu lembut membulat.",
    "square": "Dahi, tulang pipi, dan rahangmu hampir sama lebar, dengan sudut rahang yang tegas.",
    "long": "Wajahmu lebih panjang dibanding lebarnya, dengan dahi, tulang pipi, dan rahang yang hampir sama lebar.",
    "heart": "Dahimu menjadi bagian terlebar, lalu wajahmu menyempit lembut ke arah dagu.",
    "diamond": "Tulang pipimu jelas menjadi bagian terlebar, dengan dahi dan rahang yang lebih ramping.",
    "triangle": "Rahangmu menjadi bagian terlebar dengan sudut yang tegas, sementara dahimu lebih ramping.",
}
BAND_WORD = {
    "short": "Pendek", "medium": "Sedang", "long": "Panjang",
    "forehead": "Dahi", "cheekbone": "Pipi", "jaw": "Rahang", "even": "Merata",
    "soft": "Lembut", "defined": "Tegas",
}
CAVEAT = (
    "Bentuk wajah dibaca dari proporsi, dan kebanyakan wajah berada di antara dua bentuk. "
    "Anggap ini sebagai titik awal, bukan penilaian."
)
COVERED_NOTE = "Hijab terdeteksi, jadi lebar dahi kami ukur dari alis, bukan dari garis rambut."
APPROXIMATE_NOTE = {
    "pose": "Wajahmu sedikit menoleh atau menunduk saat foto depan, jadi bentuk ini perkiraan. "
            "Untuk hasil yang lebih pasti, scan lagi sambil menghadap lurus ke kamera.",
    "expression": "Ekspresimu sedikit berubah saat foto depan, jadi bentuk ini perkiraan. "
                  "Untuk hasil yang lebih pasti, scan lagi dengan wajah rileks dan mulut tertutup.",
}
REMEDY = {
    "face_straight": "Kepalamu banyak menoleh atau miring selama pemindaian. Hadapkan wajah lurus ke kamera, lalu coba lagi.",
    "neutral_face": "Ekspresimu banyak berubah selama pemindaian. Rileks dengan mulut tertutup, lalu coba lagi.",
    "hold_still": "Terlalu banyak gerakan untuk pembacaan yang akurat. Tahan posisi sebentar, lalu coba lagi.",
    "cannot_measure": "Kami belum bisa membaca wajahmu dengan jelas. Atur cahaya dan posisi, lalu coba lagi.",
}

# ---- look notes ----
LOOKS = ["natural", "dewy_glow", "soft_glam", "bold", "latina"]
LOOK_NAME = {
    "natural": "Natural", "dewy_glow": "Dewy / Glow", "soft_glam": "Soft Glam", "bold": "Bold", "latina": "Latina",
}
LOOK_CHARACTER = {
    "natural": "Kulit sheer, alis disisir, blush tipis, bibir balm.",
    "dewy_glow": "Kulit bercahaya, alis lurus, bibir gradient.",
    "soft_glam": "Kulit satin, contour sedang, mata terdefinisi lembut, bibir rosy.",
    "bold": "Eyeliner tegas, smokey, bibir pekat.",
    "latina": "Alis tebal, contour tajam, bibir nude atau cokelat.",
}
TIE_ORDER = ["soft_glam", "dewy_glow", "bold", "latina"]
FIT_KEY = {0: "as_is", 1: "one_adjustment", 2: "major_adjustment"}
FIT_LABEL = {0: "Jalan apa adanya", 1: "Perlu satu penyesuaian", 2: "Perlu penyesuaian besar"}
TIER = {
    0: ("best", "Paling Pas", "Sudah sejalan dengan proporsi wajahmu. Pakai seperti aslinya."),
    1: ("one_touch", "Satu Sentuhan", "Cukup satu penyesuaian kecil, dan look ini terasa dibuat untukmu."),
    2: ("worth_trying", "Layak Dicoba", "Butuh beberapa penyesuaian, tapi hasilnya layak untuk dicoba."),
}
_AS_IS = "Pengaturan bawaannya sudah sejalan dengan proporsi wajahmu."
# [look][shape] -> (fit 0/1/2, note, draft). Shape order: SHAPES.
_MATRIX = {
    "dewy_glow": [
        (0, _AS_IS, False),
        (1, "Letakkan glow sedikit lebih tinggi di tulang pipi dan sapukan ke arah pelipis, supaya cahayanya memberi arah diagonal pada wajahmu.", True),
        (1, "Pusatkan glow di tengah wajah — tulang pipi atas, batang hidung, dan dagu — supaya cahaya menarik perhatian ke tengah dan melembutkan bingkai wajah.", True),
        (2, "Hentikan glow di pertengahan batang hidung, lewati dagu, dan sapukan cahaya melintang di tulang pipi. Alis lurus look ini jadi penyeimbang utamanya, jadi pertahankan.", False),
        (0, _AS_IS, False),
        (1, "Pindahkan glow dari puncak tulang pipi ke tulang alis dan dagu, supaya cahaya memberi dimensi pada bagian atas dan bawah wajahmu.", False),
        (0, _AS_IS, False),
    ],
    "soft_glam": [
        (0, _AS_IS, False),
        (1, "Letakkan contour di sisi wajah, tepat di bawah tulang pipi, untuk memberi dimensi vertikal.", False),
        (1, "Baurkan contour di sudut rahang sampai lembut, supaya garis wajahmu terasa mengalir.", False),
        (1, "Letakkan contour di garis rambut dan ujung dagu, supaya perhatian berkumpul di tengah wajah.", False),
        (0, _AS_IS, False),
        (0, _AS_IS, False),
        (1, "Sapukan bronzer di pelipis untuk menyeimbangkan bagian atas dengan rahangmu.", False),
    ],
    "bold": [
        (0, _AS_IS, False),
        (1, "Tarik smokey memanjang ke arah luar, bukan membulat, supaya mata memberi arah horizontal.", False),
        (1, "Angkat sayap eyeliner dan baurkan tepi smokey ke atas, supaya perhatian tertarik ke mata dan menyeimbangkan dengan garis rahangmu.", True),
        (1, "Jaga eyeshadow tetap rendah dan melebar ke samping, supaya fokus mata bergerak horizontal.", False),
        (1, "Jadikan bibir sebagai fokus utama dan turunkan sedikit intensitas mata, supaya perhatian tersebar ke bagian bawah wajah.", False),
        (0, _AS_IS, False),
        (0, _AS_IS, False),
    ],
    "latina": [
        (0, _AS_IS, False),
        (0, "Contour tajam look ini memberi struktur vertikal — pasangan yang sangat cocok untuk wajahmu.", False),
        (2, "Baurkan contour jadi sapuan yang lembut dan bulatkan lengkung alis, supaya ketegasan look ini tidak bertumpuk dengan garis rahangmu yang sudah tegas.", False),
        (2, "Pilih bentuk alis yang lebih mendatar, hentikan contour hidung lebih pendek, dan sapukan contour pipi melintang, supaya look ini tidak menambah kesan vertikal.", False),
        (1, "Tipiskan sedikit alisnya, karena dahimu sudah membawa bobot di bagian atas wajah.", False),
        (1, "Letakkan contour sedikit di bawah puncak tulang pipi dan beri highlight di pelipis, supaya struktur look ini tersebar ke seluruh wajah.", True),
        (0, _AS_IS, False),
    ],
}
# The look photos are served by the web app (apps/web/public/beauty/looks), which
# makes these paths absolute before a result leaves it (lib/beauty-scan.ts).
LOOK_IMAGE_BASE = "/beauty/looks/"


def look_guide(shape: str) -> dict:
    s = SHAPES.index(shape)
    ranked = sorted(
        (
            {"key": look, "fit": _MATRIX[look][s][0], "note": _MATRIX[look][s][1], "draft": _MATRIX[look][s][2]}
            for look in TIE_ORDER
        ),
        key=lambda n: n["fit"],  # stable: equal fits keep TIE_ORDER
    )
    looks = [
        {
            "key": n["key"],
            "displayName": LOOK_NAME[n["key"]],
            "character": LOOK_CHARACTER[n["key"]],
            "fit": FIT_KEY[n["fit"]],
            "fitLabel": FIT_LABEL[n["fit"]],
            "tier": TIER[n["fit"]][0],
            "note": n["note"],
            "draft": n["draft"],
            "imageUrl": f"{LOOK_IMAGE_BASE}{shape}_{n['key']}.jpg",
        }
        for n in ranked
    ]
    tiers = []
    for fit in (0, 1, 2):
        keys = [n["key"] for n in ranked if n["fit"] == fit]
        if fit == 0:
            keys.append("natural")
        if keys:
            key, title, lead = TIER[fit]
            tiers.append({"key": key, "title": title, "lead": lead, "fit": FIT_KEY[fit], "looks": keys})
    return {
        "title": "Paling sedikit butuh penyesuaian untuk wajahmu",
        "ranked": looks,
        "natural": {
            "key": "natural",
            "displayName": "Natural",
            "text": "Natural netral untuk semua bentuk wajah, jadi pakai apa adanya.",
            "tier": "best",
            "imageUrl": f"{LOOK_IMAGE_BASE}natural.jpg",
        },
        "guide": {"title": "Panduan Look untuk Wajahmu", "lead": "Dari yang paling pas sampai yang layak dicoba", "tiers": tiers},
    }


def _median(values: list[float]) -> float:
    return float(np.median(values))


def _relative_spread(values: list[float]) -> float:
    med = np.median(values)
    return float(np.median(np.abs(np.asarray(values) - med)) / abs(med)) if abs(med) > 1e-9 else 0.0


def analyse(frames: list[FaceFrame], head_covered: bool) -> dict:
    """The face shape verdict over the scan's frames, with a
    relaxed fallback tier (see RELAXED_*)."""
    kept: list[Measurements] = []
    relaxed: list[Measurements] = []
    poses: list[HeadPose] = []
    rejected_pose = rejected_expression = 0
    for frame in frames:
        pose = head_pose(frame)
        if pose is None:
            continue
        poses.append(pose)
        straight, neutral = pose_allows_shape(pose), is_neutral(frame)
        if straight and neutral:
            if (m := measure(frame, head_covered)) is not None:
                kept.append(m)
            continue
        if not straight:
            rejected_pose += 1
        else:
            rejected_expression += 1
        if (straight or pose_allows_relaxed(pose)) and (neutral or is_neutral_relaxed(frame)):
            if (m := measure(frame, head_covered)) is not None:
                relaxed.append(m)

    approximate = False
    if len(kept) < MIN_FRAMES and len(kept) + len(relaxed) >= MIN_FRAMES:
        kept, approximate = kept + relaxed, True

    remedy = None
    if len(kept) < MIN_FRAMES:
        if rejected_pose == 0 and rejected_expression == 0:
            remedy = "cannot_measure"
        else:
            remedy = "face_straight" if rejected_pose >= rejected_expression else "neutral_face"
    elif any(
        _relative_spread([getattr(m, f) for m in kept]) > MAX_RELATIVE_SPREAD
        for f in ("proportion", "forehead_ratio", "jaw_ratio")
    ):
        remedy = "hold_still"

    source = {
        "method": "camera",
        "headCovered": head_covered,
        "foreheadFrom": "brows" if head_covered else "temples",
        "framesUsed": len(kept),
        "remedy": remedy or "none",
        "unmeasurable": remedy is not None and len(kept) < MIN_FRAMES,
        "quality": "approximate" if approximate else "measured",
        "approximateReason": ("pose" if rejected_pose >= rejected_expression else "expression") if approximate else None,
        # What the frames read, to tune the gates on real scans.
        "angles": {
            "yaw": round(_median([p.yaw for p in poses]), 1) if poses else None,
            "pitch": round(_median([p.pitch - PITCH_NEUTRAL_DEGREES for p in poses]), 1) if poses else None,
            "roll": round(_median([p.roll for p in poses]), 1) if poses else None,
            "rejectedForPose": rejected_pose,
            "rejectedForExpression": rejected_expression,
        },
    }
    if len(kept) < MIN_FRAMES:
        return {
            "kind": "bluebuilding.beauty.face-shape",
            "shape": None,
            "source": source,
            "remedyText": REMEDY[remedy],
            "caveat": CAVEAT,
        }

    median = Measurements(*(_median([getattr(m, f) for m in kept]) for f in Measurements.__dataclass_fields__))
    axes = axes_from(median)
    ranked = rank(axes)
    (best, best_score), (second, second_score) = ranked[0], ranked[1]
    close = second_score >= best_score * CLOSE_RATIO

    return {
        "kind": "bluebuilding.beauty.face-shape",
        "shape": {
            "key": best,
            "displayName": SHAPE_NAME[best],
            "confidence": round(best_score, 3),
            "confidencePercent": round(best_score * 100),
            "alsoFits": {"key": second, "displayName": SHAPE_NAME[second]} if close else None,
            "ranked": [{"key": k, "displayName": SHAPE_NAME[k], "score": round(v, 3)} for k, v in ranked[:3]],
        },
        "source": source,
        "axes": [
            {"axis": "proportion", "label": "Proporsi", "position": round(axes.proportion, 3),
             "band": axes.proportion_band, "verdict": BAND_WORD[axes.proportion_band],
             "lowLabel": "Pendek", "highLabel": "Panjang"},
            {"axis": "widest_point", "label": "Titik terlebar", "position": round(axes.widest_position, 3),
             "band": axes.widest, "verdict": BAND_WORD[axes.widest],
             "lowLabel": "Dahi", "midLabel": "Pipi", "highLabel": "Rahang"},
            {"axis": "jaw_definition", "label": "Ketegasan rahang", "position": round(axes.definition, 3),
             "band": axes.jaw_band, "verdict": BAND_WORD[axes.jaw_band],
             "lowLabel": "Lembut", "highLabel": "Tegas"},
        ],
        "description": SHAPE_DESCRIPTION[best],
        "alsoFitsText": f"Wajahmu juga hampir sama cocoknya dengan bentuk {SHAPE_NAME[second]}." if close else None,
        "coveredNote": COVERED_NOTE if head_covered else None,
        "approximateNote": (
            APPROXIMATE_NOTE["pose" if rejected_pose >= rejected_expression else "expression"] if approximate else None
        ),
        "looks": look_guide(best),
        "caveat": CAVEAT,
        "remedyText": REMEDY[remedy] if remedy else None,
    }
