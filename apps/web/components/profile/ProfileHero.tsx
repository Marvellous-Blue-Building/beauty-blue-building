import type { UserProfile } from "@/types/user";
import { AvatarUploadCropper } from "@/components/profile/AvatarUploadCropper";

export function ProfileHero({
  profile,
  onAvatarChange,
}: {
  profile: UserProfile;
  onAvatarChange: (dataUrl: string) => void;
}) {
  const summary = profile.skinType
    ? `${profile.skinType} · ${profile.concernSummary} · Goal: ${profile.goal}`
    : "Take the quiz to build your skin profile";

  return (
    <div className="mb-[18px] flex items-center gap-[14px]">
      <AvatarUploadCropper avatarUrl={profile.avatarUrl} onChange={onAvatarChange} />
      <div className="min-w-0">
        <div className="truncate text-[15px] font-extrabold text-canvas-ink">{profile.name}</div>
        <div className="mt-[1px] truncate text-[11.5px] text-canvas-ink-muted">{profile.email}</div>
        <div className="mt-[2px] text-[12.5px] leading-relaxed text-canvas-ink-muted">{summary}</div>
      </div>
    </div>
  );
}
