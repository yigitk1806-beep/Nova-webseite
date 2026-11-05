-- Lokale Entwicklung: Anwendungsrolle ohne Eigentümerrechte, damit RLS greift.
-- In Produktion werden Rollen und Passwörter über die Infrastruktur verwaltet.
CREATE ROLE onyx_app LOGIN PASSWORD 'onyx_app_dev' NOSUPERUSER NOBYPASSRLS;
GRANT CONNECT ON DATABASE onyx TO onyx_app;
