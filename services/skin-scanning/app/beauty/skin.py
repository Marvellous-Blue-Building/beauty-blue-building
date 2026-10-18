"""Skin analysis. The region measurements are vectorised with numpy.

Five regions (dahi, hidung, pipi_kiri, pipi_kanan, dagu -- left and right are
the user's own) are outlined from the mesh, kept to skin-coloured pixels, and
scored 0..1 on six things: shine, evenness, pores, dark spots, acne, fine lines.
The scores answer the skin-type questionnaire (oil points, then a sensitivity
check from cheek flush), giving one of five types.

The scan takes three photos (front, turned right, turned left) and reads each
cheek from the side photo that faces it, falling back to the front photo.
Forehead, nose and chin always come
from the front photo, and so does the cheek flush, so one white balance
covers both sides of that comparison.

Every threshold is a placeholder, checked only on painted test patches.
"""

import cv2
import numpy as np

from app.beauty import colour_space as cs
from app.beauty.poses import SIDE_REGION
from app.beauty.vision import FaceFrame

REGIONS = ["dahi", "hidung", "pipi_kiri", "pipi_kanan", "dagu"]
REGION_LABEL = {"dahi": "Dahi", "hidung": "Hidung", "pipi_kiri": "Pipi kiri", "pipi_kanan": "Pipi kanan", "dagu": "Dagu"}
T_ZONE = {"dahi", "hidung", "dagu"}

FOREHEAD = [10, 338, 297, 332, 333, 299, 337, 151, 108, 69, 104, 103, 67, 109]
RIGHT_CHEEK = [117, 118, 101, 36, 205, 187, 147, 123, 116, 50]  # the user's right: pipi_kanan
LEFT_CHEEK = [346, 347, 330, 266, 425, 411, 376, 352, 345, 280]  # the user's left: pipi_kiri
NOSE_BRIDGE, NOSE_TIP = 6, 4
LOWER_LIP, CHIN = 17, 152
MOUTH_R, MOUTH_L = 61, 291
EYE_OUTER_R, EYE_OUTER_L = 33, 263
SHRINK = 0.12
PHOTO_MAX = 720

# ---- region meter tuning ----
MIN_PIXELS = 300
GATE_DARKER, GATE_LIGHTER, GATE_CHROMA = 28.0, 20.0, 16.0
HOLE_RADIUS, HOLE_SHARE = 4, 0.6
BROAD_SHARE, FINE_RADIUS, EDGE_RADIUS = 0.2, 3, 2
SHINE_LIFT, SHINE_DESATURATION = 10.0, 0.8
PORE_DEPTH, SPOT_DEPTH, ACNE_REDNESS = 3.0, 7.0, 6.0
LINE_GRADIENT, LINE_COHERENCE = 1.5, 0.6
RAMPS = {
    "shine": (0.005, 0.06), "uneven": (1.5, 6.0), "pores": (0.01, 0.1),
    "spots": (0.002, 0.04), "acne": (0.002, 0.03), "lines": (0.01, 0.1),
}

# ---- skin-type rules ----
SHINE_HIGH, SHINE_LOW = 0.5, 0.15
PORE_LARGE, PORE_TINY = 0.5, 0.1
ACNE_SOMETIMES, ACNE_OFTEN = 0.15, 0.4
FLUSH_NONE, FLUSH_FULL = 2.0, 10.0
KERING_AT_MOST, NORMAL_AT_MOST, KOMBINASI_AT_MOST = -3, 1, 4
SENSITIVE_AT_LEAST, SENSITIVITY_MAX = 4, 6

TYPE_LABEL = {
    "unknown": "Tipe kulit belum dapat diperkirakan",
    "normal": "Kulit Normal", "kering": "Kulit Kering", "berminyak": "Kulit Berminyak",
    "sensitif": "Kulit Sensitif", "kombinasi": "Kulit Kombinasi",
}
CAVEAT = "Hasil pindai kulit bukan diagnosis medis. Untuk masalah kulit yang serius, konsultasikan dengan dokter kulit."


def _ramp(v: float, lo: float, hi: float) -> float:
    if hi <= lo:
        return 1.0 if v >= hi else 0.0
    return min(1.0, max(0.0, (v - lo) / (hi - lo)))


def _photo(frame: FaceFrame) -> tuple[np.ndarray, np.ndarray]:
    """The centre square of the frame, scaled to at most 720 px, and the landmarks in
    that photo's pixels."""
    h, w = frame.height, frame.width
    side = min(w, h)
    x0, y0 = (w - side) // 2, (h - side) // 2
    square = frame.rgb[y0 : y0 + side, x0 : x0 + side]
    size = min(PHOTO_MAX, side)
    photo = cv2.resize(square, (size, size), interpolation=cv2.INTER_AREA) if size != side else square
    points = (frame.landmarks[:, :2] * [w, h] - [x0, y0]) * (size / side)
    return photo, points


def _strip(a, b, t0, t1, w0, w1) -> list:
    d = b - a
    length = np.linalg.norm(d)
    if length < 1e-3:
        return []
    perp = np.array([-d[1], d[0]]) / length
    p0, p1 = a + d * t0, a + d * t1
    return [p0 + perp * w0, p0 - perp * w0, p1 - perp * w1, p1 + perp * w1]


def _outline(region: str, pts: np.ndarray) -> np.ndarray | None:
    """A region's outline: convex hull, shrunk 12% toward its centre."""
    if region == "dahi":
        raw = pts[FOREHEAD]
    elif region == "pipi_kanan":
        raw = pts[RIGHT_CHEEK]
    elif region == "pipi_kiri":
        raw = pts[LEFT_CHEEK]
    elif region == "hidung":
        eyes = np.linalg.norm(pts[EYE_OUTER_R] - pts[EYE_OUTER_L])
        raw = np.array(_strip(pts[NOSE_BRIDGE], pts[NOSE_TIP], 0.1, 0.95, 0.07 * eyes, 0.12 * eyes))
    else:
        mouth = np.linalg.norm(pts[MOUTH_R] - pts[MOUTH_L])
        raw = np.array(_strip(pts[LOWER_LIP], pts[CHIN], 0.3, 0.85, 0.3 * mouth, 0.22 * mouth))
    if len(raw) < 3:
        return None
    hull = cv2.convexHull(raw.astype(np.float32)).reshape(-1, 2).astype(np.float64)
    if len(hull) < 3:
        return None
    centre = hull.mean(axis=0)
    return hull + (centre - hull) * SHRINK


def _patch(photo: np.ndarray, outline: np.ndarray):
    """The outline's bounding box: inside mask and per-pixel Lab."""
    h, w = photo.shape[:2]
    x0, y0 = max(0, int(np.floor(outline[:, 0].min()))), max(0, int(np.floor(outline[:, 1].min())))
    x1, y1 = min(w - 1, int(np.ceil(outline[:, 0].max()))), min(h - 1, int(np.ceil(outline[:, 1].max())))
    if x1 - x0 + 1 < 4 or y1 - y0 + 1 < 4:
        return None
    mask = np.zeros((y1 - y0 + 1, x1 - x0 + 1), np.uint8)
    cv2.fillPoly(mask, [np.round(outline - [x0, y0]).astype(np.int32)], 1)
    inside = mask.astype(bool)
    if not inside.any():
        return None
    lab = cs.rgb_to_lab(photo[y0 : y1 + 1, x0 : x1 + 1] / 255.0)
    return inside, lab


def _box(values: np.ndarray, r: int) -> np.ndarray:
    """Sum over the (2r+1)^2 window around each pixel; outside the patch counts 0."""
    return cv2.boxFilter(values.astype(np.float64), cv2.CV_64F, (2 * r + 1, 2 * r + 1),
                         normalize=False, borderType=cv2.BORDER_CONSTANT)


def _median_lab(take: np.ndarray, lab: np.ndarray) -> np.ndarray:
    return np.median(lab[take], axis=0)


def _measure(photo: np.ndarray, outline: np.ndarray | None, reference: np.ndarray | None) -> dict | None:
    """Scores one region 0..1 on shine, evenness, pores, spots, acne and lines."""
    if outline is None:
        return None
    sampled = _patch(photo, outline)
    if sampled is None:
        return None
    inside, lab = sampled
    if inside.sum() < MIN_PIXELS:
        return None
    L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]
    ref = reference if reference is not None else _median_lab(inside, lab)

    dl = L - ref[0]
    chroma_dist2 = (A - ref[1]) ** 2 + (B - ref[2]) ** 2
    dark = inside & (dl < -GATE_DARKER)
    strict = inside & ~dark & (dl <= GATE_LIGHTER) & (chroma_dist2 <= GATE_CHROMA ** 2)
    hole_box = (2 * HOLE_RADIUS + 1) ** 2
    near_strict = _box(strict.astype(np.float64), HOLE_RADIUS) >= HOLE_SHARE * hole_box
    skin = inside & ~dark & (strict | near_strict)
    if skin.sum() < MIN_PIXELS:
        return None
    skin_f = skin.astype(np.float64)

    # Gradients of L inside the skin, a missing neighbour standing in as the centre.
    def neighbour(dy, dx):
        shifted = np.roll(L, (dy, dx), axis=(0, 1))
        ok = np.roll(skin, (dy, dx), axis=(0, 1))
        if dy == 1:
            ok[0, :] = False
        if dy == -1:
            ok[-1, :] = False
        if dx == 1:
            ok[:, 0] = False
        if dx == -1:
            ok[:, -1] = False
        return np.where(ok, shifted, L)

    gx = (neighbour(0, -1) - neighbour(0, 1)) * 0.5
    gy = (neighbour(-1, 0) - neighbour(1, 0)) * 0.5
    gxx, gyy, gxy = gx * gx * skin_f, gy * gy * skin_f, gx * gy * skin_f

    bh, bw = skin.shape
    broad = max(4, int(round(BROAD_SHARE * min(bw, bh))))
    full = (2 * EDGE_RADIUS + 1) ** 2

    m_edge = _box(skin_f, EDGE_RADIUS)
    measured = skin & (m_edge >= full - 0.5)
    count = int(measured.sum())
    if count < MIN_PIXELS / 2:
        return None

    sL, sA, sB = L * skin_f, A * skin_f, B * skin_f
    m_broad = np.maximum(_box(skin_f, broad), 1e-9)
    l_broad, a_broad, b_broad = _box(sL, broad) / m_broad, _box(sA, broad) / m_broad, _box(sB, broad) / m_broad
    m_near = np.maximum(_box(skin_f, 1), 1e-9)
    l_near, a_near, b_near = _box(sL, 1) / m_near, _box(sA, 1) / m_near, _box(sB, 1) / m_near
    l_fine = _box(sL, FINE_RADIUS) / np.maximum(_box(skin_f, FINE_RADIUS), 1e-9)

    d_l, d_a, d_b = l_near - l_broad, a_near - a_broad, b_near - b_broad
    uneven = float((d_l ** 2 + d_a ** 2 + d_b ** 2)[measured].sum())

    chroma = np.hypot(A, B)
    chroma_broad = np.hypot(a_broad, b_broad)
    shine = measured & (L - l_broad > SHINE_LIFT) & (chroma < chroma_broad * SHINE_DESATURATION)

    red = d_a > ACNE_REDNESS
    darker = d_l < -SPOT_DEPTH
    acne = measured & red
    spot = measured & ~red & darker
    pore = measured & ~red & ~darker & (L - l_fine < -PORE_DEPTH)

    jxx, jyy, jxy = _box(gxx, EDGE_RADIUS), _box(gyy, EDGE_RADIUS), _box(gxy, EDGE_RADIUS)
    energy = jxx + jyy
    with np.errstate(divide="ignore", invalid="ignore"):
        coherence = np.sqrt((jxx - jyy) ** 2 + 4 * jxy ** 2) / energy
        gradient = np.sqrt(energy / full)
    line = measured & (energy > 1e-6) & (gradient > LINE_GRADIENT) & (coherence > LINE_COHERENCE) & (L < l_fine)

    inv = 1.0 / count
    return {
        "shine": _ramp(shine.sum() * inv, *RAMPS["shine"]),
        "evenness": 1 - _ramp(float(np.sqrt(uneven * inv)), *RAMPS["uneven"]),
        "pores": _ramp(pore.sum() * inv, *RAMPS["pores"]),
        "spots": _ramp(spot.sum() * inv, *RAMPS["spots"]),
        "acne": _ramp(acne.sum() * inv, *RAMPS["acne"]),
        "lines": _ramp(line.sum() * inv, *RAMPS["lines"]),
        "median": _median_lab(skin, lab),
        "pixels": count,
    }


def _measure_photo(frame: FaceFrame, pose: str) -> dict:
    """Every region the pose is taken for. The front
    photo's regions are gated against the nose's colour, the one area nothing
    covers; a side photo's cheek against its own."""
    photo, points = _photo(frame)
    if pose != "front":
        region = SIDE_REGION[pose]
        return {region: _measure(photo, _outline(region, points), None)}
    reference = None
    nose_outline = _outline("hidung", points)
    if nose_outline is not None:
        sampled = _patch(photo, nose_outline)
        if sampled is not None:
            reference = _median_lab(*sampled)
    return {name: _measure(photo, _outline(name, points), reference) for name in REGIONS}


def _flush(front: dict) -> float | None:
    """Cheek flush: how much redder the cheeks are than the forehead and
    chin, in a*, all from the front photo."""
    cheeks = [front[r]["median"][1] for r in ("pipi_kiri", "pipi_kanan") if front.get(r)]
    rest = [front[r]["median"][1] for r in ("dahi", "dagu") if front.get(r)]
    return float(sum(cheeks) / len(cheeks) - sum(rest) / len(rest)) if cheeks and rest else None


def _mean(regions: dict, t_zone: bool, key: str) -> float | None:
    values = [r[key] for name, r in regions.items() if r is not None and (name in T_ZONE) == t_zone]
    return sum(values) / len(values) if values else None


def _classify(regions: dict, flush: float | None) -> dict:
    """The skin type from the region scores (a comparison with None is false)."""
    def ge(v, x):
        return v is not None and v >= x

    def lt(v, x):
        return v is not None and v < x

    t_shine, c_shine = _mean(regions, True, "shine"), _mean(regions, False, "shine")
    nose = regions.get("hidung")
    nose_pores = nose["pores"] if nose else _mean(regions, True, "pores")
    cheek_pores = _mean(regions, False, "pores")

    t_shiny, c_shiny = ge(t_shine, SHINE_HIGH), ge(c_shine, SHINE_HIGH)
    nose_tiny, cheeks_tiny = not ge(nose_pores, PORE_TINY), not ge(cheek_pores, PORE_TINY)
    cheeks_dry = lt(c_shine, SHINE_LOW) and lt(cheek_pores, PORE_TINY)
    all_dull = not ge(t_shine, SHINE_LOW) and not ge(c_shine, SHINE_LOW) and nose_tiny and cheeks_tiny

    if t_shiny and c_shiny:
        shine = 2
    elif t_shiny or (t_shine is None and c_shiny):
        shine = 1
    elif all_dull and (t_shine is not None or c_shine is not None):
        shine = -2
    else:
        shine = 0

    nose_large, cheeks_large = ge(nose_pores, PORE_LARGE), ge(cheek_pores, PORE_LARGE)
    if nose_large and cheeks_large:
        pores = 2
    elif nose_large or cheeks_large:
        pores = 1
    elif nose_tiny and cheeks_tiny and (nose_pores is not None or cheek_pores is not None):
        pores = -1
    else:
        pores = 0

    acne = max((r["acne"] for r in regions.values() if r is not None), default=0.0)
    acne_points = 2 if acne >= ACNE_OFTEN else 1 if acne >= ACNE_SOMETIMES else 0

    m = 2 * shine + pores + acne_points
    skin_type = (
        "kering" if m <= KERING_AT_MOST
        else "normal" if m <= NORMAL_AT_MOST
        else "kombinasi" if m <= KOMBINASI_AT_MOST
        else "berminyak"
    )
    if t_shiny and cheeks_dry:
        skin_type = "kombinasi"

    # Round half away from zero: Python's round() would round half to even.
    sensitivity = int(_ramp(flush, FLUSH_NONE, FLUSH_FULL) * SENSITIVITY_MAX + 0.5) if flush is not None else 0
    if sensitivity >= SENSITIVE_AT_LEAST and skin_type == "normal":
        skin_type = "sensitif"
    return {"type": skin_type, "oilPoints": m, "sensitivityPoints": sensitivity,
            "flush": round(flush, 2) if flush is not None else None}


def analyse(front: FaceFrame, sides: dict[str, FaceFrame] | None = None) -> dict:
    """The skin reading of a scan: `front` always, plus any side photos that
    passed their pose check, keyed "right" / "left"."""
    sides = sides or {}
    front_regions = _measure_photo(front, "front")
    regions = dict(front_regions)
    source = {name: "front" for name in REGIONS}
    for pose, frame in sides.items():
        region = SIDE_REGION[pose]
        reading = _measure_photo(frame, pose)[region]
        if reading is not None:
            regions[region] = reading
            source[region] = pose
    verdict = _classify(regions, _flush(front_regions))
    # Missing areas must not vote as "no shine / no pores" and imply normal skin.
    if any(regions[name] is None for name in REGIONS):
        verdict = {"type": "unknown", "oilPoints": None, "sensitivityPoints": None, "flush": None}

    def score(r, key):
        return round(float(r[key]), 2) if r is not None else None

    from_sides = sorted({p for p in source.values() if p != "front"})
    return {
        "kind": "bluebuilding.beauty.skin-analysis",
        "captureMode": "three-pose" if len(from_sides) == 2 else "front+" + from_sides[0] if from_sides else "single-front",
        "analysis": {
            "summary": TYPE_LABEL[verdict["type"]],
            "key": verdict["type"],
            "detail": [
                {
                    "tipe": name,
                    "label": REGION_LABEL[name],
                    "measured": regions[name] is not None,
                    "source": source[name],
                    "bersinar": score(regions[name], "shine"),
                    "warna_kulit_merata": score(regions[name], "evenness"),
                    "pori_besar": score(regions[name], "pores"),
                    "noda_hitam": score(regions[name], "spots"),
                    "jerawat": score(regions[name], "acne"),
                    "garis_halus": score(regions[name], "lines"),
                }
                for name in REGIONS
            ],
        },
        "classifier": verdict,
        "caveat": CAVEAT,
    }
