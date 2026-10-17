"""sRGB <-> linear light <-> CIELAB (D65), the colour maths the beauty
analysis is written in. Channels are 0..1 floats; every function also accepts
numpy arrays with channels last."""

import numpy as np

_WHITE = np.array([0.95047, 1.0, 1.08883])
_RGB_TO_XYZ = np.array(
    [
        [0.4124564, 0.3575761, 0.1804375],
        [0.2126729, 0.7151522, 0.0721750],
        [0.0193339, 0.1191920, 0.9503041],
    ]
)


def to_linear(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def from_linear(x):
    x = np.clip(np.asarray(x, dtype=np.float64), 0.0, 1.0)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * x ** (1 / 2.4) - 0.055)


def luminance(rgb) -> np.ndarray:
    """Linear-light luminance Y of an sRGB colour (0..1)."""
    return to_linear(rgb) @ _RGB_TO_XYZ[1]


def rgb_to_lab(rgb) -> np.ndarray:
    """sRGB (0..1, channels last) to CIELAB L*a*b*, D65 white, L in 0..100."""
    xyz = to_linear(rgb) @ _RGB_TO_XYZ.T / _WHITE
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    fx, fy, fz = f[..., 0], f[..., 1], f[..., 2]
    return np.stack([116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)], axis=-1)


def lab_to_lch(lab) -> np.ndarray:
    """L*, chroma C*, hue angle in degrees 0..360."""
    lab = np.asarray(lab, dtype=np.float64)
    c = np.hypot(lab[..., 1], lab[..., 2])
    h = np.degrees(np.arctan2(lab[..., 2], lab[..., 1])) % 360
    return np.stack([lab[..., 0], c, h], axis=-1)


def to_hex(rgb) -> str:
    r, g, b = (int(round(float(v) * 255)) for v in np.clip(rgb, 0, 1))
    return f"#{r:02X}{g:02X}{b:02X}"


def hex_to_rgb(hex_colour: str) -> np.ndarray:
    h = hex_colour.lstrip("#")
    return np.array([int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)])
