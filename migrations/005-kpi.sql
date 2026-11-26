CREATE TABLE kpi_years (
  year INTEGER PRIMARY KEY CHECK (year BETWEEN 1900 AND 9999)
) STRICT;

CREATE TABLE kpi_plans (
  year INTEGER NOT NULL REFERENCES kpi_years(year),
  utente TEXT NOT NULL REFERENCES people(utente),
  objectives TEXT NOT NULL CHECK (json_valid(objectives) AND json_type(objectives) = 'array'),
  PRIMARY KEY (year, utente)
) STRICT;
