"""English text for a beauty scan result (`language: "en"`).

The analyses write Indonesian. This turns a finished result into English by
its stable keys -- season, axis, shape, look, region, remedy -- so no number or
key changes, only the words: the season copy, the colour caveat and remedies,
the axis words, face shape, the look notes and the skin result.
"""

import copy

from app.beauty.colour import AXIS_WORDS, MEASURED_CONCLUSIVE
from app.beauty.face_shape import _AS_IS, _MATRIX, SHAPES, TIE_ORDER

# ---------------------------------------------------------------- colour

SEASON_VOICE = {
    "bright_spring": "Clear, warm and vivid - this is the palette that can take a colour at full strength. Coral, turquoise, poppy red, bright ivory. Anything dusty or greyed will look like it has been left out in the sun, so keep your colours clean and let one of them be the loudest thing you are wearing.",
    "true_spring": "Warm and golden the whole way through. Think camel, apricot, grass green, warm ivory rather than white. Gold jewellery, always. The colours that work hardest for you are the ones with sunlight already in them - nothing icy, nothing that has had the warmth washed out of it.",
    "light_spring": "Light and warm, and happiest when nothing is heavy. Peach, soft coral, warm aqua, buttery cream. Black will feel like it is wearing you rather than the other way round - swap it for warm greys and soft navy, and keep the contrast between your pieces gentle.",
    "light_summer": "Light and cool, with a softness to it. Powder blue, soft rose, dove grey, cool cream. Silver over gold. The trick with this palette is to keep the whole outfit in the same gentle register - one very dark or very saturated piece will pull all the attention away from you.",
    "true_summer": "Cool, and gently so. Your palette lives in soft blues, rose, plum and the greys that look faintly blue in daylight - colours that seem to have been rinsed rather than mixed. Silver sits better on you than gold, and true black is worth trading for a deep soft navy.",
    "soft_summer": "Cool and muted, and that muting is the point. Sage, mushroom, dusty rose, soft teal, cocoa. Colours with a little grey folded in will look effortless on you, while anything neon or crystal-clear will start doing the talking. Keep the contrast low and let the outfit read as one thing.",
    "soft_autumn": "Warm and muted - the palette of a good linen shirt. Olive, terracotta, soft gold, mushroom, dusty peach. Nothing here should shout: your colours work by sitting close together and letting the warmth come through. Save the brilliant clear shades for an accessory, if at all.",
    "true_autumn": "Warm, rich and unhurried. Rust, moss, mustard, deep teal, chestnut, cream instead of white. Gold and bronze rather than silver. This is a palette with real depth in it - the colours that fail you are the pale icy ones, not the strong ones.",
    "dark_autumn": "Deep and warm, with weight to it. Chocolate, forest, aubergine, burnt orange, dark teal. You can carry a genuinely dark outfit and look richer for it - just keep the darkness warm. Charcoal and warm black will do more for you than a flat, cool black.",
    "dark_winter": "Deep and cool, and unafraid of contrast. Black, pine, burgundy, ice white, cold plum. This is one of the few palettes that genuinely improves with a sharp light-against-dark pairing - a bright white shirt under something very dark is your best trick, not your safest one.",
    "true_winter": "Cool, clear and strong. True red, royal blue, emerald, pure white, real black. Silver and platinum. Your palette does not want to be softened: muted, dusty or warm-beige colours will flatten it, while a single saturated colour against black or white will look completely deliberate.",
    "bright_winter": "Cool and brilliant - the highest-contrast palette of the twelve. Fuchsia, electric blue, emerald, hot pink, stark white and black. Nothing dusty, nothing beige. When you keep the colours clean and the contrast high, you look like you chose it; when you soften everything, the outfit goes quiet.",
}

AXIS = {
    # axis: (label, negative pole, positive pole, middle band)
    "value": ("Depth", "Deep", "Light", "Balanced"),
    "chroma": ("Clarity", "Muted", "Bright", "Balanced"),
    "warmth": ("Undertone", "Cool", "Warm", "Neutral"),
}
AXIS_NOT_MEASURED = "Not measured"

COLOUR_UNMEASURED = {
    "more_light": "I couldn't get a clear read on your colouring. The light was too dim or too uneven for me to trust what I saw.",
    "hold_still": "I couldn't get a clear read on your colouring. There was too much movement for me to settle on a colour.",
    "show_hair": "I couldn't get a clear read on your colouring. I wasn't able to see enough of your hair to judge your contrast.",
    "cannot_measure": "I couldn't get a clear read on your colouring this time.",
    "less_light": "I couldn't get a clear read on your colouring. The light was so bright it washed your skin tone out.",
}
COLOUR_RETRY_TIP = {
    "more_light": "For a firmer result, scan again in brighter, even light - facing a window works well.",
    "less_light": "For a firmer result, scan again in light that isn't too bright or shining straight onto your face.",
    "hold_still": "For a firmer result, keep your head still while the scan runs.",
    "show_hair": "For a firmer result, make sure some of your hair is visible to the camera.",
}


def _colour_caveat(season: dict) -> str:
    if season["conclusive"]:
        return "Screens and room lighting both shift colour, so treat this as a strong starting point rather than the last word."
    runner = season["runnerUp"]["displayName"] if season.get("runnerUp") else "a neighbouring season"
    if season["confidence"] >= MEASURED_CONCLUSIVE:
        return (f"Part of your colouring could not be read, so this one is a best guess - "
                f"the closest alternative was {runner}. A stylist in daylight would settle it.")
    return (f"Your reading sat between two seasons, so this one is a best guess - "
            f"{runner} fitted almost as well. A stylist in daylight would settle it.")


def _colour(c: dict) -> None:
    season = c.get("season")
    key = c.get("remedyKey")
    if not season:
        c["remedyText"] = COLOUR_UNMEASURED.get(key, COLOUR_UNMEASURED["cannot_measure"])
        return
    c["description"] = SEASON_VOICE.get(season["key"], c.get("description"))
    for a in c.get("attributes", []):
        label, negative, positive, middle = AXIS[a["axis"]]
        a["label"], a["negativeLabel"], a["positiveLabel"] = label, negative, positive
        # From the verdict colour.py wrote, not the rounded score: a score on the
        # pole line would round across it and the two languages would disagree.
        _, id_negative, id_positive, _ = AXIS_WORDS[a["axis"]]
        if not a["measured"]:
            a["verdict"] = AXIS_NOT_MEASURED
        else:
            a["verdict"] = {id_negative: negative, id_positive: positive}.get(a["verdict"], middle)
    c["caveat"] = _colour_caveat(season)
    c["remedyText"] = COLOUR_RETRY_TIP.get(key) if key else None


# ---------------------------------------------------------------- face shape (translated)

SHAPE_NAME = {
    "oval": "Oval", "round": "Round", "square": "Square", "long": "Long",
    "heart": "Heart", "diamond": "Diamond", "triangle": "Triangle",
}
SHAPE_DESCRIPTION = {
    "oval": "Your face is a little longer than it is wide, your cheekbones are the widest part, and your jawline is soft.",
    "round": "Your face is almost as wide as it is long, your cheekbones are the widest part, and your jawline curves softly.",
    "square": "Your forehead, cheekbones and jaw are almost the same width, with a defined jaw angle.",
    "long": "Your face is longer than it is wide, with forehead, cheekbones and jaw of almost the same width.",
    "heart": "Your forehead is the widest part, and your face narrows gently towards the chin.",
    "diamond": "Your cheekbones are clearly the widest part, with a narrower forehead and jaw.",
    "triangle": "Your jaw is the widest part, with a defined angle, while your forehead is narrower.",
}
BAND_WORD = {
    "short": "Short", "medium": "Medium", "long": "Long",
    "forehead": "Forehead", "cheekbone": "Cheekbones", "jaw": "Jaw", "even": "Even",
    "soft": "Soft", "defined": "Defined",
}
AXIS_TEXT = {
    "proportion": ("Proportion", "Short", None, "Long"),
    "widest_point": ("Widest point", "Forehead", "Cheekbones", "Jaw"),
    "jaw_definition": ("Jaw definition", "Soft", None, "Defined"),
}
SHAPE_CAVEAT = ("Face shape is read from proportions, and most faces sit between two shapes. "
                "Treat this as a starting point, not a judgement.")
COVERED_NOTE = "A hijab was detected, so your forehead width is measured from your brows rather than your hairline."
APPROXIMATE_NOTE = {
    "pose": "Your head was turned or tilted a little in the front photo, so this shape is an estimate. "
            "For a firmer result, scan again facing the camera straight on.",
    "expression": "Your expression moved a little in the front photo, so this shape is an estimate. "
                  "For a firmer result, scan again with a relaxed face and your mouth closed.",
}
SHAPE_REMEDY = {
    "face_straight": "Your head turned or tilted a lot during the scan. Face the camera straight on, then try again.",
    "neutral_face": "Your expression changed a lot during the scan. Relax with your mouth closed, then try again.",
    "hold_still": "There was too much movement for an accurate reading. Hold still for a moment, then try again.",
    "cannot_measure": "We couldn't read your face clearly yet. Adjust the light and your position, then try again.",
}
LOOK_CHARACTER = {
    "natural": "Sheer skin, brushed-up brows, a hint of blush, balm on the lips.",
    "dewy_glow": "Glowing skin, straight brows, gradient lips.",
    "soft_glam": "Satin skin, medium contour, softly defined eyes, rosy lips.",
    "bold": "Sharp eyeliner, smokey eyes, saturated lips.",
    "latina": "Full brows, sharp contour, nude or brown lips.",
}
FIT_LABEL = {"as_is": "Works as it is", "one_adjustment": "Needs one adjustment", "major_adjustment": "Needs bigger adjustments"}
TIER_TEXT = {
    "best": ("Best Fit", "Already in line with your proportions. Wear it as it is."),
    "one_touch": ("One Touch", "Just one small adjustment and this look feels made for you."),
    "worth_trying": ("Worth Trying", "Needs a few adjustments, but the result is worth a try."),
}
AS_IS = "Its default placement already follows your proportions."
# Same shape as face_shape._MATRIX: [look][shape index] -> note; None = AS_IS.
NOTES = {
    "dewy_glow": [
        None,
        "Place the glow a little higher on the cheekbones and sweep it towards the temples, so the light gives your face a diagonal direction.",
        "Centre the glow on the middle of the face - upper cheekbones, the bridge of the nose and the chin - so the light draws attention inwards and softens the frame of your face.",
        "Stop the glow halfway down the bridge of the nose, skip the chin, and sweep the light across the cheekbones. The look's straight brows are its main balance here, so keep them.",
        None,
        "Move the glow from the top of the cheekbones to the brow bone and the chin, so the light gives dimension to the upper and lower parts of your face.",
        None,
    ],
    "soft_glam": [
        None,
        "Place the contour at the sides of the face, just under the cheekbones, to add vertical dimension.",
        "Blend the contour at the jaw angles until it is soft, so the lines of your face feel like they flow.",
        "Place the contour along the hairline and the tip of the chin, so attention gathers in the middle of the face.",
        None,
        None,
        "Sweep bronzer across the temples to balance the upper face with your jaw.",
    ],
    "bold": [
        None,
        "Pull the smokey shadow long and outwards rather than round, so the eyes give a horizontal direction.",
        "Lift the wing of the eyeliner and blend the edge of the smokey shadow upwards, so attention is drawn to the eyes and balances your jawline.",
        "Keep the eyeshadow low and wide, so the focus of the eyes moves horizontally.",
        "Make the lips the main focus and bring the eye intensity down a little, so attention spreads to the lower half of the face.",
        None,
        None,
    ],
    "latina": [
        None,
        "This look's sharp contour adds vertical structure - a very good match for your face.",
        "Blend the contour into a soft wash and round the arch of the brows, so the look's sharpness doesn't stack on top of your already defined jawline.",
        "Choose a flatter brow shape, stop the nose contour shorter and sweep the cheek contour across, so the look doesn't add length.",
        "Thin the brows slightly, since your forehead already carries weight in the upper face.",
        "Place the contour a little below the top of the cheekbones and highlight the temples, so the look's structure spreads across the whole face.",
        None,
    ],
}


def _shape(f: dict) -> None:
    f["caveat"] = SHAPE_CAVEAT
    remedy = (f.get("source") or {}).get("remedy")
    f["remedyText"] = SHAPE_REMEDY.get(remedy) if remedy and remedy != "none" else None
    shape = f.get("shape")
    if not shape:
        return
    shape["displayName"] = SHAPE_NAME[shape["key"]]
    for r in shape.get("ranked", []):
        r["displayName"] = SHAPE_NAME[r["key"]]
    if shape.get("alsoFits"):
        shape["alsoFits"]["displayName"] = SHAPE_NAME[shape["alsoFits"]["key"]]
        f["alsoFitsText"] = f"Your face fits the {SHAPE_NAME[shape['alsoFits']['key']]} shape almost as well."
    f["description"] = SHAPE_DESCRIPTION[shape["key"]]
    if f.get("coveredNote"):
        f["coveredNote"] = COVERED_NOTE
    if f.get("approximateNote"):
        f["approximateNote"] = APPROXIMATE_NOTE[(f.get("source") or {}).get("approximateReason") or "pose"]
    for a in f.get("axes", []):
        label, low, mid, high = AXIS_TEXT[a["axis"]]
        a["label"], a["lowLabel"], a["highLabel"] = label, low, high
        if mid:
            a["midLabel"] = mid
        a["verdict"] = BAND_WORD[a["band"]]

    looks = f.get("looks")
    if not looks:
        return
    s = SHAPES.index(shape["key"])
    looks["title"] = "Needs the least adjustment for your face"
    for look in looks.get("ranked", []):
        look["character"] = LOOK_CHARACTER[look["key"]]
        look["fitLabel"] = FIT_LABEL[look["fit"]]
        look["note"] = NOTES[look["key"]][s] or AS_IS
    if looks.get("natural"):
        looks["natural"]["text"] = "Natural is neutral for every face shape, so wear it as it is."
    guide = looks.get("guide")
    if guide:
        guide["title"], guide["lead"] = "Your Look Guide", "From the best fit to the ones worth trying"
        for tier in guide.get("tiers", []):
            tier["title"], tier["lead"] = TIER_TEXT[tier["key"]]


# ---------------------------------------------------------------- skin (translated)

SKIN_TYPE = {
    "unknown": "Skin type could not be estimated",
    "normal": "Normal Skin", "kering": "Dry Skin", "berminyak": "Oily Skin",
    "sensitif": "Sensitive Skin", "kombinasi": "Combination Skin",
}
REGION = {"dahi": "Forehead", "hidung": "Nose", "pipi_kiri": "Left cheek", "pipi_kanan": "Right cheek", "dagu": "Chin"}
SKIN_CAVEAT = "A skin scan is not a medical diagnosis. For serious skin concerns, see a dermatologist."
SCAN_CAVEAT = ("A cosmetic estimate from one face scan, not a diagnosis. "
               "Lighting affects colour, so treat this as a starting point.")


def _skin(s: dict) -> None:
    analysis = s.get("analysis") or {}
    if analysis.get("key") in SKIN_TYPE:
        analysis["summary"] = SKIN_TYPE[analysis["key"]]
    for d in analysis.get("detail", []):
        d["label"] = REGION.get(d["tipe"], d["label"])
    s["caveat"] = SKIN_CAVEAT


def to_english(result: dict) -> dict:
    out = copy.deepcopy(result)
    out["language"] = "en"
    out["caveat"] = SCAN_CAVEAT
    if out.get("colour"):
        _colour(out["colour"])
    if out.get("faceShape"):
        _shape(out["faceShape"])
    if out.get("skin"):
        _skin(out["skin"])
    return out


# The translated look notes must line up with face_shape's matrix, note for note.
assert set(NOTES) == set(TIE_ORDER) and all(len(NOTES[k]) == len(SHAPES) for k in NOTES)
assert all((NOTES[k][i] is None) == (_MATRIX[k][i][1] == _AS_IS) for k in NOTES for i in range(len(SHAPES)))
