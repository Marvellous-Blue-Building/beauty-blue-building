#!/usr/bin/env bash
# Turns a short "woman turning her head" clip (front → turns right → back) into
# the looping 3-pose fake camera the widget scan reads in Chrome:
#   front (3.5s) → turn right & hold → back → front → turn LEFT (the right turn,
#   mirrored) → back. 960x720 (4:3), 24fps, as .y4m for
#   --use-file-for-fake-video-capture.
#
# A face-centred horizontal gain evens out side lighting — the scan's front
# photo is (rightly) refused when one side of the face is much darker. The
# gain fades out towards white so already-bright skin and wall don't clip.
#
# usage: npm run camera -- <input.mp4>
set -euo pipefail
IN="${1:?usage: npm run camera -- <input.mp4>}"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/.camera"
mkdir -p "$OUT_DIR"
cd "$OUT_DIR"

# The 4:3 crop starts at x=200 (not the centred 240) so her nose sits on the
# frame's vertical centre line, and is lowered 80px so her face fills the scan
# oval top to chin. The gap it leaves at the top is blurred wall (from the
# hair-free left edge), feathered into the frame so there's no seam.
V="split[s][w];[w]crop=400:120:0:0,scale=1440:1080,gblur=sigma=30[bg];\
[s]crop=1440:1000:200:0,format=yuva420p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='255*clip(Y/70,0,1)'[f];\
[bg][f]overlay=0:80,scale=960:720,fps=24,format=yuv420p"
ffmpeg -v error -y -ss 0   -t 3.5 -i "$IN" -vf "$V" -an seg1_front.mp4
ffmpeg -v error -y -ss 3.5 -t 3   -i "$IN" -vf "$V" -an seg2_right.mp4
ffmpeg -v error -y -i seg2_right.mp4 -vf reverse -an seg3_rback.mp4
ffmpeg -v error -y -ss 0   -t 1.5 -i "$IN" -vf "$V" -an seg4_front.mp4
ffmpeg -v error -y -i seg2_right.mp4 -vf hflip -an seg5_left.mp4
ffmpeg -v error -y -i seg5_left.mp4 -vf reverse -an seg6_lback.mp4
printf "file '%s'\n" seg1_front.mp4 seg2_right.mp4 seg3_rback.mp4 seg4_front.mp4 seg5_left.mp4 seg6_lback.mp4 > list.txt
ffmpeg -v error -y -f concat -safe 0 -i list.txt -c:v libx264 -pix_fmt yuv420p -crf 16 face-cam.mp4
ffmpeg -v error -y -i face-cam.mp4 \
  -vf "format=yuv420p,geq=lum='clip(lum(X,Y)*(1+(clip(exp(2.9*(0.5-X/W)),0.7,1.45)-1)*(1-lum(X,Y)/255)),0,255)':cb='cb(X,Y)':cr='cr(X,Y)'" \
  -c:v libx264 -crf 16 -pix_fmt yuv420p face-cam-lit.mp4
ffmpeg -v error -y -i face-cam-lit.mp4 -pix_fmt yuv420p face-cam.y4m
rm -f seg*.mp4 list.txt
echo "fake camera: $OUT_DIR/face-cam.y4m"
