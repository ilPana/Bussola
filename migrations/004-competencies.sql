CREATE TABLE competency_entries (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('application', 'skill')),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  nameKey TEXT NOT NULL,
  description TEXT,
  category TEXT,
  UNIQUE (kind, nameKey),
  CHECK (
    (kind = 'application' AND description IS NOT NULL AND length(trim(description)) > 0 AND category IS NULL)
    OR (kind = 'skill' AND description IS NULL AND category IS NOT NULL AND category IN ('hard', 'soft'))
  )
) STRICT;

CREATE TABLE competency_assessments (
  entryId INTEGER NOT NULL REFERENCES competency_entries(id),
  utente TEXT NOT NULL REFERENCES people(utente),
  level TEXT NOT NULL CHECK (level IN ('Da valutare', 'Assente', 'Base', 'Autonomo', 'Avanzato')),
  note TEXT,
  PRIMARY KEY (entryId, utente)
) STRICT;
