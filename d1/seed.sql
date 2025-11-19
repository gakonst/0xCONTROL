INSERT INTO track_metadata (
  track_id,
  name,
  artist,
  duration_seconds,
  bpm,
  musical_key,
  annotation_color,
  annotation_note
) VALUES
  ('Anyma, Argy, Son of Son - Voices In My Head.mp3', 'Voices In My Head', 'Anyma, Argy, Son of Son', 180, 112, '8A', NULL, NULL),
  ('BLOND-ISH, ForgiveMeTommy! - We Like To Party - Rework.mp3', 'We Like To Party - Rework', 'BLOND-ISH, ForgiveMeTommy!', 197, 118, '9A', NULL, NULL),
  ('Bedouin - Better Than This.mp3', 'Better Than This', 'Bedouin', 214, 124, '8B', NULL, NULL),
  ('Betical - Do It Again.mp3', 'Do It Again', 'Betical', 231, 130, '11A', NULL, NULL),
  ('Booka Shade, Eli & Fur, Einmusik - To the Sea - Einmusik Remix.mp3', 'To the Sea - Einmusik Remix', 'Booka Shade, Eli & Fur, Einmusik', 248, 136, '11B', NULL, NULL),
  ('DJ T., Emanuel Satie - Funk On You - Emanuel Satie Remix.mp3', 'Funk On You - Emanuel Satie Remix', 'DJ T., Emanuel Satie', 265, 142, '2A', NULL, NULL),
  ('Depeche Mode, Dixon - Cover Me - Dixon Remix.mp3', 'Cover Me - Dixon Remix', 'Depeche Mode, Dixon', 282, 112, '10B', NULL, NULL),
  ('Echonomist, Avangart Tabldot, Alexandros Miaris, Mano Le Tough - Secret Places - Mano Le Tough Remix.mp3', 'Secret Places - Mano Le Tough Remix', 'Echonomist, Avangart Tabldot, Alexandros Miaris, Mano Le Tough', 299, 118, '5A', NULL, NULL),
  ('Grooverick 548.m4a', 'Grooverick 548', 'Grooverick 548', 196, 124, '8A', NULL, NULL),
  ('Helsloot - Let''s Pretend.mp3', 'Let''s Pretend', 'Helsloot', 213, 130, '9A', NULL, NULL),
  ('Howling, Frank Wiedemann, RY X, Jimi Jules - Lover - Jimi Jules Lo-Fi Remix.mp3', 'Lover - Jimi Jules Lo-Fi Remix', 'Howling, Frank Wiedemann, RY X, Jimi Jules', 230, 136, '8B', NULL, NULL),
  ('Liva K, Luch - Act A Fool.mp3', 'Act A Fool', 'Liva K, Luch', 247, 142, '11A', NULL, NULL),
  ('MGMT, Thodoris Triantafillou, Mångata Projekt - Kids - Thodoris Triantafillou & Mångata Projekt Remix.mp3', 'Kids - Thodoris Triantafillou & Mångata Projekt Remix', 'MGMT, Thodoris Triantafillou, Mångata Projekt', 264, 112, '11B', NULL, NULL),
  ('Marc DePulse, Rafael Cerato, Hadar, Malandra Jr. - Make a Show (Malandra Jr. Remix).mp3', 'Make a Show (Malandra Jr. Remix)', 'Marc DePulse, Rafael Cerato, Hadar, Malandra Jr.', 281, 118, '2A', NULL, NULL),
  ('Mees Salomé, Joris Voorn, Celine Cairo - Fool''s Paradise - Joris Voorn Remix.mp3', 'Fool''s Paradise - Joris Voorn Remix', 'Mees Salomé, Joris Voorn, Celine Cairo', 298, 124, '10B', NULL, NULL),
  ('Notre Dame - Nobody Told Me.mp3', 'Nobody Told Me', 'Notre Dame', 195, 130, '5A', NULL, NULL),
  ('Oliver Koletzki, HVOB - Bones.mp3', 'Bones', 'Oliver Koletzki, HVOB', 212, 136, '8A', NULL, NULL),
  ('Polo & Pan - The Mirror.mp3', 'The Mirror', 'Polo & Pan', 229, 142, '9A', NULL, NULL),
  ('Raxon - The Cage Of Love.mp3', 'The Cage Of Love', 'Raxon', 246, 112, '8B', NULL, NULL),
  ('Rem Siman - When You Need It - Radio Edit.mp3', 'When You Need It - Radio Edit', 'Rem Siman', 263, 118, '11A', NULL, NULL),
  ('Rodriguez Jr. - Kids of Hula.mp3', 'Kids of Hula', 'Rodriguez Jr.', 280, 124, '11B', NULL, NULL),
  ('Steve Angello, Modern Tales - Darkness In Me.mp3', 'Darkness In Me', 'Steve Angello, Modern Tales', 297, 130, '2A', NULL, NULL),
  ('Tiësto, Mathame - Everlight.mp3', 'Everlight', 'Tiësto, Mathame', 194, 136, '10B', NULL, NULL),
  ('Tiësto, Rose Ringed - Lethal Industry (Rose Ringed Remix).mp3', 'Lethal Industry (Rose Ringed Remix)', 'Tiësto, Rose Ringed', 211, 142, '5A', NULL, NULL),
  ('Âme, Curses, Echonomist - Shadow Of Love - Echonomist Remix.mp3', 'Shadow Of Love - Echonomist Remix', 'Âme, Curses, Echonomist', 228, 112, '8A', NULL, NULL)
ON CONFLICT(track_id) DO UPDATE SET
  name = excluded.name,
  artist = excluded.artist,
  duration_seconds = excluded.duration_seconds,
  bpm = excluded.bpm,
  musical_key = excluded.musical_key,
  annotation_color = excluded.annotation_color,
  annotation_note = excluded.annotation_note;

INSERT INTO playlists (
  id,
  title,
  description,
  mood,
  tags,
  accent_from,
  accent_to,
  folder_path,
  is_pinned,
  is_favorite
) VALUES
  (
    'field-intel',
    'Field Intel',
    'Late-night rhythms that keep the monitors glowing after midnight mission briefs.',
    'Afterhours drive',
    '["percussion","sub-heavy","warehouse"]',
    '#ff3d81',
    '#f9b16e',
    '["Ops","Field Kits"]',
    1,
    0
  ),
  (
    'sunrise-bloom',
    'Sunrise Bloom',
    'Balearic-leaning selections for the comedown rehearsal when the lights finally come up.',
    'Warm + euphoric',
    '["balearic","organic","uplift"]',
    '#4facfe',
    '#00f2fe',
    '["Mood Arcs"]',
    0,
    0
  ),
  (
    'control-tests',
    'Control Tests',
    'Fresh uploads that still need a spin at full gain. QA the arrangements before release.',
    'QA queue',
    '["wip","rough mix"]',
    '#a18cd1',
    '#fbc2eb',
    '["Ops","QA"]',
    0,
    0
  )
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  mood = excluded.mood,
  tags = excluded.tags,
  accent_from = excluded.accent_from,
  accent_to = excluded.accent_to,
  folder_path = excluded.folder_path,
  is_pinned = excluded.is_pinned,
  is_favorite = excluded.is_favorite,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES
  ('field-intel', 'Anyma, Argy, Son of Son - Voices In My Head.mp3', 1),
  ('field-intel', 'Raxon - The Cage Of Love.mp3', 2),
  ('field-intel', 'Rodriguez Jr. - Kids of Hula.mp3', 3),
  ('sunrise-bloom', 'Polo & Pan - The Mirror.mp3', 1),
  ('sunrise-bloom', 'Betical - Do It Again.mp3', 2),
  ('sunrise-bloom', 'Mees Salomé, Joris Voorn, Celine Cairo - Fool''s Paradise - Joris Voorn Remix.mp3', 3),
  ('control-tests', 'Grooverick 548.m4a', 1),
  ('control-tests', 'DJ T., Emanuel Satie - Funk On You - Emanuel Satie Remix.mp3', 2),
  ('control-tests', 'Marc DePulse, Rafael Cerato, Hadar, Malandra Jr. - Make a Show (Malandra Jr. Remix).mp3', 3)
ON CONFLICT(playlist_id, track_id) DO UPDATE SET
  position = excluded.position;
