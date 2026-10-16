"""The three poses of the beauty scan.

The user faces the camera, turns to their own right, then to their own left.
A head turned to the user's right shows the camera their LEFT cheek, so the
right-turn photo is where `pipi_kiri` is read from, and the left-turn photo
`pipi_kanan`.

The camera guides each pose live (the web clients run the same limits on the
in-browser mesh). The server re-checks only the direction and size of the
turn, more leniently than the live limits: its job is to catch a side photo
taken facing the wrong way or barely turned (the manual shutter, or no live
tracker), not to second-guess a head tilt the camera already allowed.
"""

import math
from dataclasses import dataclass

from app.beauty.face_shape import CHEEK_L, CHEEK_R, NOSE_TIP, head_pose
from app.beauty.vision import FaceFrame

POSES = ("front", "right", "left")
DIRECTION = {"front": 0, "right": 1, "left": -1}
VISIBLE_CHEEK = {"front": "both", "right": "left", "left": "right"}
# The one region each side photo is taken for.
SIDE_REGION = {"right": "pipi_kiri", "left": "pipi_kanan"}

# The live limits, for reference by the clients.
SIDE_MIN_YAW, SIDE_MAX_YAW = 25.0, 60.0
# The server's re-check of a side photo.
RECHECK_MIN_YAW, RECHECK_MAX_YAW = 15.0, 70.0


@dataclass
class TurnReading:
    yaw: float  # signed degrees, positive = the user's own right
    pitch: float
    roll: float


def nose_offset(frame: FaceFrame) -> float:
    """Where the nose sits: +1 on the user's right face edge, -1 on the left.
    Read from landmark identity, so it holds whether or not the frame is mirrored."""
    p = frame.landmarks
    to_right = abs(p[NOSE_TIP, 0] - p[CHEEK_R, 0])
    to_left = abs(p[CHEEK_L, 0] - p[NOSE_TIP, 0])
    total = to_right + to_left
    return 0.0 if total <= 1e-5 else (to_left - to_right) / total


def turn(frame: FaceFrame) -> TurnReading | None:
    """Signed yaw: the size from the depth between the face edges,
    the direction from where the nose sits between them."""
    pose = head_pose(frame)
    if pose is None:
        return None
    offset = nose_offset(frame)
    size = pose.yaw
    if size < 0.5:
        size = math.degrees(math.asin(min(1.0, abs(offset))))
    return TurnReading(yaw=size if offset >= 0 else -size, pitch=pose.pitch, roll=pose.roll)


def check_side(frame: FaceFrame, pose: str) -> tuple[bool, str, TurnReading | None]:
    """Whether a side photo is turned the asked way, far enough and not too far.
    Returns (ok, reason, reading); reason is one of ok, no_face, not_turned,
    wrong_way, turned_too_far."""
    reading = turn(frame)
    if reading is None:
        return False, "no_face", None
    turned = reading.yaw * DIRECTION[pose]
    if turned < -RECHECK_MIN_YAW:
        return False, "wrong_way", reading
    if turned < RECHECK_MIN_YAW:
        return False, "not_turned", reading
    if turned > RECHECK_MAX_YAW:
        return False, "turned_too_far", reading
    return True, "ok", reading
