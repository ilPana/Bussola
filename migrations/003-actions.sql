CREATE TABLE actions (
  id INTEGER PRIMARY KEY,
  year INTEGER NOT NULL,
  utente TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Promozione', 'Job Rotation', 'Formazione', 'Cambio di ruolo', 'Altro')),
  proposal TEXT NOT NULL CHECK (length(trim(proposal)) > 0),
  state TEXT NOT NULL CHECK (state IN ('Proposta', 'Confermata', 'Sospesa', 'Completata', 'Annullata', 'Rinviata')),
  plannedPeriod TEXT,
  proposedLevel TEXT,
  proposedRal INTEGER CHECK (proposedRal >= 0),
  proposedPtp INTEGER CHECK (proposedPtp >= 0),
  initialLevel TEXT,
  initialRal INTEGER CHECK (initialRal >= 0),
  initialPtp INTEGER CHECK (initialPtp >= 0),
  sourceId INTEGER UNIQUE REFERENCES actions(id),
  CHECK (type <> 'Promozione' OR (proposedLevel IS NOT NULL AND initialLevel IS NOT NULL)),
  FOREIGN KEY (year, utente) REFERENCES review_people(year, utente)
) STRICT;

CREATE INDEX actions_by_person ON actions(year, utente);

CREATE TABLE action_status_changes (
  id INTEGER PRIMARY KEY,
  actionId INTEGER NOT NULL REFERENCES actions(id),
  previousState TEXT NOT NULL,
  state TEXT NOT NULL,
  changedOn TEXT NOT NULL,
  note TEXT,
  CHECK (previousState <> state)
) STRICT;

CREATE INDEX changes_by_action ON action_status_changes(actionId);
