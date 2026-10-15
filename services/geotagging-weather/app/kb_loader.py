"""Parses kb_holiday.md and kb_weather.md (repo root) into structured
entries. Both files share the same shape — a `## N. Title` heading per
entry, followed by `* **Label:** value` bullets, where some labels
(`Skin Health Concerns`, `Targeted Skincare Product Needs`) hold a
sub-bulleted list instead of a single inline value. This is a generic
parser over that shape, not two bespoke ones, so a KB edit (wording,
a new holiday, a reordered bullet) never needs a matching code change.
"""

import os
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
KB_HOLIDAY_PATH = Path(os.environ.get("KB_HOLIDAY_PATH", REPO_ROOT / "kb_holiday.md"))
KB_WEATHER_PATH = Path(os.environ.get("KB_WEATHER_PATH", REPO_ROOT / "kb_weather.md"))

_HEADING_RE = re.compile(r"^##\s*\d+\.\s*(.+?)\s*$", re.MULTILINE)
_FIELD_RE = re.compile(r"^\*[ \t]*\*\*([^*:]+):\*\*[ \t]*(.*)$", re.MULTILINE)
_LIST_ITEM_RE = re.compile(r"^\s*\*\s+(.+)$")
_BOLD_LABEL_RE = re.compile(r"^\*\*(.+?)\*\*:?\s*(.*)$")


@dataclass
class ProductNeed:
    """One '**Label:** detail' bullet under Targeted Skincare Product Needs — the bold label doubles as a concise product-matching keyword."""

    label: str
    detail: str


@dataclass
class KbEntry:
    title: str
    fields: dict[str, str] = field(default_factory=dict)
    concerns: list[str] = field(default_factory=list)
    product_needs: list[ProductNeed] = field(default_factory=list)

    @property
    def boost_keywords(self) -> list[str]:
        return [need.label for need in self.product_needs]


def _parse_list_field(raw_label: str, body: str) -> list[str] | list[ProductNeed]:
    items = []
    for line in body.splitlines():
        match = _LIST_ITEM_RE.match(line)
        if match:
            items.append(match.group(1).strip())

    if raw_label == "Targeted Skincare Product Needs":
        needs = []
        for item in items:
            bold = _BOLD_LABEL_RE.match(item)
            if bold:
                # The bold markers wrap the trailing colon too (**Label:**), so it has to be stripped separately.
                needs.append(ProductNeed(label=bold.group(1).strip().rstrip(":").strip(), detail=bold.group(2).strip()))
            else:
                needs.append(ProductNeed(label=item, detail=""))
        return needs
    return items


def _parse_entry(title: str, body: str) -> KbEntry:
    entry = KbEntry(title=title)
    field_matches = list(_FIELD_RE.finditer(body))

    for i, m in enumerate(field_matches):
        label = m.group(1).strip()
        inline_value = m.group(2).strip()
        section_end = field_matches[i + 1].start() if i + 1 < len(field_matches) else len(body)
        section_body = body[m.end() : section_end]

        if label == "Skin Health Concerns":
            entry.concerns = _parse_list_field(label, section_body)  # type: ignore[assignment]
        elif label == "Targeted Skincare Product Needs":
            entry.product_needs = _parse_list_field(label, section_body)  # type: ignore[assignment]
        else:
            entry.fields[label] = inline_value

    return entry


def _parse_kb_file(path: Path) -> list[KbEntry]:
    text = path.read_text(encoding="utf-8")
    headings = list(_HEADING_RE.finditer(text))
    entries = []
    for i, h in enumerate(headings):
        title = h.group(1).strip()
        end = headings[i + 1].start() if i + 1 < len(headings) else len(text)
        body = text[h.end() : end]
        entries.append(_parse_entry(title, body))
    return entries


@lru_cache(maxsize=1)
def load_holiday_kb() -> list[KbEntry]:
    return _parse_kb_file(KB_HOLIDAY_PATH)


@lru_cache(maxsize=1)
def load_weather_kb() -> list[KbEntry]:
    return _parse_kb_file(KB_WEATHER_PATH)
