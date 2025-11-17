export type Playlist = {
  id: string;
  title: string;
  description: string;
  mood: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  accentFrom?: string;
  accentTo?: string;
  cover?: string;
  trackIds: string[];
};
