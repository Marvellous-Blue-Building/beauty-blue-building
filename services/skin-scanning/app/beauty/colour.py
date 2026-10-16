"""Seasonal colour analysis.

Per frame: two cheek patches and five hairline points are sampled, the hair is
checked against the segmenter (hair vs. hijab / ceiling), and the room's neutral
surfaces are read as a fallback white reference. Over the scan: the per-channel
median, a white-balance correction against hair (or the room), then three axes
-- Warmth from skin hue, Value from skin L*, Chroma from skin-to-hair contrast --
each with a belief, and the nearest of twelve seasons. Confidence says how far
ahead the winner is (45% tied .. 75% clear), never more.

The steadiness figure is read over the scan's front burst.

The season palettes (data/seasonal_makeup_palettes.json) are marked as
placeholders, not final colourist work.
"""

import json
import math
import pathlib
from dataclasses import dataclass, field

import cv2
import numpy as np

from app.beauty import colour_space as cs
from app.beauty.face_shape import head_pose, pose_allows_reading
from app.beauty.vision import BODY_SKIN, CLOTHES, FACE_SKIN, HAIR, OTHER, FaceFrame

# ---- sampler geometry ----
EYE_OUTER_R, MOUTH_R, EDGE_R = 33, 61, 234
EYE_OUTER_L, MOUTH_L, EDGE_L = 263, 291, 454
FOREHEAD, CHIN = 10, 152
CHEEK_OUTWARD = 0.28
PATCH_RADIUS_OF_FACE = 0.028
HAIR_ABOVE_BROW = 0.20
HAIR_POINTS = 5
CELL = 24  # each patch is read into a 24px cell, so radius <= 12
COVERED_SHARE = 0.6

# ---- skin, hair and white reference ----
HAIR_NEUTRAL_CHROMA = 3.5
HAIR_FULLY_NEUTRAL_CHROMA = 2.5
HAIR_MIN_DARKER_THAN_SKIN = 10.0
HAIR_MAX_LIGHTNESS = 62.0
HAIR_MIN_LIGHTNESS = 8.0
HAIR_LIGHTNESS_FADE = 2.0
DARK_HAIR_LIGHTNESS = 15.0
HIGHLIGHT_ALLOWANCE = 0.03
HAIR_TRUST, DARK_HAIR_TRUST, GREY_WORLD_TRUST = 0.7, 0.55, 0.35
GATE_FLOOR, GATE_CEILING, MAX_CLIP_FRACTION = 45.0, 72.0, 0.02

# ---- the three axes ----
COOL_HUE, WARM_HUE = 44.0, 60.0
EXPOSURE_FLOOR, EXPOSURE_CEILING = 45.0, 72.0
VERIFIED_FLOOR, VERIFIED_CEILING = 52.0, 68.0
VALUE_CONFIDENCE = 0.30
SOFT_STOPS, BRIGHT_STOPS = 1.0, 3.6
MIN_STABILITY_WEIGHT = 0.25

# ---- steadiness and measurement quality ----
HUE_SPREAD_CEILING, LIGHTNESS_SPREAD_CEILING, NOISE_MIN_FRAMES = 7.5, 5.0, 3
WEAK_STABILITY, STRONG_STABILITY = 0.30, 0.60

# ---- nearest season and verdict ----
AXES = ("value", "chroma", "warmth")
AXIS_TRUST = {"value": 1.0, "chroma": 0.9, "warmth": 0.7}
UNMEASURED_AXIS_WEIGHT = 0.1
DECISIVE_GAP = 0.18
TIED_CONFIDENCE, CLEAR_CONFIDENCE, CONFIDENCE_RISE = 0.45, 0.75, 1.8
MEASURED_CONCLUSIVE = 0.70
POLE_THRESHOLD = 0.34  # where an axis reads as one pole

# (key, display name, family, value, chroma, warmth)
SEASONS = [
    ("bright_spring", "Bright Spring", "Spring", 0.25, 0.95, 0.40),
    ("true_spring", "True Spring", "Spring", 0.40, 0.50, 0.90),
    ("light_spring", "Light Spring", "Spring", 0.90, 0.25, 0.35),
    ("light_summer", "Light Summer", "Summer", 0.90, -0.15, -0.35),
    ("true_summer", "True Summer", "Summer", 0.30, -0.40, -0.90),
    ("soft_summer", "Soft Summer", "Summer", 0.05, -0.95, -0.35),
    ("soft_autumn", "Soft Autumn", "Autumn", -0.05, -0.95, 0.35),
    ("true_autumn", "True Autumn", "Autumn", -0.30, -0.40, 0.90),
    ("dark_autumn", "Dark Autumn", "Autumn", -0.90, -0.10, 0.35),
    ("dark_winter", "Dark Winter", "Winter", -0.90, 0.35, -0.35),
    ("true_winter", "True Winter", "Winter", -0.40, 0.50, -0.90),
    ("bright_winter", "Bright Winter", "Winter", -0.20, 0.95, -0.40),
]

AXIS_WORDS = {
    # axis: (Indonesian label, negative pole, positive pole, English label)
    "value": ("Kedalaman", "Gelap", "Terang", "Depth"),
    "chroma": ("Kejernihan", "Lembut", "Cerah", "Clarity"),
    "warmth": ("Undertone", "Cool", "Warm", "Undertone"),
}

_PALETTES = {
    s["key"]: s
    for s in json.loads(
        (pathlib.Path(__file__).parent / "data" / "seasonal_makeup_palettes.json").read_text(encoding="utf-8")
    )["seasons"]
}
_PALETTE_CATEGORIES = {
    c["id"]: c["label"]
    for c in json.loads(
        (pathlib.Path(__file__).parent / "data" / "seasonal_makeup_palettes.json").read_text(encoding="utf-8")
    )["categories"]
}

SEASON_VOICE_ID = {
    "bright_spring": "Jernih, hangat dan cerah - palet ini kuat menampung warna penuh. Coral, turquoise, merah poppy, ivory cerah. Warna yang berdebu atau keabu-abuan akan terlihat pudar, jadi pilih warna yang bersih dan biarkan satu warna jadi pusat perhatian.",
    "true_spring": "Hangat dan keemasan dari awal sampai akhir. Camel, aprikot, hijau rumput, ivory hangat sebagai ganti putih. Perhiasan emas, selalu. Warna yang paling bekerja untukmu adalah yang terasa seperti ada sinar matahari di dalamnya - tidak ada yang dingin atau pucat.",
    "light_spring": "Terang dan hangat, paling indah saat tidak ada yang berat. Peach, coral lembut, aqua hangat, krem mentega. Hitam akan terasa mendominasimu - ganti dengan abu-abu hangat dan navy lembut, dan jaga kontras antar pakaian tetap lembut.",
    "light_summer": "Terang dan cool, dengan kelembutan. Biru pastel, rose lembut, abu-abu merpati, krem dingin. Perak lebih baik daripada emas. Kuncinya, jaga seluruh pakaian dalam nada lembut yang sama - satu warna yang sangat gelap atau pekat akan mencuri perhatian darimu.",
    "true_summer": "Cool, dan lembut. Paletmu ada di biru lembut, rose, plum dan abu-abu yang tampak kebiruan di cahaya siang - warna yang seperti dibilas, bukan dicampur. Perak lebih cocok daripada emas, dan hitam pekat sebaiknya diganti navy tua yang lembut.",
    "soft_summer": "Cool dan lembut, dan kelembutan itulah kuncinya. Sage, mushroom, dusty rose, teal lembut, cokelat kakao. Warna dengan sedikit abu-abu akan terlihat effortless, sedangkan neon atau warna sangat jernih akan terlalu mencolok. Jaga kontras tetap rendah.",
    "soft_autumn": "Hangat dan lembut - seperti kemeja linen yang bagus. Olive, terakota, emas lembut, mushroom, peach berdebu. Tidak ada yang perlu mencolok: warnamu bekerja saat berdekatan dan membiarkan kehangatannya terlihat. Warna yang sangat cerah cukup untuk aksesori saja.",
    "true_autumn": "Hangat, kaya dan tenang. Karat, lumut, mustard, teal tua, chestnut, krem sebagai ganti putih. Emas dan perunggu daripada perak. Palet ini punya kedalaman nyata - warna yang tidak cocok untukmu adalah yang pucat dan dingin, bukan yang kuat.",
    "dark_autumn": "Gelap dan hangat, dengan bobot. Cokelat, hijau hutan, terong, oranye bakar, teal gelap. Kamu bisa memakai pakaian yang benar-benar gelap dan terlihat makin kaya - asal gelapnya hangat. Charcoal dan hitam hangat lebih baik untukmu daripada hitam dingin yang datar.",
    "dark_winter": "Gelap dan cool, dan tidak takut kontras. Hitam, hijau pinus, burgundy, putih es, plum dingin. Ini salah satu palet yang justru makin bagus dengan pasangan terang-gelap yang tegas - kemeja putih cerah di bawah warna yang sangat gelap adalah trik terbaikmu.",
    "true_winter": "Cool, jernih dan kuat. Merah sejati, biru royal, zamrud, putih bersih, hitam pekat. Perak dan platinum. Paletmu tidak ingin dilembutkan: warna berdebu atau beige hangat akan membuatnya datar, sedangkan satu warna pekat dengan hitam atau putih terlihat sangat disengaja.",
    "bright_winter": "Cool dan berkilau - palet dengan kontras paling tinggi dari dua belas musim. Fuchsia, biru elektrik, zamrud, hot pink, putih bersih dan hitam. Tidak ada yang berdebu, tidak ada beige. Saat warnanya bersih dan kontrasnya tinggi, kamu terlihat seperti sengaja memilihnya.",
}

UNMEASURED_TEXT = {
    "more_light": "Aku belum bisa membaca warnamu dengan jelas. Cahayanya terlalu redup atau tidak merata untuk dipercaya.",
    "hold_still": "Aku belum bisa membaca warnamu dengan jelas. Terlalu banyak gerakan untuk menentukan warnamu.",
    "show_hair": "Aku belum bisa membaca warnamu dengan jelas. Rambutmu kurang terlihat untuk menilai kontrasmu.",
    "cannot_measure": "Kali ini aku belum bisa membaca warnamu dengan jelas.",
    # Too bright, worded apart from too dark (both share the more_light remedy).
    "less_light": "Aku belum bisa membaca warnamu dengan jelas. Cahayanya terlalu terang, jadi warna kulitmu memudar.",
}

# Shown under a season that was read, but not strongly (tier workable / weak).
RETRY_TIP = {
    "more_light": "Untuk hasil yang lebih pasti, pindai lagi di cahaya yang lebih terang dan merata, misalnya menghadap jendela.",
    "less_light": "Untuk hasil yang lebih pasti, pindai lagi dengan cahaya yang tidak terlalu terang atau langsung mengenai wajah.",
    "hold_still": "Untuk hasil yang lebih pasti, tahan kepalamu tetap diam selama pemindaian.",
    "show_hair": "Untuk hasil yang lebih pasti, pastikan sebagian rambutmu terlihat di kamera.",
}


# ---------------------------------------------------------------- sampling


@dataclass
class Patch:
    mean: np.ndarray  # mean RGB 0..1
    clip: float
    middle: np.ndarray  # mean RGB of the 20th..80th luma percentile
    body: float  # linear luminance of the 20th..60th percentile


def _sample_patch(rgb: np.ndarray, cx: float, cy: float, r: float) -> Patch | None:
    """Median colour and clipping of one cheek patch."""
    h, w = rgb.shape[:2]
    if not (0 <= cx < w and 0 <= cy < h):
        return None
    r = min(r if r > 0 else 3.0, CELL / 2)
    x0 = max(0, min(w - 1, round(cx - r)))
    y0 = max(0, min(h - 1, round(cy - r)))
    pw = max(0, min(w - x0, round(r * 2)))
    ph = max(0, min(h - y0, round(r * 2)))
    if pw < 2 or ph < 2:
        return None
    px = rgb[y0 : y0 + ph, x0 : x0 + pw].reshape(-1, 3).astype(np.int32)
    luma = (77 * px[:, 0] + 150 * px[:, 1] + 29 * px[:, 2]) >> 8
    clip = float(np.mean((px >= 248).any(axis=1)))
    sorted_luma = np.sort(luma)
    n = len(sorted_luma)
    p20 = sorted_luma[max(0, math.ceil(n * 0.2) - 1)]
    p60 = sorted_luma[max(0, math.ceil(n * 0.6) - 1)]
    p80 = sorted_luma[max(0, math.ceil(n * 0.8) - 1)]
    middle_mask = (luma >= p20) & (luma <= p80)
    body_mask = middle_mask & (luma <= p60)
    mean = px.mean(axis=0) / 255
    middle = px[middle_mask].mean(axis=0) / 255 if middle_mask.any() else mean
    body = float(cs.luminance(px[body_mask] / 255).mean()) if body_mask.any() else 0.0
    return Patch(mean=mean, clip=clip, middle=middle, body=body)


def _grey_world(frame: FaceFrame) -> tuple[np.ndarray, float] | None:
    """Grey world: the room's neutral surfaces, without her skin and
    hair, each pixel weighted by how neutral it looks."""
    size = 32
    small = cv2.resize(frame.rgb, (size, size), interpolation=cv2.INTER_AREA).astype(np.float64)
    keep = np.ones((size, size), bool)
    if frame.categories is not None:
        cats = cv2.resize(frame.categories, (size, size), interpolation=cv2.INTER_NEAREST)
        keep = ~np.isin(cats, (HAIR, BODY_SKIN, FACE_SKIN))
    hi = small.max(axis=2)
    lo = small.min(axis=2)
    usable = np.clip(np.minimum((248 - hi) / 16, (hi - 24) / 16), 0, 1)
    t = np.clip(1 - ((hi - lo) / np.maximum(hi, 1e-9)) / 0.35, 0, 1)
    weight = (0.10 + t) * usable * keep
    neutral = t * usable * keep
    total = weight.sum()
    if total <= 0:
        return None
    linear = cs.to_linear(small / 255)
    mean_linear = (linear * weight[..., None]).sum(axis=(0, 1)) / total
    return cs.from_linear(mean_linear), float(neutral.sum() / (size * size))


@dataclass
class _Run:
    cheeks: list = field(default_factory=list)
    clips: list = field(default_factory=list)
    sides: list = field(default_factory=list)
    hairs: list = field(default_factory=list)
    hair_bodies: list = field(default_factory=list)
    greys: list = field(default_factory=list)
    support: list = field(default_factory=list)
    hair_votes: int = 0
    covered_votes: int = 0
    turned: int = 0


def _luma(c: np.ndarray) -> float:
    return float(0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2])


def _read_frame(frame: FaceFrame, run: _Run) -> bool:
    """Samples one frame into the run: cheek patches, hairline and room."""
    pose = head_pose(frame)
    if pose is None or not pose_allows_reading(pose):
        run.turned += 1
        return False

    w, h = frame.width, frame.height
    p = frame.landmarks
    brow, chin = p[FOREHEAD, :2], p[CHIN, :2]
    face_h = abs(chin[1] - brow[1]) * h
    if face_h < 40:
        return False
    radius = max(3.0, face_h * PATCH_RADIUS_OF_FACE)

    def cheek(eye, mouth, edge):
        mid = (p[eye, :2] + p[mouth, :2]) * 0.5
        return mid + (p[edge, :2] - mid) * CHEEK_OUTWARD

    right = _sample_patch(frame.rgb, *(cheek(EYE_OUTER_R, MOUTH_R, EDGE_R) * [w, h]), radius)
    left = _sample_patch(frame.rgb, *(cheek(EYE_OUTER_L, MOUTH_L, EDGE_L) * [w, h]), radius)
    if right is None or left is None:
        return False

    frame_cheek = (right.middle + left.middle) * 0.5
    cheek_luma = _luma(frame_cheek)
    y_r, y_l = float(cs.luminance(right.middle)), float(cs.luminance(left.middle))
    side = math.log2(y_l / y_r) if y_r > 1e-5 and y_l > 1e-5 else 0.0

    face_w = abs(p[EDGE_L, 0] - p[EDGE_R, 0])
    brow_to_chin = abs(chin[1] - brow[1])
    hair_colours, hair_bodies = [], []
    for i in range(HAIR_POINTS):
        t = i / (HAIR_POINTS - 1) - 0.5
        drop = abs(t) * brow_to_chin * 0.10
        hx = (brow[0] + t * face_w * 0.55) * w
        hy = (brow[1] - HAIR_ABOVE_BROW * brow_to_chin + drop) * h
        category = frame.category_at(hx, hy)
        if category in (CLOTHES, OTHER):
            run.covered_votes += 1
            continue
        if category >= 0 and category != HAIR:
            continue
        if category == HAIR:
            run.hair_votes += 1
        patch = _sample_patch(frame.rgb, hx, hy, radius * 0.8)
        if patch is None:
            continue
        if _luma(patch.mean) < cheek_luma * 0.78:
            hair_colours.append(patch.mean)
            if patch.body > 0:
                hair_bodies.append(patch.body)

    run.cheeks.append(frame_cheek)
    run.clips.append(max(right.clip, left.clip))
    run.sides.append(side)
    if hair_colours:
        run.hairs.append(np.median(hair_colours, axis=0))
        if hair_bodies:
            run.hair_bodies.append(float(np.median(hair_bodies)))
    grey = _grey_world(frame)
    if grey is not None:
        run.greys.append(grey[0])
        run.support.append(grey[1])
    return True


# ---------------------------------------------------------------- reading


@dataclass
class Reading:
    skin_hue: float = 0.0
    skin_lightness: float = 0.0
    contrast_stops: float | None = None
    reference_trust: float = 0.0
    reference: str = "none"
    hair_share: float = 0.0
    cast_stops: float = 0.0
    exposure_in_band: bool = False
    exposure_near_band: bool = False
    hair_valid: bool = False
    head_covered: bool = False
    stability: float = 1.0
    stability_measured: bool = False
    skin_rgb: np.ndarray | None = None
    hair_rgb: np.ndarray | None = None
    side_stops: float = 0.0


def _rise(value: float, lo: float, hi: float) -> float:
    if hi <= lo:
        return 1.0 if value >= hi else 0.0
    return min(1.0, max(0.0, (value - lo) / (hi - lo)))


def _log_gain(reference: np.ndarray) -> np.ndarray | None:
    linear = cs.to_linear(reference)
    mean = linear.mean()
    if mean <= 1e-9:
        return None
    return np.log(mean / np.maximum(linear, 1e-9))


def _apply_gain(colour: np.ndarray, gain: np.ndarray) -> np.ndarray:
    return np.clip(cs.from_linear(np.minimum(1.0, cs.to_linear(colour) * np.exp(gain))), 0, 1)


def value_weight(lightness: float) -> float:
    outside = 0.0
    if lightness < VERIFIED_FLOOR:
        outside = (VERIFIED_FLOOR - lightness) / (VERIFIED_FLOOR - EXPOSURE_FLOOR)
    elif lightness > VERIFIED_CEILING:
        outside = (lightness - VERIFIED_CEILING) / (EXPOSURE_CEILING - VERIFIED_CEILING)
    return max(0.0, VALUE_CONFIDENCE * (1 - 0.5 * outside))


def _build_reading(cheek: np.ndarray, clip: float, hair: np.ndarray | None, hair_body: float,
                   grey: np.ndarray | None) -> Reading:
    """Skin, hair and white reference for the run, white-balanced."""
    reading = Reading()
    skin_raw = cs.rgb_to_lab(cheek)

    hair_is_hair, hair_lab, hair_chroma = False, None, 0.0
    if hair is not None:
        hair_lab = cs.rgb_to_lab(hair)
        hair_chroma = float(np.hypot(hair_lab[1], hair_lab[2]))
        hair_is_hair = (skin_raw[0] - hair_lab[0]) > HAIR_MIN_DARKER_THAN_SKIN and hair_lab[0] < HAIR_MAX_LIGHTNESS

    hair_share = 0.0
    hair_gain = None
    if hair_is_hair:
        readable = _rise(hair_lab[0], HAIR_MIN_LIGHTNESS - HAIR_LIGHTNESS_FADE, HAIR_MIN_LIGHTNESS + HAIR_LIGHTNESS_FADE)
        neutral = 1 - _rise(hair_chroma, HAIR_FULLY_NEUTRAL_CHROMA, HAIR_NEUTRAL_CHROMA)
        hair_share = readable * neutral
        hair_gain = _log_gain(hair)
        if hair_gain is None:
            hair_share = 0.0

    room_gain = _log_gain(grey) if grey is not None else None
    room_share = (1 - hair_share) if room_gain is not None else 0.0
    hair_trust = 0.0
    if hair_share > 0:
        hair_trust = DARK_HAIR_TRUST + (HAIR_TRUST - DARK_HAIR_TRUST) * _rise(
            hair_lab[0], HAIR_MIN_LIGHTNESS + HAIR_LIGHTNESS_FADE, DARK_HAIR_LIGHTNESS
        )
    trust = hair_share * hair_trust + room_share * GREY_WORLD_TRUST

    gain = np.zeros(3)
    if hair_share > 0:
        gain += hair_share * hair_gain
    if room_share > 0:
        gain += room_share * room_gain
    if trust > 0:
        reading.reference = "hair" if hair_share >= 0.5 or room_gain is None else "room"
        reading.hair_share = hair_share
        reading.cast_stops = float(np.max(np.abs(gain)) / math.log(2))

    corrected = _apply_gain(cheek, gain) if trust > 0 else cheek
    skin = cs.rgb_to_lab(corrected)
    lch = cs.lab_to_lch(skin)
    reading.skin_hue = float(lch[2])
    reading.skin_lightness = float(skin[0])
    reading.reference_trust = trust
    reading.hair_valid = hair_is_hair
    reading.skin_rgb = corrected

    if hair_is_hair:
        corrected_hair = _apply_gain(hair, gain) if trust > 0 else hair
        reading.hair_rgb = corrected_hair
        y_skin, y_hair = float(cs.luminance(corrected)), float(cs.luminance(corrected_hair))
        if y_hair > 1e-6 and y_skin > 1e-6:
            reading.contrast_stops = math.log2(y_skin / y_hair)
            if hair_body > 0:
                y_hair_raw = float(cs.luminance(hair))
                body = hair_body * (y_hair / y_hair_raw) if y_hair_raw > 1e-6 else hair_body
                allowance = HIGHLIGHT_ALLOWANCE * y_skin
                reading.contrast_stops = math.log2((y_skin + allowance) / (body + allowance))

    unclipped = clip < MAX_CLIP_FRACTION
    reading.exposure_in_band = GATE_FLOOR <= skin[0] <= GATE_CEILING and unclipped
    reading.exposure_near_band = (not reading.exposure_in_band) and unclipped and value_weight(skin[0]) > 0
    return reading


def _stability(cheeks: list[np.ndarray]) -> float | None:
    """Steadiness (0..1) over the per-frame raw cheek colours."""
    if len(cheeks) < NOISE_MIN_FRAMES:
        return None
    lch = cs.lab_to_lch(cs.rgb_to_lab(np.array(cheeks)))
    hues, lightness = lch[:, 2], lch[:, 0]
    centre = math.degrees(math.atan2(np.sin(np.radians(hues)).sum(), np.cos(np.radians(hues)).sum()))
    hue_dev = float(np.median(np.abs((hues - centre + 180) % 360 - 180)))
    light_dev = float(np.median(np.abs(lightness - np.median(lightness))))
    hue = min(1.0, max(0.0, 1 - hue_dev / HUE_SPREAD_CEILING))
    light = min(1.0, max(0.0, 1 - light_dev / LIGHTNESS_SPREAD_CEILING))
    return min(hue, light)


# ---------------------------------------------------------------- classify


def _ramp(value: float, lo: float, hi: float) -> float:
    return min(1.0, max(0.0, (value - lo) / (hi - lo))) * 2 - 1


def _axis_scores(reading: Reading) -> tuple[dict, float]:
    """{axis: (position -1..1, belief)} and the run belief."""
    steadiness = (
        MIN_STABILITY_WEIGHT + (1 - MIN_STABILITY_WEIGHT) * min(1.0, max(0.0, reading.stability))
        if reading.stability_measured
        else 1.0
    )
    scores = {}
    if reading.reference_trust > 0:
        scores["warmth"] = (_ramp(reading.skin_hue, COOL_HUE, WARM_HUE), min(1.0, reading.reference_trust) * steadiness)
    if reading.exposure_in_band or reading.exposure_near_band:
        weight = value_weight(reading.skin_lightness)
        if weight > 0:
            scores["value"] = (_ramp(reading.skin_lightness, EXPOSURE_FLOOR, EXPOSURE_CEILING), weight * steadiness)
    if reading.hair_valid and reading.contrast_stops is not None:
        scores["chroma"] = (_ramp(reading.contrast_stops, SOFT_STOPS, BRIGHT_STOPS), steadiness)
    return scores, steadiness


def _classify(scores: dict, run_belief: float) -> tuple[list, float, float]:
    """The twelve seasons ranked by distance from a camera reading."""
    ranked = []
    for key, name, family, *coord in SEASONS:
        season = dict(zip(AXES, coord))
        total = 0.0
        for axis in AXES:
            trust = AXIS_TRUST[axis]
            if axis in scores:
                position, evidence = scores[axis]
                total += trust * evidence * (season[axis] - position) ** 2
                floor = UNMEASURED_AXIS_WEIGHT * run_belief
                if evidence < floor:
                    total += trust * (floor - evidence) * season[axis] ** 2
            else:
                total += trust * UNMEASURED_AXIS_WEIGHT * run_belief * season[axis] ** 2
        ranked.append((math.sqrt(total), key, name, family))
    ranked.sort(key=lambda r: (r[0], r[1]))

    coverage = len(scores) / len(AXES)
    gap = ranked[1][0] - ranked[0][0]
    separation = max(0.0, gap / DECISIVE_GAP)
    confidence = TIED_CONFIDENCE + (CLEAR_CONFIDENCE - TIED_CONFIDENCE) * (1 - math.exp(-CONFIDENCE_RISE * separation))
    if coverage < 0.5 and confidence > TIED_CONFIDENCE:
        confidence = TIED_CONFIDENCE
    return ranked, confidence, coverage


def _quality(reading: Reading) -> tuple[str, str, int]:
    """How trustworthy the reading is: (tier, remedy, axes measured)."""
    axes = int(reading.reference_trust > 0) + int(reading.exposure_in_band) + int(reading.hair_valid)
    stability = reading.stability if reading.stability_measured else 1.0
    if axes == 0:
        return "unmeasurable", "cannot_measure", 0
    if axes == 1 or stability < WEAK_STABILITY:
        tier = "weak"
    elif axes == 2 or stability < STRONG_STABILITY:
        tier = "workable"
    else:
        tier = "strong"
    remedy = "none"
    if tier != "strong":
        if not reading.exposure_in_band:
            remedy = "more_light"
        elif stability < STRONG_STABILITY:
            remedy = "hold_still"
        elif not reading.hair_valid and not reading.head_covered:
            remedy = "show_hair"
    return tier, remedy, axes


def _undertone(scores: dict) -> str:
    if "warmth" not in scores:
        return "neutral"
    position = scores["warmth"][0]
    return "warm" if position >= POLE_THRESHOLD else "cool" if position <= -POLE_THRESHOLD else "neutral"


def _palette(season_key: str) -> dict:
    palette = _PALETTES[season_key]
    return {
        "status": "placeholder",
        "undertone": palette.get("undertone"),
        "categories": [
            {"id": c["id"], "label": _PALETTE_CATEGORIES.get(c["id"], c["id"]), "swatches": c["swatches"]}
            for c in palette["categories"]
        ],
        "bestMetals": palette.get("bestMetals", []),
        "avoid": palette.get("avoid", []),
    }


def _caveat(conclusive: bool, confidence: float, runner_up: str) -> str:
    if conclusive:
        return "Layar dan cahaya ruangan sama-sama menggeser warna, jadi anggap ini titik awal yang kuat, bukan kata akhir."
    if confidence >= MEASURED_CONCLUSIVE:
        return (f"Sebagian warnamu tidak terbaca, jadi ini tebakan terbaik — alternatif terdekat adalah {runner_up}. "
                "Stylist di cahaya siang bisa memastikannya.")
    return (f"Hasilmu berada di antara dua musim, jadi ini tebakan terbaik — {runner_up} hampir sama cocoknya. "
            "Stylist di cahaya siang bisa memastikannya.")


@dataclass
class ColourResult:
    payload: dict
    head_covered: bool
    skin_rgb: np.ndarray | None


def analyse(frames: list[FaceFrame]) -> ColourResult:
    run = _Run()
    for frame in frames:
        _read_frame(frame, run)

    labelled = run.hair_votes + run.covered_votes
    head_covered = labelled > 0 and run.covered_votes > labelled * COVERED_SHARE

    if not run.cheeks:
        return ColourResult(
            payload={
                "kind": "bluebuilding.beauty.colour-analysis",
                "season": None,
                "source": {"method": "camera", "tier": "unmeasurable",
                           "remedy": "face_straight" if run.turned else "cannot_measure",
                           "axesMeasured": 0, "framesUsed": 0, "unmeasurable": True},
                "remedyKey": "cannot_measure",
                "remedyText": UNMEASURED_TEXT["cannot_measure"],
            },
            head_covered=head_covered,
            skin_rgb=None,
        )

    hair = np.median(run.hairs, axis=0) if run.hairs and not head_covered else None
    clip = float(np.median(run.clips))
    reading = _build_reading(
        cheek=np.median(run.cheeks, axis=0),
        clip=clip,
        hair=hair,
        hair_body=float(np.median(run.hair_bodies)) if (hair is not None and run.hair_bodies) else 0.0,
        grey=np.median(run.greys, axis=0) if run.greys else None,
    )
    reading.head_covered = head_covered
    reading.side_stops = abs(float(np.median(run.sides)))
    stability = _stability(run.cheeks)
    if stability is not None:
        reading.stability, reading.stability_measured = stability, True

    tier, remedy, axes_measured = _quality(reading)
    # Which end of the exposure band, for the wording only; the remedy key stays more_light.
    over_exposed = reading.skin_lightness > GATE_CEILING or clip >= MAX_CLIP_FRACTION
    remedy_text_key = "less_light" if remedy == "more_light" and over_exposed else remedy
    source = {
        "method": "camera",
        "tier": tier,
        "remedy": remedy,
        "axesMeasured": axes_measured,
        "stability": round(reading.stability, 2),
        "framesUsed": len(run.cheeks),
        "unmeasurable": tier == "unmeasurable",
    }
    evidence = {
        "skin": cs.to_hex(reading.skin_rgb) if reading.skin_rgb is not None else None,
        "hair": cs.to_hex(reading.hair_rgb) if reading.hair_rgb is not None else None,
        "hasHair": reading.hair_valid,
        "headCovered": head_covered,
        "contrastStops": round(reading.contrast_stops, 2) if reading.hair_valid and reading.contrast_stops is not None else None,
        "skinHueDegrees": round(reading.skin_hue, 1),
        "skinLightness": round(reading.skin_lightness, 1),
        "reference": reading.reference,
        "hairShare": round(reading.hair_share, 2),
        "castStops": round(reading.cast_stops, 2),
        "sideStops": round(reading.side_stops, 2),
    }

    if tier == "unmeasurable":
        return ColourResult(
            payload={"kind": "bluebuilding.beauty.colour-analysis", "season": None, "source": source,
                     "evidence": evidence, "remedyKey": remedy_text_key if remedy_text_key in UNMEASURED_TEXT else "cannot_measure",
                     "remedyText": UNMEASURED_TEXT.get(remedy_text_key, UNMEASURED_TEXT["cannot_measure"])},
            head_covered=head_covered,
            skin_rgb=reading.skin_rgb,
        )

    scores, run_belief = _axis_scores(reading)
    ranked, confidence, coverage = _classify(scores, run_belief)
    best, runner = ranked[0], ranked[1]
    conclusive = confidence >= MEASURED_CONCLUSIVE and coverage >= 0.999
    source["coverage"] = round(coverage, 2)

    attributes = []
    for axis in AXES:
        label, negative, positive, english = AXIS_WORDS[axis]
        measured = axis in scores
        score = scores[axis][0] if measured else 0.0
        verdict = positive if score >= POLE_THRESHOLD else negative if score <= -POLE_THRESHOLD else "Seimbang"
        attributes.append({
            "axis": axis, "label": label, "englishLabel": english, "measured": measured,
            "score": round(score, 2), "position": round((score + 1) / 2, 3),
            "belief": round(scores[axis][1], 2) if measured else 0.0,
            "verdict": verdict if measured else "Belum terbaca",
            "negativeLabel": negative, "positiveLabel": positive,
        })

    payload = {
        "kind": "bluebuilding.beauty.colour-analysis",
        "season": {
            "key": best[1], "displayName": best[2], "family": best[3],
            "confidence": round(confidence, 3), "confidencePercent": round(confidence * 100),
            "conclusive": conclusive,
            "runnerUp": {"key": runner[1], "displayName": runner[2], "family": runner[3]},
            "ranked": [{"key": r[1], "displayName": r[2], "family": r[3], "distance": round(r[0], 3)} for r in ranked[:3]],
        },
        "undertone": _undertone(scores),
        "description": SEASON_VOICE_ID[best[1]],
        "source": source,
        "attributes": attributes,
        "evidence": evidence,
        "palette": _palette(best[1]),
        "caveat": _caveat(conclusive, confidence, runner[2]),
        "remedyKey": remedy_text_key if remedy_text_key in RETRY_TIP else None,
        "remedyText": RETRY_TIP.get(remedy_text_key),
    }
    return ColourResult(payload=payload, head_covered=head_covered, skin_rgb=reading.skin_rgb)
