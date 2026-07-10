import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

export const TRACK_FOOTER_TOOLS_TARGET_ID = "library-footer-tools-tracks";
export const PLAYLIST_FOOTER_TOOLS_TARGET_ID = "library-footer-tools-playlists";

export function FooterToolsPortal({
  active,
  targetId,
  children,
}: {
  active: boolean;
  targetId: string;
  children: ReactNode;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(document.getElementById(targetId));
  }, [targetId]);

  if (!active || !target) return null;
  return createPortal(children, target);
}
