# Skin scan measurement integrity — version 3

## What changed

The original five 0–100 health scores used provisional contrast thresholds. Low or absent detail could saturate at 99. There was no labeled validation set establishing that these scores corresponded to skin health. Version 3 therefore returns `null` for hydration, elasticity, pigmentation, texture, pores and overall. Those backend health fields remain null. The UI now offers a display-only provisional visual score, as described below.

`measurements` contains real image statistics with status, unavailable reason, front-photo source, region names, usable pixel count and sample coverage. Units are **100 × natural-log linear-luminance contrast**, with the existing 0.005 luminance offset. They are image units, not percentages of skin health, pore counts, pore diameter, moisture content, elasticity, diagnoses, or calibrated probabilities.

- Fine surface detail: robust spread (1.4826 × median absolute deviation) of the fine-frequency cheek residual.
- Visible line contrast: robust spread of the mid-frequency forehead/under-eye residual. This is not a wrinkle count.
- Dark-mark contrast: 95th percentile of local morphological dark-mark contrast on cheeks/forehead. Sparse marks may not affect this percentile.
- Cheek texture contrast: robust spread of the mid-frequency cheek residual.
- Nose detail contrast: robust spread of fine + mid-frequency nose residual. This is not a pore-size measurement.

The skin-type and per-area findings remain explicitly **visual estimates** from provisional rules. They are not validated diagnostic labels. Missing required areas produce an unknown type and null findings, not normal skin. V3 image estimates do not automatically boost active ingredients in the recommendation pipeline; user preferences/concerns and the questionnaire still work.

## Visual score presentation

At the user’s request, the widget, app report and PDF show appearance scores and gradient bars again. The display-only `visualScore` uses the legacy contrast mapping: `round(clamp(95 - 50 * (raw - lower) / (upper - lower), 5, 99))`. Anchors are surface 1.2–3.5, lines 1.8–5, tone 4–12, texture 1.8–5, nose 2.5–6.5. These anchors remain provisional, not calibrated health thresholds. Higher means less visible contrast; genuine low contrast can still produce 99. Camera smoothing and lighting can raise scores. No “very good” health grade, hydration/elasticity score or overall grade is inferred.

Only measured finite nonnegative front-photo log-contrast readings with no failure reason, at least 120 sample pixels and 50–100% coverage qualify. Unknown keys, null, invalid or unavailable readings have no score or filled bar. Raw measurements and coverage remain available in expandable details. These display values are never persisted into health fields or used for ingredient recommendations. Regression checks cover standalone-widget/app parity and missing-data handling: `cd apps/web && node scripts/check-visual-scores.cjs`.

## Eligibility and missing data

Every named region is required. No area borrows pixels from another region. Each needs at least 120 retained pixels and at least 50% of its candidate skin pixels after highlight exclusion. Unique pixels are counted once across overlapping masks. Original inter-eye distance must be at least 128 px to avoid extracting micro-detail from an upscaled source. More than 10% channel-clipped pixels (>=250) in a sampled region makes the reading unavailable. Existing face, darkness and sharpness checks still run before measurement.

These are conservative engineering gates, **not validated accuracy thresholds**. Coverage describes the retained fraction of candidate skin, not segmentation correctness, full anatomical area coverage, or confidence. Missing, too-small, clipped, non-finite and insufficient samples return null with a reason. A genuine measured zero remains zero and never implies perfect health. There is no overall grade.

All numerical measurements currently come from the selected front photo. Side images inform the separately labeled per-area estimates; they are not silently combined with front-photo statistics.

## Compatibility and deployment

Deploy the updated web app, skin-scanning service and matching service together. V3 nullable fields are accepted by the matcher and cannot trigger score-based recommendations. Existing database score columns already allow NULL; raw JSON retains the measurements and method version. New reports, onboarding persistence and saved-routine reconstruction use completed-report metadata, not a non-null hydration score. Archived v1/v2 reports are not recalculated; the live report and regenerated PDF invite a new scan instead of presenting old health scores as verified. Historical dashboards may retain old records; do not compare them with v3 image measurements.

The shared widget covers demo retailer, simulator and integration. The app report and PDF use the same reading vocabulary. Browser and unit tests check integrity, not clinical accuracy.

## Validation needed before any accuracy claim

1. Collect consented reference captures covering skin tones, age ranges, devices, lighting and common image-processing modes. Obtain multiple captures per person/session and on different days.
2. Record the original resolution, camera processing, illumination and cosmetics. Include blur, glare, obstructions and small-face negatives. Annotate whether each region is actually assessable.
3. Compare image statistics to expert annotations of visible features; use paired instrument measurements for hydration/elasticity claims. Keep participant and device holdouts separate from calibration data.
4. Report repeatability, agreement/error, missing/false-accept rates and performance by device/skin-tone group. Include uncertainty intervals and an explicit intended use. Select release thresholds with the responsible domain experts before evaluating the holdout.
5. Freeze and version any future calibration. Do not optimize for attractive score distributions or claim a percentage accuracy without an appropriate reference standard.

Reference: [Courage + Khazaka scientific instruments](https://www.courage-khazaka.com/en/scientific-products?view=article) describes Corneometer hydration testing and Cutometer suction-based elasticity measurement. The webcam algorithm implements neither instrument measurement.

## Reproduce checks

From `services/skin-scanning`:

```sh
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
.venv/bin/python scripts/calibrate.py /path/to/consented/photos
```

The inspection script prints actual readings and eligibility reasons. Its optional `--overlay` writes zone overlays only when explicitly requested by the operator. No customer photos are added to the repository by this change.
