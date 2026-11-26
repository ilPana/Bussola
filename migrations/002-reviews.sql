CREATE TABLE reviews (
  year INTEGER PRIMARY KEY CHECK (year BETWEEN 1900 AND 9999),
  openedOn TEXT NOT NULL
) STRICT;

CREATE TABLE review_people (
  year INTEGER NOT NULL REFERENCES reviews(year),
  utente TEXT NOT NULL REFERENCES people(utente),
  includedOn TEXT NOT NULL,
  leftOn TEXT,
  nominativo TEXT NOT NULL,
  age INTEGER,
  codiceRuolo TEXT,
  ral INTEGER,
  livello TEXT,
  dataLivello TEXT,
  ptp INTEGER,
  dataPtp TEXT,
  PRIMARY KEY (year, utente)
) STRICT;
