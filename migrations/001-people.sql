CREATE TABLE people (
  utente TEXT PRIMARY KEY NOT NULL CHECK (length(trim(utente)) > 0),
  idPersona TEXT,
  nominativo TEXT NOT NULL CHECK (length(trim(nominativo)) > 0),
  dataNascita TEXT,
  sesso TEXT,
  mail TEXT,
  comuneResidenza TEXT,
  dataAssunzione TEXT,
  ufficio TEXT,
  dataIncarico TEXT,
  codiceRuolo TEXT,
  dataRuolo TEXT,
  sedeLavoro TEXT,
  ral INTEGER CHECK (ral >= 0),
  mensilita REAL CHECK (mensilita >= 0),
  livello TEXT,
  dataLivello TEXT,
  ultimoInterventoRal TEXT,
  ptp INTEGER CHECK (ptp >= 0),
  dataPtp TEXT,
  prestazione TEXT CHECK (prestazione IN ('Tempo pieno', 'Part-time')),
  oreSettimanali REAL CHECK (oreSettimanali >= 0)
) STRICT;

CREATE TRIGGER people_utente_immutable
BEFORE UPDATE OF utente ON people
WHEN NEW.utente IS NOT OLD.utente
BEGIN
  SELECT RAISE(ABORT, 'Utente non modificabile');
END;
