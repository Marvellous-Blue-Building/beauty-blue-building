"""Matches an Indonesia holiday API name (e.g. "Tahun Baru Imlek 2577
Kongzili") to the closest kb_holiday.md entry (e.g. "Tahun Baru Imlek
(Lunar New Year)"). The two naming schemes never line up exactly — the API
embeds the Hijri/Saka/Kongzili year, the KB doesn't — so this is a
keyword-based classifier (curated once against the real 15 KB entries and
the real API's 2026 payload), not a fuzzy string match.
"""

from app.kb_loader import KbEntry, load_holiday_kb

# Each KB entry title maps to a list of keyword groups (lowercase); the API
# name matches if ANY group's keywords are ALL present in it.
_KEYWORD_GROUPS: dict[str, list[list[str]]] = {
    "Tahun Baru Masehi (New Year's Day)": [["tahun baru", "masehi"]],
    "Isra Mikraj Nabi Muhammad S.A.W.": [["isra"]],
    "Tahun Baru Imlek (Lunar New Year)": [["imlek"]],
    "Hari Suci Nyepi (Tahun Baru Saka)": [["nyepi"]],
    "Idul Fitri (Lebaran)": [["idul fitri"]],
    "Wafat Yesus Kristus & Kebangkitan Yesus Kristus (Good Friday & Easter)": [
        ["wafat", "yesus"],
        ["paskah"],
        ["kebangkitan", "yesus"],
        ["jumat agung"],
    ],
    "Hari Buruh Internasional (May Day)": [["buruh"]],
    "Kenaikan Yesus Kristus (Ascension of Jesus Christ)": [["kenaikan", "yesus"]],
    "Idul Adha (Day of Sacrifice)": [["idul adha"]],
    "Hari Raya Waisak": [["waisak"]],
    "Hari Lahir Pancasila": [["pancasila"]],
    "1 Muharam Tahun Baru Islam": [["muharam"], ["muharram"], ["tahun baru islam"]],
    "Proklamasi Kemerdekaan (Independence Day)": [["kemerdekaan"]],
    "Maulid Nabi Muhammad S.A.W.": [["maulid"]],
    "Kelahiran Yesus Kristus (Christmas Day)": [["natal"], ["kristus", "kelahiran"]],
}


def match_holiday_kb(api_holiday_name: str) -> KbEntry | None:
    name = api_holiday_name.lower()
    by_title = {entry.title: entry for entry in load_holiday_kb()}

    for title, groups in _KEYWORD_GROUPS.items():
        entry = by_title.get(title)
        if entry is None:
            continue
        if any(all(keyword in name for keyword in group) for group in groups):
            return entry

    return None
