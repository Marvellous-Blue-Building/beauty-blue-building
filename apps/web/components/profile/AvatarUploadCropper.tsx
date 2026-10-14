"use client";

import { useRef, useState } from "react";
import ReactCrop, { centerCrop, makeAspectCrop, type Crop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { useTranslations } from "next-intl";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/jpg"];

interface AvatarUploadCropperProps {
  avatarUrl: string | null;
  onChange: (dataUrl: string) => void;
}

function cropToDataUrl(image: HTMLImageElement, crop: Crop): string {
  const canvas = document.createElement("canvas");
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  const pixelCrop = {
    x: crop.x * scaleX,
    y: crop.y * scaleY,
    width: crop.width * scaleX,
    height: crop.height * scaleY,
  };

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return canvas.toDataURL("image/jpeg", 0.9);
}

export function AvatarUploadCropper({ avatarUrl, onChange }: AvatarUploadCropperProps) {
  const t = useTranslations("profile");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError(t("avatarUnsupported"));
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(t("avatarTooLarge"));
      return;
    }

    setError(null);
    const reader = new FileReader();
    reader.onload = () => setSourceImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
    setCrop(
      centerCrop(
        makeAspectCrop({ unit: "%", width: 80 }, 1, width, height),
        width,
        height
      )
    );
  }

  function handleConfirm() {
    if (!imageRef.current || !crop) return;
    const dataUrl = cropToDataUrl(imageRef.current, crop);
    onChange(dataUrl);
    setSourceImage(null);
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        aria-label="Change profile photo"
        className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-border bg-gradient-to-br from-secondary to-primary bg-cover bg-center"
        style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}
      />
      {error && <p className="mt-1 text-[11px] text-warn">{error}</p>}

      {sourceImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-4">
            <ReactCrop crop={crop} onChange={(c) => setCrop(c)} aspect={1} circularCrop>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img ref={imageRef} src={sourceImage} alt="" onLoad={handleImageLoad} />
            </ReactCrop>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setSourceImage(null)}
                className="flex-1 rounded-full border border-border py-2 text-[13px] font-bold text-canvas-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 rounded-full bg-primary py-2 text-[13px] font-bold text-surface"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
